-- ============================================================
-- Phase W17 — «طلب صورة إلى ألبوم» ⇒ إشعار فوري لصاحب الألبوم
-- ------------------------------------------------------------
-- ⭐ الـtrigger ينطلق AFTER INSERT على album_requests ويستدعي
--   المحرّك الذكي عبر pg_net (نفس آلية Database Webhook في Supabase)
--   ⇒ تصل الرسالة إلى صاحب الألبوم **في ثوانٍ** بدل انتظار
--   دورة الـcron (30 دقيقة).
--
-- ⭐ الطلب لا يُعطَّل أبداً: أي خطأ يُلتقط ويُسجَّل كتحذير.
-- ============================================================

create or replace function public.notify_album_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
  endpoint text;
begin
  begin
    select vault_read_secret_text('cron_secret') into secret;
    if secret is null or secret = '' then
      raise warning 'notify_album_request: cron_secret is not in the vault';
      return new;
    end if;

    endpoint := coalesce(
      nullif(current_setting('app.settings.supabase_url', true), ''),
      'https://pfjpeqhevegivjmyjvux.supabase.co'
    ) || '/functions/v1/smart-notifications-engine';

    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', secret
      ),
      body := jsonb_build_object(
        'mode', 'albumRequest',
        'request_id', new.id
      )::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'notify_album_request: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists album_request_notify on public.album_requests;
create trigger album_request_notify
  after insert on public.album_requests
  for each row execute function public.notify_album_request();
