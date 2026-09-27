// ============================================
// sw.js — Service Worker
// Version 3.1.0 — إصلاح الخطأ النحوي + دعم كامل لصور الجداول
// ============================================

const CACHE_VERSION = 'v3.1.0';
const STATIC_CACHE  = `medfav-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `medfav-runtime-${CACHE_VERSION}`;
const PDF_CACHE     = `medfav-pdf-${CACHE_VERSION}`;
const IMGS_CACHE    = `medfav-imgs-${CACHE_VERSION}`;

// ملفات precache
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/confirm.html',
  '/subject.html',
  '/viewer.html',
  '/upload.html',
  '/notes.html',
  '/goals.html',
  '/admin.html',
  '/all-files.html',
  '/about.html',
  '/privacy.html',
  '/terms.html',
  '/reset-password.html',
  '/offline.html',
  '/my-lectures.html',        // ⭐ الصفحة الجديدة

  '/auth.js',
  '/db.js',
  '/files.js',
  '/supabase-config.js',
  '/theme-init.js',
  '/pwa.js',

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
// 1. Install
// ============================================
self.addEventListener('install', (event) => {
  console.log('🔧 SW: Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('📦 SW: Pre-caching...');
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err =>
            console.warn(`⚠️ SW: failed ${url}`, err.message)
          )
        )
      );
    }).then(() => {
      console.log('✅ SW: Installed');
      return self.skipWaiting();
    })
  );
});

// ============================================
// 2. Activate — امسح كل نسخة قديمة
// ============================================
self.addEventListener('activate', (event) => {
  console.log('🔧 SW: Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(n => n.startsWith('medfav-') &&
          n !== STATIC_CACHE && n !== RUNTIME_CACHE &&
          n !== PDF_CACHE && n !== IMGS_CACHE)
          .map(n => {
            console.log('🗑️ SW: Removing old cache', n);
            return caches.delete(n);
          })
      );
    }).then(() => {
      console.log('✅ SW: Activated');
      return self.clients.claim();
    })
  );
});

// ============================================
// 3. Fetch
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'chrome:') return;

  // ⭐⭐ صور الجداول من Supabase Storage — Cache First للأبد
  if (url.hostname.includes('supabase.co') &&
      url.pathname.includes('/storage/v1/object/public/schedule-images/')) {
    event.respondWith(handleScheduleImage(request));
    return;
  }

  // PDF من Supabase Storage
  if (url.hostname.includes('supabase.co') &&
      (url.pathname.includes('/storage/') || url.pathname.endsWith('.pdf'))) {
    event.respondWith(handlePDFRequest(request));
    return;
  }

  // أي شيء آخر من Supabase → نتركه يمر
  if (url.hostname.includes('supabase.co')) return;

  // ملفات محلية
  if (url.origin === self.location.origin) {
    event.respondWith(handleLocalRequest(request));
    return;
  }

  // ملفات خارجية
  event.respondWith(handleExternalRequest(request));
});

// ============================================
// 4. Strategies
// ============================================

// صور الجداول — Cache First (للأبد)
async function handleScheduleImage(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      console.log('📦 SW: img from cache');
      return cached;
    }

    const network = await fetch(request);
    if (network && network.status === 200) {
      const cache = await caches.open(IMGS_CACHE);
      cache.put(request, network.clone());
    }
    return network;
  } catch (err) {
    console.warn('🌐 SW: img failed');
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('', { status: 404 });
  }
}

// PDF — Cache First
async function handlePDFRequest(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const network = await fetch(request);
    if (network && network.status === 200) {
      const cache = await caches.open(PDF_CACHE);
      cache.put(request, network.clone());
    }
    return network;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('PDF غير متاح', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ملفات محلية — Cache First + Network update
async function handleLocalRequest(request) {
  try {
    let cached = await caches.match(request);
    if (cached) {
      updateCacheInBackground(request);
      return cached;
    }

    const urlNoQ = request.url.split('?')[0];
    cached = await caches.match(urlNoQ);
    if (cached) {
      updateCacheInBackground(request);
      return cached;
    }

    const network = await fetch(request);
    if (network && network.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, network.clone());
    }
    return network;
  } catch (err) {
    const urlNoQ = request.url.split('?')[0];
    const cached = await caches.match(urlNoQ);
    if (cached) return cached;

    if (request.headers.get('accept')?.includes('text/html')) {
      const index = await caches.match('/index.html');
      if (index) return index;
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
    }
    throw err;
  }
}

// خارجية — Cache First + Network update
async function handleExternalRequest(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      updateCacheInBackground(request);
      return cached;
    }
    const network = await fetch(request);
    if (network && network.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, network.clone());
    }
    return network;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

function updateCacheInBackground(request) {
  fetch(request)
    .then(r => {
      if (r && r.status === 200) {
        caches.open(STATIC_CACHE).then(c => c.put(request, r));
      }
    })
    .catch(() => {});
}

// ============================================
// 5. Messages
// ============================================
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') self.skipWaiting();

  if (type === 'CLEAR_CACHE') {
    caches.keys().then(names =>
      Promise.all(names.map(n => caches.delete(n)))
    ).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
});

console.log('✅ sw.js v3.0.0 loaded');
