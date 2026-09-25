// ============================================
// db.js — إدارة الملفات المحلية (IndexedDB)
// Version 2.0.0 — دعم كامل للصيغ المتعددة + أداء أفضل
// ============================================

const DB_NAME = 'medfav_db';
const DB_VERSION = 2;  // ⭐ تم رفع الإصدار لدعم تحديثات جديدة
const STORE_FILES = 'downloaded_files';
const STORE_META = 'files_meta';
const STORE_FAVORITES = 'favorites';

let dbInstance = null;
let dbOpenPromise = null;  // ⭐ منع فتح DB مرات متعددة

// ============================================
// 1. فتح قاعدة البيانات
// ============================================
async function openDB() {
  if (dbInstance) return dbInstance;
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbOpenPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      
      // ⭐ معالجة إغلاق اتصال آخر (متعدد التبويبات)
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
        dbOpenPromise = null;
      };
      
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion;

      // ⭐ مخزن الملفات (Blob)
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        const store = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
        store.createIndex('downloaded_at', 'downloaded_at');
        store.createIndex('size', 'size');  // ⭐ جديد
      }

      // ⭐ مخزن الميتاداتا
      if (!db.objectStoreNames.contains(STORE_META)) {
        const store = db.createObjectStore(STORE_META, { keyPath: 'id' });
        store.createIndex('downloaded_at', 'downloaded_at');
        store.createIndex('subject_slug', 'subject_slug');  // ⭐ جديد
        store.createIndex('category', 'category');  // ⭐ جديد
        store.createIndex('source', 'source');  // ⭐ جديد
      }

      // ⭐ مخزن المفضلة
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        const store = db.createObjectStore(STORE_FAVORITES, { keyPath: 'id' });
        store.createIndex('added_at', 'added_at');
        store.createIndex('subject_slug', 'subject_slug');  // ⭐ جديد
      }
    };
  });

  return dbOpenPromise;
}

// ============================================
// 2. حفظ ملف محمّل
// ============================================
async function saveDownloadedFile(fileInfo, blob) {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');
    const filesStore = tx.objectStore(STORE_FILES);
    const metaStore = tx.objectStore(STORE_META);

    // حفظ الـ Blob
    filesStore.put({
      id: fileInfo.id,
      blob: blob,
      size: blob.size,
      type: blob.type,
      downloaded_at: Date.now()
    });

    // حفظ الميتاداتا
    metaStore.put({
      id: fileInfo.id,
      title: fileInfo.title,
      description: fileInfo.description || '',
      subject_name: fileInfo.subject_name || '',
      subject_slug: fileInfo.subject_slug || '',
      category: fileInfo.category,
      file_size: fileInfo.file_size || blob.size,
      file_url: fileInfo.file_url,
      file_path: fileInfo.file_path || null,
      external_url: fileInfo.external_url || null,
      source: fileInfo.source || 'upload',
      mime_type: fileInfo.mime_type || blob.type || 'application/pdf',
      created_at: fileInfo.created_at,
      downloaded_at: Date.now()
    });

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.error('saveDownloadedFile error:', err);
    return false;
  }
}

// ============================================
// 3. جلب ملف محمّل (Blob)
// ============================================
async function getDownloadedFile(fileId) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FILES, 'readonly');
    const store = tx.objectStore(STORE_FILES);

    return await new Promise((resolve, reject) => {
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

    return await new Promise((resolve, reject) => {
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

// ⭐ جلب ملفات مادة معينة من IndexedDB
async function getDownloadedFilesBySubject(subjectSlug) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);
    const index = store.index('subject_slug');

    return await new Promise((resolve, reject) => {
      const req = index.getAll(subjectSlug);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getDownloadedFilesBySubject error:', err);
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

    return await new Promise((resolve, reject) => {
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

    tx.objectStore(STORE_FILES).delete(fileId);
    tx.objectStore(STORE_META).delete(fileId);

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
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

    store.put({
      id: fileInfo.id,
      title: fileInfo.title,
      description: fileInfo.description || '',
      subject_name: fileInfo.subject_name || '',
      subject_slug: fileInfo.subject_slug || '',
      category: fileInfo.category,
      file_size: fileInfo.file_size || 0,
      file_url: fileInfo.file_url,
      file_path: fileInfo.file_path || null,
      external_url: fileInfo.external_url || null,
      source: fileInfo.source || 'upload',
      mime_type: fileInfo.mime_type || 'application/pdf',
      created_at: fileInfo.created_at,
      added_at: Date.now()
    });

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
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

    store.delete(fileId);

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
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

    return await new Promise((resolve, reject) => {
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

    return await new Promise((resolve, reject) => {
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
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readonly');
    const store = tx.objectStore(STORE_FAVORITES);

    return await new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('getFavoritesCount error:', err);
    return 0;
  }
}

// ⭐ تفريغ المفضلة
async function clearAllFavorites() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_FAVORITES, 'readwrite');
    tx.objectStore(STORE_FAVORITES).clear();

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('clearAllFavorites error:', err);
    return false;
  }
}

// ============================================
// 8. تحميل الملف من URL وحفظه
// ============================================
async function downloadAndSaveFile(fileInfo, onProgress) {
  try {
    // 1. جلب الملف مع تتبع التقدم
    const response = await fetch(fileInfo.file_url);
    if (!response.ok) throw new Error(`فشل التحميل (${response.status})`);

    // ⭐ استخدام Stream لتتبع التقدم
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let blob;

    if (total && response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        if (typeof onProgress === 'function') {
          onProgress(Math.round((received / total) * 100), received, total);
        }
      }

      blob = new Blob(chunks, { 
        type: response.headers.get('content-type') || 'application/pdf' 
      });
    } else {
      blob = await response.blob();
    }

    // 2. حفظ في IndexedDB
    const saved = await saveDownloadedFile(fileInfo, blob);
    if (!saved) throw new Error('فشل الحفظ في الجهاز');

    // 3. تنزيل للمستخدم
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    
    // ⭐ امتداد حسب النوع
    const ext = getExtensionFromMime(blob.type) || '.pdf';
    link.download = (fileInfo.title || 'file') + ext;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    }, 1500);

    return { success: true, blob, size: blob.size };
  } catch (err) {
    console.error('downloadAndSaveFile error:', err);
    return { success: false, error: err.message };
  }
}

// ⭐ الحصول على الامتداد من نوع MIME
function getExtensionFromMime(mime) {
  const map = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'application/zip': '.zip',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
  };
  return map[mime] || null;
}

// ============================================
// 9. جلب Blob URL (من DB أو الشبكة)
// ============================================
async function getFileBlobUrl(fileInfo) {
  try {
    // 1. البحث في IndexedDB
    const cached = await getDownloadedFile(fileInfo.id);
    if (cached && cached.blob) {
      return URL.createObjectURL(cached.blob);
    }

    // 2. جلب من الشبكة إذا متصل
    if (!navigator.onLine) {
      throw new Error('لا يوجد اتصال والملف غير محفوظ');
    }

    const response = await fetch(fileInfo.file_url);
    if (!response.ok) throw new Error('فشل الجلب');

    const blob = await response.blob();

    // 3. حفظ للاستخدام المستقبلي
    await saveDownloadedFile(fileInfo, blob);

    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('getFileBlobUrl error:', err);
    return null;
  }
}

// ============================================
// 10. حذف جميع الملفات
// ============================================
async function clearAllDownloadedFiles() {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_FILES, STORE_META], 'readwrite');

    tx.objectStore(STORE_FILES).clear();
    tx.objectStore(STORE_META).clear();

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('clearAllDownloadedFiles error:', err);
    return false;
  }
}

