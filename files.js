// ============================================
// files.js — مكتبة جلب الملفات والمواد
// Version 2.0.0 — Cache شامل لكل مادة بمفتاح فريد
// ============================================

// ============================================
// Cache Helper — يستخدم localStorage
// ============================================
const DATA_CACHE_PREFIX = 'medfav_data_';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 أيام

function saveDataCache(key, data) {
  try {
    localStorage.setItem(
      DATA_CACHE_PREFIX + key,
      JSON.stringify({ 
        data, 
        time: Date.now(),
        version: '2.0.0'
      })
    );
    console.log(`💾 Cached: ${key}`);
  } catch (err) {
    console.warn('saveDataCache error:', err);
  }
}

function getDataCache(key) {
  try {
    const cached = localStorage.getItem(DATA_CACHE_PREFIX + key);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    
    // فحص العمر
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
            console.log(`🗑️ Removed old cache: ${key}`);
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
// 1. جلب جميع المواد — مع Cache
// ============================================
async function fetchSubjects() {
  // 1. offline — اقرأ من cache
  if (!isOnline()) {
    const cached = getDataCache('subjects');
    if (cached) {
      console.log('📦 Subjects from cache (offline)');
      return cached;
    }
    return [];
  }
  
  // 2. متصل — جلب من Supabase
  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    // 3. خزّن
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
// 2. جلب بيانات مادة واحدة (Subject)
// ============================================
async function fetchSubjectBySlug(subjectSlug) {
  const cacheKey = `subject_${subjectSlug}`;
  
  if (!isOnline()) {
    const cached = getDataCache(cacheKey);
    if (cached) {
      console.log(`📦 Subject ${subjectSlug} from cache`);
      return cached;
    }
    return null;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .eq('slug', subjectSlug)
      .single();
    
    if (error) throw error;
    
    if (data) {
      saveDataCache(cacheKey, data);
    }
    
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
    const cached = getDataCache(cacheKey);
    if (cached) {
      console.log(`📦 Files for ${subjectSlug} from cache`);
      return cached;
    }
    return [];
  }
  
  try {
    // 1. جلب المادة
    const { data: subject, error: subError } = await supabaseClient
      .from('subjects')
      .select('id')
      .eq('slug', subjectSlug)
      .single();
    
    if (subError) throw subError;
    
    // 2. جلب ملفاتها
    const { data: files, error: filesError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('subject_id', subject.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    
    if (filesError) throw filesError;
    
    // 3. خزّن — حتى لو فارغ
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
    const cached = getDataCache(cacheKey);
    if (cached) {
      console.log('📦 Recent files from cache');
      return cached;
    }
    return [];
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
    const cached = getDataCache('stats');
    return cached || { subjects: 0, files: 0, recent: 0 };
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
    
    if (data) {
      saveDataCache(cacheKey, data);
    }
    
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
  if (!bytes) return '0 KB';
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
// 10. معلومات التصنيف
// ============================================
const CATEGORY_INFO = {
  all: { label: 'الكل', icon: 'layers', color: '#34d399' },
  book: { label: 'كتب', icon: 'book-open', color: '#34d399' },
  summary: { label: 'ملخصات', icon: 'file-text', color: '#60a5fa' },
  automation: { label: 'أتمتة', icon: 'check-circle-2', color: '#fbbf24' },
  exam: { label: 'دورات', icon: 'graduation-cap', color: '#a78bfa' }
};

function getCategoryInfo(category) {
  return CATEGORY_INFO[category] || {
    label: 'ملف',
    icon: 'file',
    color: '#94a3b8'
  };
}

// ============================================
// 11. بناء رابط viewer
// ============================================
function buildViewerUrl(file) {
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
// 12. المفضلة
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
      created_at: file.created_at
    });
    return { added: true };
  }
}

async function isFileFavorite(fileId) {
  return await isFavorite(fileId);
}

// ============================================
// 13. مراقبة الاتصال
// ============================================
window.addEventListener('online', () => {
  console.log('🟢 Back online');
  // مسح cache القديم عند العودة
  clearOldCache();
});

window.addEventListener('offline', () => {
  console.log('🔴 Offline');
});

// ============================================
// 14. 🆕 دعم الروابط الخارجية
// ============================================

// مواقع الرفع المدعومة
const FILE_HOSTS = {
  drive:     { name: 'Google Drive',  icon: 'hard-drive',  color: '#4285F4', pattern: /drive\.google\.com|docs\.google\.com/ },
  dropbox:   { name: 'Dropbox',       icon: 'box',         color: '#0061FF', pattern: /dropbox\.com/ },
  mega:      { name: 'Mega',          icon: 'cloud',       color: '#D9272E', pattern: /mega\.nz/ },
  mediafire: { name: 'MediaFire',     icon: 'flame',       color: '#1299F3', pattern: /mediafire\.com/ },
  onedrive:  { name: 'OneDrive',      icon: 'cloud',       color: '#0078D4', pattern: /1drv\.ms|onedrive\.live\.com/ },
  icloud:    { name: 'iCloud',        icon: 'cloud',       color: '#3693F3', pattern: /icloud\.com/ },
  telegram:  { name: 'Telegram',      icon: 'send',        color: '#0088CC', pattern: /t\.me|telegram\.(me|org)/ },
  pdf:       { name: 'رابط PDF',      icon: 'file-text',   color: '#10b981', pattern: /\.pdf($|\?)/i },
  other:     { name: 'رابط خارجي',    icon: 'link',        color: '#94a3b8', pattern: /.*/ }
};

// كشف نوع موقع الرفع من الرابط
function detectFileHost(url) {
  if (!url) return FILE_HOSTS.other;
  const cleanUrl = url.toLowerCase();
  for (const [key, host] of Object.entries(FILE_HOSTS)) {
    if (host.pattern.test(cleanUrl)) return { ...host, key };
  }
  return { ...FILE_HOSTS.other, key: 'other' };
}

// هل الملف خارجي (رابط)؟
function isExternalFile(file) {
  return file && file.source === 'link';
}

// تحسين رابط Google Drive
function normalizeDriveUrl(url) {
  if (!url) return url;
  try {
    // نمط: /file/d/FILE_ID/view أو /open?id=FILE_ID
    let fileId = null;
    
    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1) fileId = match1[1];
    
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2) fileId = match2[1];
    
    const match3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match3 && !fileId) fileId = match3[1];
    
    if (fileId) {
      return `https://drive.google.com/file/d/${fileId}/view`;
    }
    return url;
  } catch (e) {
    return url;
  }
}

// تحسين رابط Dropbox
function normalizeDropboxUrl(url) {
  if (!url) return url;
  try {
    // حول ?dl=0 إلى ?dl=1
    if (url.includes('dropbox.com')) {
      let newUrl = url.replace(/[?&]dl=0/, '?dl=1');
      if (!newUrl.includes('dl=')) {
        newUrl += (newUrl.includes('?') ? '&' : '?') + 'dl=1';
      }
      // احذف ?dl=1 إذا كان الملف غير PDF (نريده يُفتح في العرض)
      // لكن للتبسيط نتركه يفتح في المتصفح
      return url; // نبقي الرابط الأصلي حتى يفتح في Dropbox
    }
    return url;
  } catch (e) {
    return url;
  }
}

// تحسين الرابط حسب الموقع
function normalizeExternalUrl(url) {
  if (!url) return url;
  const trimmed = url.trim();
  
  if (FILE_HOSTS.drive.pattern.test(trimmed)) {
    return normalizeDriveUrl(trimmed);
  }
  if (FILE_HOSTS.dropbox.pattern.test(trimmed)) {
    return normalizeDropboxUrl(trimmed);
  }
  
  // تأكد أن الرابط يبدأ بـ http
  if (!/^https?:\/\//i.test(trimmed)) {
    return 'https://' + trimmed;
  }
  
  return trimmed;
}

// التحقق من صحة الرابط (بسيط — بدون fetch)
function validateExternalUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'الرابط فارغ' };
  }
  
  const trimmed = url.trim();
  
  if (trimmed.length < 10) {
    return { valid: false, error: 'الرابط قصير جداً' };
  }
  
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
  
  try {
    const parsed = new URL(withProtocol);
    
    // تأكد من وجود نطاق حقيقي
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { valid: false, error: 'النطاق غير صحيح' };
    }
    
    // تأكد من وجود . في النطاق
    if (!parsed.hostname.includes('.')) {
      return { valid: false, error: 'النطاق غير صحيح' };
    }
    
    // رفض نطاقات محلية/خطرة
    const dangerous = ['localhost', '127.0.0.1', '0.0.0.0', 'javascript:', 'data:'];
    if (dangerous.some(d => withProtocol.toLowerCase().includes(d))) {
      return { valid: false, error: 'رابط غير آمن' };
    }
    
    // الحصول على معلومات المضيف
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

