// ============================================
// files.js — مكتبة جلب الملفات والمواد
// Version 3.0.0 — Font Awesome + دعم كامل لكل الصيغ
// ============================================

// ============================================
// Cache Helper — يستخدم localStorage
// ============================================
const DATA_CACHE_PREFIX = 'medfav_data_';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 أيام
const FILES_VERSION = '3.0.0';

function saveDataCache(key, data) {
  try {
    localStorage.setItem(
      DATA_CACHE_PREFIX + key,
      JSON.stringify({
        data,
        time: Date.now(),
        version: FILES_VERSION
      })
    );
  } catch (err) {
    console.warn('saveDataCache error:', err);
  }
}

function getDataCache(key) {
  try {
    const cached = localStorage.getItem(DATA_CACHE_PREFIX + key);
    if (!cached) return null;

    const parsed = JSON.parse(cached);

    if (parsed.time && Date.now() - parsed.time > CACHE_MAX_AGE) {
      localStorage.removeItem(DATA_CACHE_PREFIX + key);
      return null;
    }

    return parsed.data;
  } catch (err) {
    console.warn('getDataCache error:', err);
    return null;
  }
}

function clearOldCache() {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith(DATA_CACHE_PREFIX)) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          if (parsed.time && now - parsed.time > CACHE_MAX_AGE) {
            localStorage.removeItem(key);
          }
        } catch (e) {}
      }
    });
  } catch (err) {}
}

function isOnline() {
  return navigator.onLine;
}

// ⭐ Offline-first: هل نحن غير متصلين فعلياً؟
// نستخدم navigator.onLine مع فحص navigator.connection كخط دفاع ثانٍ
// لأن بعض المتصفحات تُرجع true بينما الطلبات تفشل فعلياً.
function isOffline() {
  try {
    if (navigator.onLine === false) return true;
    if (navigator.connection && navigator.connection.type === 'none' && navigator.onLine === false) return true;
  } catch (e) {}
  return false;
}

// مهلة الطلبات إلى الشبكة. بعدها نرجع للنسخة المخزَّنة فوراً
// بدل انتظار فشل الاتصال (وهو ما كان يوقف الواجهة خلف الهياكل).
const NETWORK_TIMEOUT_MS = 6000;

/**
 * يحدّ من مدة الانتظار لأي وعد (Promise) — يُستخدم مع طلبات الشبكة
 * حتى لا يعلّق التطبيق على مهلة طويلة عند انقطاع الاتصال.
 */
function withTimeout(promise, ms) {
  const timeout = ms || NETWORK_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('timeout'));
    }, timeout);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ============================================
// Cache-First helpers — البيانات المحلية
// ============================================
// خطة الدراسة (plans-data.json) وبيانات المواد ملفات محلية، فلا
// داعي لانتظار الشبكة في وضع عدم الاتصال. تُخزَّن نسخة في
// localStorage لتكون فورية حتى قبل أن يستجيب الـ Service Worker.

const PLAN_DATA_CACHE_KEY = 'medapp_plans_data_v1';
const SUBJECT_COUNT_CACHE_KEY = 'medapp_subject_file_counts_v1';

/**
 * يحمّل خطة الدراسة (plans-data.json) مع ترتيب:
 *   1) الذاكرة المحلية (فوري تماماً)
 *   2) الشبكة (عند الاتصال) مع تحديث الذاكرة
 *   3) الذاكرة المحلية عند فشل الشبكة
 */
