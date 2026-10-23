<div align="center">

<img src="icon-512.png" alt="شعار المنصة الطبية" width="120" height="120" />

# 📚 المنصة الطبية — السنة التحضيرية

### Pre12 · منصة تعليمية مجانية لطلاب السنة التحضيري الطبية

**كتب · ملخصات · ملاحظات · أهداف · محاضراتي · تقدّم · سلسلة أيام · قراءة بدون إنترنت**

<br>

![Version](https://img.shields.io/badge/version-5.1.1-10b981?style=for-the-badge)
![Android](https://img.shields.io/badge/Android-APK-3DDC84?style=for-the-badge&logo=android&logoColor=white)
![Offline](https://img.shields.io/badge/Offline-First-3b82f6?style=for-the-badge)
![SPA](https://img.shields.io/badge/SPA-a78bfa?style=for-the-badge)
![License](https://img.shields.io/badge/license-Free-10b981?style=for-the-badge)

<br>

### ⬇️ [**تحميل أحدث نسخة (APK)**](https://github.com/7sn-17/Pre12/releases/latest)

<sub>كل الإصدارات السابقة: [GitHub Releases](https://github.com/7sn-17/Pre12/releases)</sub>

</div>

---

## ✨ نظرة سريعة

منصة تعليمية **مجانية 100%** لطلاب السنة التحضيرية الطبية: مكتبة منظمة من الكتب
والملخصات، نظام ملاحظات وأهداف دراسية، معرض صور احترافي لمشاركة المحاضرات
والجداول، وتقدّم دراسي محسوب من **يوم الإنجاز الفعلي** — وكل ذلك **يعمل بدون
إنترنت**.

> 📱 **التطبيق يُوزَّع كـ APK للأندرويد فقط.** الواجهة نفسها بُنيت كتطبيق ويب
> تقدّمي (PWA) وتعمل داخل WebView أصلي عبر Capacitor — لكن لا توجد أي استضافة
> ويب للمشروع.

---

## 🎯 المميزات

| الميزة | الوصف |
|:------:|:------|
| 📖 **قراءة بدون إنترنت** | حمّل الملفات واقرأها في أي وقت (تخزين محلي + Service Worker) |
| ⚡ **فتح فوري دون إنترنت** | البنية تعمل بالكامل بلا شبكة — لا هياكل تحميل ولا انتظار |
| 🔥 **سلسلة الأيام (Streak)** | عدّاد نار + ورقة إحصائيات بنمط Duolingo (أسبوع · شهر · الكل) |
| 🧊 **تجميد السلسلة** | تجميدان لكل شهر يحميان يوماً فائتاً فلا تنقطع سلسلتك |
| 📤 **مشاركة أصلية** | مشاركة السلسلة وصورة الخطة عبر مشاركة أندرويد الأصلية |
| 🔑 **دخول سريع بـ Google** | Credential Manager داخل التطبيق — بلا متصفح وبلا إعادة توجيه |
| 📝 **ملاحظات ذكية** | خاصة (محلياً) + مشتركة (سحابياً) |
| 🎯 **أهداف دراسية** | تابع إنجازك بمؤشر بصري |
| 📊 **تقدمي** | بطاقة لكل مادة تفتح نافذة مهامها (منجزة / متبقية) |
| 📸 **محاضراتي** | معرض بالسحب والقرص والتكبير + قص + طلبات مشاركة + يعمل بلا إنترنت |
| 🗂️ **مزامنة بين الأجهزة** | المهام والملاحظات والمفضّلة تتزامن مع حسابك |
| 🔄 **مزامنة لحظية** | تغيير أي مهمة في "تقدمي" ينعكس فوراً على "بطاقة اليوم" وعدّاد السلسلة |
| 🏠 **ودجات الشاشة الرئيسية** | مهام اليوم · سلسلة الأيام · خريطة الأسبوع · ملاحظاتي وأهدافي |
| 🔔 **إشعارات ذكية (FCM)** | 6 فئات بقوالب عربية تتكيّف مع حالتك + ساعات هادئة ليلاً |
| 🛡️ **لوحة تحكم** | إحصائيات الطلاب وتقدّمهم |
| 🎨 **تصميم عصري** | وضع نهاري/ليلي بانتقال ناعم · عربي RTL · Mobile-First |

---

## 🏗️ البنية التقنية

```
Pre12/
├── src/                 # 📄 القوالب (المصدر الحقيقي) — front-matter + includes
│   └── *.html           #    21 صفحة
├── partials/            # 🧩 القوالب المشتركة (head · header · topbar · footer · scripts)
│
├── app.js               # ⚡ محرّك التنقّل الفوري (SPA shell)
├── build.js             # 🏗️  مُولِّد الموقع (Node.js) — يدمج partials ويكتب dist/ وحدها
├── sw.js                # 🛡️  Service Worker (Network-First للـ HTML · Cache-First للـ JSON)
├── auth.js              # 🔐 المصادقة + كاش الملف الشخصي
├── db.js                # 💾 IndexedDB + طابور مزامنة المهام + حالات السلسلة
├── sync.js              # 🔄 المزامنة بين الأجهزة + تجميد السلسلة
├── files.js             # 📚 جلب البيانات + منطق "رابط أم ملف"
├── streak.js            # 🔥 نواة حساب سلسلة الأيام (منطق نقي)
├── search.js            # 🔍 محرّك البحث الموحّد
├── notifications.js     # 🔔 الإشعارات المحلية + FCM
├── native.js            # 📱 طبقة Capacitor الأصلية
├── ui.js                # 🎛️ النوافذ والتنبيهات المشتركة
├── widgets.js           # 🏠 جسر الودجات مع التطبيق
├── app-update.js        # 🔄 شريط التحديث
│
├── supabase-config.js   # 🔑 إعداد Supabase (URL + anon key)
├── theme-init.js        # 🎨 تطبيق الثيم قبل أول رسم
├── manifest.json        # 📱 بيانات PWA
│
├── plans/  *.png        # 🎨 الأصول
├── dist/                # 📦 مخرَج البناء الوحيد: الصفحات + الأصول (ينشئها npm run build)
├── android/             # 🤖 مشروع Capacitor الأصلي (يُبنى منه الـ APK)
└── supabase/            # 🗄️ مخططات SQL + Edge Functions
```

### التقنيات

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?style=flat-square&logo=capacitor&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)

</div>

- **الواجهة:** HTML5 + CSS3 + Vanilla JavaScript (بلا أي إطار عمل)
- **الخلفية:** Supabase (PostgreSQL · Storage · Auth · Edge Functions)
- **الأصلي:** Capacitor 8 + Jetpack Glance (ودجات الشاشة الرئيسية)
- **دون اتصال:** Service Worker · Cache API · IndexedDB · LocalStorage
- **الأيقونات:** Lucide + Font Awesome 6 · **الخطوط:** Cairo

---

## 🚀 التشغيل المحلي

```bash
# 1) تثبيت الاعتماديات (مرة واحدة)
npm install

# 2) بناء الصفحات (يكتب dist/ وحدها)
npm run build
```

ثم قدّم **`dist/`** (الجذر لم يعد يحتوي صفحات مبنية):

```bash
npx serve dist
# أو
python3 -m http.server 8000 --directory dist
```

> افتح <http://localhost:8000/> — ولا تخدم `src/` أو `partials/` مباشرةً،
> فهما قوالب خام تحتوي على `{{المتغيّرات}}`.

**المتطلبات:** Node.js ≥ 18 للبناء على الويب (الاعتماد الوحيد هو `acorn`)،
و Node.js **22+** لأدوات Capacitor الأصلية، و **JDK 21** لبناء الـ APK.

---

## 🧱 كيف يعمل البناء؟

كل صفحة في `src/*.html` تبدأ بكتلة **front-matter** ثم تستدعي القوالب المشتركة:

```html
<!--@
title: تقدمي - المنصة الطبية
libs: supabase, lucide
scripts: supabase-config, auth, db, files
sw: true
backHref: index.html
headerTitle: تقدمي
-->

<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<!-- @include partials/head.html -->
<style>/* أنماط الصفحة */</style>
</head>
<body>
<!-- @include partials/header.html -->
</body>
</html>
```

`build.js` يقرأ القوالب، يوسّع `<!-- @include ... -->` و`{{المتغيّرات}}`، ثم
يكتب **نسخة نهائية في `dist/` وحدها** (منذ v5.1.1) — وهي التي تُحقن داخل
التطبيق. الجذر يبقى نظيفاً بلا أي `*.html` مبنية.

**لماذا؟** لأن خدمة الجذر مباشرةً يجب ألا تعرض القوالب الخام أبداً — القوالب
الخام بلا `<meta charset>` ولا `viewport` ولا خطوط ولا سكربتات، فتبدو العربية
مشوّهة وتعلق الصفحات على الـ spinner.

---

## ⚡ SPA shell

الصفحات التالية تُنقَّل عبر `app.js` **بدون** إعادة تحميل المستند:
`index · subject · viewer · notes · goals · my-lectures · all-files · gpa ·
admin · plans · progress`.

- يُستبدل `<body>` وأنماط الصفحة و`<title>` فقط، بينما يبقى `<head>` ومكتبة
  Supabase والجلسة والثيم والمكتبات محمّلة **مرة واحدة**.
- `history.pushState` يُحدَّث **قبل** تشغيل سكربت الصفحة الجديدة، فتقرأ الصفحات
  مثل `viewer.html` قيمة `location.search` الصحيحة.
- التنقّل مُغلَّف في `document.startViewTransition()` — لا شاشة بيضاء ولا تجمّد.
- `build.js` يحوّل `const`/`let`/`class` على المستوى الأعلى إلى `var` في صفحات
  التطبيق، فتُعاد-execut سكربتات الصفحة الكلاسيكية بأمان بعد كل تنقّل.
- الصفحات القانونية ونتائج OAuth تبقى تحميلاً كاملاً — وهو الخيار الأكثر أماناً.

---

## 📴 وضع عدم الاتصال (Offline-first)

البيانات تُقرأ من الجهاز **قبل** أي طلب شبكة، فلا تظهر هياكل تحميل ولا ينتظر
المستخدم انتهاء المهلة:

| البيانات | المصدر المحلي |
|---|---|
| الملف الشخصي (الاسم · الرتبة) | `medapp_profile_cache_v1` |
| خطة الدراسة (`plans-data.json`) | `medapp_plans_data_v1` + كاش الـ SW |
| المواد وأحدث الملفات | `medfav_data_*` |
| تقدّم المهام | مفاتيح `task_<date>_<id>` + `task_at_*` |
| الألبومات والصور | IndexedDB (`medapp_lecture_albums_v1`) |

- **stale-while-revalidate**: تُعاد النسخة المحفوظة فوراً، ويُحدَّث الكاش في الخلفية.
- كل طلب شبكة محدود بمهلة، فلا تتجمّد الواجهة أبداً.
- `sw.js` يخدم ملفات `.json` المحلية بـ **Cache First**، وصفحات HTML بـ
  **Network First**.
- عند انقطاع الشبكة لا يُرسَل **أي طلب شبكة** في صفحة "محاضراتي" — تُقرأ
  البيانات من IndexedDB مباشرة.
- حدث `online` لا يُوزَّع إلا عند **تغيّر حقيقي** في حالة الشبكة، وكل مستمعيه
  مخنوق بـ 30 ثانية ⇒ لا حلقات "إعادة الاتصال" ولا طلبات زائدة.

---

## 📱 تطبيق الأندرويد (APK)

المنصة تُوزَّع كتطبيق أندرويد أصلي مبني عبر **Capacitor**: نفس كود الواجهة داخل
WebView + طبقة أصلية.

| الميزة | التفاصيل |
|:---|---|
| 🔙 زر الرجوع الأصلي | يغلق النافذة المفتوحة، ثم يرجع للصفحة السابقة، ثم يطلب التأكيد قبل الخروج |
| 🎨 شريط الحالة | لونه يتابع الوضع النهاري/الليلي تلقائياً |
| 🧊 شاشة البدء | تظهر بلون الهوية وتختفي بعد أول رسم |
| 📡 حالة الشبكة | أحداث `online` / `offline` عند التغيّر الحقيقي فقط |
| 🔔 إشعارات Firebase (FCM) | التوكن يُحفظ في `profiles.fcm_token` والنقر ينقلك للمقصد |
| 🔏 توقيع الإنتاج | APK موقّع (Signature Scheme v2) — المفتاح في GitHub Secrets ويُفكّ داخل الـ CI فقط |
| 🔐 دخول Google أصلي | Credential Manager عبر SocialLogin |
| 📨 روابط عميقة | تأكيد البريد واستعادة كلمة المرور يعودان إلى التطبيق مباشرةً |
| 🏠 ودجات | 4 ودجات (Glance) تتحدّث من بيانات التطبيق المحلية |
| 👤 وضع الزائر | تصفّح المواد والقراءة بلا حساب — يُطلب الدخول فقط عند الحفظ أو التنزيل |

### بناء الـ APK محلياً

```bash
npm install
npm run build                            # يبني dist/ وحدها
npx cap sync android                     # ينسخ الويب + الإضافات إلى مشروع أندرويد
node tools/generate-app-icon.js          # أيقونة + شاشة بدء (اختياري)
cd android && ./gradlew assembleRelease  # نسخة موقّعة (يتطلب Android SDK + المفتاح)
```

> **المتطلبات:** Node.js **22+** (Capacitor 8 يرفض الإصدارات الأقدم) و
> **JDK 21** — والبناء على GitHub Actions مضبوط عليهما تلقائياً.

### الإصدار الآلي (CI)

workflow [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)
هو **المُصرِّف الرسمي** للمشروع (لا يوجد Android SDK على جهاز التطوير):

1. `npm install` → `npm run build` → `npx cap sync android`.
2. يفكّ مفتاح التوقيع من GitHub Secrets ويبني نسخة **Release** موقّعة.
3. يتحقق من التوقيع، ويعيد تنزيل الـ APK ويتحقق من بصمته.
4. ينشر الأصول بأسماء ثابتة:
   `Medical_Platform_Latest.apk` + `version.json` (يقرأهما المُحدِّث داخل التطبيق).
5. ينشئ **GitHub Release** بالوسم `vX.Y.Z`.

**الروابط العامة**

- APK: `https://pfjpeqhevegivjmyjvux.supabase.co/storage/v1/object/public/releases/Medical_Platform_Latest.apk`
- بيانات الإصدار: `.../releases/version.json`

> 🔑 **لتفعيل دخول Google الأصلي** ضع الـ **Web Client ID** في
> `supabase-config.js` → `GOOGLE_WEB_CLIENT_ID`.
>
> 🔐 **مفتاح التوقيع** في GitHub Secrets
> (`KEYSTORE_BASE64` · `KEYSTORE_PASSWORD` · `KEY_ALIAS` · `KEY_PASSWORD`).
>
> 📣 **إعلان التحديث** يحتاج `SUPABASE_SERVICE_ROLE_KEY` أو `CRON_SECRET`
> في Secrets (بدونه تُرجع الدالة 403 ولا يُرسل إشعار — والبناء لا يفشل).

---

## 📚 المواد المتاحة

⚛️ الفيزياء الطبية · 🧪 الكيمياء الطبية · 🧬 بيولوجيا الخلية · 📜 تاريخ الطب ·
🌐 اللغة الإنجليزية

---

## 🧑‍💻 للمطوّرين

> 📖 **الدليل الكامل للعمارة في [`ARCHITECTURE.md`](ARCHITECTURE.md)** — بناء
> المشروع، قواعد الـ SPA، استراتيجية عدم الاتصال، نظام التصميم، والودجات.
> اقرأه قبل تعديل أي ملف.

### قواعد سريعة

1. عدّل القوالب في `src/` و`partials/` — **لا** تعدّل `dist/` (مخرَج يُحذف ويُعاد إنشاؤه).
2. شغّل `npm run build` بعد كل تعديل.
3. أضف أي صفحة جديدة إلى `APP_PAGES` في `build.js` **و** `app.js` **و** `PRECACHE_URLS` في `sw.js`.
4. ارفع رقم `APP_VERSION` (في `build.js` و`sw.js`) و`versionCode` عند كل إصدار — **كل الملفات أو لا شيء** (انظر `PROJECT_STATE.md` §3.2).

### 🗄️ مخططات قاعدة البيانات

مخططات SQL محفوظة في `supabase/migrations/` — تُطبَّق من
**Supabase → SQL Editor** (كل ملف آمن للتكرار).

---

<div align="center">

**صُنع بحب لطلاب السنة التحضيرية الطبية** 💚

</div>
