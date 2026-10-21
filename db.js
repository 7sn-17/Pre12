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
      added_at: fileInfo.added_at || Date.now()
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
// 13. مزامنة تقدم المهام (Offline-first)
// ============================================
// يحفظ كل تغيير محلياً أولاً (localStorage) ثم يرفعه إلى جدول
// public.task_progress عند توفر الاتصال. لا يمسح العنصر من الطابور
// إلا بعد نجاح الرفع، لذلك لا تُفقد أي مهمة عند انقطاع الشبكة.
const TASK_PROGRESS_QUEUE_KEY = 'medapp_task_progress_queue_v1';
const TASK_PROGRESS_OWNER_KEY = 'medapp_task_progress_owner_v1';
const TASK_PROGRESS_TABLE = 'task_progress';
let taskProgressSyncing = false;
let taskProgressFlushRequested = false;
let taskProgressRetryTimer = 0;
let taskProgressLastSync = { userId: '', at: 0 };

// Keep DB-level sync independent from auth.js getSession(). auth.js calls the
// full account sync from getSession(), so using getSession() here would create
// a recursive sync loop on every page.
async function getDbSession() {
  try {
    if (typeof supabaseClient !== 'undefined' && supabaseClient &&
        supabaseClient.auth && typeof supabaseClient.auth.getSession === 'function') {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      return data && data.session ? data.session : null;
    }
  } catch (e) {
    return null;
  }

  // Compatibility for test harnesses / very old cached shells where auth.js
  // is the only session provider. Never used when the Supabase auth client is
  // present, so the getSession() → sync → getSession() loop cannot happen.
  if (typeof getSession === 'function') {
    try {
      const session = await getSession();
      return session && session.user ? session : null;
    } catch (e) {}
  }
  return null;
}

function removeTaskCompletionStorage() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('task_') === 0) keys.push(key);
    }
    keys.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
  } catch (e) {}
}

function clearLocalTaskProgressState() {
  removeTaskCompletionStorage();
  writeTaskProgressQueue([]);
  try { localStorage.removeItem(TASK_PROGRESS_OWNER_KEY); } catch (e) {}
  taskProgressLastSync = { userId: '', at: 0 };
}

// One-time migration for progress that was saved before task_progress existed.
// The cloud becomes the source of truth afterwards, but old local completions
// must not disappear just because they were never uploaded.
function migrateLocalTaskKeysToQueue(userId) {
  const queue = readTaskProgressQueue();
  const now = new Date().toISOString();
  let changed = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf('task_') !== 0) continue;
      if (localStorage.getItem(key) !== '1') continue;
      const match = key.match(/^task_(\d{4}-\d{2}-\d{2})_(.+)$/);
      if (!match) continue;
      const planDate = match[1];
      const taskId = match[2];
      const exists = queue.some(function (row) {
        return String(row.plan_date) === planDate &&
          String(row.task_id) === taskId &&
          (!row.user_id || String(row.user_id) === String(userId));
      });
      if (exists) continue;
      queue.push({
        user_id: userId,
        plan_date: planDate,
        task_id: taskId,
        subject: null,
        task_title: null,
        instructor: null,
        task_type: null,
        completed: true,
        completed_at: now,
        updated_at: now
      });
      changed = true;
    }
  } catch (e) {}
  if (changed) writeTaskProgressQueue(queue);
}

function taskProgressTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function readTaskProgressQueue() {
  try {
    const raw = localStorage.getItem(TASK_PROGRESS_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeTaskProgressQueue(queue) {
  try {
    localStorage.setItem(TASK_PROGRESS_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('تعذّر حفظ طابور المزامنة:', e);
  }
}

/**
 * ⭐ يضع المهمة في طابور الرفع.
 * @param {object} task  المهمة (id · date · subject · task · instructor · type)
 * @param {boolean} done الحالة الجديدة
 * @param {object} [options] { deferFlush: true } → لا ترفع الآن (يتكفّل به
 *        المصدر المركزي في sync.js حتى لا يتأخر الحدث العام).
 */
async function queueTaskProgressSync(task, done, options) {
  options = options || {};
  if (!task || !task.id) return false;

  const session = await getDbSession();
  const userId = session && session.user ? session.user.id : '';
  // Guest progress has no cloud home. Do not queue it under whichever account
  // happens to sign in later.
  if (!userId) return false;

  const planDate = task.date || taskProgressTodayKey();
  const row = {
    user_id: userId,
    plan_date: planDate,
    task_id: String(task.id),
    subject: task.subject || null,
    task_title: task.task || task.title || null,
    instructor: task.instructor || null,
    task_type: task.type || null,
    completed: !!done,
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  const queue = readTaskProgressQueue();
  const idx = queue.findIndex(function (item) {
    return String(item.plan_date) === String(row.plan_date) &&
      String(item.task_id) === String(row.task_id) &&
      (!item.user_id || String(item.user_id) === String(row.user_id));
  });
  if (idx >= 0) queue[idx] = row;
  else queue.push(row);
  writeTaskProgressQueue(queue);

  if (navigator.onLine && !options.deferFlush) await flushTaskProgressQueue();
  return true;
}

async function flushTaskProgressQueue() {
  if (taskProgressSyncing) {
    // A task changed while the current batch was in flight. Run one more
    // pass after it finishes so the newest state is never left behind.
    taskProgressFlushRequested = true;
    return false;
  }
  if (!navigator.onLine) return false;
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;

  const queue = readTaskProgressQueue();
  if (!queue.length) return true;

  const session = await getDbSession();
  if (!session || !session.user) return false;

  // Only upload rows owned by this account. Legacy rows without user_id are
  // migrated to the current account; rows belonging to a previous account
  // must never be written into the new user's progress.
  const userId = session.user.id;
  const uploadQueue = queue.filter(function (row) {
    return !row.user_id || String(row.user_id) === String(userId);
  });
  if (!uploadQueue.length) return true;

  taskProgressSyncing = true;
  let uploaded = [];
  try {
    uploaded = uploadQueue.map(function (row) {
      return {
        user_id: userId,
        plan_date: row.plan_date,
        task_id: row.task_id,
        subject: row.subject || null,
        task_title: row.task_title || null,
        instructor: row.instructor || null,
        task_type: row.task_type || null,
        completed: !!row.completed,
        completed_at: row.completed_at || null,
        updated_at: row.updated_at || new Date().toISOString()
      };
    });

    const { error } = await supabaseClient
      .from(TASK_PROGRESS_TABLE)
      .upsert(uploaded, { onConflict: 'user_id,plan_date,task_id' });

    if (error) throw error;
  } catch (err) {
    console.warn('Task progress sync failed:', err && err.message ? err.message : err);
    taskProgressFlushRequested = false;
    clearTimeout(taskProgressRetryTimer);
    taskProgressRetryTimer = setTimeout(function () {
      taskProgressRetryTimer = 0;
      if (navigator.onLine) flushTaskProgressQueue();
    }, 15000);
    return false;
  } finally {
    taskProgressSyncing = false;
  }

  // احذف فقط الصفوف التي رُفعت فعلاً، وأبقِ أي تغيير أحدث حدث أثناء المزامنة.
  clearTimeout(taskProgressRetryTimer);
  taskProgressRetryTimer = 0;
  const uploadedAt = new Map(uploaded.map(function (row) {
    return [row.plan_date + '|' + row.task_id, String(row.updated_at || '')];
  }));
  const remaining = readTaskProgressQueue().filter(function (row) {
    if (row.user_id && String(row.user_id) !== String(userId)) return true;
    const key = String(row.plan_date) + '|' + String(row.task_id);
    if (!uploadedAt.has(key)) return true;
    return String(row.updated_at || '') !== uploadedAt.get(key);
  });
  writeTaskProgressQueue(remaining);

  try {
    window.dispatchEvent(new CustomEvent('medapp:progress-synced', {
      detail: { count: uploaded.length }
    }));
  } catch (e) {}

  if (taskProgressFlushRequested) {
    taskProgressFlushRequested = false;
    if (navigator.onLine) setTimeout(flushTaskProgressQueue, 0);
  }
  return true;
}

async function fetchUserTaskProgress(userId) {
  if (!userId || typeof supabaseClient === 'undefined' || !supabaseClient) return [];
  try {
    // Return both completed and reopened rows: a task unchecked on another
    // device must be able to clear a stale local completion here.
    const { data, error } = await supabaseClient
      .from(TASK_PROGRESS_TABLE)
      .select('plan_date,task_id,subject,task_title,instructor,task_type,completed,completed_at,updated_at')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('fetchUserTaskProgress error:', err && err.message ? err.message : err);
    // null means "could not read"; [] means the account genuinely has no rows.
    return null;
  }
}

// Pull the account's canonical progress into the local task_* keys. This is
// what makes a task checked on Device A appear checked on Device B after login.
async function syncTaskProgressFromCloud(userId) {
  if (!userId || !navigator.onLine) return false;
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
  if (taskProgressLastSync.userId === userId &&
      Date.now() - taskProgressLastSync.at < 3000 &&
      readTaskProgressQueue().length === 0) {
    return true;
  }

  const owner = (function () {
    try { return localStorage.getItem(TASK_PROGRESS_OWNER_KEY); } catch (e) { return null; }
  })();

  if (owner && String(owner) !== String(userId)) {
    // A different account used this browser. Never show or upload its tasks
    // under the new account.
    clearLocalTaskProgressState();
  } else if (!owner) {
    // First sync after upgrading from local-only progress: preserve every
    // local completion by uploading it before the cloud overwrites local keys.
    migrateLocalTaskKeysToQueue(userId);
  }

  try { localStorage.setItem(TASK_PROGRESS_OWNER_KEY, userId); } catch (e) {}

  const flushed = await flushTaskProgressQueue();
  if (!flushed) return false;

  const rows = await fetchUserTaskProgress(userId);
  if (!Array.isArray(rows)) return false;

  removeTaskCompletionStorage();
  rows.forEach(function (row) {
    if (!row || !row.plan_date || !row.task_id || !row.completed) return;
    try {
      localStorage.setItem('task_' + String(row.plan_date) + '_' + String(row.task_id), '1');
      // ⭐ نخزّن وقت الإجازة الحقيقي حتى تكون أيام السلسلة دقيقة.
      if (row.completed_at) {
        localStorage.setItem(
          TASK_DONE_AT_PREFIX + String(row.plan_date) + '_' + String(row.task_id),
          JSON.stringify({ done: true, at: new Date(row.completed_at).toISOString() })
        );
      }
    } catch (e) {}
  });

  // ⭐ التغييرات المحلية الأحدث (مثل إلغاء مهمة) تُطبَّق بعد المزامنة،
  //    ومعها شاهد الإلغاء حتى لا تعود المهمة محسوبة في السلسلة.
  const overrides = getLocalTaskProgressOverrides(userId);
  Object.keys(overrides).forEach(function (key) {
    const split = key.indexOf('|');
    if (split < 1) return;
    const date = key.slice(0, split);
    const taskId = key.slice(split + 1);
    const storageKey = 'task_' + date + '_' + taskId;
    const stampKey = TASK_DONE_AT_PREFIX + date + '_' + taskId;
    try {
      if (overrides[key]) {
        localStorage.setItem(storageKey, '1');
        if (!localStorage.getItem(stampKey)) {
          localStorage.setItem(stampKey, JSON.stringify({ done: true, at: new Date().toISOString() }));
        }
      } else {
        localStorage.removeItem(storageKey);
        localStorage.setItem(stampKey, JSON.stringify({ done: false, at: new Date().toISOString() }));
      }
    } catch (e) {}
  });

  taskProgressLastSync = { userId: userId, at: Date.now() };

  try {
    window.dispatchEvent(new CustomEvent('medapp:progress-synced', {
      detail: { count: rows.length, source: 'cloud' }
    }));
  } catch (e) {}
  return true;
}

// Latest pending local state per task. Used to stop a stale remote row from
// overriding a change that has not been uploaded yet.
function getLocalTaskProgressOverrides(userId) {
  const overrides = {};
  readTaskProgressQueue().forEach(function (row) {
    if (!row || !row.plan_date || !row.task_id) return;
    // Rows owned by another account must never influence this account's UI.
    if (userId && row.user_id && String(row.user_id) !== String(userId)) return;
    overrides[String(row.plan_date) + '|' + String(row.task_id)] = !!row.completed;
  });
  return overrides;
}

function getLocalCompletedTaskKeys() {
  const keys = new Set();
  try {
    const queue = readTaskProgressQueue();
    queue.forEach(function (row) {
      if (row.completed) keys.add(row.plan_date + '|' + row.task_id);
    });
  } catch (e) {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || key.indexOf('task_') !== 0) continue;
      if (localStorage.getItem(key) !== '1') continue;
      const match = key.match(/^task_(\d{4}-\d{2}-\d{2})_(.+)$/);
      if (match) keys.add(match[1] + '|' + match[2]);
    }
  } catch (e) {}
  return keys;
}

// ============================================
// 14.5 سجلّ الأيام النشطة (سلسلة الأيام)
// ------------------------------------------------------------
// ⭐ القاعدة: اليوم يُعتبر "نشطاً" إذا أنجز المستخدم مهمة **في
// ذلك اليوم تحديداً** — لا في يوم المهمة المخطّط لها.
//
// لهذا نحفظ وقت الإpletion بجانب حالة الإكمال:
//   task_<plan_date>_<id>   = '1'                 (الحالة)
//   task_at_<plan_date>_<id> = <ISO timestamp>    (متى أُنجزت فعلاً)
//
// بدون هذا السجل كانت السلسلة تُضيء اليوم المخطّط للمهمة، فيبدو
// للمستخدم أن أياماً لم يعمل فيها أضواء بلا سبب.
// ============================================

const TASK_DONE_AT_PREFIX = 'task_at_';

/**
 * يحوّل طابعاً زمنياً إلى مفتاح يوم محلي (YYYY-MM-DD).
 * التوقيت المحلي هو المعيار: المستخدم أنجز المهمة في يومه هو.
 */
function toLocalDayKey(value) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  } catch (e) {
    return '';
  }
}

/**
 * ⭐ يحفظ حالة إكمال المهمة + وقت الإجازة المحلي.
 *
 * القيمة المخزّنة في `task_at_*` هي كائن JSON:
 *   { "done": true|false, "at": "<ISO>" }
 * `done:false` هي "شاهد إلغاء" (tombstone): يعني أن المهمة أُلغيت
 * محلياً، فلا يجوز أن تُحتسب في السلسلة حتى لو كان الطابور
 * أو السحابة ما زالا يعرضانها كمنجزة.
 */
function setLocalTaskCompletion(planDate, taskId, completed) {
  const date = String(planDate || '');
  const id = String(taskId || '');
  if (!date || !id) return false;
  const key = 'task_' + date + '_' + id;
  const stampKey = TASK_DONE_AT_PREFIX + date + '_' + id;
  try {
    const stamp = JSON.stringify({ done: !!completed, at: new Date().toISOString() });
    if (completed) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
    localStorage.setItem(stampKey, stamp);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * ⭐ يقرأ ختم الإجازة (يدعم الصيغة القديمة النصية).
 */
function parseTaskStamp(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'done' in parsed) {
      return { done: !!parsed.done, at: parsed.at || '' };
    }
  } catch (e) {}
  // صيغة قديمة: طابع ISO فقط = مهمة منجزة
  return { done: true, at: String(raw) };
}

/**
 * ⭐ حالة كل مهمة: "date|task_id" → { done, at }
 *
 * ترتيب الأولوية:
 *   1) الطابور (أحدث نية، لم تُرفع بعد) — يتقدّم على كل شيء.
 *   2) الختم المحلي `task_at_*` (آخر حالة مُزامنة).
 *   3) المفتاح القديم `task_*` = '1' (بلا ختم) → منجزة بلا وقت دقيق.
 */
function getLocalTaskStates() {
  const states = new Map();

  // 1) الختم والمفاتيح المحلية
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.indexOf(TASK_DONE_AT_PREFIX) === 0) {
        const m = key.match(/^task_at_(\d{4}-\d{2}-\d{2})_(.+)$/);
        if (!m) continue;
        const parsed = parseTaskStamp(localStorage.getItem(key));
        if (!parsed) continue;
        states.set(m[1] + '|' + m[2], parsed);
        continue;
      }

      if (key.indexOf('task_') === 0) {
        const m = key.match(/^task_(\d{4}-\d{2}-\d{2})_(.+)$/);
        if (!m) continue;
        if (localStorage.getItem(key) !== '1') continue;
        const id = m[1] + '|' + m[2];
        if (states.has(id)) continue;   // الختم الدقيق يتقدّم
        states.set(id, { done: true, at: '' });
      }
    }
  } catch (e) {}

  // 2) الطابور يتقدّم على كل شيء (أحدث نية)
  try {
    readTaskProgressQueue().forEach(function (row) {
      if (!row || !row.plan_date || !row.task_id) return;
      states.set(String(row.plan_date) + '|' + String(row.task_id), {
        done: !!row.completed,
        at: row.completed ? (row.completed_at || row.updated_at || '') : ''
      });
    });
  } catch (e) {}

  return states;
}

