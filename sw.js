// ============================================
// sw.js — Service Worker للمنصة الطبية
// Version 2.4.1 — Cache ذكي مع ملفات منفصلة
// ============================================

const CACHE_VERSION = 'v2.4.1';
const STATIC_CACHE = `medfav-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `medfav-runtime-${CACHE_VERSION}`;
const PDF_CACHE = `medfav-pdf-${CACHE_VERSION}`;

// ============================================
// الملفات الثابتة التي تُخزّن فوراً
// ============================================
const PRECACHE_URLS = [
  // الصفحات
  '/',
  '/index.html',
  '/login.html',
 './confirm.html',
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
  console.log('🔧 SW: Installing v2.0.0...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('📦 SW: Pre-caching static files...');
        
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
  console.log('🔧 SW: Activating v2.0.0...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('medfav-') && 
                     name !== STATIC_CACHE && 
                     name !== RUNTIME_CACHE && 
                     name !== PDF_CACHE;
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
  if (url.protocol === 'chrome:') return;

  // ============================================
  // ⭐ Supabase — لا نتدخل أبداً
  // نترك files.js يتعامل مع offline عبر localStorage
  // فقط PDF نتدخل لتخزينه
  // ============================================
  if (url.hostname.includes('supabase.co')) {
    // PDF من Storage — نخزّنه
    if (url.pathname.includes('/storage/') || url.pathname.endsWith('.pdf')) {
      event.respondWith(handlePDFRequest(request));
    }
    // غير ذلك — نتركه يمر مباشرة
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
// 4. الاستراتيجيات
// ============================================

/**
 * PDF من Supabase Storage — Cache-First
 * نخزّنها للأبد لأنها ثابتة
 */
async function handlePDFRequest(request) {
  try {
    // 1. ابحث في كاش PDF
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('📦 SW: PDF from cache');
      return cachedResponse;
    }

    // 2. اجلب من الشبكة
    const networkResponse = await fetch(request);
    
    // 3. خزّن في كاش PDF
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(PDF_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: PDF request failed');
    
    // حاول الكاش
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    
    return new Response('PDF غير متاح', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/**
 * الملفات المحلية
 */
async function handleLocalRequest(request) {
  try {
    // ابحث في الكاش (بدون تجاهل Query — لأن الصفحات قد تختلف)
    let cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      updateCacheInBackground(request);
      return cachedResponse;
    }
    
    // حاول بدون Query (مثل viewer.html?id=xxx)
    const urlWithoutQuery = request.url.split('?')[0];
    cachedResponse = await caches.match(urlWithoutQuery);
    
    if (cachedResponse) {
      updateCacheInBackground(request);
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    console.warn('🌐 SW: Local failed:', request.url);
    
    // حاول بدون query
    const urlWithoutQuery = request.url.split('?')[0];
    let cachedResponse = await caches.match(urlWithoutQuery);
    
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
    let cachedResponse = await caches.match(request);
    
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
    const cachedResponse = await caches.match(request);
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
        caches.open(STATIC_CACHE).then((cache) => {
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
  
  if (type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      return Promise.all(names.map(name => caches.delete(name)));
    }).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});

console.log('✅ sw.js v2.0.0 loaded — Supabase bypass enabled');