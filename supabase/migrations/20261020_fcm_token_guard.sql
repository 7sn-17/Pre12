-- ⭐ v4.4.0 — حارس على مستوى القاعدة يمنع حفظ "[object Object]"
-- أو أي قيمة غير صالحة في profiles.fcm_token، حتى لو كان جهاز
-- المستخدم ما زال يشغّل نسخة قديمة من التطبيق.
--
-- رمز FCM الحقيقي نصّ طويل (عادة 140+ حرفاً) بلا فراغات.
-- القيمة NULL مسموحة (الجهاز لم يسجّل بعد).

alter table public.profiles
  drop constraint if exists profiles_fcm_token_valid;

alter table public.profiles
  add constraint profiles_fcm_token_valid check (
    fcm_token is null or (
      length(fcm_token) between 20 and 4096
      and fcm_token not like '[object%'
      and fcm_token !~ '\s'
    )
  );
