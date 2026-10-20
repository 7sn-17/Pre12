// ============================================================
// app-update.js — نظام التحديث داخل التطبيق (In-App Update)
// ------------------------------------------------------------
// ⭐ Phase 29/30 — The update is simplified on purpose:
//
//   1) checkForAppUpdate()  → the current version (App.getInfo())
//      compared with the latest GitHub release.
//   2) showUpdateModal()    → a premium green card with the version
//      and the (clean) release notes.
//   3) "تحديث الآن"         → ⭐ Browser.open({ url }) — the APK is
//      downloaded by the device's browser. No in-app downloader, no
//      progress bar, no silent install.
//
// ⭐ Works on the web too (it opens the release page).
// ============================================================
(function (global) {
  'use strict';

  var RELEASES_API = 'https://api.github.com/repos/7sn-17/Pre12/releases/latest';
  var APK_NAME_PREFIX = 'Medical_Platform_v';
  var APK_NAME_SUFFIX = '.apk';

  function plugin(name) {
    return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[name]) || null;
  }

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  /* ─────────────────────────────────────────────
     1) مقارنة الإصدارات
     ───────────────────────────────────────────── */
  function parseVersion(value) {
    var parts = String(value || '').replace(/^v/i, '').split(/[.\-+]/);
    return {
      major: parseInt(parts[0], 10) || 0,
      minor: parseInt(parts[1], 10) || 0,
      patch: parseInt(parts[2], 10) || 0
    };
  }

  /** ⭐ يُرجع >0 إذا كان b أحدث من a */
  function compareVersions(a, b) {
    var va = parseVersion(a);
    var vb = parseVersion(b);
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
  }

  /* ─────────────────────────────────────────────
     2) التحقّق من التحديث
     ───────────────────────────────────────────── */
  async function checkForAppUpdate(options) {
    options = options || {};

    var currentVersion = '';
    var App = plugin('App');
    if (App && typeof App.getInfo === 'function') {
      try {
        var info = await App.getInfo();
        currentVersion = (info && info.version) || '';
      } catch (e) {
        console.error('[update] the version could not be read:', e);
      }
    }

    var response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error('GitHub API: ' + response.status);

    var release = await response.json();
    var remoteVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');

    // ⭐ رابط التنزيل المباشر للـ APK
    var apkUrl = '';
    var assets = release.assets || [];
    for (var i = 0; i < assets.length; i++) {
      var name = String(assets[i].name || '');
      if (name.indexOf('.apk') > -1) {
        apkUrl = assets[i].browser_download_url || '';
        break;
      }
    }
    if (!apkUrl) {
      apkUrl = 'https://github.com/7sn-17/Pre12/releases/latest/download/' +
        APK_NAME_PREFIX + remoteVersion + APK_NAME_SUFFIX;
    }

    var result = {
      currentVersion: currentVersion,
      version: remoteVersion,
      notes: release.body || '',
      url: apkUrl,
      htmlUrl: release.html_url || '',
      publishedAt: release.published_at || '',
      updateAvailable: false
    };

    if (remoteVersion && currentVersion && compareVersions(remoteVersion, currentVersion) > 0) {
      result.updateAvailable = true;
    }

    if (options.silent !== true && result.updateAvailable && typeof global.showUpdateModal === 'function') {
      global.showUpdateModal(result);
    }

    return result;
  }

  /* ─────────────────────────────────────────────
     3) تنظيف النصّ (بلا Markdown)
     ───────────────────────────────────────────── */
  /**
   * ⭐⭐⭐ يحوّل Markdown إلى نصّ عربي نظيف:
   *   **عريض** · *مائل* · `code` · [نص](رابط) · # عنوان · > اقتباس
   *   كلّها تُحذف فيبقى النصّ مقروءاً فقط.
   */
  function cleanMarkdown(text) {
    return String(text || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // [نص](رابط) → نص
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')  // ![صورة](رابط) → نص
      .replace(/\*\*([^*]+)\*\*/g, '$1')           // **عريض** → عريض
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')                   // `code` → code
      .replace(/^#{1,6}\s*/gm, '')                  // # عنوان
      .replace(/^>\s?/gm, '')                       // > اقتباس
      .replace(/^\s*[-*+]\s+/gm, '')                // - عنصر
      .replace(/\*([^*\n]+)\*/g, '$1')             // *مائل*
      .replace(/_{1,2}([^_\n]+)_{1,2}/g, '$1')
      .replace(/\\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * ⭐⭐ يستخرج ملاحظات الإصدار كقائمة نقطية نظيفة (3 نقاط كحد أقصى).
   * @returns {string[]}
   */
  function extractChangelogHighlights(notes) {
    var text = String(notes || '').trim();
    if (!text) return [];

    var lines = text.split('\n');
    var bullets = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('---') === 0) continue;
      if (line.charAt(0) === '<' || line.charAt(0) === '[') continue;

      var isBullet = line.indexOf('- ') === 0 || line.indexOf('* ') === 0;
      if (isBullet) {
        var cleaned = cleanMarkdown(line.replace(/^[-*]\s+/, ''));
        if (cleaned) bullets.push(cleaned);
        if (bullets.length >= 3) break;
      }
    }

    // ⭐ لا نقاط → نأخذ أول 3 أسطر نظيفة
    if (!bullets.length) {
      var fallback = lines
        .filter(function (l) {
          var t = l.trim();
          return t && t.charAt(0) !== '#' && t.charAt(0) !== '<' && t.indexOf('---') !== 0;
        })
        .map(cleanMarkdown)
        .filter(function (t) { return t.length > 2; })
        .slice(0, 3);
      bullets = fallback;
    }

    return bullets;
  }

  /* ─────────────────────────────────────────────
     4) نافذة التحديث (Premium)
     ───────────────────────────────────────────── */
  function showUpdateModal(update) {
    update = update || {};

    var existing = document.getElementById('medappUpdateOverlay');
    if (existing) existing.remove();

    var highlights = extractChangelogHighlights(update.notes);

    var overlay = document.createElement('div');
    overlay.className = 'medapp-update-overlay';
    overlay.id = 'medappUpdateOverlay';

    var notesHtml = '';
    if (highlights.length) {
      notesHtml = '<ul class="medapp-update-notes">' +
        highlights.map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        }).join('') +
        '</ul>';
    }

    overlay.innerHTML =
      '<div class="medapp-update-card" role="dialog" aria-modal="true">' +
        '<div class="medapp-update-glow"></div>' +
        '<div class="medapp-update-icon"><i data-lucide="sparkles"></i></div>' +
        '<div class="medapp-update-title">إصدار جديد متاح!</div>' +
        '<div class="medapp-update-version">v' + escapeHtml(update.version || '') + '</div>' +
        notesHtml +
        '<div class="medapp-update-actions">' +
          '<button class="medapp-update-btn ghost" id="medappUpdateLater">لاحقاً</button>' +
          '<button class="medapp-update-btn primary" id="medappUpdateNow">' +
            '<i data-lucide="download" style="width:16px;height:16px;"></i>' +
            '<span>تحديث الآن</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });

    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    } catch (e) {}

    function close() {
      overlay.classList.remove('open');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 260);
    }

    var laterBtn = document.getElementById('medappUpdateLater');
    if (laterBtn) laterBtn.addEventListener('click', close);

    // ⭐⭐ "تحديث الآن" → نفتح رابط التنزيل في متصفّح الجهاز
    var nowBtn = document.getElementById('medappUpdateNow');
    if (nowBtn) {
      nowBtn.addEventListener('click', function () {
        close();
        openDownload(update.url || update.htmlUrl);
      });
    }

    return overlay;
  }

  /** ⭐⭐ يفتح رابط التنزيل في متصفّح الجهاز (لا تحميل داخل التطبيق) */
  function openDownload(url) {
    var target = url || 'https://github.com/7sn-17/Pre12/releases/latest';
    var Browser = plugin('Browser');
    if (Browser && typeof Browser.open === 'function') {
      try {
        var result = Browser.open({ url: target });
        if (result && typeof result.catch === 'function') {
          result.catch(function () { openInWeb(target); });
        }
        return;
      } catch (e) {}
    }
    openInWeb(target);
  }

  function openInWeb(url) {
    try {
      global.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      try { global.location.href = url; } catch (e2) {}
    }
  }

  function escapeHtml(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.showUpdateModal = showUpdateModal;
  global.MedAppUpdate = {
    RELEASES_API: RELEASES_API,
    check: checkForAppUpdate,
    checkForAppUpdate: checkForAppUpdate,
    compareVersions: compareVersions,
    cleanMarkdown: cleanMarkdown,
    extractChangelogHighlights: extractChangelogHighlights,
    showModal: showUpdateModal,
    openDownload: openDownload,
    isNative: isNative
  };
})(window);
