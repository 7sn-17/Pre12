// ============================================
// files.js — مكتبة جلب الملفات والمواد
// ============================================

// ============================================
// 1. جلب جميع المواد
// ============================================
async function fetchSubjects() {
  try {
    const { data, error } = await supabaseClient
      .from('subjects')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('fetchSubjects error:', err);
    return [];
  }
}

// ============================================
// 2. جلب ملفات مادة محددة
// ============================================
async function fetchFilesBySubject(subjectSlug) {
  try {
    // أولاً: احصل على id المادة
    const { data: subject, error: subError } = await supabaseClient
      .from('subjects')
      .select('id')
      .eq('slug', subjectSlug)
      .single();
    
    if (subError) throw subError;
    
    // ثم: احصل على ملفاتها
    const { data: files, error: filesError } = await supabaseClient
      .from('files')
      .select('*')
      .eq('subject_id', subject.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    
    if (filesError) throw filesError;
    return files || [];
  } catch (err) {
    console.error('fetchFilesBySubject error:', err);
    return [];
  }
}

// ============================================
// 3. جلب جميع الملفات (لأحدث الملفات)
// ============================================
async function fetchRecentFiles(limit = 10) {
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
    return data || [];
  } catch (err) {
    console.error('fetchRecentFiles error:', err);
    return [];
  }
}

// ============================================
// 4. جلب إحصائيات عامة
// ============================================
async function fetchStats() {
  try {
    // عدد المواد
    const { count: subjectsCount } = await supabaseClient
      .from('subjects')
      .select('*', { count: 'exact', head: true });
    
    // عدد الملفات
    const { count: filesCount } = await supabaseClient
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true);
    
    // ملفات هذا الأسبوع
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const { count: recentCount } = await supabaseClient
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .gte('created_at', oneWeekAgo.toISOString());
    
    return {
      subjects: subjectsCount || 0,
      files: filesCount || 0,
      recent: recentCount || 0
    };
  } catch (err) {
    console.error('fetchStats error:', err);
    return { subjects: 0, files: 0, recent: 0 };
  }
}

// ============================================
// 5. جلب ملف واحد بالـ ID
// ============================================
async function fetchFileById(fileId) {
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
    return data;
  } catch (err) {
    console.error('fetchFileById error:', err);
    return null;
  }
}

// ============================================
// 6. زيادة عداد التحميلات
// ============================================
async function incrementFileDownloads(fileId) {
  try {
    const { error } = await supabaseClient.rpc('increment_downloads', {
      file_uuid: fileId
    });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('incrementDownloads error:', err);
    return false;
  }
}

// ============================================
// 7. زيادة عداد المشاهدات
// ============================================
async function incrementFileViews(fileId) {
  try {
    const { error } = await supabaseClient.rpc('increment_views', {
      file_uuid: fileId
    });
    
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('incrementViews error:', err);
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
// 9. تنسيق التاريخ بالعربية
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
// 12. المفضلة — موحدة (باستخدام IndexedDB)
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

console.log('✅ files.js loaded');