async function fetchPlanData(options) {
  options = options || {};
  const force = !!options.force;

  const readCache = () => {
    try {
      const raw = localStorage.getItem(PLAN_DATA_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed.data : null;
    } catch (e) {
      return null;
    }
  };

  const writeCache = (data) => {
    try {
      localStorage.setItem(PLAN_DATA_CACHE_KEY, JSON.stringify({
        data: data,
        at: Date.now()
      }));
    } catch (e) {}
  };

  // ⭐ غير متصل: لا نلمس الشبكة إطلاقاً.
  if (isOffline()) {
    const cached = readCache();
    if (cached) return cached;
    try {
      const res = await fetch('plans-data.json', { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        writeCache(data);
        return data;
      }
    } catch (e) {}
    return null;
  }

  try {
    const res = await fetch('plans-data.json', { cache: force ? 'reload' : 'default' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    writeCache(data);
    return data;
  } catch (err) {
    console.warn('fetchPlanData error:', err && err.message ? err.message : err);
    return readCache();
  }
}

/**
 * ⭐⭐ Phase W12 — عدد ملفات مادة معيّن.
 *
 * ⚠️ كان هنا استنزافٌ ضخم لسجلّات Supabase: كل فتح للصفحة كان يرسل
 *   طلب HEAD لكل مادة (≈٢٧٠٠ طلب في اليوم لكل مادة ⇒ أكثر من ١٦٬٠٠٠
 *   سجلّ). الآن:
 *   • النتيجة تُخزَّن محلياً مع **وقت** (TTL)؛
 *   • إذا كانت新鮮اً نُعيده **فوراً بلا شبكة**؛
 *   • إذا قَدَم نُعيده ونُحدّثه في الخلفية (stale-while-revalidate)؛
 *   • الشبكة تُستدعى فقط عند غياب أي نسخة مخزَّنة.
 */
async function fetchSubjectFileCount(subjectId) {
  const cacheKey = SUBJECT_COUNT_CACHE_KEY;
  const TTL_MS = 30 * 60 * 1000; // ٣٠ دقيقة

  const readAll = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  };

  const writeAll = (map) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(map));
    } catch (e) {}
  };

  const key = String(subjectId);
  const map = readAll();
  const entry = map[key];

  // ⭐ نسخة حديثة ⇒ لا شبكة إطلاقاً.
  if (entry && typeof entry.count === 'number') {
    const age = Date.now() - (Number(entry.at) || 0);
    if (age < TTL_MS) return entry.count;
    // ⭐ نسخة قديمة ⇒ نُعيدها الآن ونُحدّثها في الخلفية.
    refreshSubjectFileCount(subjectId, readAll, writeAll);
    return entry.count;
  }

  // ⭐ نسخة قديمة بلا وقت (من الإصدارات السابقة) ⇒ نستخدمها مرّة ونحدّثها.
  if (entry && typeof entry.count === 'number') {
    refreshSubjectFileCount(subjectId, readAll, writeAll);
    return entry.count;
  }

  // ⭐ لا نسخة ⇒ شبكة (مع مهلة).
  if (isOffline()) return null;
  try {
    const result = await withTimeout(
      supabaseClient
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subjectId)
        .eq('is_published', true),
      NETWORK_TIMEOUT_MS
    );
    if (result.error) throw result.error;

    const count = result.count || 0;
    const fresh = readAll();
    fresh[key] = { count: count, at: Date.now() };
    writeAll(fresh);
    return count;
  } catch (err) {
    return null;
  }
}

/** ⭐ تحديث خلفي للعدد (بلا انتظار، وبلا 影响 على الواجهة). */
function refreshSubjectFileCount(subjectId, readAll, writeAll) {
  if (isOffline()) return;
  Promise.resolve(
    withTimeout(
      supabaseClient
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subjectId)
        .eq('is_published', true),
      NETWORK_TIMEOUT_MS
    )
  ).then(function (result) {
    if (!result || result.error) return;
    const map = readAll();
    map[String(subjectId)] = { count: result.count || 0, at: Date.now() };
    writeAll(map);
  }).catch(function () {});
}

// تنظيف دوري
clearOldCache();

// ============================================
// 1. جلب جميع المواد
// ============================================
// ⭐ Offline-first + Stale-While-Revalidate:
//    إن وُجدت نسخة مخزَّنة نُعيدها فوراً (بلا هيكل تحميل)، ونحدّثها
//    في الخلفية عند توفّر الشبكة.
async function fetchSubjects(options) {
  options = options || {};
  const cached = getDataCache('subjects');

  if (isOffline()) {
    return cached || [];
  }

  const network = (async () => {
    const result = await withTimeout(
      supabaseClient
        .from('subjects')
        .select('*')
        .order('sort_order', { ascending: true }),
      NETWORK_TIMEOUT_MS
    );
    if (result.error) throw result.error;
    if (result.data && result.data.length > 0) {
      saveDataCache('subjects', result.data);
    }
    return result.data || [];
  })();

  if (cached) {
    network
      .then((fresh) => { if (fresh && options.onFresh) options.onFresh(fresh); })
      .catch(() => {});
    return cached;
  }

  try {
    return await network;
  } catch (err) {
    console.warn('fetchSubjects error:', err.message);
    return cached || [];
  }
}

// ============================================
// 2. جلب بيانات مادة واحدة
// ============================================
async function fetchSubjectBySlug(subjectSlug) {
  const cacheKey = `subject_${subjectSlug}`;

  if (!isOnline()) {
    return getDataCache(cacheKey) || null;
  }

  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .eq('slug', subjectSlug)
      .single();

    if (error) throw error;

    if (data) saveDataCache(cacheKey, data);
    return data;
  } catch (err) {
    console.warn('fetchSubjectBySlug error:', err.message);
    return getDataCache(cacheKey);
  }
}

// ============================================
// 3. جلب ملفات مادة محددة
// ============================================
async function fetchFilesBySubject(subjectSlug) {
  const cacheKey = `subject_files_${subjectSlug}`;

  if (!isOnline()) {
    return getDataCache(cacheKey) || [];
  }

  try {
    // 1. اجلب المادة
    const { data: subject, error: subError } = await withTimeout(
      supabaseClient
        .from('subjects')
        .select('*')
        .eq('slug', subjectSlug)
        .single(),
      NETWORK_TIMEOUT_MS
    );

    if (subError) throw subError;
    if (!subject) throw new Error('المادة غير موجودة');

    // 2. اجلب كل الملفات بـ select *
    const { data: files, error: filesError } = await withTimeout(
      supabaseClient
        .from('files')
        .select('*')
        .eq('subject_id', subject.id)
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
      NETWORK_TIMEOUT_MS
    );

    if (filesError) throw filesError;

    // 3. دمج المادة مع كل ملف
    const merged = (files || []).map(f => ({
      ...f,
      subjects: subject
    }));

    saveDataCache(cacheKey, merged);
    return merged;

  } catch (err) {
    console.warn('fetchFilesBySubject error:', err.message);
    return getDataCache(cacheKey) || [];
  }
}

