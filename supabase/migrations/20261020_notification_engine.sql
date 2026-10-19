-- ============================================================
-- Phase 15/16 — Universal Notification Engine
-- ------------------------------------------------------------
--  1) تفضيلات الإشعارات على جدول profiles
--  2) جدول notification_log لسجلّ الإشعارات المُرسلة
--  3) دالة قراءة أسرار Vault (مقيّدة بـ service_role فقط)
--  4) pg_cron + pg_net لتشغيل المحرّك الآلي كل ساعة
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) تفضيلات الإشعارات
-- ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists notify_enabled boolean not null default true,
  add column if not exists last_notification_at timestamptz,
  add column if not exists notification_streak integer not null default 0,
  add column if not exists timezone text not null default 'Asia/Baghdad';

-- ─────────────────────────────────────────────
-- 2) سجلّ الإشعارات
-- ─────────────────────────────────────────────
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  target text,
  sent boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_user_idx
  on public.notification_log (user_id, created_at desc);

create index if not exists notification_log_created_idx
  on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;

-- فقط service_role يكتب السجلّ (Edge Functions)
revoke all on public.notification_log from anon, authenticated;
grant all on public.notification_log to service_role;

-- ─────────────────────────────────────────────
-- 3) قراءة أسرار Vault — مقيّدة تماماً
-- ─────────────────────────────────────────────
create or replace function public.vault_read_secret_text(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke all on function public.vault_read_secret_text(text) from public, anon, authenticated;
grant execute on function public.vault_read_secret_text(text) to service_role;

-- ─────────────────────────────────────────────
-- 4) المحرّك الآلي — كل ساعة
-- ─────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ⭐ سرّ الـ cron داخل Vault (يُستخدم في الطلب وفي التحقّق)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cron_secret',
      'Shared secret between pg_cron and the smart-notifications-engine'
    );
  end if;
end
$$;

-- ⭐ جدولة الوظيفة كل ساعة (دقيقة 5 من كل ساعة)
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
    '5 * * * *',
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

-- ⭐ سجلّ coalesce لتفادي أخطاء notification_log
comment on table public.notification_log is
  'Every notification sent by the smart engine or the admin panel (Phase 15/16).';
