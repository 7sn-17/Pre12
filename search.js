// ============================================================
// search.js — محرّك البحث الشامل (Universal Search)
// ------------------------------------------------------------
// ⭐⭐ v4.6.4 — إعادة بناء كاملة (Phase 33)
//   • بحث حيّ حقيقي: مستمع 'input' واحد فقط، بلا مفاتيح مخصّصة
//     وبلا keydown/keyup/change/submit على حقل البحث.
//   • تأخير صارم 250ms مع إلغاء الطلبات القديمة.
//   • تصفية محلية بـ includes() (تجاهل حالة الأحرف) قبل الشبكة.
//   • حدّ 50 نتيجة + رسم عبر requestAnimationFrame (منع التجمّد).
//   • الملفّات:  supabase.from('files').select('*').ilike('title', '%q%')
//   • المواد:  supabase.from('subjects').select('id, name').ilike('name', '%q%')
//   • دمج مع الذاكرة المحلية + إزالة التكرار
//
// ⭐ يعمل على الويب والتطبيق معاً ( supabaseClient عامّ ).
// ============================================================
(function (global) {
  'use strict';

  // ⭐ v5.1.2 — تأخير أقصر (150ms) ليظهر البحث أثناء الكتابة العربية
  //   بلا إحساس بالتجمّد، مع إلغاء الطلبات القديمة كما كان.
  var DEBOUNCE_MS = 150;
  var MAX_FILES = 40;
  var MAX_SUBJECTS = 12;
  // ⭐ حدّ النتائج المعروضة — يمنع تجميد الواجهة مع الملفات الكبيرة.
  var MAX_RESULTS = 50;

  var timer = null;
  var requestId = 0;

  function client() {
    return global.supabaseClient || null;
  }

  /* ==========================================================
     ⭐⭐⭐ Phase W16 — تطبيع النصّ العربي (جذر «البحث لا يعمل بالعربي»)
     ------------------------------------------------------------
     المشكلة: المستخدم يكتب «احمد» والملف عنوانه «أحمد» ⇒
     `includes()` لا يطابق أبداً ⇒ «لا شيء يحدث» (بينما الإنجليزي
     يعمل لأنّه لا يحتاج تطبيعاً).

     `normalizeArabic` يزيل التشكيل والتطويل ويوحّد صور الألف
     والياء والتاء المربوطة والهمزات — فيطابق «احمد» ← «أحمد»
     و«مستشفي» ← «مستشفى».

     `foldArabic` هو **نفس التطبيع لكن بمواضعه** (كل حرف ← حرف):
     نحتاجه في بحث الـPDF حيث تعتمد مواضع التظليل على أرقام
     الحروف الأصلية (فلا يجوز تغيير طول النصّ).
     ========================================================== */

  // التشكيل + التطويل + علامات قرآنية.
  var ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g;

  /** صور الألف → ا */
  var ALEF_FORMS = /[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g;
  /** ؤ → و ، ئ → ي (كلٌّ منهما حرف واحد ⇒ المواضع محفوظة) */
  var HAMZA_FORMS = /[\u0624\u0626]/g;
  /** ى + ی + ي الفارسية → ي */
  var ALEF_MAKSURA = /[\u0649\u06CC\u06D2]/g;
  /** ة → ه ، ک → ك ، گ → گ */
  var TA_MARBUTA = /\u0629/g;
  var KEHEH = /\u06A9/g;

  /**
   * ⭐ التطبيع الكامل — يُستخدم في البحث المحلي (لا موضع للكلمة).
   */
  function normalizeArabic(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(ARABIC_MARKS, '')
      .replace(ALEF_FORMS, '\u0627')
      .replace(HAMZA_FORMS, '\u0648')
      .replace(ALEF_MAKSURA, '\u064A')
      .replace(TA_MARBUTA, '\u0647')
      .replace(KEHEH, '\u0643')
      .replace(/\u0626/g, '\u064A')
      .toLowerCase()
      .trim();
  }

  /**
   * ⭐ تطبيع **يحافظ على المواضع** (كل حرف ← حرف واحد) — لبحث الـPDF
   *   حيث تُستعمل أرقام الحروف لتظليل النتيجة.
   */
  function foldArabic(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(ALEF_FORMS, '\u0627')
      .replace(HAMZA_FORMS, '\u0648')
      .replace(ALEF_MAKSURA, '\u064A')
      .replace(TA_MARBUTA, '\u0647')
      .replace(KEHEH, '\u0643')
      .replace(/\u0626/g, '\u064A')
      .toLowerCase();
  }

  function normalize(value) {
    return normalizeArabic(value);
  }

  /** ⭐ اسم المادة من الملف (يدعم السلسلة والعنصر) */
  function subjectNameOf(file) {
    if (!file) return '';
    if (typeof file.subjects === 'string') return file.subjects;
    if (file.subjects && file.subjects.name) return file.subjects.name;
    if (file.subject_name) return file.subject_name;
    if (file.subject) return file.subject;
    return '';
  }

  /**
   * ⭐ التصفية المحلية — includes() مع تجاهل حالة الأحرف.
   *   ⭐ v4.6.4: تُطبّع الاستعلام داخلياً، فتصحّ مع أي حرف صغير/كبير.
   */
  function matchesText(file, q) {
    if (!file) return false;
    var needle = normalize(q);
    if (!needle) return false;
    // ⭐ W16 — النصّ **مطبَّع** أيضاً: «احمد» تطابق «أحمد»…
    var title = normalizeArabic(file.title);
    if (title.includes(needle)) return true;
    var description = normalizeArabic(file.description);
    if (description.includes(needle)) return true;
    var subject = normalizeArabic(subjectNameOf(file));
    if (subject.includes(needle)) return true;
    return false;
  }

  /** ⭐ البحث المحلي (الذاكرة) — بحدّ أقصى للنتائج */
  function searchLocal(cache, q) {
    var list = Array.isArray(cache) ? cache : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (matchesText(list[i], q)) {
        out.push(list[i]);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }

  /** ⭐ البحث السحابي: الملفات + المواد */
  async function searchCloud(q) {
    var supa = client();
    var out = { files: [], subjects: [], error: null };

    if (!supa || !global.navigator || global.navigator.onLine === false) return out;

    try {
      var filesRes = await supa
        .from('files')
        .select('*, subjects(name)')
        .ilike('title', '%' + q + '%')
        .limit(MAX_FILES);
      if (filesRes && filesRes.error) throw filesRes.error;
      out.files = (filesRes && filesRes.data) || [];
    } catch (e) {
      out.error = e;
    }

    try {
      var subjectsRes = await supa
        .from('subjects')
        .select('id, name, slug')
        .ilike('name', '%' + q + '%')
        .limit(MAX_SUBJECTS);
      if (subjectsRes && !subjectsRes.error) out.subjects = subjectsRes.data || [];
    } catch (e) {
      // ⭐ خطأ غير قاتل — الملفات تكفي
    }

    return out;
  }

  /** ⭐ دمج النتائج المحلية مع السحابية + إزالة التكرار + حدّ 50 */
  function mergeFiles(local, cloud) {
    var seen = Object.create(null);
    var files = [];
    var list = (local || []).concat(cloud || []);
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      if (!file) continue;
      var key = file.id || ('t:' + (file.title || ''));
      if (!key || seen[key]) continue;
      seen[key] = 1;
      files.push(file);
      if (files.length >= MAX_RESULTS) break;
    }
    return files;
  }

  /**
   * ⭐⭐ البحث الكامل (بلا تأخير) — يُرجع { files, subjects, query }.
   */
  async function run(query, options) {
    options = options || {};
    var q = normalize(query);
    if (!q) return { files: [], subjects: [], query: '', error: null };

    var local = searchLocal(options.cache, q);
    var cloud = await searchCloud(q);

    return {
      files: mergeFiles(local, cloud.files),
      subjects: (cloud.subjects || []).slice(0, MAX_SUBJECTS),
      query: q,
      error: cloud.error || null
    };
  }

  /**
   * ⭐⭐ debounce صحيح: آخر استدعاء فقط هو الذي ينفّذ.
   * @param {function} fn
   * @param {number} wait
   */
  function debounce(fn, wait) {
    var handle = null;
    return function () {
      var args = arguments;
      var self = this;
      if (handle) clearTimeout(handle);
      handle = setTimeout(function () {
        handle = null;
        fn.apply(self, args);
      }, Math.max(0, Number(wait) || 0));
    };
  }

  /**
   * ⭐⭐ بحث مؤجَّر — يُستدعى من مستمع 'input' فقط.
   * @param {string} query
   * @param {function} onResult  (result) => void
   * @param {function} onLoading () => void
   * @param {object} options     { cache, onLocal }
   *
   * ⭐ v4.6.4: التأخير صارم 150ms (v5.1.2)، والنتائج المحلية تظهر فوراً
   *   (بلا شبكة) فلا يضطر المستخدم للانتظار.
   */
  function debounced(query, onResult, onLoading, options) {
    options = options || {};
    var q = normalize(query);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (!q) {
      requestId++;
      if (typeof onResult === 'function') onResult({ files: [], subjects: [], query: '', error: null });
      return;
    }

    // ⭐ 1) النتائج المحلية فوراً — أول حرف يعطي نتيجة.
    if (typeof options.onLocal === 'function') {
      try {
        options.onLocal(searchLocal(options.cache, q));
      } catch (e) {
        console.warn('[search] the local pass failed:', e);
      }
    }

    if (typeof onLoading === 'function') onLoading();

    var id = ++requestId;
    timer = setTimeout(async function () {
      timer = null;
      var result = await run(q, options);
      // ⭐ نتجاهل النتائج القديمة إن وصل بحث أحدث
      if (id !== requestId) return;
      if (typeof onResult === 'function') onResult(result);
    }, DEBOUNCE_MS);
  }

  /**
   * ⭐⭐⭐⭐ v5.1.2 — ربط حقل البحث بلا أي مرشّح وبلا isComposing.
   *
   *   القاعدة الذهبية: **لا نفحص** e.isComposing ولا inputType ولا
   *   أي شرط آخر — نقرأ قيمة الحقل من الـDOM ونمرّرها للمعالج.
   *
   *   الأحداث التي نربطها فقط:
   *     input · compositionupdate · compositionend
   *
   *   لا keydown ولا keyup: البحث لا ينتظر Enter ولا حذفاً ولا نهاية
   *   تكوين الـIME. الـdebounce (100ms) مسؤولية الصفحة المستدعية، حتى
   *   تبقى كل صفحة حرّة في ضبطه (عارض الـPDF يستخدم 100ms).
   *
   * @param {HTMLInputElement} input
   * @param {function} handler  (value, event) => void
   */
  function bindSearchInput(input, handler) {
    if (!input || typeof handler !== 'function') return;

    // ⭐ تدمير أي مستمعين سابقين على هذا الحقل.
    var previous = input.__medappSearchHandlers;
    if (previous) {
      Object.keys(previous).forEach(function (type) {
        var fn = previous[type];
        if (!fn) return;
        try { input.removeEventListener(type, fn); } catch (e) {}
      });
      input.__medappSearchHandlers = null;
    }

    function readDomValue() {
      try { return input.value || ''; } catch (e) { return ''; }
    }

    // ⭐ قيمة الـDOM هي الحقيقة دائماً — لا نعيد بناء النصّ من event.data
    //   (وهو ما كان يكرّر أوّل حرف عربي في بعض لوحات المفاتيح).
    var handleSearchInput = function (event) {
      handler(String(readDomValue()), event);
    };

    var handleCompositionEnd = function (event) {
      handleSearchInput(event);
      // ⭐ بعض WebViews تُثبّت القيمة النهائية **بعد** الحدث — قراءة أخيرة
      //   في المهمّة التالية تضمن ألّا يضيع آخر حرف عربي.
      setTimeout(function () {
        handler(readDomValue(), event);
      }, 0);
    };

    var handlers = {
      input: handleSearchInput,
      compositionupdate: handleSearchInput,
      compositionend: handleCompositionEnd
    };
    input.__medappSearchHandlers = handlers;
    Object.keys(handlers).forEach(function (type) {
      input.addEventListener(type, handlers[type]);
    });
  }

  global.MedAppSearch = {
    DEBOUNCE_MS: DEBOUNCE_MS,
    MAX_RESULTS: MAX_RESULTS,
    run: run,
    debounced: debounced,
    debounce: debounce,
    bindSearchInput: bindSearchInput,
    searchLocal: searchLocal,
    matchesText: matchesText,
    mergeFiles: mergeFiles,
    normalize: normalize,
    // ⭐⭐⭐ W16 — أدوات التطبيع العربي (تستخدمها كل صفحات البحث).
    normalizeArabic: normalizeArabic,
    foldArabic: foldArabic
  };
})(window);
