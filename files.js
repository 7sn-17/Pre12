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

// تنظيف دوري
clearOldCache();

// ============================================
// 1. جلب جميع المواد
// ============================================
async function fetchSubjects() {
  if (!isOnline()) {
    return getDataCache('subjects') || [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      saveDataCache('subjects', data);
    }

    return data || [];
  } catch (err) {
    console.warn('fetchSubjects error:', err.message);
    return getDataCache('subjects') || [];
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
    const { data: subject, error: subError } = await supabaseClient
      .from('subjects')
      .select('id')
      .eq('slug', subjectSlug)
      .single();

    if (subError) throw subError;

    const { data: files, error: filesError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('subject_id', subject.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (filesError) throw filesError;

    saveDataCache(cacheKey, files || []);
    return files || [];
  } catch (err) {
    console.warn('fetchFilesBySubject error:', err.message);
    return getDataCache(cacheKey) || [];
  }
}

// ============================================
// 4. جلب أحدث الملفات
// ============================================
async function fetchRecentFiles(limit = 10) {
  const cacheKey = `recent_files_${limit}`;

  if (!isOnline()) {
    return getDataCache(cacheKey) || [];
  }

  try {
    const { data, error } = await supabaseClient
      .from('files')
      .select(`
        *,
        subjects (
          name,
          slug,
          icon,
          color
        )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    if (data && data.length > 0) {
      saveDataCache(cacheKey, data);
    }

    return data || [];
  } catch (err) {
    console.warn('fetchRecentFiles error:', err.message);
    return getDataCache(cacheKey) || [];
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
    const { count: subjectsCount } = await supabaseClient
      .from('subjects')
      .select('*', { count: 'exact', head: true });

    const { count: filesCount } = await supabaseClient
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { count: recentCount } = await supabaseClient
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .gte('created_at', oneWeekAgo.toISOString());

    const stats = {
      subjects: subjectsCount || 0,
      files: filesCount || 0,
      recent: recentCount || 0
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
    const { data, error } = await supabaseClient
      .from('files')
      .select(`
        *,
        subjects (
          name,
          slug,
          icon,
          color
        )
      `)
      .eq('id', fileId)
      .single();

    if (error) throw error;

    if (data) saveDataCache(cacheKey, data);
    return data;
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
  all:        { label: 'الكل',   icon: 'fa-layer-group',     color: '#34d399' },
  book:       { label: 'كتب',    icon: 'fa-book',            color: '#34d399' },
  summary:    { label: 'ملخصات', icon: 'fa-file-lines',      color: '#60a5fa' },
  automation: { label: 'أتمتة',  icon: 'fa-list-check',      color: '#fbbf24' },
  exam:       { label: 'دورات',  icon: 'fa-graduation-cap',  color: '#a78bfa' }
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
  pdf:     { icon: 'fa-file-pdf',         color: '#ef4444', label: 'PDF',         viewer: true  },
  word:    { icon: 'fa-file-word',        color: '#2563eb', label: 'Word',        viewer: false },
  excel:   { icon: 'fa-file-excel',       color: '#16a34a', label: 'Excel',       viewer: false },
  ppt:     { icon: 'fa-file-powerpoint',  color: '#ea580c', label: 'PowerPoint',  viewer: false },
  image:   { icon: 'fa-file-image',       color: '#8b5cf6', label: 'صورة',        viewer: false },
  video:   { icon: 'fa-file-video',       color: '#ec4899', label: 'فيديو',       viewer: false },
  audio:   { icon: 'fa-file-audio',       color: '#f59e0b', label: 'صوت',         viewer: false },
  archive: { icon: 'fa-file-zipper',      color: '#64748b', label: 'ZIP',         viewer: false },
  text:    { icon: 'fa-file-lines',       color: '#0ea5e9', label: 'نص',          viewer: false },
  link:    { icon: 'fa-link',             color: '#3b82f6', label: 'رابط',        viewer: false },
  other:   { icon: 'fa-file',             color: '#94a3b8', label: 'ملف',         viewer: false }
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
// 13. المفضلة
// ============================================
async function toggleFileFavorite(file, subjectName = '', subjectSlug = '') {
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
  console.log('🟢 Back online');
  clearOldCache();
});

window.addEventListener('offline', () => {
  console.log('🔴 Offline');
});

// ============================================
// 15. 🌐 مواقع الرفع المدعومة
// ============================================
const FILE_HOSTS = {
  drive:     { name: 'Google Drive',  icon: 'fa-brands fa-google-drive', color: '#4285F4', pattern: /drive\.google\.com|docs\.google\.com/ },
  dropbox:   { name: 'Dropbox',       icon: 'fa-brands fa-dropbox',      color: '#0061FF', pattern: /dropbox\.com/ },
  mega:      { name: 'Mega',          icon: 'fa-solid fa-cloud',         color: '#D9272E', pattern: /mega\.nz/ },
  mediafire: { name: 'MediaFire',     icon: 'fa-solid fa-fire',          color: '#1299F3', pattern: /mediafire\.com/ },
  onedrive:  { name: 'OneDrive',      icon: 'fa-brands fa-microsoft',    color: '#0078D4', pattern: /1drv\.ms|onedrive\.live\.com/ },
  icloud:    { name: 'iCloud',        icon: 'fa-brands fa-apple',        color: '#3693F3', pattern: /icloud\.com/ },
  telegram:  { name: 'Telegram',      icon: 'fa-brands fa-telegram',     color: '#0088CC', pattern: /t\.me|telegram\.(me|org)/ },
  youtube:   { name: 'YouTube',       icon: 'fa-brands fa-youtube',      color: '#FF0000', pattern: /youtube\.com|youtu\.be/ },
  pdf:       { name: 'رابط PDF',      icon: 'fa-solid fa-file-pdf',      color: '#10b981', pattern: /\.pdf($|\?)/i },
  other:     { name: 'رابط خارجي',    icon: 'fa-solid fa-link',          color: '#94a3b8', pattern: /.*/ }
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
    window.open(url, '_blank', 'noopener,noreferrer');
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
    window.open(file.file_url, '_blank', 'noopener,noreferrer');
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

console.log(`✅ files.js v${FILES_VERSION} loaded — Font Awesome + Full Format Support`);