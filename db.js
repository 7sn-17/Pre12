// ============================================
// db.js — إدارة الملفات المحلية (IndexedDB)
// لتخزين ملفات PDF في الجهاز للعمل بدون إنترنت
// ============================================

const DB_NAME = 'medfav_db';
const DB_VERSION = 1;
const STORE_FILES = 'downloaded_files';  // الملفات المحمّلة (Blobs)
const STORE_META = 'files_meta';         // معلومات الملفات
const STORE_FAVORITES = 'favorites';     // المفضلة

let dbInstance = null;

// ============================================
// 1. فتح قاعدة البيانات
// ============================================
async function openDB() {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // مخزن الملفات (Blob)
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        store.createIndex('downloaded_at', 'downloaded_at');
      }
      
      // مخزن الميتاداتا
      if (!db.objectStoreNames.contains(STORE_META)) {
        const store = db.createObjectStore(STORE_META, { keyPath: 'id' });
        store.createIndex('downloaded_at', 'downloaded_at');
      }
      
      // مخزن المفضلة
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        const store = db.createObjectStore(STORE_FAVORITES, { keyPath: 'id' });
        store.createIndex('added_at', 'added_at');
      }
    };
  });
}

// ============================================
// 2. حفظ ملف محمّل (Blob)
// ============================================
async function saveDownloadedFile(fileInfo, blob) {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
    const filesStore = tx.objectStore(STORE_FILES);
    const metaStore = tx.objectStore(STORE_META);
    
    // حفظ الـ Blob
    await new Promise((resolve, reject) => {
      const req = filesStore.put({
        id: fileInfo.id,
        blob: blob,
        downloaded_at: Date.now()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    // حفظ الميتاداتا
    await new Promise((resolve, reject) => {
      const req = metaStore.put({
        id: fileInfo.id,
        title: fileInfo.title,
        subject_name: fileInfo.subject_name || '',
        subject_slug: fileInfo.subject_slug || '',
        category: fileInfo.category,
        file_size: fileInfo.file_size,
        file_url: fileInfo.file_url,
        file_path: fileInfo.file_path,
        created_at: fileInfo.created_at,
        downloaded_at: Date.now()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    return true;
  } catch (err) {
    console.error('saveDownloadedFile error:', err);
    return false;
  }
}

// ============================================
// 3. جلب ملف محمّل
// ============================================
async function getDownloadedFile(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FILES, 'readonly');
    const store = tx.objectStore(STORE_FILES);
    
    return new Promise((resolve, reject) => {
      const req = store.get(fileId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getDownloadedFile error:', err);
    return null;
  }
}

// ============================================
// 4. جلب كل الملفات المحمّلة (ميتاداتا)
// ============================================
async function getAllDownloadedFiles() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const index = store.index('downloaded_at');
    
    return new Promise((resolve, reject) => {
      const req = index.getAll();
      req.onsuccess = () => {
        const files = req.result || [];
        files.sort((a, b) => b.downloaded_at - a.downloaded_at);
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getAllDownloadedFiles error:', err);
    return [];
  }
}

// ============================================
// 5. التحقق من وجود ملف محمّل
// ============================================
async function isFileDownloaded(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    
    return new Promise((resolve, reject) => {
      const req = store.get(fileId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('isFileDownloaded error:', err);
    return false;
  }
}

// ============================================
// 6. حذف ملف محمّل
// ============================================
async function deleteDownloadedFile(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
    
    await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_FILES).delete(fileId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_META).delete(fileId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    return true;
  } catch (err) {
    console.error('deleteDownloadedFile error:', err);
    return false;
  }
}

// ============================================
// 7. المفضلة — IndexedDB
// ============================================
async function addFavorite(fileInfo) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readwrite');
    const store = tx.objectStore(STORE_FAVORITES);
    
    return new Promise((resolve, reject) => {
      const req = store.put({
        id: fileInfo.id,
        title: fileInfo.title,
        subject_name: fileInfo.subject_name || '',
        subject_slug: fileInfo.subject_slug || '',
        category: fileInfo.category,
        file_size: fileInfo.file_size,
        file_url: fileInfo.file_url,
        file_path: fileInfo.file_path,
        created_at: fileInfo.created_at,
        added_at: Date.now()
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('addFavorite error:', err);
    return false;
  }
}

async function removeFavorite(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readwrite');
    const store = tx.objectStore(STORE_FAVORITES);
    
    return new Promise((resolve, reject) => {
      const req = store.delete(fileId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('removeFavorite error:', err);
    return false;
  }
}

async function getAllFavorites() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readonly');
    const store = tx.objectStore(STORE_FAVORITES);
    const index = store.index('added_at');
    
    return new Promise((resolve, reject) => {
      const req = index.getAll();
      req.onsuccess = () => {
        const files = req.result || [];
        files.sort((a, b) => b.added_at - a.added_at);
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getAllFavorites error:', err);
    return [];
  }
}

async function isFavorite(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readonly');
    const store = tx.objectStore(STORE_FAVORITES);
    
    return new Promise((resolve, reject) => {
      const req = store.get(fileId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('isFavorite error:', err);
    return false;
  }
}

async function getFavoritesCount() {
  try {
    const favorites = await getAllFavorites();
    return favorites.length;
  } catch (err) {
    return 0;
  }
}

// ============================================
// 8. تحميل الملف من URL وحفظه في DB
// ============================================
async function downloadAndSaveFile(fileInfo, onProgress) {
  try {
    // 1. جلب الملف من Supabase Storage
    const response = await fetch(fileInfo.file_url);
    if (!response.ok) throw new Error('فشل التحميل');
    
    // 2. تحويل إلى Blob (مع تتبع التقدم إن أمكن)
    const blob = await response.blob();
    
    // 3. حفظ في IndexedDB
    const saved = await saveDownloadedFile(fileInfo, blob);
    if (!saved) throw new Error('فشل الحفظ');
    
    // 4. إنشاء رابط تحميل للمستخدم
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileInfo.title + '.pdf';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 100);
    
    return { success: true, blob };
  } catch (err) {
    console.error('downloadAndSaveFile error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================
// 9. جلب Blob URL من IndexedDB أو الشبكة
// ============================================
async function getFileBlobUrl(fileInfo) {
  try {
    // 1. البحث في IndexedDB
    const cached = await getDownloadedFile(fileInfo.id);
    if (cached && cached.blob) {
      return URL.createObjectURL(cached.blob);
    }
    
    // 2. إذا لم يوجد، جلب من الشبكة
    const response = await fetch(fileInfo.file_url);
    if (!response.ok) throw new Error('فشل الجلب');
    
    const blob = await response.blob();
    
    // 3. حفظ في Cache للاستخدام المستقبلي
    await saveDownloadedFile(fileInfo, blob);
    
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('getFileBlobUrl error:', err);
    return null;
  }
}

// ============================================
// 10. حذف جميع الملفات المحمّلة
// ============================================
async function clearAllDownloadedFiles() {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
    
    await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_FILES).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_META).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    return true;
  } catch (err) {
    console.error('clearAllDownloadedFiles error:', err);
    return false;
  }
}

// ============================================
// 11. حساب حجم الملفات المحمّلة
// ============================================
async function getStorageUsed() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0
      };
    }
    return { usage: 0, quota: 0, percentage: 0 };
  } catch (err) {
    console.error('getStorageUsed error:', err);
    return { usage: 0, quota: 0, percentage: 0 };
  }
}

console.log('✅ db.js loaded');