// ⭐ تفريغ كل شيء (للمستخدم الذي يريد البدء من جديد)
async function clearAllData() {
  try {
    const db = await openDB();
    const tx = db.transaction(
      [STORE_FILES, STORE_META, STORE_FAVORITES],
      'readwrite'
    );

    tx.objectStore(STORE_FILES).clear();
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_FAVORITES).clear();

    return await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('clearAllData error:', err);
    return false;
  }
}

// ============================================
// 11. حساب حجم التخزين
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

// ⭐ حساب الحجم الفعلي للملفات المحمّلة
async function getActualDownloadedSize() {
  try {
    const files = await getAllDownloadedFiles();
    return files.reduce((sum, f) => sum + (f.file_size || 0), 0);
  } catch (err) {
    return 0;
  }
}

// ⭐ عدد الملفات المحمّلة
async function getDownloadedCount() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const store = tx.objectStore(STORE_META);

    return await new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return 0;
  }
}

// ============================================
// 12. أدوات مساعدة إضافية
// ============================================

// ⭐ التحقق من أن الملف يمكن حفظه offline
function isFileSavableOffline(file) {
  if (!file) return false;
  // الروابط الخارجية لا يمكن حفظها
  if (file.source === 'link') return false;
  // الملفات المرفوعة يمكن حفظها
  return !!file.file_url;
}

// ⭐ التحقق من دعم المتصفح لـ IndexedDB
function isIndexedDBSupported() {
  try {
    return !!window.indexedDB;
  } catch {
    return false;
  }
}

// ⭐ حذف الملفات القديمة تلقائياً (اختياري)
async function cleanupOldFiles(maxDays = 90) {
  try {
    const files = await getAllDownloadedFiles();
    const now = Date.now();
    const maxAge = maxDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    for (const file of files) {
      if (now - file.downloaded_at > maxAge) {
        await deleteDownloadedFile(file.id);
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (err) {
    console.error('cleanupOldFiles error:', err);
    return 0;
  }
}

// ⭐ معلومات التخزين بشكل مختصر
async function getStorageSummary() {
  try {
    const [storage, count, files] = await Promise.all([
      getStorageUsed(),
      getDownloadedCount(),
      getAllFavorites()
    ]);

    const actualSize = await getActualDownloadedSize();

    return {
      browserUsage: storage.usage,
      browserQuota: storage.quota,
      browserPercentage: storage.percentage,
      downloadedCount: count,
      favoritesCount: files.length,
      actualSize: actualSize,
      actualSizeFormatted: formatBytes(actualSize),
      browserUsageFormatted: formatBytes(storage.usage),
      browserQuotaFormatted: formatBytes(storage.quota)
    };
  } catch (err) {
    console.error('getStorageSummary error:', err);
    return null;
  }
}

// ⭐ تنسيق البايتات
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// ============================================
// 13. مراقبة حالة الاتصال
// ============================================
window.addEventListener('online', () => {
  console.log('🟢 IndexedDB ready — online');
});

window.addEventListener('offline', () => {
  console.log('🔴 IndexedDB ready — offline');
});

// ⭐ معالجة عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbOpenPromise = null;
  }
});

// ⭐ تحديث DB عند تغيير الإصدار في تبويب آخر
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('medfav_db_channel');
  channel.addEventListener('message', (event) => {
    if (event.data === 'db_updated') {
      dbInstance = null;
      dbOpenPromise = null;
    }
  });
}

console.log('✅ db.js v2.0.0 loaded — IndexedDB enhanced');