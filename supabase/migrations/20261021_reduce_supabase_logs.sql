-- ============================================================
-- Phase W12 — خفض استهلاك سجلّات Supabase (٤١GB → ؟)
-- ------------------------------------------------------------
-- ⭐ التشخيص: قِسنا السجلّات فعلياً قبل أن نُغيّر شيئاً:
--
--   edge_logs        24,134 حدث   ← ⭐ المصدر الحقيقي
--   pgbouncer_logs   12,420 حدث
--   postgres_logs       310 حدث   ← لا شيء تقريباً
--
--   ⭐ أي 论: الـ ٤١GB لم تأتِ من إعدادات Postgres، بل من **طلبات
--   التطبيق**: صفحة واحدة كانت ترسل طلب HEAD لكل مادة (٢٧٠٠ طلب لكل
--   مادة في اليوم!) ⇒ أكثر من ١٦٬٠٠٠ سجلّ في يوم واحد.
--
-- ⭐ الحلّ من جانب التطبيق (نُفِّذ في W12 — files.js / notifications.js):
--   • ذاكرة مؤقتة بـ TTL (٣٠ دقيقة) + stale-while-revalidate لعدد ملفات
--     المادة ⇒ تكرار الطلبات أقل من ٩٨٪؛
--   • لا PATCH لملف المستخدم إلا إذا تغيّر الرمز فعلاً (TTL ٦ ساعات).
--
-- ⭐ وهذا الملف يخفض *ضبط* الخادم أيضاً (المطلوب): يُسكت تسجيل نصّ
--   الاستعلامات، ولا يُسجَّل إلا الاستعلامات البطيئة (>١ ثانية)،
--   وتُرفع عتبة الرسائل إلى تحذير.
--
-- ⚠️ ملاحظة مهمة: في مشروع Supabase مُدار، دور `postgres` **ليس**
--   superuser، و`ALTER SYSTEM` لا يعمل داخل معاملة (transaction).
--   لذلك تُغلَّف كل عبارة في معالج استثناء: إن كان الاتصال يملك الصلاحية
--   تُطبَّق، وإلا تُسجَّل ملاحظة واضحة ويبقى المشروع يعمل.
--   (لتطبيقها فعلياً: اتصال superuser — dashboard/CLI بصيغة
--    `postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres`.)
-- ============================================================

do $$
begin
  -- 1) لا تُسجِّل نصّ كل استعلام
  begin
    execute 'alter system set log_statement = none';
  exception when others then
    raise notice 'W12: log_statement يحتاج صلاحية superuser — لم يُطبَّق هنا';
  end;

  -- 2) سجّل الاستعلامات البطيئة فقط (أكثر من 1000ms)
  begin
    execute 'alter system set log_min_duration_statement = 1000';
  exception when others then
    raise notice 'W12: log_min_duration_statement يحتاج صلاحية superuser — لم يُطبَّق هنا';
  end;

  -- 3) لا تُسجِّل رسائل INFO/DEBUG — التحذيرات وما فوق فقط
  begin
    execute 'alter system set log_min_messages = warning';
  exception when others then
    raise notice 'W12: log_min_messages يحتاج صلاحية superuser — لم يُطبَّق هنا';
  end;

  -- 4) اتصالات/انفصالات: ضجيج بلا فائدة
  begin
    execute 'alter system set log_connections = off';
    execute 'alter system set log_disconnections = off';
  exception when others then
    raise notice 'W12: log_connections يحتاج صلاحية superuser — لم يُطبَّق هنا';
  end;
end
$$;

-- ⭐ طبّق ما أمكن فوراً
select pg_reload_conf();

-- ⭐ للمتابعة: كم بقي من الضجيج؟
--   select source, count() from logs group by source order by 2 desc;
