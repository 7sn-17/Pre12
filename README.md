<div align="center">

<img src="icon-512.png" alt="شعار المنصة الطبية" width="120" height="120" />

# 📚 المنصة الطبية — السنة التحضيرية

### Pre12 · منصة تعليمية مجانية لطلاب السنة التحضيري الطبية

**كتب · ملخصات · ملاحظات · أهداف · محاضراتي · تقدّم · سلسلة أيام · قراءة بدون إنترنت**

<br>

![Version](https://img.shields.io/badge/version-4.7.0-10b981?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Ready-8b5cf6?style=for-the-badge)
![Offline](https://img.shields.io/badge/Offline-First-3b82f6?style=for-the-badge)
![SPA](https://img.shields.io/badge/SPA-a78bfa?style=for-the-badge)
![License](https://img.shields.io/badge/license-Free-10b981?style=for-the-badge)

<br>

### 🚀 [**افتح المنصة**](https://pre-three-pearl.vercel.app/)

</div>

---

## ✨ نظرة سريعة

منصة تعليمية **مجانية 100%** لطلاب السنة التحضيرية الطبية: مكتبة منظمة من الكتب
والملخصات، نظام ملاحظات وأهداف دراسية، معرض صور احترافي لمشاركة المحاضرات
والجداول، وتقدّم دراسي محسوب من **يوم الإنجاز الفعلي** — وكل ذلك **يعمل بدون
إنترنت**.

بُنيت المنصة كتطبيق ويب تقدّمي (**PWA**) بواجهة **RTL** عربية بالكامل، مع
**محرّك تنقّل فوري (SPA)** يبقي المكتبات وجلسة المستخدم والثيم محمّلة مرة واحدة
فقط أثناء التنقّل بين الصفحات.

---

## 🎯 المميزات

| الميزة | الوصف |
|:------:|:------|
| 📖 **قراءة بدون إنترنت** | حمّل الملفات واقرأها في أي وقت (PWA) |
| ⚡ **فتح فوري دون إنترنت** | البنية تعمل بالكامل بلا شبكة — لا هياكل تحميل ولا انتظار |
| 🔥 **سلسلة الأيام (Streak)** | عدّاد نار + ورقة إحصائيات بنمط Duolingo (أسبوع · شهر · الكل) |
| 🔑 **دخول سريع بـ Google** | زر "المتابعة باستخدام Google" بنسخة رسمية (OAuth) |
| 📝 **ملاحظات ذكية** | خاصة (محلياً) + مشتركة (سحابياً) |
| 🎯 **أهداف دراسية** | تابع إنجازك بمؤشر بصري |
| 📊 **تقدمي** | بطاقة لكل مادة تفتح نافذة مهامها (منجزة / متبقية) |
| 📸 **محاضراتي** | معرض بالسحب والقرص والتكبير + قص + طلبات مشاركة + يعمل بلا إنترنت |
| 🗂️ **مزامنة بين الأجهزة** | المهام والملاحظات والمفضّلة تتزامن مع حسابك |
| 🛡️ **لوحة تحكم** | إحصائيات الطلاب وتقدّمهم |
| 🎨 **تصميم عصري** | وضع نهاري/ليلي بانتقال ناعم · عربي RTL · Mobile-First |

---

## 🏗️ البنية التقنية

```
Pre12/
├── src/                 # 📄 القوالب (المصدر الحقيقي) — front-matter + includes
│   └── *.html           #    22 صفحة
├── partials/            # 🧩 القوالب المشتركة (head · header · topbar · footer · scripts)
│
├── app.js               # ⚡ محرّك التنقّل الفوري (SPA shell)
├── build.js             # 🏗️  مُولِّد الموقع (Node.js) — يدمج partials ويكتب الجذر + dist/
├── sw.js                # 🛡️  Service Worker (Network-First للـ HTML · Cache-First للـ JSON)
├── auth.js              # 🔐 المصادقة + كاش الملف الشخصي
├── db.js                # 💾 IndexedDB + طابور مزامنة المهام
├── sync.js              # 🔄 المزامنة بين الأجهزة
├── files.js             # 📚 جلب البيانات + منطق "رابط أم ملف"
├── streak.js            # 🔥 نواة حساب سلسلة الأيام (منطق نقي)
│
├── supabase-config.js   # 🔑 إعداد Supabase (URL + anon key)
├── theme-init.js        # 🎨 تطبيق الثيم قبل أول رسم
├── manifest.json        # 📱 بيانات PWA
│
├── *.html               # ✅ صفحات مبنية (جاهزة للخدمة من الجذر)
├── icons/  plans/  *.png # 🎨 الأصول
└── dist/                # 🚀 مخرجات النشر (ينشئها npm run build)
```

### التقنيات

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

</div>

- **الواجهة:** HTML5 + CSS3 + Vanilla JavaScript (بلا أي إطار عمل)
- **الخلفية:** Supabase (PostgreSQL · Storage · Auth)
- **دون اتصال:** Service Worker · Cache API · IndexedDB · LocalStorage
- **الأيقونات:** Lucide + Font Awesome 6 · **الخطوط:** Cairo

---

## 🚀 التشغيل المحلي

```bash
# 1) تثبيت الاعتماديات (مرة واحدة)
npm install

# 2) بناء الموقع (يكتب الجذر + dist/)
npm run build
```

ثم قدّم المجلد بأي خادم ملفات ثابت:

```bash
python3 -m http.server 8000
# أو
npx serve .
```

> افتح <http://localhost:8000/> — ولا تخدم `src/` أو `partials/` مباشرةً،
> فهما قوالب خام تحتوي على `{{المتغيّرات}}`.

**المتطلبات:** Node.js ≥ 18 (الاعتماد الوحيد هو `acorn`، محلّل JS وقت البناء).

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
يكتب **نسخة نهائية** في الجذر وأخرى في `dist/` (المجلدان متطابقان تماماً).

**لماذا؟** لأن خدمة الجذر مباشرةً يجب ألا تعرض القوالب الخام أبداً — القوالب
الخام بلا `<meta charset>` ولا `viewport` ولا خطوط ولا سكربتات، فتبدو العربية
مشوّهة وتعلق الصفحات على الـ spinner.

---

## ⚡SPA shell

الصفحات التالية تُنقَّل عبر `app.js` **بدون** إعادة تحميل المستند:
`index · subject · viewer · notes · goals · my-lectures · all-files · tools · gpa ·
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
  **Network First** (لتظهر أي نسخة جديدة فوراً).
- عند انقطاع الشبكة لا يُرسَل **أي طلب شبكة** في صفحة "محاضراتي" — تُقرأ
  البيانات من IndexedDB مباشرة.

---

## 🚀 النشر على Vercel

`vercel.json` يضبط `buildCommand: npm run build` و`outputDirectory: dist`،
فتُبنى `dist/` على خادم Vercel عند كل نشر.

- الأصول الثابتة (CSS/JS/الصور/الخطوط) بـ `immutable` لمدة سنة.
- ملفات JS المحلية بـ `must-revalidate`، ويُحمَّل `app.js` برقم إصدار
  (`app.js?v=…`) حتى يتجاوز الزائر أي نسخة قديمة.
- صفحات HTML بـ **Network First** من `sw.js`.

> 🧹 **إن ظهرت الواجهة القديمة بعد النشر:** تحديث قوي (Hard Reload) مرة واحدة —
> تسجيل `sw.js` الجديد يكتشف العامل القديم ويعيد تحميل الصفحة تلقائياً.

---

## 📚 المواد المتاحة

⚛️ الفيزياء الطبية · 🧪 الكيمياء الطبية · 🧬 بيولوجيا الخلية · 📜 تاريخ الطب ·
🌐 اللغة الإنجليزية

---

## 🧑‍💻 للمطوّرين

> 📖 **الدليل الكامل للعمارة في [`ARCHITECTURE.md`](ARCHITECTURE.md)** — بناء
> المشروع، قواعد الـ SPA، استراتيجية عدم الاتصال، نظام التصميم، وأي شاشات
> تخطيط الذاكرة. اقرأها قبل تعديل أي ملف.

### قواعد سريعة

1. عدّل القوالب في `src/` و`partials/` — **لا** تعدّل `*.html` في الجذر ولا `dist/`.
2. شغّل `npm run build` بعد كل تعديل.
3. أضف أي صفحة جديدة إلى `APP_PAGES` في `build.js` **و** `app.js` **و** `PRECACHE_URLS` في `sw.js`.
4. ارفع رقم `APP_VERSION` (في `build.js` و`sw.js`) عند تعديل `app.js`.

### 📁 مخططات قاعدة البيانات

مخططات SQL محفوظة في `supabase/migrations/` — تُطبَّق يدوياً من
**Supabase → SQL Editor → New query** (كل ملف آمن للتكرار).

---

<div align="center">

**صُنع بحب لطلاب السنة التحضيرية الطبية** 💚

</div>
