-- ============================================================
-- Phase W10 — The Perfection Strike: Notification System
-- ------------------------------------------------------------
--  1) تفضيلات القنوات + ساعات الصمت على ملف المستخدم
--  2) سجلّ إشعارات أغنى (السيناريو + القناة + الحمولة + السبب)
--  3) فهارس لقراءة "آخر الإشعارات" بسرعة
--  4) جدولة أدقّ للمحرّك (كل 30 دقيقة) — التهدئة internal تتكفّل بالباقي
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) تفضيلات القنوات وساعات الصمت
-- ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists notification_prefs jsonb not null
    default '{"tasks": true, "streak": true, "content": true, "updates": true}'::jsonb,
  add column if not exists quiet_start integer,
  add column if not exists quiet_end integer;

comment on column public.profiles.notification_prefs is
  'W10: per-channel opt-in. {tasks, streak, content, updates} — the smart engine respects it.';

comment on column public.profiles.quiet_start is
  'W10: the hours the user asked to be left alone (null = learned automatically from their activity).';

-- ─────────────────────────────────────────────
-- 2) سجلّ إشعارات أغنى
-- ─────────────────────────────────────────────
alter table public.notification_log
  add column if not exists channel text,
  add column if not exists scenario text,
  add column if not exists payload jsonb,
  add column if not exists reason text;

comment on column public.notification_log.scenario is
  'W10: the scenario id that produced the message (streakRisk, goalDue, freshStart …).';

comment on column public.notification_log.reason is
  'W10: why the engine decided to send this message *now* (for diagnostics).';

create index if not exists notification_log_scenario_idx
  on public.notification_log (user_id, scenario, created_at desc);

create index if not exists notification_log_user_recent_idx
  on public.notification_log (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- 3) دالة مساعدة: آخر إشعارات المستخدم (للمنع من التكرار)
-- ─────────────────────────────────────────────
create or replace function public.recent_notification_titles(p_user_id uuid, p_limit integer default 12)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(title order by created_at desc), '{}'::text[])
  from (
    select title
    from public.notification_log
    where user_id = p_user_id
    order by created_at desc
    limit greatest(1, least(100, coalesce(p_limit, 12)))
  ) recent;
$$;

revoke all on function public.recent_notification_titles(uuid, integer) from public, anon, authenticated;
grant execute on function public.recent_notification_titles(uuid, integer) to service_role;

-- ─────────────────────────────────────────────
-- 4) دالة: إحصاء ما أُرسل اليوم/الأسبوع (للسقوف)
-- ─────────────────────────────────────────────
create or replace function public.notification_counts(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'today', (select count(*) from public.notification_log
               where user_id = p_user_id and created_at > now() - interval '1 day'),
    'week',  (select count(*) from public.notification_log
               where user_id = p_user_id and created_at > now() - interval '7 days')
  );
$$;

revoke all on function public.notification_counts(uuid) from public, anon, authenticated;
grant execute on function public.notification_counts(uuid) to service_role;

-- ─────────────────────────────────────────────
-- 5) الجدولة: كل 30 دقيقة (المحرّك يهدّئ نفسه بنفسه)
-- ─────────────────────────────────────────────
do $$
declare
  job_id bigint;
begin
  select id into job_id from cron.job where jobname = 'smart-notifications-engine';

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'smart-notifications-engine',
    '*/30 * * * *',
    $cron$
    select net.http_post(
      url := 'https://pfjpeqhevegivjmyjvux.supabase.co/functions/v1/smart-notifications-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'at', now())
    );
    $cron$
  );
end
$$;

-- ─────────────────────────────────────────────
-- 6) دالة تشخيص: حالة المستخدم (لنفسه فقط)
-- ─────────────────────────────────────────────
create or replace function public.notification_diagnostics(p_user_id uuid)
returns table (
  user_id uuid,
  email text,
  fcm_token_present boolean,
  notify_enabled boolean,
  prefs jsonb,
  last_notification_at timestamptz,
  sent_today bigint,
  sent_week bigint,
  last_category text,
  last_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.email,
    p.fcm_token is not null,
    coalesce(p.notify_enabled, true),
    p.notification_prefs,
    p.last_notification_at,
    (select count(*) from public.notification_log l
      where l.user_id = p.id and l.created_at > now() - interval '1 day'),
    (select count(*) from public.notification_log l
      where l.user_id = p.id and l.created_at > now() - interval '7 days'),
    (select l.category from public.notification_log l
      where l.user_id = p.id order by l.created_at desc limit 1),
    (select l.title from public.notification_log l
      where l.user_id = p.id order by l.created_at desc limit 1)
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.notification_diagnostics(uuid) from public, anon;
grant execute on function public.notification_diagnostics(uuid) to authenticated, service_role;
