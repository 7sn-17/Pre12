-- ============================================================================
-- Phase 10.1 — v2.1.0: FCM push token storage
-- Run this file in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It is safe to run more than once.
--
-- Adds:
--   1. profiles.fcm_token — يُخزَّن فيه توكن Firebase لكل جهاز،
--      ليصل الإشعار إلى الجهاز الصحيح.
-- ============================================================================

alter table public.profiles
  add column if not exists fcm_token text;

comment on column public.profiles.fcm_token is
  'Firebase Cloud Messaging registration token of the user''s device (used to deliver push notifications)';

-- فهرس جزئي: نبحث فقط عن الصفوف التي لها توكن (الطلبات الفاشلة تتجاهلها).
create index if not exists profiles_fcm_token_idx
  on public.profiles (fcm_token)
  where fcm_token is not null;
