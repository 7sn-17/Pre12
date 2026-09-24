// ============================================
// sw.js — Service Worker للمنصة الطبية
// Version 1.2.0 — مع دعم كامل للعمل بدون إنترنت
// ============================================

const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME = `medfav-${CACHE_VERSION}`;
const RUNTIME_CACHE = `medfav-runtime-${CACHE_VERSION}`;
const DATA_CACHE = `medfav-data-${CACHE_VERSION}`;

// ============================================
// الملفات التي تُخزّن فوراً عند التثبيت
// ============================================
const PRECACHE_URLS = [
  // الصفحات
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
  '/pwa.js',
  
  // manifest والأيقونات
  '/manifest.json',
  '/icon-512.png',
  
  // مصادر خارجية
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// ============================================
// 1. تثبيت SW
// ============================================
self.addEventListener('install', (event) => {
  console.log('🔧 SW: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 SW: Pre-caching files...');
        
        return Promise.allSettled(
          PRECACHE_URLS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`⚠️ SW: Failed to cache ${url}:`, err.message);
            });
          })
        );
      })
      .then(() => {
        console.log('✅ SW: Installed');
        return self.skipWaiting();
      })
  );
});

// ============================================
// 2. تنشيط SW
// ============================================
self.addEventListener('activate', (event) => {
  console.log('🔧 SW: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
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
        return self.clients.claim();
      })
  );
});

// ============================================
// 3. اعتراض الطلبات
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Supabase
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(handleSupabaseRequest(request));
    return;
  }

  // ملفات محلية
  if (url.origin === self.location.origin) {
    event.respondWith(handleLocalRequest(request));
    return;
  }

  // ملفات خارجية
  event.respondWith(handleExternalRequest(request));
});

// ============================================
// 4. استراتيجيات
// ============================================

/**
 * ⭐ أهم تعديل: Supabase — Offline-First!
 * إذا لا يوجد إنترنت → Cache فوراً (بدون انتظار)
 */
async function handleSupabaseRequest(request) {
  // ⭐ 1. إذا لم يوجد إنترنت — استخدم الكاش فوراً
  if (!navigator.onLine) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      console.log('📦 SW: Offline — from cache');
      return cachedResponse;
    }
    
    // لا يوجد كاش — أرجع مصفوفة فارغة (بدل خطأ)
    return new Response(
      JSON.stringify([]),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-Offline': 'true'
        }
      }
    );
  }
  
  // ⭐ 2. متصل — حاول الشبكة
  try {
    const networkResponse = await fetchWithTimeout(request, 5000);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error('Non-200 response');
  } catch (err) {
    // فشل — حاول الكاش
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) {
      console.log('📦 SW: Supabase fallback to cache');
      return cachedResponse;
    }
    
    return new Response(
      JSON.stringify([]),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' }
      }
    );
  }
}

/**
 * الملفات المحلية
 */
async function handleLocalRequest(request) {
  try {
    // ابحث في الكاش
    let cachedResponse = await caches.match(request, { ignoreSearch: true });
    
    if (cachedResponse) {
      updateCacheInBackground(request);
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: Local failed:', request.url);
    
    // حاول بدون query
    const urlWithoutQuery = request.url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery, { ignoreSearch: true });
    
    if (cachedResponse) return cachedResponse;
    
    // حاول index.html
    if (request.headers.get('accept')?.includes('text/html')) {
      const index = await caches.match('/index.html');
      if (index) return index;
      return caches.match('/offline.html');
    }
    
    throw err;
  }
}

/**
 * الملفات الخارجية
 */
async function handleExternalRequest(request) {
  try {
    let cachedResponse = await caches.match(request, { ignoreSearch: true });
    
    if (cachedResponse) {
      updateCacheInBackground(request);
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) return cachedResponse;
    throw err;
  }
}

// ============================================
// 5. Helpers
// ============================================
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

function updateCacheInBackground(request) {
  fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, response);
        });
      }
    })
    .catch(() => {});
}

// ============================================
// 6. الرسائل
// ============================================
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('✅ sw.js v1.2.0 loaded — offline ready');