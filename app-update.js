// ============================================================
// app-update.js — نظام التحديث داخل التطبيق (In-App Update)
// ------------------------------------------------------------
// ⭐ Migration: 100% GitHub Releases API (No Supabase Storage).
//
//   1) checkForAppUpdate()  → reads the current version, fetches
//      from GitHub Releases API, and compares.
//   2) showUpdateModal()    → a premium modal with the notes.
//   3) "تحديث الآن"         → Browser.open({ url }) — opens the
//      direct APK link in the device's browser.
// ============================================================
(function (global) {
  'use strict';

  var RELEASES_API = 'https://api.github.com/repos/7sn-17/Pre12/releases/latest';
  var MAX_HIGHLIGHTS = 4;
  var lastShownVersion = '';

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

  function compareVersions(a, b) {
    var va = parseVersion(a);
    var vb = parseVersion(b);
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    return va.patch - vb.patch;
  }

  /* ─────────────────────────────────────────────
     2) التحقّق من التحديث (GitHub API Only)
     ───────────────────────────────────────────── */
  async function fetchJsonFresh(url, headers) {
    var separator = url.indexOf('?') > -1 ? '&' : '?';
    var response = await fetch(url + separator + 't=' + Date.now(), {
      cache: 'no-store',
      headers: Object.assign({
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }, headers || {})
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

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

    if (!currentVersion) {
      try {
        var meta = document.querySelector('meta[name="app-version"]');
        currentVersion = (meta && meta.getAttribute('content')) || '';
      } catch (e) {}
    }

    try {
      var release = await fetchJsonFresh(RELEASES_API, { Accept: 'application/vnd.github+json' });
      var remoteVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');

      var apkUrl = '';
      var assets = release.assets || [];
      for (var i = 0; i < assets.length; i++) {
        var name = String(assets[i].name || '');
        if (/\.apk$/i.test(name)) {
          apkUrl = assets[i].browser_download_url || '';
          break;
        }
      }
      if (!apkUrl) apkUrl = release.html_url || 'https://github.com/7sn-17/Pre12/releases/latest';

      var result = {
        currentVersion: currentVersion,
        version: remoteVersion,
        notes: latestReleaseNotes(release.body || ''),
        url: apkUrl,
        htmlUrl: release.html_url || '',
        publishedAt: release.published_at || '',
        source: 'github',
        updateAvailable: false
      };

      if (remoteVersion && currentVersion && compareVersions(remoteVersion, currentVersion) > 0) {
        result.updateAvailable = true;
      }

      if (options.silent !== true && result.updateAvailable && lastShownVersion !== result.version &&
          typeof global.showUpdateModal === 'function') {
        lastShownVersion = result.version;
        global.showUpdateModal(result);
      }

      return result;
    } catch (e) {
      console.warn('[update] Failed to check GitHub Releases:', e);
      return { updateAvailable: false, error: e.message };
    }
  }

  /* ─────────────────────────────────────────────
     3) تنظيف النصّ (بلا Markdown)
     ───────────────────────────────────────────── */
  function latestReleaseNotes(notes) {
    var text = String(notes || '');
    var lines = text.split('\n');
    var out = [];
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^##\s+/.test(line)) {
        if (started) break;
        started = true;
        continue;
      }
      if (!started) continue;
      out.push(line);
    }

    return started ? out.join('\n') : text;
  }

  function cleanMarkdown(text) {
    return String(text || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

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
        var parts = [line.replace(/^[-*]\s+/, '')];
        var j = i + 1;
        while (j < lines.length) {
          var next = lines[j].trim();
          if (!next || next.indexOf('- ') === 0 || next.indexOf('* ') === 0 ||
              next.charAt(0) === '#' || next.indexOf('---') === 0) break;
          parts.push(next);
          j++;
        }
        i = j - 1;

        var cleaned = cleanMarkdown(parts.join(' '));
        if (cleaned.length > 240) cleaned = cleaned.slice(0, 237).trim() + '…';
        if (cleaned) bullets.push(cleaned);
        if (bullets.length >= MAX_HIGHLIGHTS) break;
      }
    }

    if (!bullets.length) {
      var fallback = lines
        .filter(function (l) {
          var t = l.trim();
          return t && t.charAt(0) !== '#' && t.charAt(0) !== '<' && t.indexOf('---') !== 0;
        })
        .map(cleanMarkdown)
        .filter(function (t) { return t.length > 2; })
        .slice(0, MAX_HIGHLIGHTS);
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

    var highlights = extractChangelogHighlights(latestReleaseNotes(update.notes));

    var overlay = document.createElement('div');
    overlay.className = 'medapp-update-overlay';
    overlay.id = 'medappUpdateOverlay';

    var notesHtml = '';
    if (highlights.length) {
      notesHtml =
        '<div class="medapp-update-section-title">ما الجديد في هذا الإصدار</div>' +
        '<ul class="medapp-update-notes">' +
          highlights.map(function (item) {
            return '<li><i data-lucide="check"></i><span>' + escapeHtml(item) + '</span></li>';
          }).join('') +
        '</ul>';
    }

    var fromVersion = String(update.currentVersion || '').replace(/^v/i, '');
    var fromLine = fromVersion
      ? '<div class="medapp-update-from">من v' + escapeHtml(fromVersion) + ' إلى v' + escapeHtml(update.version || '') + '</div>'
      : '';

    overlay.innerHTML =
      '<div class="medapp-update-card" role="dialog" aria-modal="true" aria-labelledby="medappUpdateTitle" dir="rtl">' +
        '<div class="medapp-update-glow"></div>' +
        '<div class="medapp-update-icon"><i data-lucide="sparkles"></i></div>' +
        '<div class="medapp-update-kicker">تحديث رسمي وآمن</div>' +
        '<div class="medapp-update-title" id="medappUpdateTitle">إصدار جديد متاح</div>' +
        '<div class="medapp-update-version">v' + escapeHtml(update.version || '') + '</div>' +
        fromLine +
        notesHtml +
        '<div class="medapp-update-footnote">' +
          '<i data-lucide="shield-check"></i>' +
          '<span>تحديث من المصدر الرسمي — بياناتك وإعداداتك محفوظة.</span>' +
        '</div>' +
        '<div class="medapp-update-actions">' +
          '<button class="medapp-update-btn ghost" id="medappUpdateLater" type="button">لاحقاً</button>' +
          '<button class="medapp-update-btn primary" id="medappUpdateNow" type="button">' +
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
      document.removeEventListener('keydown', onKey);
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 260);
    }

    function onKey(event) {
      if (event && event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });

    var laterBtn = document.getElementById('medappUpdateLater');
    if (laterBtn) laterBtn.addEventListener('click', close);

    var nowBtn = document.getElementById('medappUpdateNow');
    if (nowBtn) {
      nowBtn.addEventListener('click', function () {
        close();
        openDownload(update.url || update.htmlUrl);
      });
    }

    return overlay;
  }

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
    latestReleaseNotes: latestReleaseNotes,
    extractChangelogHighlights: extractChangelogHighlights,
    showModal: showUpdateModal,
    openDownload: openDownload,
    isNative: isNative
  };
})(window);