// حفظ ملف برابط خارجي
async function uploadLinkFile(info) {
  if (!isOnline()) {
    throw new Error('يجب الاتصال بالإنترنت لحفظ الرابط');
  }
  
  const user = await getCurrentUser();
  if (!user) throw new Error('يجب تسجيل الدخول');
  
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
      file_url: info.externalUrl, // للتوافق مع الكود القديم
      file_path: null,
      file_size: 0,
      mime_type: 'external/link',
      is_published: true
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // امسح cache
  try {
    const keys = Object.keys(localStorage).filter(k => 
      k.startsWith('medfav_data_')
    );
    keys.forEach(k => {
      if (k.includes('files') || k.includes('recent') || k.includes('stats')) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {}
  
  return data;
}

// فتح ملف خارجي مع التحقق
async function openExternalFile(file) {
  const url = file.external_url || file.file_url;
  if (!url) {
    showToast?.('لا يوجد رابط', 'error') || alert('لا يوجد رابط');
    return;
  }
  
  // افتح الرابط
  window.open(url, '_blank', 'noopener,noreferrer');
  
  // زد العداد
  if (file.id) {
    incrementFileViews(file.id).catch(() => {});
  }
}

// الحصول على معلومات المضيف
function getHostInfo(url) {
  return detectFileHost(url);
}

console.log('✅ files.js v2.0.0 loaded — full cache');