// ============================================
// 4. جلب أحدث الملفات
// ============================================
async function fetchRecentFiles(limit = 10, options) {
  options = options || {};
  const cacheKey = `recent_files_${limit}`;
  const cached = getDataCache(cacheKey);

  if (isOffline()) {
    return cached || [];
  }

  const network = (async () => {
    // ⭐ 1. اجلب كل الأعمدة (select * يعطي كل شيء)
    const { data: files, error: filesError } = await withTimeout(
      supabaseClient
        .from('files')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(limit),
      NETWORK_TIMEOUT_MS
    );

    if (filesError) throw filesError;

    if (!files || files.length === 0) {
      saveDataCache(cacheKey, []);
      return [];
    }

    // ⭐ 2. اجلب المواد المستخدمة فقط
    const subjectIds = [...new Set(
      files.map(f => f.subject_id).filter(Boolean)
    )];

    let subjectsMap = {};
    if (subjectIds.length > 0) {
      const { data: subjects, error: subjectsError } = await withTimeout(
        supabaseClient
          .from('subjects')
          .select('id, name, slug, icon, color')
          .in('id', subjectIds),
        NETWORK_TIMEOUT_MS
      );

      if (!subjectsError && subjects) {
        subjects.forEach(s => { subjectsMap[s.id] = s; });
      }
    }

    // ⭐ 3. دمج الملفات مع المواد
    const merged = files.map(f => ({
      ...f,  // كل حقول الملف
      subjects: subjectsMap[f.subject_id] || null
    }));

    saveDataCache(cacheKey, merged);
    return merged;
  })();

  if (cached) {
    network
      .then((fresh) => { if (fresh && options.onFresh) options.onFresh(fresh); })
      .catch(() => {});
    return cached;
  }

  try {
    return await network;
  } catch (err) {
    console.warn('fetchRecentFiles error:', err.message);
    return cached || [];
  }
}

// ============================================
// 5. جلب الإحصائيات
// ============================================
async function fetchStats() {
  if (!isOnline()) {
    return getDataCache('stats') || { subjects: 0, files: 0, recent: 0 };
  }

  try {
    const subjectsCount = await withTimeout(
      supabaseClient.from('subjects').select('*', { count: 'exact', head: true }),
      NETWORK_TIMEOUT_MS
    );
    if (subjectsCount.error) throw subjectsCount.error;

    const filesCount = await withTimeout(
      supabaseClient.from('files').select('*', { count: 'exact', head: true }).eq('is_published', true),
      NETWORK_TIMEOUT_MS
    );
    if (filesCount.error) throw filesCount.error;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentCount = await withTimeout(
      supabaseClient
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true)
        .gte('created_at', oneWeekAgo.toISOString()),
      NETWORK_TIMEOUT_MS
    );
    if (recentCount.error) throw recentCount.error;

    const stats = {
      subjects: subjectsCount.count || 0,
      files: filesCount.count || 0,
      recent: recentCount.count || 0
    };

    saveDataCache('stats', stats);
    return stats;
  } catch (err) {
    console.warn('fetchStats error:', err.message);
    return getDataCache('stats') || { subjects: 0, files: 0, recent: 0 };
  }
}

// ============================================
// 6. جلب ملف واحد
// ============================================
async function fetchFileById(fileId) {
  const cacheKey = `file_${fileId}`;

  if (!isOnline()) {
    return getDataCache(cacheKey) || null;
  }

  try {
    // 1. اجلب الملف كاملاً
    const { data: file, error: fileError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) throw fileError;
    if (!file) return null;

    // 2. اجلب المادة
    let subject = null;
    if (file.subject_id) {
      const { data: subData } = await supabaseClient
        .from('subjects')
        .select('id, name, slug, icon, color')
        .eq('id', file.subject_id)
        .single();
      subject = subData || null;
    }

    const merged = { ...file, subjects: subject };
    saveDataCache(cacheKey, merged);
    return merged;

  } catch (err) {
    console.warn('fetchFileById error:', err.message);
    return getDataCache(cacheKey) || null;
  }
}

