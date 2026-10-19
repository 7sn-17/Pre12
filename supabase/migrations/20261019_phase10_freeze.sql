-- ============================================================================
-- Phase 10 — v2.0.0 polish (2026-10-19)
-- Run this file in the Supabase SQL Editor (Dashboard → SQL → New query).
-- It is safe to run more than once.
--
-- Adds:
--   1. streak_freezes — تجميد السلسلة (نمط Duolingo)
--      • يُستهلك التجميد تلقائياً عند فوات يوم واحد في السلسلة.
--      • الحد الأقصى: تجميدان لكل شهر تقويمي (YYYY-MM).
--      • كل صف = يوم واحد محمي (day_key) فقوة الاستهلاك واضحة.
-- ============================================================================

create table if not exists public.streak_freezes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- ⭐ اليوم الذي حُمِي (لم يُنجز فيه شيء)
  day_key    date not null,
  -- ⭐ الشهر التقويمي — تُحسب منه حصة التجميد (2 شهرياً)
  month_key  text not null,
  created_at timestamptz not null default now(),
  unique (user_id, day_key)
);

create index if not exists streak_freezes_user_idx
  on public.streak_freezes (user_id, created_at desc);

create index if not exists streak_freezes_month_idx
  on public.streak_freezes (user_id, month_key);

-- ----------------------------------------------------------------------------
-- RLS: كل تجميد ملك صاحبه فقط
-- ----------------------------------------------------------------------------
alter table public.streak_freezes enable row level security;

drop policy if exists "phase10_streak_freezes_select_own" on public.streak_freezes;
create policy "phase10_streak_freezes_select_own"
  on public.streak_freezes for select
  using (auth.uid() = user_id);

drop policy if exists "phase10_streak_freezes_insert_own" on public.streak_freezes;
create policy "phase10_streak_freezes_insert_own"
  on public.streak_freezes for insert
  with check (auth.uid() = user_id);

drop policy if exists "phase10_streak_freezes_delete_own" on public.streak_freezes;
create policy "phase10_streak_freezes_delete_own"
  on public.streak_freezes for delete
  using (auth.uid() = user_id);

-- حدّ الاستهلاك: مستخدم واحد × يوم واحد (المفتاح الفريد يتولّى ذلك)
-- لكن نضيف فهرساً دلالياً واضحاً لسرعة الاستعلام.
create unique index if not exists streak_freezes_user_day_uniq
  on public.streak_freezes (user_id, day_key);

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select, insert, delete on public.streak_freezes to authenticated;
revoke all on public.streak_freezes from anon;
