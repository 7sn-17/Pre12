/* ============================================================================
   app.js — SPA shell runtime ("MedApp")
   ----------------------------------------------------------------------------
   Multi-page app, SPA-like navigation without a framework:
     • Intercepts same-origin clicks to the whitelisted app pages only.
     • Fetches the target HTML, swaps <body> and the page-specific <style>
       blocks + <title>, keeps the shell (head, CDN libs, Supabase client,
       IndexedDB, theme) alive.
     • Re-runs the target page's own inline scripts in document order.
     • Re-initialises Lucide icons after every swap.
     • Cleans up the previous view's window/document listeners.
     • Falls back to a normal full page load on error / timeout / offline.

   Re-execution safety:
     build.js rewrites top-level `const` / `let` / `class` to `var` on the app
     pages. Classic scripts can therefore be executed again without throwing
     "Identifier has already been declared". Functions and variables stay in
     the global scope (exactly like the original pages), so every inline
     onclick handler and every cross-<script> reference keeps working.
   ========================================================================== */
(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------
  var APP_PAGES = {
    'index.html': 1, 'subject.html': 1, 'viewer.html': 1, 'notes.html': 1,
    'goals.html': 1, 'my-lectures.html': 1, 'all-files.html': 1,
    'gpa.html': 1, 'admin.html': 1, 'plans.html': 1,
    'progress.html': 1
  };

  // Framework / shell events that must NEVER be auto-removed from a view scope.
  var LISTENER_DENYLIST = {
    visibilitychange: 1, storage: 1, focus: 1, blur: 1,
    beforeunload: 1, unload: 1, pagehide: 1, pageshow: 1,
    popstate: 1, hashchange: 1
  };

  var SCRIPT_TYPES = { '': 1, 'text/javascript': 1, 'application/javascript': 1 };

  // --------------------------------------------------------------------------
  // Assets already present in this document (so the SPA never double-loads)
  // --------------------------------------------------------------------------
  var loadedSrcs = Object.create(null);
  var loadedHrefs = Object.create(null);

  (function seedLoadedAssets() {
    var i, els = document.querySelectorAll('script[src]');
    for (i = 0; i < els.length; i++) loadedSrcs[els[i].getAttribute('src')] = 1;
    els = document.querySelectorAll('link[rel="stylesheet"][href]');
    for (i = 0; i < els.length; i++) loadedHrefs[els[i].getAttribute('href')] = 1;
  })();

  // --------------------------------------------------------------------------
  // View scope: record window/document listeners + intervals so they can be
  // torn down when the view is replaced.
  // --------------------------------------------------------------------------
  var recording = false;
  var viewListeners = [];

  var origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (recording && (this === window || this === document) &&
        typeof type === 'string' && !LISTENER_DENYLIST[type]) {
      viewListeners.push([this, type, fn, opts]);
    }
    return origAddEventListener.call(this, type, fn, opts);
  };

  function endView() {
    // Pages can release non-DOM resources that a body swap cannot reclaim
    // (IndexedDB connections, object URLs, rAF loops, …). The hook belongs to
    // the view that is being replaced and is cleared before the next page runs.
    if (typeof window.MedAppViewCleanup === 'function') {
      try { window.MedAppViewCleanup(); }
      catch (e) { console.error('[MedApp] view cleanup failed:', e); }
    }
    window.MedAppViewCleanup = null;

    for (var i = 0; i < viewListeners.length; i++) {
      var L = viewListeners[i];
      try { L[0].removeEventListener(L[1], L[2], L[3]); } catch (e) {}
    }
    viewListeners.length = 0;
  }

  // On a swap the document is already "loaded", so DOMContentLoaded never fires
  // again. Replay the handlers the new view registered.
  function fireDomReady() {
    var snapshot = viewListeners.slice();
    for (var i = 0; i < snapshot.length; i++) {
      var L = snapshot[i];
      if (L[1] === 'DOMContentLoaded') {
        try { L[2].call(L[0], new Event('DOMContentLoaded')); }
        catch (e) { console.error('[MedApp] DOMContentLoaded handler threw:', e); }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Lazy asset loading (only for libs the new page needs but we don't have)
  // --------------------------------------------------------------------------
  function loadScript(src) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        console.warn('[MedApp] asset timed out:', src);
        resolve();
      }, 12000);
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { if (done) return; done = true; clearTimeout(timer); resolve(); };
      s.onerror = function () { if (done) return; done = true; clearTimeout(timer); console.warn('[MedApp] failed to load asset:', src); resolve(); };
      document.head.appendChild(s);
    });
  }

  function loadMissingAssets(doc) {
    var i;
    var links = doc.querySelectorAll('link[rel="stylesheet"][href]');
    for (i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && !loadedHrefs[href]) {
        loadedHrefs[href] = 1;
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
      }
    }

    var queue = [];
    var scripts = doc.querySelectorAll('script[src]');
    for (i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src');
      if (!src) continue;
      // The router itself is already running; a version bump in a freshly
      // fetched page must never boot a second copy of app.js.
      if (/(^|\/)app\.js(\?|$)/.test(src)) continue;
      if (!loadedSrcs[src]) { loadedSrcs[src] = 1; queue.push(src); }
    }

    // Load sequentially (dependency order: supabase-js → supabase-config → auth…)
    // with listener-recording OFF so a late lib's global listeners are never
    // attributed to (and later removed from) the active view.
    var wasRecording = recording;
    recording = false;
    var chain = Promise.resolve();
    queue.forEach(function (src) {
      chain = chain.then(function () { return loadScript(src); });
    });
    return chain.then(
      function () { recording = wasRecording; },
      function () { recording = wasRecording; }
    );
  }

  // --------------------------------------------------------------------------
  // DOM swapping
  // --------------------------------------------------------------------------
  function syncHead(doc) {
    if (doc.title) document.title = doc.title;

    // Keep the browser chrome colour in sync with the target page (it differs
    // between the app shell, auth pages and the white legal pages).
    var tm = doc.head.querySelector('meta[name="theme-color"]');
    if (tm) {
      var cm = document.head.querySelector('meta[name="theme-color"]');
      if (cm) cm.setAttribute('content', tm.getAttribute('content') || '');
      else document.head.appendChild(document.importNode(tm, true));
    }

    // Page-specific CSS is inlined in <head> by the build. Replace it before
    // the body changes so there is never a flash of unstyled content.
    var olds = document.head.querySelectorAll('style:not([data-shell])');
    for (var i = 0; i < olds.length; i++) olds[i].parentNode.removeChild(olds[i]);
    var news = doc.head.querySelectorAll('style:not([data-shell])');
    for (var j = 0; j < news.length; j++) {
      document.head.appendChild(document.importNode(news[j], true));
    }
  }

  function copyBodyAttributes(target) {
    var body = document.body;
    var i;
    for (i = body.attributes.length - 1; i >= 0; i--) {
      body.removeAttribute(body.attributes[i].name);
    }
    for (i = 0; i < target.attributes.length; i++) {
      body.setAttribute(target.attributes[i].name, target.attributes[i].value);
    }
  }

  function swapBody(doc) {
    endView();
    copyBodyAttributes(doc.body);
    document.body.innerHTML = doc.body.innerHTML;
  }

  function isExecutableInlineScript(s) {
    if (s.hasAttribute('data-shell')) return false;
    if (s.src) return false;
    var type = (s.getAttribute('type') || '').trim().toLowerCase();
    return !!SCRIPT_TYPES[type];
  }

  function runViewScripts() {
    var scripts = document.body.querySelectorAll('script');
    var toRun = [];
    var i;

    for (i = 0; i < scripts.length; i++) {
      if (isExecutableInlineScript(scripts[i])) toRun.push(scripts[i]);
    }

    // Insert fresh script elements one by one: inline classic scripts execute
    // synchronously at insertion time, in document order.
    for (i = 0; i < toRun.length; i++) {
      var old = toRun[i];
      var fresh = document.createElement('script');
      for (var a = 0; a < old.attributes.length; a++) {
        fresh.setAttribute(old.attributes[a].name, old.attributes[a].value);
      }
      fresh.textContent = old.textContent;
      old.parentNode.replaceChild(fresh, old);
    }

    fireDomReady();

    // The swapped body has a fresh header that may need the scrolled state
    // immediately (e.g. Back restoration lands mid-page).
    headerScrolled = null;
    scheduleHeaderScrollState();
  }

  function refreshIcons() {
    try { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); } catch (e) {}
  }

  function refreshIconsSoon() {
    refreshIcons();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(refreshIcons);
    }
    setTimeout(refreshIcons, 80);
  }

  function syncTheme() {
    try {
      var theme = localStorage.getItem('medfav_theme');
      if (theme === 'light' || theme === 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // Theme transition — smooth light/dark switch
  // --------------------------------------------------------------------------
  // The transition class is added *before* the theme changes and removed
  // afterwards, so the colours fade instead of snapping. A forced reflow
  // guarantees the browser has applied the transition-enabled styles first.
  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function withThemeTransition(apply) {
    var root = document.documentElement;
    if (typeof apply !== 'function') return;

    if (prefersReducedMotion()) {
      try { apply(); } catch (e) { console.error('[MedApp] theme change failed:', e); }
      return;
    }

    try {
      root.classList.add('theme-transition');
      // Force a style flush so the transition is active for the very next
      // frame (otherwise the first colour change snaps instead of fading).
      void root.offsetWidth;
      apply();
    } catch (e) {
      console.error('[MedApp] theme change failed:', e);
    }

    if (withThemeTransition.timer) clearTimeout(withThemeTransition.timer);
    withThemeTransition.timer = setTimeout(function () {
      root.classList.remove('theme-transition');
    }, 420);
  }

  // ⭐ شبكة أمان: أي صفحة تبدّل الثيم بنفسها (دون استدعاء
  // withThemeTransition) تحصل على الانتقال الناعم تلقائياً.
  function watchThemeChanges() {
    if (typeof MutationObserver === 'undefined') return;
    var root = document.documentElement;
    var observer = new MutationObserver(function () {
      if (root.classList.contains('theme-transition')) return;
      root.classList.add('theme-transition');
      if (withThemeTransition.timer) clearTimeout(withThemeTransition.timer);
      withThemeTransition.timer = setTimeout(function () {
        root.classList.remove('theme-transition');
      }, 420);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // --------------------------------------------------------------------------
  // Router
  // --------------------------------------------------------------------------
  var navigating = false;
  // Incremented whenever a history traversal must win over an in-flight
  // forward navigation (e.g. the user presses Back while a page is loading).
  var navToken = 0;
  // Navigation requested while another one is in flight (last one wins).
  var pendingNav = null;
  var prefetched = Object.create(null);
  // Path+query of the currently rendered view. Lets a hash-only history
  // traversal be handled by the browser (anchor scroll) instead of refetching.
  var viewKey = location.pathname + location.search;

  // The browser's own scroll restoration fights the SPA: it can restore the
  // wrong entry (or reset to 0) after the async body swap. We restore manually
  // once the new DOM is laid out.
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch (e) {}

  function basename(pathname) {
    var p = pathname.split('/');
    return p[p.length - 1] || 'index.html';
  }

  function isAppUrl(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin && !!APP_PAGES[basename(u.pathname)];
    } catch (e) { return false; }
  }

  function eligibleLink(a) {
    if (!a || a.target || a.hasAttribute('download')) return false;
    if (a.hasAttribute('data-no-router')) return false;
    if (a.closest && a.closest('[data-no-router]')) return false;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;
    // Any anchor in the URL keeps the browser's own (full-load) behaviour so
    // in-page targets always work exactly like the original pages.
    if (href.indexOf('#') !== -1) return false;
    if (/^(mailto:|tel:|sms:|javascript:|blob:|data:)/i.test(href)) return false;
    var u;
    try { u = new URL(href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    // same document (hash-only change) → let the browser handle it
    if (u.pathname === location.pathname && u.search === location.search) return false;
    return isAppUrl(u.href);
  }

  /**
   * ⭐⭐⭐ W9 — «قاتل الكاش».
   *
   * A page fetched by the shell must never come from the HTTP cache: after an
   * app update the WebView still holds the previous HTML, and the user would
   * keep seeing the old settings page. `cache: 'no-store'` forces the network.
   */
  function fetchWithTimeout(url, ms, noStore) {
    var init = { credentials: 'same-origin' };
    if (noStore) init.cache = 'no-store';
    if (typeof AbortController === 'undefined') return fetch(url, init);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
    init.signal = ctrl.signal;
    return fetch(url, init)
      .then(function (r) { clearTimeout(timer); return r; },
            function (e) { clearTimeout(timer); throw e; });
  }

  function navigate(url, push, restoreScroll) {
    // Anything that is not a whitelisted app page — auth, legal, onboarding,
    // offline, or an in-page anchor — must stay a normal full page load.
    var target;
    try { target = new URL(url, location.href); } catch (e) { target = null; }
    if (!target || target.hash || !isAppUrl(target.href)) {
      hideLoader();
      document.documentElement.classList.remove('medapp-navigating');
      window.location.href = target ? target.href : url;
      return Promise.resolve();
    }
    url = target.href;

    // Read the scroll position saved on the history entry we are going BACK
    // to before any async work. Page scripts (e.g. my-lectures) may call
    // replaceState during init and wipe the state, so capture it now.
    var restoreY = 0;
    if (restoreScroll) {
      try { restoreY = Number((history.state && history.state.scrollY) || 0) || 0; } catch (e) { restoreY = 0; }
    }
    // Any queued debounced save belongs to the view we are leaving; never let
    // it fire against the new history entry.
    if (scrollSaveTimer) { clearTimeout(scrollSaveTimer); scrollSaveTimer = 0; }
    restoreSeq++;

    if (navigating) {
      pendingNav = { url: url, push: push, restoreScroll: restoreScroll };
      return Promise.resolve();
    }
    navigating = true;
    var token = ++navToken;
    document.documentElement.classList.add('medapp-navigating');
    showLoader();

    return fetchWithTimeout(url, 15000, true)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        return loadMissingAssets(doc).then(function () { return doc; });
      })
      .then(function (doc) {
        var doSwap = function () {
          // A history traversal happened while this page was loading → drop
          // this (now stale) forward navigation; the queued popstate wins.
          if (token !== navToken) return;
          syncHead(doc);
          syncTheme();

          // The URL must be current BEFORE the page script runs: pages such as
          // subject.html / viewer.html read location.search during init().
          if (push !== false) {
            try { history.pushState({ medapp: 1 }, '', url); } catch (e) {}
          }
          viewKey = location.pathname + location.search;

          swapBody(doc);
          if (!restoreScroll) {
            jumpScroll(0);
          }
          runViewScripts();
          // ⭐ W9 — a deep link that navigated here must still be honoured:
          //    the new view's scripts are already running at this point.
          try { deepLinkFromLocation(); } catch (e) {}
          // Page scripts may normalise the URL (e.g. my-lectures strips a
          // deep-link query with replaceState) — track the final URL.
          viewKey = location.pathname + location.search;
          refreshIconsSoon();

          if (restoreScroll) {
            // Apply the saved position synchronously so the View Transition's
            // new snapshot is already at the right place, then keep retrying
            // as async content (Supabase, images, Lucide) makes the page taller.
            jumpScroll(restoreY);
            restoreScrollTo(restoreY);
          }
        };

        if (document.startViewTransition && !prefersReducedMotion()) {
          var t;
          try {
            t = document.startViewTransition(doSwap);
          } catch (e) {
            doSwap();
            return;
          }
          var done = (t && t.finished) ? t.finished : Promise.resolve();
          return done.catch(function () {});
        }

        // No View Transitions API: swap synchronously. No body animation here
        // on purpose — fading <body> would also fade the fixed bottom nav.
        doSwap();
      })
      .catch(function (err) {
        if (token !== navToken) return; // superseded by a history traversal
        console.warn('[MedApp] SPA navigation failed — falling back to full load:', err);
        hideLoader();
        // ⭐ لا يوجد اتصال ولا صفحة مخزّنة: صفحة "بدون إنترنت" أنفع من
        // رسالة المتصفح.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          try {
            window.location.href = 'offline.html';
            return;
          } catch (e) {}
        }
        window.location.href = url;
      })
      .then(function () {
        navigating = false;
        document.documentElement.classList.remove('medapp-navigating');
        if (pendingNav) {
          var p = pendingNav;
          pendingNav = null;
          navigate(p.url, p.push, p.restoreScroll);
        } else {
          hideLoaderAfterPaint();
        }
      });
  }

  function rememberScroll() {
    try {
      var state = history.state;
      if (!state || typeof state !== 'object') state = {};
      var y = window.scrollY || window.pageYOffset || 0;
      if (state.medapp && state.scrollY === y) return;
      state.medapp = 1;
      state.scrollY = y;
      history.replaceState(state, '', location.href);
    } catch (e) {}
  }

  // Instant scroll that bypasses `html { scroll-behavior: smooth }` (used for
  // SPA swaps and Back/Forward restoration; only user-initiated anchor jumps
  // should animate). A depth counter keeps overlapping jumps safe.
  var scrollJumpDepth = 0;
  function jumpScroll(y) {
    var root = document.documentElement;
    scrollJumpDepth++;
    root.classList.add('medapp-scroll-jump');
    try { window.scrollTo(0, y); } catch (e) {}
    // Fallback for browsers that clamp window scrolling to <html>/<body>.
    if (Math.abs((window.pageYOffset || window.scrollY || 0) - y) > 2) {
      try { root.scrollTop = y; document.body.scrollTop = y; } catch (e) {}
    }
    var finish = function () {
      scrollJumpDepth--;
      if (scrollJumpDepth <= 0) {
        scrollJumpDepth = 0;
        root.classList.remove('medapp-scroll-jump');
      }
    };
    if (window.requestAnimationFrame) requestAnimationFrame(finish);
    else setTimeout(finish, 0);
  }

  var restoreSeq = 0;

  // Restore a saved scroll position AFTER the swap, Lucide icons and the first
  // paint. Supabase/IndexedDB content can still be growing, so retry briefly
  // as the document gets taller. Any user scroll intent cancels the retries so
  // we never fight the user.
  function restoreScrollTo(y) {
    var seq = ++restoreSeq;
    var started = Date.now();
    var attempts = 0;
    var stopped = false;
    var cleanups = [];

    function cleanup() {
      for (var i = 0; i < cleanups.length; i++) {
        try { window.removeEventListener(cleanups[i][0], cleanups[i][1], cleanups[i][2]); } catch (e) {}
      }
      cleanups.length = 0;
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      cleanup();
    }

    function cancel() { stop(); }

    function onKey(e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'PageUp' || e.key === 'PageDown' ||
          e.key === 'Home' || e.key === 'End' || e.key === ' ') {
        cancel();
      }
    }

    if (window.addEventListener) {
      var opts = { passive: true };
      window.addEventListener('wheel', cancel, opts);
      window.addEventListener('touchstart', cancel, opts);
      window.addEventListener('keydown', onKey);
      cleanups.push(['wheel', cancel, opts], ['touchstart', cancel, opts], ['keydown', onKey]);
    }

    function attempt() {
      if (stopped || seq !== restoreSeq) { cleanup(); return; }

      var doc = document.documentElement;
      var max = Math.max(
        doc ? doc.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0
      ) - (window.innerHeight || 0);
      var target = Math.max(0, Math.min(y, max));
      jumpScroll(target);

      var atTarget = Math.abs((window.pageYOffset || window.scrollY || 0) - target) < 2;
      var tallEnough = max >= y - 2;

      attempts++;
      if ((atTarget && tallEnough) || Date.now() - started > 4000) { stop(); return; }

      // Fast retries while the new view is still laying out, then a few
      // slower ones for async content (Supabase lists / Lucide icons).
      setTimeout(attempt, attempts < 6 ? 50 : 150);
    }

    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(attempt); });
    } else {
      setTimeout(attempt, 0);
    }
    // Covers the router's own 80 ms Lucide refresh.
    setTimeout(attempt, 120);
    setTimeout(attempt, 320);
  }

  // Keep the current history entry's scroll position up to date. This makes
  // Back/Forward work even when the user leaves a page via the browser's Back
  // button (not only via an intercepted link click).
  var scrollSaveTimer = 0;
  function scheduleScrollSave() {
    if (navigating || scrollSaveTimer) return;
    scrollSaveTimer = setTimeout(function () {
      scrollSaveTimer = 0;
      if (!navigating) rememberScroll();
    }, 400);
  }

  // --------------------------------------------------------------------------
  // Sticky header state (rAF-throttled)
  // --------------------------------------------------------------------------
  // A scroll listener that toggles a class on every event causes the sticky
  // header to flicker around the threshold and can stall scrolling on mobile.
  // Coalesce events into one animation frame and use hysteresis so the
  // shrink/grow transition happens exactly once per direction change.
  var headerStateFrame = 0;
  var headerScrolled = null;
  var HEADER_ON_THRESHOLD = 24;
  var HEADER_OFF_THRESHOLD = 12;

  function updateHeaderScrollState() {
    headerStateFrame = 0;
    var header = document.getElementById('header') || document.querySelector('header');
    if (!header) return;

    var y = window.scrollY || window.pageYOffset || 0;
    var next = headerScrolled === null
      ? y > HEADER_ON_THRESHOLD
      : headerScrolled
        ? y > HEADER_OFF_THRESHOLD
        : y > HEADER_ON_THRESHOLD;

    if (next === headerScrolled) return;
    headerScrolled = next;
    header.classList.toggle('scrolled', next);
  }

  function scheduleHeaderScrollState() {
    if (headerStateFrame) return;
    if (window.requestAnimationFrame) {
      headerStateFrame = window.requestAnimationFrame(updateHeaderScrollState);
    } else {
      headerStateFrame = window.setTimeout(updateHeaderScrollState, 16);
    }
  }

  // --------------------------------------------------------------------------
  // Top loading bar (created once, appended to <html> so a body swap cannot
  // remove it). Purely visual; pointer-events: none.
  // --------------------------------------------------------------------------
  var loaderEl = null;
  function ensureLoader() {
    if (loaderEl && loaderEl.parentNode) return loaderEl;
    loaderEl = document.getElementById('medapp-loader');
    if (!loaderEl) {
      loaderEl = document.createElement('div');
      loaderEl.id = 'medapp-loader';
      loaderEl.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(loaderEl);
    }
    return loaderEl;
  }
  function showLoader() {
    ensureLoader();
    document.documentElement.classList.add('medapp-loading');
  }
  function hideLoader() {
    document.documentElement.classList.remove('medapp-loading');
  }

  // إخفاء شريط التحميل بعد اكتمال الرسم (rAF) حتى لا تختفي
  // الحركة قبل أن يرى المستخدم المحتوى الجديد.
  function hideLoaderAfterPaint() {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { hideLoader(); });
    } else {
      setTimeout(hideLoader, 0);
    }
  }

  function prefetch(url) {
    if (prefetched[url]) return;
    prefetched[url] = 1;
    try {
      if (navigator.connection && navigator.connection.saveData) return;
    } catch (e) {}
    try {
      fetch(url, { credentials: 'same-origin', priority: 'low' }).catch(function () {});
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // ⭐⭐⭐ Phase W9 — deep links (pre12://…)
  // --------------------------------------------------------------------------
  // A notification tap (or a widget action) opens the app with a `pre12://`
  // URL. The shell owns the Capacitor listener so that *every* page reacts —
  // not only the ones that load widgets.js — and it re-dispatches the target
  // after an SPA swap, so a link that had to navigate to another page is not
  // lost on the way.
  var deepLinksBound = false;

  function dispatchDeepLink(url) {
    if (!url) return;
    try {
      document.dispatchEvent(new CustomEvent('medapp:deeplink', {
        detail: { url: String(url) }
      }));
    } catch (e) {}
  }

  /**
   * Reads `?deep=<target>` from the URL, removes it (so a reload does not
   * fire the same target twice) and dispatches the link.
   */
  function deepLinkFromLocation() {
    try {
      var params = new URLSearchParams(location.search || '');
      var deep = params.get('deep');
      if (!deep) return;
      params.delete('deep');
      var query = params.toString();
      try {
        history.replaceState(history.state, '',
          location.pathname + (query ? '?' + query : '') + (location.hash || ''));
      } catch (e) {}
      dispatchDeepLink('pre12://' + deep);
    } catch (e) {}
  }

  function bindDeepLinks() {
    if (deepLinksBound) return;
    deepLinksBound = true;
    try {
      var cap = window.Capacitor;
      var app = cap && cap.Plugins ? cap.Plugins.App : null;
      if (!app) return;
      if (typeof app.getLaunchUrl === 'function') {
        Promise.resolve(app.getLaunchUrl()).then(function (launch) {
          if (launch && launch.url) {
            setTimeout(function () { dispatchDeepLink(launch.url); }, 500);
          }
        }).catch(function () {});
      }
      if (typeof app.addListener === 'function') {
        var handle = app.addListener('appUrlOpen', function (data) {
          if (data && data.url) dispatchDeepLink(data.url);
        });
        if (handle && typeof handle.catch === 'function') handle.catch(function () {});
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // Install shell listeners, THEN start recording the page's own listeners
  // --------------------------------------------------------------------------
  // Save the scroll position continuously (debounced) so Back/Forward also
  // works when the user leaves via the browser's Back button. Installed before
  // `recording = true`, so it is a permanent shell listener.
  window.addEventListener('scroll', scheduleScrollSave, { passive: true });
  window.addEventListener('scroll', scheduleHeaderScrollState, { passive: true });
  scheduleHeaderScrollState();
  window.addEventListener('pagehide', function () {
    if (scrollSaveTimer) { clearTimeout(scrollSaveTimer); scrollSaveTimer = 0; }
    rememberScroll();
  });
  // If this document comes back from the back/forward cache, never leave the
  // loader spinning or a half-finished swap armed.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    navToken++;
    restoreSeq++;
    navigating = false;
    pendingNav = null;
    document.documentElement.classList.remove('medapp-navigating');
    hideLoader();
  });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    var a = (t && t.closest) ? t.closest('a') : null;
    if (!eligibleLink(a)) return;
    // Never hijack a click on an interactive control that lives *inside* the
    // link (like/save/share buttons on cards, toggle switches, inputs…).
    // The page's own handler must receive it; the original browser behaviour
    // is preserved (no SPA navigation for that click).
    var control = (t && t.closest) ? t.closest(
      'button, input, select, textarea, label, [role="button"], [data-action], [data-action-sheet], [data-no-router]'
    ) : null;
    if (control && control !== a && a.contains(control)) return;
    e.preventDefault();
    rememberScroll();
    navigate(a.href, true, false);
  }, true);

  // Warm the cache as soon as the user shows intent (hover / touch / focus).
  function onIntent(e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest('a') : null;
    if (eligibleLink(a)) prefetch(a.href);
  }
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('touchstart', onIntent, { passive: true });
  document.addEventListener('focusin', onIntent, { passive: true });

  window.addEventListener('popstate', function () {
    // Same document (hash/anchor only) → keep the browser's native behaviour.
    if (location.pathname + location.search === viewKey) return;
    // Cancel any in-flight forward navigation and queue the history target.
    navToken++;
    navigate(location.href, false, true);
  });

  recording = true;

  // ⭐ W9 — the deep-link listener lives in the shell, so it survives every
  //    body swap (an external script's listeners would not).
  bindDeepLinks();
  try { deepLinkFromLocation(); } catch (e) {}

  // ⭐ راقب تبديل الثيم لإضافة انتقال ناعم في كل الصفحات.
  watchThemeChanges();

  // --------------------------------------------------------------------------
  // ⭐⭐ تأكيد البريد المعلّق — لا يضيع أبداً
  // --------------------------------------------------------------------------
  // المشكلة: يفتح المستخدم تطبيق البريد → يتجمّد التطبيق → عند العودة
  // يعيد أندرويد بناء الـ WebView فتُفتح الصفحة الرئيسية (index.html)
  // وتضيع صفحة الرمز. الحل: نحفظ البريد في localStorage ونُعيده إلى
  // صفحة الرمز عند كل إقلاع حتى التأكيد ينجح.
  (function restorePendingVerification() {
    try {
      var email = (localStorage.getItem('pending_verification') || '').trim();
      if (!email) return;
      var here = (location.pathname || '').split('/').pop() || 'index.html';
      if (here === 'confirm.html') return;      // ⭐ نحن في صفحة الرمز أصلاً
      location.replace('confirm.html?email=' + encodeURIComponent(email));
    } catch (e) {}
  })();

  // Public API (also handy for JS-driven redirects)
  window.MedApp = {
    navigate: function (url) { return navigate(url, true, false); },
    refreshIcons: refreshIcons,
    onViewCleanup: function (fn) {
      window.MedAppViewCleanup = typeof fn === 'function' ? fn : null;
    },
    withThemeTransition: withThemeTransition,
    prefersReducedMotion: prefersReducedMotion,
    _viewListeners: viewListeners
  };
})();
