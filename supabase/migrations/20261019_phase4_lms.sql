-- ============================================================================
-- Phase 4 — LMS migration (2026-10-19)
-- Run this file in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It is safe to run more than once.
--
-- Adds:
--   1. The "عام / general" subject + files.category=general.
--   2. lecture_albums + schedule_images.album_id (My Lectures albums).
--   3. task_progress + RLS (offline task-progress sync + admin dashboard).
--   4. Storage policies for the existing schedule-images bucket.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) General category / subject
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.subjects where slug = 'general') then
    insert into public.subjects
      (id, name, slug, icon, color, description, sort_order)
    values
      ('22222222-2222-4222-8222-222222222222',
       'عام', 'general', 'inbox', 'default',
       'محتوى عام غير مرتبط بمادة دراسية محددة', 9999);
  end if;
end $$;

comment on column public.files.category is
  'book | summary | automation | exam | videos | general';

-- Remove any legacy CHECK constraint that would reject the new "general" value.
-- The upload form still validates the known category values client-side.
do $$
declare con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.files'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.files drop constraint %I', con.conname);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Lecture albums
-- ----------------------------------------------------------------------------
create table if not exists public.lecture_albums (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  visibility   text not null default 'private'
               check (visibility in ('private', 'public')),
  author_name  text,
  cover_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lecture_albums_user_id_idx
  on public.lecture_albums (user_id);
create index if not exists lecture_albums_visibility_idx
  on public.lecture_albums (visibility, created_at desc);

-- Existing table holds individual lecture images. Add the album relation.
alter table public.schedule_images
  add column if not exists album_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'schedule_images_album_id_fkey'
      and conrelid = 'public.schedule_images'::regclass
  ) then
    alter table public.schedule_images
      add constraint schedule_images_album_id_fkey
      foreign key (album_id) references public.lecture_albums(id)
      on delete set null;
  end if;
end $$;

create index if not exists schedule_images_album_id_idx
  on public.schedule_images (album_id, created_at desc);

alter table public.lecture_albums enable row level security;

drop policy if exists "phase4_lecture_albums_select" on public.lecture_albums;
create policy "phase4_lecture_albums_select"
  on public.lecture_albums for select
  using (visibility = 'public' or auth.uid() = user_id);

drop policy if exists "phase4_lecture_albums_insert" on public.lecture_albums;
create policy "phase4_lecture_albums_insert"
  on public.lecture_albums for insert
  with check (auth.uid() = user_id);

drop policy if exists "phase4_lecture_albums_update" on public.lecture_albums;
create policy "phase4_lecture_albums_update"
  on public.lecture_albums for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "phase4_lecture_albums_delete" on public.lecture_albums;
create policy "phase4_lecture_albums_delete"
  on public.lecture_albums for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3) Task progress (offline-first sync from the Home today card)
-- ----------------------------------------------------------------------------
create table if not exists public.task_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  plan_date    date not null,
  task_id      text not null,
  subject      text,
  task_title   text,
  instructor   text,
  task_type    text,
  completed    boolean not null default false,
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (user_id, plan_date, task_id)
);

create index if not exists task_progress_user_idx
  on public.task_progress (user_id, plan_date desc);
create index if not exists task_progress_completed_idx
  on public.task_progress (completed, user_id);

-- Helper used by RLS policies. SECURITY DEFINER avoids recursive RLS on profiles.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'moderator')
  );
$$;

grant execute on function public.is_staff() to authenticated;

alter table public.task_progress enable row level security;

drop policy if exists "phase4_task_progress_select_own" on public.task_progress;
create policy "phase4_task_progress_select_own"
  on public.task_progress for select
  using (auth.uid() = user_id or public.is_staff());

drop policy if exists "phase4_task_progress_insert_own" on public.task_progress;
create policy "phase4_task_progress_insert_own"
  on public.task_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "phase4_task_progress_update_own" on public.task_progress;
create policy "phase4_task_progress_update_own"
  on public.task_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "phase4_task_progress_delete_own" on public.task_progress;
create policy "phase4_task_progress_delete_own"
  on public.task_progress for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) schedule_images album policies
