// ============================================================
// search.js — محرّك البحث الشامل (Universal Search)
// ------------------------------------------------------------
// ⭐ Phase 29 — أُعيد بناؤه من الصفر
//
//   • بحث مؤجَّر (debounce) 300 مللي ثانية
//   • الملفات:  supabase.from('files').select('*').ilike('title', '%q%')
//   • المواد:  supabase.from('subjects').select('id, name').ilike('name', '%q%')
//   • دمج مع الذاكرة المحلية + إزالة التكرار
//   • "لا توجد نتائج" عند الفراغ
//
// ⭐ يعمل على الويب والتطبيق معاً ( supabaseClient عامّ ).
// ============================================================
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 150;
  var MAX_FILES = 40;
  var MAX_SUBJECTS = 12;

  var timer = null;
  var requestId = 0;

  function client() {
    return global.supabaseClient || null;
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  /** ⭐ البحث المحلي (الذاكرة) */
  function searchLocal(cache, q) {
    var list = Array.isArray(cache) ? cache : [];
    return list.filter(function (file) {
      return (file.title || '').toLowerCase().indexOf(q) > -1 ||
        (file.description || '').toLowerCase().indexOf(q) > -1 ||
        ((file.subjects && file.subjects.name) || '').toLowerCase().indexOf(q) > -1;
    });
  }

  /** ⭐ البحث السحابي: الملفات + المواد */
  async function searchCloud(q) {
    var supa = client();
    var out = { files: [], subjects: [], error: null };

    if (!supa || !navigator.onLine) return out;

    try {
      var filesRes = await supa
        .from('files')
        .select('*, subjects(name)')
        .ilike('title', '%' + q + '%')
        .limit(MAX_FILES);
      if (filesRes.error) throw filesRes.error;
      out.files = filesRes.data || [];
    } catch (e) {
      out.error = e;
    }

    try {
      var subjectsRes = await supa
        .from('subjects')
        .select('id, name, slug')
        .ilike('name', '%' + q + '%')
        .limit(MAX_SUBJECTS);
      if (!subjectsRes.error) out.subjects = subjectsRes.data || [];
    } catch (e) {
      // ⭐ MATERIAL خطأ غير قاتل — الملفات تكفي
    }

    return out;
  }

  /**
   * ⭐⭐ البحث الكامل (بلا تأخير) — يُرجع { files, subjects, query }.
   */
  async function run(query, options) {
    options = options || {};
    var q = normalize(query);
    if (!q) return { files: [], subjects: [], query: q };

    var local = searchLocal(options.cache, q);
    var cloud = await searchCloud(q);

    // ⭐ دمج + إزالة التكرار
    var seen = Object.create(null);
    var files = [];
    local.concat(cloud.files || []).forEach(function (file) {
      var key = file.id || ('t:' + (file.title || ''));
      if (!key || seen[key]) return;
      seen[key] = 1;
      files.push(file);
    });

    var seenSubjects = Object.create(null);
    var subjects = [];
    (cloud.subjects || []).forEach(function (subject) {
      var key = subject.id || subject.name;
      if (!key || seenSubjects[key]) return;
      seenSubjects[key] = 1;
      subjects.push(subject);
    });

    return { files: files, subjects: subjects, query: q, error: cloud.error || null };
  }

  /**
   * ⭐⭐ بحث مؤجَّر — يُستدعى عند كل ضغطة مفتاح.
   * @param {string} query
   * @param {function} onResult  (result) => void
   * @param {function} onLoading () => void
   * @param {object} options     { cache, debounce, onLocal }
   *
   * ⭐ v4.6.1: options.onLocal (localFiles) => void — تُستدعى فوراً
   *   بالنتائج المحلية، فلا ينتظر المستخدم السحابة لأرى أول حرف.
   */
  function debounced(query, onResult, onLoading, options) {
    var q = normalize(query);

    if (timer) clearTimeout(timer);

    if (!q) {
      requestId++;
      if (typeof onResult === 'function') onResult({ files: [], subjects: [], query: '' });
      return;
    }

    // ⭐ النتائج المحلية فوراً.
    if (options && typeof options.onLocal === 'function') {
      try {
        options.onLocal(searchLocal(options.cache, q));
      } catch (e) {
        console.warn('[search] the local pass failed:', e);
      }
    }

    if (typeof onLoading === 'function') onLoading();

    var id = ++requestId;
    // ⭐ v4.6.3 — HOTFIX: البحث الحيّ — لا ننتظر أكثر من 150ms مهما
    //   كان التأخير الذي يطلبه المستدعي (150ms = فوري عملياً).
    var wait = options && options.debounce
      ? Math.min(Number(options.debounce) || DEBOUNCE_MS, DEBOUNCE_MS)
      : DEBOUNCE_MS;
    timer = setTimeout(async function () {
      var result = await run(q, options);
      // ⭐ نتجاهل النتائج القديمة إن وصل بحث أحدث
      if (id !== requestId) return;
      if (typeof onResult === 'function') onResult(result);
    }, wait);
  }

  global.MedAppSearch = {
    DEBOUNCE_MS: DEBOUNCE_MS,
    run: run,
    debounced: debounced,
    searchLocal: searchLocal,
    normalize: normalize
  };
})(window);
