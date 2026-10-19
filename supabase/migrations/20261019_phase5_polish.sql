-- ============================================================================
-- Phase 5 — Polish (2026-10-19)
-- Run this file in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It is safe to run more than once.
--
-- Adds:
--   1. album_requests — طلبات إضافة صور إلى ألبومات الآخرين.
--      • المستخدم يرفع صورة ويحوّلها إلى "طلب" على ألبوم عام.
--      • صاحب الألبوم يقبل الطلب (فتُضاف الصورة لألبومه) أو يرفضه.
--   2. updated_at trigger for the new table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) album_requests
-- ----------------------------------------------------------------------------
create table if not exists public.album_requests (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references public.lecture_albums(id) on delete cascade,
  -- ⭐ صاحب الألبوم (مقبِل الطلب)
  album_owner_id uuid references auth.users(id) on delete cascade,
  -- ⭐ صاحب الطلب (مرسل الصورة)
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null default 'صورة محاضرة',
  image_url     text not null,
  image_path    text,
  author_name   text,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists album_requests_album_idx
  on public.album_requests (album_id, created_at desc);

create index if not exists album_requests_user_idx
  on public.album_requests (user_id, created_at desc);

create index if not exists album_requests_owner_idx
  on public.album_requests (album_owner_id, status);

create index if not exists album_requests_status_idx
  on public.album_requests (status);

-- ----------------------------------------------------------------------------
-- 2) RLS
--   • الطلب يرسله صاحب حساب: إدراج صف ينتمي إليه.
--   • القراءة: صاحب الألبوم + صاحب الطلب + المشرفون.
--   • القبول/الرفض: صاحب الألبوم فقط.
-- ----------------------------------------------------------------------------
alter table public.album_requests enable row level security;

drop policy if exists "phase5_album_requests_select" on public.album_requests;
create policy "phase5_album_requests_select"
  on public.album_requests for select
  using (
    auth.uid() = user_id
    or auth.uid() = album_owner_id
    or public.is_staff()
  );

drop policy if exists "phase5_album_requests_insert_own" on public.album_requests;
create policy "phase5_album_requests_insert_own"
  on public.album_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "phase5_album_requests_update_owner" on public.album_requests;
create policy "phase5_album_requests_update_owner"
  on public.album_requests for update
  using (auth.uid() = album_owner_id)
  with check (auth.uid() = album_owner_id);

drop policy if exists "phase5_album_requests_delete" on public.album_requests;
create policy "phase5_album_requests_delete"
  on public.album_requests for delete
  using (auth.uid() = user_id or auth.uid() = album_owner_id);

-- ----------------------------------------------------------------------------
-- 3) updated_at trigger
-- ----------------------------------------------------------------------------
drop trigger if exists album_requests_touch_updated_at on public.album_requests;
create trigger album_requests_touch_updated_at
  before update on public.album_requests
  for each row execute function public.phase4_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Grants
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.album_requests to authenticated;
revoke all on public.album_requests from anon;

-- Storage: صور الطلبات تُرفع تحت مجلد requests/ داخل مجلد المستخدم.
drop policy if exists "phase5_album_requests_storage_read" on storage.objects;
create policy "phase5_album_requests_storage_read"
  on storage.objects for select
  using (bucket_id = 'schedule-images');

drop policy if exists "phase5_album_requests_storage_insert" on storage.objects;
create policy "phase5_album_requests_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'schedule-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