-- These phase-4 policies replace the legacy img_* policies (dropped in §5).
-- ----------------------------------------------------------------------------
drop policy if exists "phase4_schedule_images_select" on public.schedule_images;
create policy "phase4_schedule_images_select"
  on public.schedule_images for select
  using (is_public = true or auth.uid() = user_id);

drop policy if exists "phase4_schedule_images_insert" on public.schedule_images;
create policy "phase4_schedule_images_insert"
  on public.schedule_images for insert
  with check (auth.uid() = user_id);

drop policy if exists "phase4_schedule_images_update" on public.schedule_images;
create policy "phase4_schedule_images_update"
  on public.schedule_images for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "phase4_schedule_images_delete" on public.schedule_images;
create policy "phase4_schedule_images_delete"
  on public.schedule_images for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5) Storage (existing schedule-images bucket)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('schedule-images', 'schedule-images', true)
on conflict (id) do nothing;

-- Remove legacy bucket-wide write policies from the first image release. They
-- allowed any authenticated user to overwrite/delete another user's objects.
-- The phase4_* policies below are ownership-scoped and replace them.
drop policy if exists "storage_upload" on storage.objects;
drop policy if exists "storage_update" on storage.objects;
drop policy if exists "storage_delete" on storage.objects;
drop policy if exists "storage_read" on storage.objects;

-- Legacy duplicate row policies (same rules as phase4_*).
drop policy if exists "img_select" on public.schedule_images;
drop policy if exists "img_insert" on public.schedule_images;
drop policy if exists "img_update" on public.schedule_images;
drop policy if exists "img_delete" on public.schedule_images;

drop policy if exists "phase4_schedule_images_public_read" on storage.objects;
create policy "phase4_schedule_images_public_read"
  on storage.objects for select
  using (bucket_id = 'schedule-images');

drop policy if exists "phase4_schedule_images_upload_own" on storage.objects;
create policy "phase4_schedule_images_upload_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'schedule-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "phase4_schedule_images_update_own" on storage.objects;
create policy "phase4_schedule_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'schedule-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "phase4_schedule_images_delete_own" on storage.objects;
create policy "phase4_schedule_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'schedule-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 6) Updated-at triggers
-- ----------------------------------------------------------------------------
create or replace function public.phase4_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lecture_albums_touch_updated_at on public.lecture_albums;
create trigger lecture_albums_touch_updated_at
  before update on public.lecture_albums
  for each row execute function public.phase4_touch_updated_at();

drop trigger if exists task_progress_touch_updated_at on public.task_progress;
create trigger task_progress_touch_updated_at
  before update on public.task_progress
  for each row execute function public.phase4_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 7) Admin dashboard aggregate (one row per student instead of every task row)
-- ----------------------------------------------------------------------------
-- The function is SECURITY DEFINER so it can aggregate despite task_progress
-- RLS. It returns rows only when the caller is an admin/moderator.
-- The parameter lets the dashboard count only tasks that still exist in the
-- current plan; old task_progress rows must not inflate the percentages.
drop function if exists public.get_student_progress_counts();
create or replace function public.get_student_progress_counts(p_task_keys text[] default null)
returns table (user_id uuid, completed_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select tp.user_id, count(*)::bigint
  from public.task_progress tp
  where tp.completed = true
    and public.is_staff()
    and (
      p_task_keys is null
      or (to_char(tp.plan_date, 'YYYY-MM-DD') || '|' || tp.task_id) = any(p_task_keys)
    )
  group by tp.user_id;
$$;

revoke all on function public.get_student_progress_counts(text[]) from public;
revoke all on function public.get_student_progress_counts(text[]) from anon;
grant execute on function public.get_student_progress_counts(text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 8) API grants
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.lecture_albums to authenticated;
grant select, insert, update, delete on public.schedule_images to authenticated;
grant select, insert, update, delete on public.task_progress to authenticated;

-- The LMS surfaces require a signed-in student. Supabase's default privileges
-- give anon broad table grants; revoke them so RLS is not the only barrier.
revoke all on public.lecture_albums from anon;
revoke all on public.schedule_images from anon;
revoke all on public.task_progress from anon;
