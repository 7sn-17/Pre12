// ============================================
// files.js — مكتبة جلب الملفات والمواد
// Version 1.1.0 — مع Cache للعمل بدون إنترنت
// ============================================

// ============================================
// Cache Helper — يستخدم localStorage
// ============================================
const DATA_CACHE_PREFIX = 'medfav_data_';

function saveDataCache(key, data) {
  try {
    localStorage.setItem(
      DATA_CACHE_PREFIX + key,
      JSON.stringify({ data, time: Date.now() })
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
    return parsed.data;
  } catch (err) {
    return null;
  }
}

function isOnline() {
  return navigator.onLine;
}

// ============================================
// 1. جلب جميع المواد — مع Cache
// ============================================
async function fetchSubjects() {
  // ⭐ 1. إذا لا يوجد إنترنت — اقرأ من Cache فوراً
  if (!isOnline()) {
    const cached = getDataCache('subjects');
    if (cached) {
      console.log('📦 Subjects from cache (offline)');
      return cached;
    }
    return [];
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    // ⭐ 2. خزّن في Cache
    if (data && data.length > 0) {
      saveDataCache('subjects', data);
    }
    
    return data || [];
  } catch (err) {
    console.warn('fetchSubjects error:', err.message);
    
    // ⭐ 3. فشل — اقرأ من Cache
    return getDataCache('subjects') || [];
  }
}

// ============================================
// 2. جلب ملفات مادة محددة
// ============================================
async function fetchFilesBySubject(subjectSlug) {
  const cacheKey = `subject_files_${subjectSlug}`;
  
  if (!isOnline()) {
    const cached = getDataCache(cacheKey);
    if (cached) return cached;
    return [];
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
    
    if (files && files.length > 0) {
      saveDataCache(cacheKey, files);
    }
    
    return files || [];
  } catch (err) {
    console.warn('fetchFilesBySubject error:', err.message);
    return getDataCache(cacheKey) || [];
  }
}

// ============================================
// 3. جلب أحدث الملفات
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
// 4. جلب الإحصائيات
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
// 5. جلب ملف واحد
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
// 6. زيادة العدادات (لا تعمل offline)
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
// 7. تنسيق حجم الملف
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
// 8. تنسيق التاريخ
// ============================================
function formatDate(dateString) {
  const date = new Date(dateString);
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
// 9. معلومات التصنيف
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
// 10. بناء رابط viewer
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
// 11. المفضلة
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
// 12. مراقبة الاتصال
// ============================================
window.addEventListener('online', () => {
  console.log('🟢 Back online');
});

window.addEventListener('offline', () => {
  console.log('🔴 Offline');
});

console.log('✅ files.js v1.1.0 loaded — offline ready');