// ============================================
// 7. زيادة العدادات
// ============================================
async function incrementFileDownloads(fileId) {
  if (!isOnline()) return false;

  try {
    const { error } = await supabaseClient.rpc('increment_downloads', {
      file_uuid: fileId
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('incrementDownloads error:', err.message);
    return false;
  }
}

async function incrementFileViews(fileId) {
  if (!isOnline()) return false;

  try {
    const { error } = await supabaseClient.rpc('increment_views', {
      file_uuid: fileId
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('incrementViews error:', err.message);
    return false;
  }
}

// ============================================
// 8. تنسيق حجم الملف
// ============================================
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const mb = bytes / (1024 * 1024);
  const kb = bytes / 1024;

  if (mb >= 1) return mb.toFixed(2) + ' MB';
  if (kb >= 1) return kb.toFixed(0) + ' KB';
  return bytes + ' B';
}

// ============================================
// 9. تنسيق التاريخ
// ============================================
function formatDate(dateString) {
  if (!dateString) return 'غير محدد';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'غير محدد';

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;

  return date.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// ============================================
// 10. معلومات التصنيف — Font Awesome
// ============================================
const CATEGORY_INFO = {
  all:        { label: 'الكل',           icon: 'fa-layer-group',    color: '#34d399' },
  book:       { label: 'كتب',            icon: 'fa-book',           color: '#34d399' },
  summary:    { label: 'ملخصات',         icon: 'fa-file-lines',     color: '#60a5fa' },
  automation: { label: 'أتمتة',          icon: 'fa-list-check',     color: '#fbbf24' },
  exam:       { label: 'دورات',          icon: 'fa-graduation-cap', color: '#a78bfa' },
  videos:     { label: 'مقاطع توضيحية', icon: 'fa-video',          color: '#ec4899' },
  general:    { label: 'عام',            icon: 'fa-inbox',          color: '#94a3b8' }
};

function getCategoryInfo(category) {
  return CATEGORY_INFO[category] || {
    label: 'ملف',
    icon: 'fa-file',
    color: '#94a3b8'
  };
}

// ============================================
// 11. 🎯 كشف نوع الملف — كل الصيغ المدعومة
// ============================================
const FILE_TYPES = {
  pdf:     { key: 'pdf',     icon: 'fa-file-pdf',         color: '#ef4444', label: 'PDF',         viewer: true  },
  word:    { key: 'word',    icon: 'fa-file-word',        color: '#2563eb', label: 'Word',        viewer: false },
  excel:   { key: 'excel',   icon: 'fa-file-excel',       color: '#16a34a', label: 'Excel',       viewer: false },
  ppt:     { key: 'ppt',     icon: 'fa-file-powerpoint',  color: '#ea580c', label: 'PowerPoint',  viewer: false },
  image:   { key: 'image',   icon: 'fa-file-image',       color: '#8b5cf6', label: 'صورة',        viewer: false },
  video:   { key: 'video',   icon: 'fa-file-video',       color: '#ec4899', label: 'فيديو',       viewer: false },
  audio:   { key: 'audio',   icon: 'fa-file-audio',       color: '#f59e0b', label: 'صوت',         viewer: false },
  archive: { key: 'archive', icon: 'fa-file-zipper',      color: '#64748b', label: 'ZIP',         viewer: false },
  text:    { key: 'text',    icon: 'fa-file-lines',       color: '#0ea5e9', label: 'نص',          viewer: false },
  link:    { key: 'link',    icon: 'fa-link',             color: '#3b82f6', label: 'رابط',        viewer: false },
  other:   { key: 'other',   icon: 'fa-file',             color: '#94a3b8', label: 'ملف',         viewer: false }
};

function detectFileType(file) {
  if (!file) return FILE_TYPES.other;

  // رابط خارجي
  if (file.source === 'link') {
    const url = (file.external_url || file.file_url || '').toLowerCase();
    const host = detectFileHost(url);

    // كشف حسب الرابط
    if (url.match(/\.pdf(\?|$)/i))          return { ...FILE_TYPES.pdf,     host: host.name };
    if (url.match(/\.(doc|docx)(\?|$)/i))   return { ...FILE_TYPES.word,    host: host.name };
    if (url.match(/\.(xls|xlsx)(\?|$)/i))   return { ...FILE_TYPES.excel,   host: host.name };
    if (url.match(/\.(ppt|pptx)(\?|$)/i))   return { ...FILE_TYPES.ppt,     host: host.name };
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)) return { ...FILE_TYPES.image,   host: host.name };
    if (url.match(/\.(mp4|avi|mov|mkv|webm)(\?|$)/i))      return { ...FILE_TYPES.video,   host: host.name };
    if (url.match(/\.(mp3|wav|m4a|ogg)(\?|$)/i))           return { ...FILE_TYPES.audio,   host: host.name };
    if (url.match(/\.(zip|rar|7z)(\?|$)/i))                return { ...FILE_TYPES.archive, host: host.name };
    if (url.match(/\.txt(\?|$)/i))                         return { ...FILE_TYPES.text,    host: host.name };

    // Drive افتراضياً PDF
    if (host.key === 'drive' || host.key === 'dropbox') {
      return { ...FILE_TYPES.pdf, host: host.name };
    }

    return { ...FILE_TYPES.link, host: host.name };
  }

  // ملف مرفوع
  const mime = (file.mime_type || '').toLowerCase();
  const fileName = (file.title || '').toLowerCase();

  if (mime.includes('pdf') || fileName.endsWith('.pdf'))               return FILE_TYPES.pdf;
  if (mime.includes('word') || fileName.match(/\.(doc|docx)$/))        return FILE_TYPES.word;
  if (mime.includes('excel') || mime.includes('spreadsheet') || fileName.match(/\.(xls|xlsx)$/)) return FILE_TYPES.excel;
  if (mime.includes('powerpoint') || mime.includes('presentation') || fileName.match(/\.(ppt|pptx)$/)) return FILE_TYPES.ppt;
  if (mime.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return FILE_TYPES.image;
  if (mime.includes('video') || fileName.match(/\.(mp4|avi|mov|mkv|webm)$/))      return FILE_TYPES.video;
  if (mime.includes('audio') || fileName.match(/\.(mp3|wav|m4a|ogg)$/))           return FILE_TYPES.audio;
  if (mime.includes('zip') || mime.includes('compressed') || fileName.match(/\.(zip|rar|7z)$/)) return FILE_TYPES.archive;
  if (mime.includes('text') || fileName.endsWith('.txt'))              return FILE_TYPES.text;

  return FILE_TYPES.other;
}

// ============================================
// 11.1 أيقونات ملفات موحّدة (Premium file icons)
// ============================================
// هوية بصرية واحدة لكل صفحات التطبيق:
//   Home / Recent activity / Search / Favorites / Subject / All files
// الاستخدام:
//   getFileIconMarkup(file, { className: 'mini-file-icon' })
//   getFileVisualMeta(file, typeInfo)
const FILE_VISUAL_THEMES = {
  pdf:     { icon: 'fa-solid fa-file-pdf',        ext: 'PDF',  color: '#ef4444' },
  word:    { icon: 'fa-solid fa-file-word',       ext: 'DOC',  color: '#2563eb' },
  excel:   { icon: 'fa-solid fa-file-excel',      ext: 'XLS',  color: '#16a34a' },
  ppt:     { icon: 'fa-solid fa-file-powerpoint', ext: 'PPT',  color: '#ea580c' },
  image:   { icon: 'fa-solid fa-image',           ext: 'IMG',  color: '#8b5cf6' },
  video:   { icon: 'fa-solid fa-circle-play',     ext: 'VID',  color: '#ec4899' },
  audio:   { icon: 'fa-solid fa-music',           ext: 'AUD',  color: '#f59e0b' },
  archive: { icon: 'fa-solid fa-file-zipper',     ext: 'ZIP',  color: '#64748b' },
  text:    { icon: 'fa-solid fa-file-lines',      ext: 'TXT',  color: '#0ea5e9' },
  link:    { icon: 'fa-solid fa-link',            ext: 'URL',  color: '#3b82f6' },
  other:   { icon: 'fa-solid fa-file',            ext: 'FILE', color: '#94a3b8' }
};

const FILE_VISUAL_LABELS = {
  'PDF': 'pdf',
  'Word': 'word',
  'Excel': 'excel',
  'PowerPoint': 'ppt',
  'صورة': 'image',
  'فيديو': 'video',
  'صوت': 'audio',
  'ZIP': 'archive',
  'نص': 'text',
  'رابط': 'link',
  'ملف': 'other'
};

function fileVisualRgba(hex, alpha) {
  if (!hex || hex[0] !== '#') return 'rgba(148, 163, 184, ' + alpha + ')';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some(function (n) { return isNaN(n); })) {
    return 'rgba(148, 163, 184, ' + alpha + ')';
  }
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function getFileVisualMeta(file, typeInfo) {
  const info = typeInfo || detectFileType(file || {});
  const key = (info && info.key) || FILE_VISUAL_LABELS[info && info.label] || 'other';
  const fallback = FILE_VISUAL_THEMES[key] || FILE_VISUAL_THEMES.other;
  let icon = fallback.icon;
  let color = fallback.color;
  let ext = fallback.ext;

  // الروابط الخارجية فقط تعرض هوية المضيف (Drive / Telegram / Instagram / …)
  // حتى لو كان الرابط يشير إلى PDF؛ ملفات Supabase المرفوعة تحتفظ بهوية
  // نوعها (PDF أحمر، Word أزرق…) بدلاً من هوية مضيف غير موجود.
  const externalUrl = (file && file.external_url) || '';
  const url = externalUrl || (file && file.source === 'link' ? (file.file_url || '') : '');
  if (url) {
    const host = detectFileHost(url);
    if (host.key !== 'other') {
      icon = host.icon;
      color = host.color;
      ext = host.ext || 'URL';
    }
  }

  return {
    key: key,
    icon: icon,
    color: color,
    ext: ext,
    label: (info && info.label) || 'ملف',
    bg: fileVisualRgba(color, 0.16),
    border: fileVisualRgba(color, 0.34),
    glow: fileVisualRgba(color, 0.24)
  };
}

function getFileIconMarkup(file, options) {
  options = options || {};
  const meta = getFileVisualMeta(file, options.typeInfo);
  const extraClass = options.className ? ' ' + options.className : '';
  const style = [
    '--pf-color:' + meta.color,
    '--pf-bg:' + meta.bg,
    '--pf-border:' + meta.border,
    '--pf-glow:' + meta.glow
  ].join(';');

  return '<span class="premium-file-icon premium-file-icon--' + meta.key + extraClass + '" style="' + style + ';" aria-hidden="true">' +
    '<i class="' + meta.icon + '"></i>' +
    '<span class="premium-file-icon__ext">' + meta.ext + '</span>' +
  '</span>';
}

// ============================================
// 12. بناء رابط viewer
// ============================================
function buildViewerUrl(file) {
  // الملفات الخارجية → رابط مباشر
  if (file.source === 'link') {
    return file.external_url || file.file_url;
  }

  const params = new URLSearchParams({
    id: file.id,
    file: file.title,
    subject: file.subjects?.name || file.subject_name || '',
    size: formatFileSize(file.file_size),
    url: file.file_url,
    path: file.file_path || '',
    category: file.category,
    created: file.created_at
  });
  return `viewer.html?${params.toString()}`;
}

// ============================================
// 12.1 إعدادات التحميل التدريجي لملفات PDF
// ============================================
// يمرّر الرابط مباشرة إلى PDF.js حتى يستخدم طلبات Range ويجلب الصفحات
// عند الحاجة بدلاً من تنزيل الملف كاملاً قبل عرض الصفحة الأولى.
function buildPdfStreamOptions(fileOrUrl) {
  const url = typeof fileOrUrl === 'string'
    ? fileOrUrl
    : (fileOrUrl && (fileOrUrl.file_url || fileOrUrl.external_url)) || '';

  return {
    url,
    disableRange: false,
    disableStream: false,
    disableAutoFetch: true,
    rangeChunkSize: 65536
  };
}

// ============================================
// 13. المفضلة
// ============================================
async function toggleFileFavorite(file, subjectName = '', subjectSlug = '') {
  if (typeof toggleCloudFavorite === 'function') {
    return await toggleCloudFavorite(file, subjectName, subjectSlug);
  }
  const isFav = await isFavorite(file.id);

  if (isFav) {
    await removeFavorite(file.id);
    return { added: false };
  } else {
    await addFavorite({
      id: file.id,
      title: file.title,
      subject_name: subjectName || file.subjects?.name || '',
      subject_slug: subjectSlug || file.subjects?.slug || '',
      category: file.category,
      file_size: file.file_size,
      file_url: file.file_url,
      file_path: file.file_path,
      external_url: file.external_url || null,
      source: file.source || 'upload',
      mime_type: file.mime_type || 'application/pdf',
      created_at: file.created_at
    });
    return { added: true };
  }
}

async function isFileFavorite(fileId) {
  return await isFavorite(fileId);
}

// ============================================
// 14. مراقبة الاتصال
// ============================================
window.addEventListener('online', () => {
  clearOldCache();
});

window.addEventListener('offline', () => {
});

// ============================================
// 15. 🌐 مواقع الرفع المدعومة
// ============================================
const FILE_HOSTS = {
  drive:     { name: 'Google Drive',  icon: 'fa-brands fa-google-drive', color: '#4285F4', ext: 'DRIVE', pattern: /drive\.google\.com|docs\.google\.com/ },
  dropbox:   { name: 'Dropbox',       icon: 'fa-brands fa-dropbox',      color: '#0061FF', ext: 'DBOX',  pattern: /dropbox\.com/ },
  mega:      { name: 'Mega',          icon: 'fa-solid fa-cloud',         color: '#D9272E', ext: 'MEGA',  pattern: /mega\.nz/ },
  mediafire: { name: 'MediaFire',     icon: 'fa-solid fa-fire',          color: '#1299F3', ext: 'MF',    pattern: /mediafire\.com/ },
  onedrive:  { name: 'OneDrive',      icon: 'fa-brands fa-microsoft',    color: '#0078D4', ext: '1DRV',  pattern: /1drv\.ms|onedrive\.live\.com/ },
  icloud:    { name: 'iCloud',        icon: 'fa-brands fa-apple',        color: '#3693F3', ext: 'iCloud', pattern: /icloud\.com/ },
  telegram:  { name: 'Telegram',      icon: 'fa-brands fa-telegram',     color: '#0088CC', ext: 'TG',    pattern: /t\.me|telegram\.(me|org)/ },
  youtube:   { name: 'YouTube',       icon: 'fa-brands fa-youtube',      color: '#FF0000', ext: 'YT',    pattern: /youtube\.com|youtu\.be/ },
  instagram: { name: 'Instagram',     icon: 'fa-brands fa-instagram',    color: '#E4405F', ext: 'IG',    pattern: /instagram\.com|instagr\.am/ },
  whatsapp:  { name: 'WhatsApp',      icon: 'fa-brands fa-whatsapp',     color: '#25D366', ext: 'WA',    pattern: /wa\.me|whatsapp\.com|api\.whatsapp\.com/ },
  facebook:  { name: 'Facebook',      icon: 'fa-brands fa-facebook-f',   color: '#1877F2', ext: 'FB',    pattern: /facebook\.com|fb\.me/ },
  x:         { name: 'X (Twitter)',   icon: 'fa-brands fa-x-twitter',    color: '#64748B', ext: 'X',     pattern: /(^|\/\/)(www\.)?(twitter\.com|x\.com)/ },
  tiktok:    { name: 'TikTok',        icon: 'fa-brands fa-tiktok',       color: '#FE2C55', ext: 'TIKTOK', pattern: /tiktok\.com/ },
  linkedin:  { name: 'LinkedIn',      icon: 'fa-brands fa-linkedin-in',  color: '#0A66C2', ext: 'IN',    pattern: /linkedin\.com/ },
  pinterest: { name: 'Pinterest',     icon: 'fa-brands fa-pinterest-p',  color: '#E60023', ext: 'PIN',   pattern: /pinterest\.(com|co\.uk)/ },
  snapchat:  { name: 'Snapchat',      icon: 'fa-brands fa-snapchat-ghost', color: '#FFFC00', ext: 'SNAP', pattern: /snapchat\.com/ },
  pdf:       { name: 'رابط PDF',      icon: 'fa-solid fa-file-pdf',      color: '#10b981', ext: 'PDF',   pattern: /\.pdf($|\?)/i },
  other:     { name: 'رابط خارجي',    icon: 'fa-solid fa-link',          color: '#94a3b8', ext: 'URL',   pattern: /.*/ }
};

function detectFileHost(url) {
  if (!url) return { ...FILE_HOSTS.other, key: 'other' };
  const cleanUrl = String(url).toLowerCase();

  for (const [key, host] of Object.entries(FILE_HOSTS)) {
    if (key === 'other') continue;
    if (host.pattern.test(cleanUrl)) return { ...host, key };
  }
  return { ...FILE_HOSTS.other, key: 'other' };
}

function isExternalFile(file) {
  return file && file.source === 'link';
}

// ⭐ المضيفون الذين لا يمكن تنزيل ملفاتهم مباشرةً (Drive, Instagram…).
// روابط Drive تُعامل كرابط — لا تنزيل مباشر.
const EXTERNAL_LINK_HOSTS = [
  'drive', 'dropbox', 'mega', 'mediafire', 'onedrive', 'icloud', 'telegram',
  'youtube', 'instagram', 'whatsapp', 'facebook', 'x', 'tiktok', 'linkedin',
  'pinterest', 'snapchat'
];

/**
 * ⭐ هل هذا العنصر رابط خارجي (نسخ الرابط) أم ملفاً حقيقياً (تحميل)؟
 *   • source = 'link'                → رابط
 *   • external_url موجود              → رابط
 *   • رابط Drive/Instagram/… محدد    → رابط
 *   • ملف مرفوع من Supabase (file_path) → ملف
 */
function isExternalLinkFile(file) {
  if (!file) return false;
  if (file.source === 'link') return true;
  if (file.external_url) return true;

  // ملف مرفوع لدينا (له مسار في Storage) → قابل للتنزيل.
  if (file.file_path) return false;

  const url = String(file.file_url || '');
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;

  const host = detectFileHost(url);
  return EXTERNAL_LINK_HOSTS.indexOf(host.key) !== -1;
}

/**
 * ⭐ رابط الملف الذي يُنسخ (الروابط الخارجية أولاً).
 */
function getShareableUrl(file) {
  if (!file) return '';
  return file.external_url || file.file_url || '';
}

/**
 * ⭐ الإجراء المناسب لعنصر:
 *   • رابط خارجي (Drive/Instagram…) → "نسخ الرابط" بأيقونة النسخ.
 *   • ملف حقيقي                    → "تحميل" بأيقونة التنزيل.
 *
 * ملاحظة مهمة: نص `handler` يُغلَّق بعلامة اقتباس **مفردة** ('…') لأنه
 * يُدرج داخل سمة HTML محاطة بـ " — استخدام " هنا يكسر الوسم بالكامل.
 */
function getFileActionMeta(file, isDownloaded) {
  const isLink = isExternalLinkFile(file);
  const safeId = String((file && file.id) || '').replace(/'/g, "\\'");
  return {
    isLink: isLink,
    label: isLink ? 'نسخ الرابط' : (isDownloaded ? 'محمّل' : 'تحميل'),
    icon: isLink ? 'copy' : (isDownloaded ? 'check' : 'download'),
    handler: isLink
      ? "copyRecentLink('" + safeId + "')"
      : "downloadRecentFile('" + safeId + "')"
  };
}

// ============================================
// 16. تحسين روابط Drive / Dropbox
// ============================================
function normalizeDriveUrl(url) {
  if (!url) return url;
  try {
    let fileId = null;

    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1) fileId = match1[1];

    if (!fileId) {
      const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match2) fileId = match2[1];
    }

    if (!fileId) {
      const match3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match3) fileId = match3[1];
    }

    if (fileId) {
      return `https://drive.google.com/file/d/${fileId}/view`;
    }
    return url;
  } catch (e) {
    return url;
  }
}

function normalizeDropboxUrl(url) {
  if (!url) return url;
  try {
    if (url.includes('dropbox.com')) {
      // اجعل dl=0 يفتح في Dropbox Viewer
      return url.replace(/[?&]dl=1/, '?dl=0');
    }
    return url;
  } catch (e) {
    return url;
  }
}

function normalizeExternalUrl(url) {
  if (!url) return url;
  const trimmed = String(url).trim();

  if (FILE_HOSTS.drive.pattern.test(trimmed)) {
    return normalizeDriveUrl(trimmed);
  }
  if (FILE_HOSTS.dropbox.pattern.test(trimmed)) {
    return normalizeDropboxUrl(trimmed);
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return 'https://' + trimmed;
  }

  return trimmed;
}

// ============================================
// 17. التحقق من الرابط
// ============================================
function validateExternalUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'الرابط فارغ' };
  }

  const trimmed = url.trim();

  if (trimmed.length < 8) {
    return { valid: false, error: 'الرابط قصير جداً' };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;

  try {
    const parsed = new URL(withProtocol);

    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { valid: false, error: 'النطاق غير صحيح' };
    }

    if (!parsed.hostname.includes('.')) {
      return { valid: false, error: 'النطاق غير صحيح' };
    }

    const dangerous = ['localhost', '127.0.0.1', '0.0.0.0', 'javascript:', 'data:'];
    if (dangerous.some(d => withProtocol.toLowerCase().includes(d))) {
      return { valid: false, error: 'رابط غير آمن' };
    }

    const host = detectFileHost(parsed.href);

    return {
      valid: true,
      normalized: normalizeExternalUrl(trimmed),
      host: host
    };
  } catch (e) {
    return { valid: false, error: 'الرابط غير صحيح' };
  }
}

