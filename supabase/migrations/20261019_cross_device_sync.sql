-- ============================================================
-- Cross-device sync — per-user favorites + notes indexes
-- Applied through Supabase MCP. Kept in the repository as the
-- canonical record of the production schema change.
-- ============================================================

-- Favorites used to live only in IndexedDB. The cloud table stores
-- only the user/file relation; file metadata is joined from public.files
-- so edits to a file are reflected everywhere automatically.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint favorites_user_file_key unique (user_id, file_id)
);

create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

create index if not exists favorites_file_idx
  on public.favorites (file_id);

alter table public.favorites enable row level security;

drop policy if exists "Users can view own favorites" on public.favorites;
drop policy if exists "Users can add own favorites" on public.favorites;
drop policy if exists "Users can remove own favorites" on public.favorites;

create policy "Users can view own favorites"
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can add own favorites"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove own favorites"
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- Favorites are private user data: no anonymous access at all.
revoke all on table public.favorites from anon;
grant select, insert, delete on table public.favorites to authenticated;
revoke update, references, truncate, trigger on table public.favorites from authenticated;
grant all on table public.favorites to service_role;

-- Speed up the two notes reads performed during a full account sync.
create index if not exists notes_user_shared_created_idx
  on public.notes (user_id, is_shared, created_at desc);

create index if not exists notes_shared_created_idx
  on public.notes (created_at desc)
  where is_shared = true;

-- Ask PostgREST to pick up the new table/relationship immediately.
notify pgrst, 'reload schema';
