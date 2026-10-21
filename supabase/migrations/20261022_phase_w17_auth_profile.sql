-- ============================================================
-- Phase W17 — «المستخدم الجديد لا يدخل جدول الملفات الشخصية»
-- ------------------------------------------------------------
-- ⭐⭐⭐ الجذر الحقيقي (تمّ فحصه عبر MCP على القاعدة الحيّة):
--
--   1) الدالة `public.handle_new_user()` **موجودة** وسليمة، لكن
--      **الـtrigger على auth.users مفقود تماماً** ⇒ لا يُستدعى أبداً
--      ⇒ كل مستخدم جديد (Google) يدخل التطبيق بلا صفّ في `profiles`:
--        • الاسم يصير بريد المستخدم (hnt317601) لأن الواجهة تسقط
--          إلى `email.split('@')[0]`؛
--        • الصورة لا تظهر لأن `profiles.avatar_url` فارغ؛
--        • وتعديل الاسم «يرجع» لأن صفّه غير موجود أصلاً.
--   2) جدول `profiles` لا يملك سياسة **INSERT** ⇒ حتى الـupsert من
--      المتصفّح كان مرفوضاً بـRLS (كما يشرح التعليق في auth.js).
--
-- ⭐ الحل هنا: إعادة إنشاء الـtrigger + سياسات INSERT/DELETE +
--   ترحيل (backfill) لكل مستخدم بلا ملف شخصي.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) الدالة: تُنشئ صفّ الملف الشخصي من بيانات Google
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⭐⭐ «تسجيل الدخول لا يُسقط أبداً»: أي خطأ داخل الـtrigger يُلتقط
  --   هنا (فيلحقه العميل بنفسه بـupsert في أول تحميل) بدل أن يُفشل
  --   إنشاء الحساب في GoTrue.
  begin
    insert into public.profiles (id, email, full_name, avatar_url)
    values (
      new.id,
      new.email,
      -- ⭐ الاسم: full_name أولاً، ثم name، ثم بريد المستخدم.
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        nullif(new.raw_user_meta_data ->> 'user_name', ''),
        split_part(coalesce(new.email, 'مستخدم'), '@', 1)
      ),
      -- ⭐ صورة Google: avatar_url أو picture أو image_url.
      coalesce(
        nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
        nullif(new.raw_user_meta_data ->> 'picture', ''),
        nullif(new.raw_user_meta_data ->> 'image_url', '')
      )
    )
    on conflict (id) do update
      set email      = coalesce(excluded.email, public.profiles.email),
          -- ⭐⭐⭐ الاسم الموجود **يفوز**: لا نمحو اسم المستخدم المخصَّص
          --   (Google يعيد كتابة بياناته في كل دخول ⇒ كان الاسم يرجع).
          full_name  = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
          -- ⭐ الصورة تتبع Google إن وُجدت.
          avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
          updated_at = now();
  exception when others then
    raise warning 'handle_new_user: %', sqlerrm;
  end;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Phase W17 — ينشئ صفّ profiles لكل مستخدم جديد من raw_user_meta_data (Google: name/picture).';

-- ────────────────────────────────────────────────────────────
-- 2) ⭐⭐⭐ الـtrigger الناقص — هذا هو سبب العطل كلّه
-- ────────────────────────────────────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 3) سياسات RLS: INSERT و DELETE لصفّ المستخدم نفسه
--    (UPDATE موجودة أصلاً: «Users can update own profile»)
-- ────────────────────────────────────────────────────────────
drop policy if exists "Users can insert own profile" on public.profiles;
-- ⭐⭐⭐ `role = 'student'` إجباري: بدونه يستطيع أي مستخدم أن يُنشئ صفّه
--   برتبة «admin» بنفسه! (الترقية تتمّ عبر لوحة المشرف = UPDATE ✓)
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id and role = 'student');

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile" on public.profiles
  for delete to authenticated
  using (auth.uid() = id);

-- ────────────────────────────────────────────────────────────
-- 4) ⭐ الترحيل: كل مستخدم في auth.users بلا صفّ في profiles
-- ────────────────────────────────────────────────────────────
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(u.raw_user_meta_data ->> 'user_name', ''),
    split_part(coalesce(u.email, 'مستخدم'), '@', 1)
  ),
  coalesce(
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(u.raw_user_meta_data ->> 'picture', ''),
    nullif(u.raw_user_meta_data ->> 'image_url', '')
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do update
  set email      = coalesce(excluded.email, public.profiles.email),
      full_name  = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
      updated_at = now();