// ============================================
// 18. حفظ ملف برابط خارجي
// ============================================
async function uploadLinkFile(info) {
  if (!isOnline()) {
    throw new Error('يجب الاتصال بالإنترنت لحفظ الرابط');
  }

  const user = await getCurrentUser();
  if (!user) throw new Error('يجب تسجيل الدخول');

  // كشف mime_type حسب الرابط (لتخزين أفضل)
  const tempFile = { source: 'link', external_url: info.externalUrl };
  const typeInfo = detectFileType(tempFile);
  let mimeType = 'external/link';
  if (typeInfo.label === 'PDF') mimeType = 'application/pdf';
  else if (typeInfo.label === 'Word') mimeType = 'application/msword';
  else if (typeInfo.label === 'Excel') mimeType = 'application/vnd.ms-excel';
  else if (typeInfo.label === 'PowerPoint') mimeType = 'application/vnd.ms-powerpoint';
  else if (typeInfo.label === 'صورة') mimeType = 'image/external';
  else if (typeInfo.label === 'فيديو') mimeType = 'video/external';

  const { data, error } = await supabaseClient
    .from('files')
    .insert({
      uploaded_by: user.id,
      subject_id: info.subjectId,
      title: info.title,
      description: info.description || null,
      category: info.category,
      source: 'link',
      external_url: info.externalUrl,
      file_url: info.externalUrl,
      file_path: null,
      file_size: 0,
      mime_type: mimeType,
      is_published: true
    })
    .select()
    .single();

  if (error) throw error;

  // امسح cache المتعلق بالملفات
  try {
    const keys = Object.keys(localStorage).filter(k =>
      k.startsWith(DATA_CACHE_PREFIX)
    );
    keys.forEach(k => {
      if (k.includes('files') || k.includes('recent') || k.includes('stats')) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {}

  return data;
}

// ============================================
// 19. فتح ملف ذكي — يفتح حسب النوع
// ============================================
async function openFileSmart(file, subjectName = '') {
  if (!file) return false;

  // زيادة العداد
  if (file.id) incrementFileViews(file.id).catch(() => {});

  // ملف خارجي → تبويب جديد
  if (file.source === 'link') {
    const url = file.external_url || file.file_url;
    if (!url) return false;
    openExternal(url);
    return true;
  }

  // PDF → viewer
  const typeInfo = detectFileType(file);
  if (typeInfo.viewer) {
    const params = new URLSearchParams({
      id: file.id,
      file: file.title,
      subject: subjectName || file.subjects?.name || file.subject_name || '',
      size: formatFileSize(file.file_size),
      url: file.file_url,
      path: file.file_path || '',
      category: file.category,
      created: file.created_at
    });
    window.location.href = `viewer.html?${params.toString()}`;
    return true;
  }

  // أنواع أخرى → تبويب جديد
  if (file.file_url) {
    openExternal(file.file_url);
    return true;
  }

  return false;
}

// ============================================
// 20. نسخ رابط
// ============================================
async function copyFileLink(file) {
  const url = file.external_url || file.file_url;
  if (!url) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (e) {}

  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const success = document.execCommand('copy');
    ta.remove();
    return success;
  } catch (e) {
    return false;
  }
}

// ============================================
// 21. معلومات المضيف
// ============================================
function getHostInfo(url) {
  return detectFileHost(url);
}