/**
 * ⭐ الأيام التي أنجز فيها المستخدم مهمة فعلاً — هذه هي أيام السلسلة.
 *
 * ⭐ القاعدة: اليوم يُحتسب فقط إذا كانت هناك مهمة واحدة على الأقل
 * حالتها "منجزة" في ذلك اليوم. فإذا ألغى المستخدم كل مهام اليوم
 * يختفي اليوم من السلسلة فوراً.
 */
function getLocalActiveDates() {
  const dates = new Set();
  const states = getLocalTaskStates();

  states.forEach(function (state, id) {
    if (!state || !state.done) return;         // ⭐ مُلغاة → لا تُحتسب
    const day = state.at ? toLocalDayKey(state.at) : String(id).split('|')[0];
    if (day) dates.add(day);
  });

  return dates;
}

// ⭐⭐⭐ Phase W17.1 — لا تدفّق الطلبات: «عودة الاتصال» كانت تُطلق
//   تفريغ الطابور في كل حدث (وهو يتكرّر على أندرويد) ⇒ خُنقناه.
window.addEventListener('online', function () {
  if (!(window.medappThrottle ? window.medappThrottle('db:flush-queue', 20000) : true)) return;
  setTimeout(flushTaskProgressQueue, 600);
});

// محاولة رفع أي عناصر متبقية من جلسة سابقة بعد تحميل الصفحة.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(flushTaskProgressQueue, 1400);
  });
} else {
  setTimeout(flushTaskProgressQueue, 1400);
}

// ============================================
// 14. مراقبة حالة الاتصال
// ============================================
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
