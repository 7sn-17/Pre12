// ============================================
// sw.js — Service Worker للمنصة الطبية
// يعمل بدون إنترنت + تخزين ذكي + مزامنة
// ============================================

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `medfav-${CACHE_VERSION}`;
const RUNTIME_CACHE = `medfav-runtime-${CACHE_VERSION}`;
const DATA_CACHE = `medfav-data-${CACHE_VERSION}`;

// ============================================
// الملفات التي تُخزّن فوراً عند التثبيت
// ============================================
const PRECACHE_URLS = [
  // الصفحات الرئيسية
  '/',
  '/index.html',
  '/login.html',
  '/subject.html',
  '/viewer.html',
  '/upload.html',
  '/notes.html',
  '/goals.html',
  '/admin.html',
  '/all-files.html',
  '/about.html',
  '/reset-password.html',
  '/offline.html',
  
  // ملفات JavaScript
  '/auth.js',
  '/db.js',
  '/files.js',
  '/supabase-config.js',
  '/theme-init.js',
  
  // ملفات manifest و الأيقونات
  '/manifest.json',
  '/icon-512.png',
  
  // مصادر خارجية أساسية
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// ============================================
// 1. تثبيت Service Worker
// ============================================
self.addEventListener('install', (event) => {
  console.log('🔧 SW: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 SW: Pre-caching files...');
        
        // نحاول تخزين كل ملف على حدة (لا نوقف العملية إذا فشل ملف واحد)
        return Promise.allSettled(
          PRECACHE_URLS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`⚠️ SW: Failed to cache ${url}:`, err.message);
            });
          })
        );
      })
      .then(() => {
        console.log('✅ SW: Installed successfully');
        // تفعيل SW الجديد فوراً (بدون انتظار إغلاق الصفحات)
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('❌ SW: Install failed:', err);
      })
  );
});

// ============================================
// 2. تنشيط Service Worker
// ============================================
self.addEventListener('activate', (event) => {
  console.log('🔧 SW: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        // احذف الكاشات القديمة
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('medfav-') && 
                     name !== CACHE_NAME && 
                     name !== RUNTIME_CACHE && 
                     name !== DATA_CACHE;
            })
            .map((name) => {
              console.log('🗑️ SW: Removing old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ SW: Activated');
        // السيطرة على كل الصفحات المفتوحة
        return self.clients.claim();
      })
  );
});

// ============================================
// 3. اعتراض الطلبات (Fetch)
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ============================================
  // تجاهل الطلبات غير المدعومة
  // ============================================
  if (request.method !== 'GET') {
    return;
  }

  // تجاهل طلبات Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // ============================================
  // استراتيجية خاصة لطلبات Supabase
  // Network-First مع Timeout
  // ============================================
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(handleSupabaseRequest(request));
    return;
  }

  // ============================================
  // استراتيجية خاصة لملفات PDF من Supabase Storage
  // Cache-First (لأنها ثابتة)
  // ============================================
  if (url.hostname.includes('supabase.co') && 
      (url.pathname.includes('/storage/') || url.pathname.endsWith('.pdf'))) {
    event.respondWith(handlePDFRequest(request));
    return;
  }

  // ============================================
  // استراتيجية للملفات المحلية (Cache-First)
  // ============================================
  if (url.origin === self.location.origin) {
    event.respondWith(handleLocalRequest(request));
    return;
  }

  // ============================================
  // استراتيجية للملفات الخارجية (CDN, Fonts)
  // Cache-First مع Background Update
  // ============================================
  event.respondWith(handleExternalRequest(request));
});

// ============================================
// 4. استراتيجيات المعالجة
// ============================================

/**
 * معالجة الطلبات المحلية (Cache-First)
 * مثالي: index.html, auth.js, إلخ
 */
async function handleLocalRequest(request) {
  try {
    // 1. ابحث في الكاش أولاً
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // حدّث في الخلفية (Stale-While-Revalidate)
      updateCacheInBackground(request);
      return cachedResponse;
    }

    // 2. اجلب من الشبكة
    const networkResponse = await fetch(request);
    
    // 3. خزّن في الكاش
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: Local request failed:', request.url);
    
    // فشل الاتصال — حاول الكاش
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    
    // إذا كانت صفحة HTML — اعرض صفحة offline
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('/offline.html');
    }
    
    throw err;
  }
}

/**
 * معالجة طلبات Supabase (Network-First with Timeout)
 * مهم: لأن البيانات قد تتغير
 */
async function handleSupabaseRequest(request) {
  try {
    // 1. حاول الشبكة أولاً (مع timeout 5 ثوان)
    const networkResponse = await fetchWithTimeout(request, 5000);
    
    if (networkResponse && networkResponse.status === 200) {
      // خزّن الاستجابة في كاش البيانات
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: Supabase request failed, trying cache:', request.url);
    
    // 2. الشبكة فشلت — استخدم الكاش
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('📦 SW: Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // 3. لا يوجد كاش — أرجع استجابة فارغة (بدل الخطأ)
    return new Response(
      JSON.stringify({ 
        error: 'offline', 
        message: 'لا يوجد اتصال بالإنترنت' 
      }),
      {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * معالجة ملفات PDF (Cache-First)
 * لأنها ثابتة — نخزنها للأبد
 */
async function handlePDFRequest(request) {
  try {
    // 1. ابحث في كل الكاشات
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('📦 SW: PDF from cache');
      return cachedResponse;
    }

    // 2. اجلب من الشبكة
    const networkResponse = await fetch(request);
    
    // 3. خزّن في كاش البيانات
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: PDF request failed');
    throw err;
  }
}

/**
 * معالجة الملفات الخارجية (CDN, Fonts)
 * Cache-First مع Background Update
 */
async function handleExternalRequest(request) {
  try {
    // 1. ابحث في الكاش
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // حدّث في الخلفية
      updateCacheInBackground(request);
      return cachedResponse;
    }

    // 2. اجلب من الشبكة
    const networkResponse = await fetch(request);
    
    // 3. خزّن في كاش Runtime
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: External request failed:', request.url);
    
    // حاول الكاش
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    
    throw err;
  }
}

// ============================================
// 5. دوال مساعدة
// ============================================

/**
 * Fetch مع Timeout
 */
function fetchWithTimeout(request, timeout) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);

    fetch(request)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

/**
 * تحديث الكاش في الخلفية (بدون انتظار)
 */
function updateCacheInBackground(request) {
  fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, response);
        });
      }
    })
    .catch(() => {
      // تجاهل الأخطاء
    });
}

// ============================================
// 6. مزامنة في الخلفية (Background Sync)
// ============================================
self.addEventListener('sync', (event) => {
  console.log('🔄 SW: Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  try {
    // سيتم استدعاؤها لاحقاً عند إضافة ميزة المزامنة
    console.log('🔄 SW: Syncing favorites...');
  } catch (err) {
    console.error('❌ SW: Sync failed:', err);
  }
}

// ============================================
// 7. رسائل من الصفحات الرئيسية
// ============================================
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    case 'CACHE_URLS':
      cacheUrls(data?.urls || []).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    default:
      console.log('📩 SW: Unknown message:', type);
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(name => caches.delete(name))
  );
}

async function cacheUrls(urls) {
  const cache = await caches.open(RUNTIME_CACHE);
  return Promise.allSettled(
    urls.map(url => cache.add(url).catch(() => {}))
  );
}

// ============================================
// 8. تحديث فوري عند وجود نسخة جديدة
// ============================================
self.addEventListener('activate', () => {
  console.log('🎉 SW: Ready for offline!');
});

console.log('✅ sw.js loaded');