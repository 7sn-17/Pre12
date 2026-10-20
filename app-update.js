// ============================================================
// app-update.js — نظام التحديث داخل التطبيق (In-App Update)
// ------------------------------------------------------------
// ⭐Phase 27 — The Ultimate Master Phase
//
//   1) checkForAppUpdate()  → يقارن إصدار التطبيق مع أحدث إصدار
//      على GitHub Releases (عبر واجهة api.github.com).
//   2) showUpdateModal()    → نافذة خضراء فاخرة تعرض الإصدار
//      الجديد وملاحظات الإصدار.
//   3) downloadAndInstall() → ينزّل الـ APK إلى الكاش عبر
//      FileTransfer ثم يفتح مثبّت أندرويد (ApkInstaller).
//
// ⭐ يعمل على الويب أيضاً (يفتح صفحة الإصدار في المتصفّح).
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

    var apkUrl = '';
    var assets = release.assets || [];
    for (var i = 0; i < assets.length; i++) {
      var name = String(assets[i].name || '');
      if (name.indexOf('.apk') > -1) {
        apkUrl = assets[i].browser_download_url || '';
        break;
      }
    }

    var result = {
      currentVersion: currentVersion,
      version: remoteVersion,
      notes: release.body || '',
      url: apkUrl,
      publishedAt: release.published_at || '',
      htmlUrl: release.html_url || '',
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
     3) تنزيل الـ APK وتثبيته
     ───────────────────────────────────────────── */
  async function downloadAndInstall(update, onProgress) {
    update = update || {};
    var FileTransfer = plugin('FileTransfer');
    var Filesystem = plugin('Filesystem');

    if (!FileTransfer || typeof FileTransfer.downloadFile !== 'function') {
      throw new Error('FileTransfer غير متاح');
    }

    var fileName = APK_NAME_PREFIX + (update.version || 'latest') + APK_NAME_SUFFIX;
    var fullPath = '';

    // ⭐ نحدّد المسار الكامل داخل الكاش
    if (Filesystem && typeof Filesystem.getUri === 'function') {
      try {
        var uri = await Filesystem.getUri({ path: fileName, directory: 'CACHE' });
        if (uri && uri.uri) fullPath = String(uri.uri).replace(/^file:\/\//, '');
      } catch (e) {
        console.error('[update] the cache path could not be resolved:', e);
      }
    }

    if (!fullPath) {
      // ⭐ مسار احتياطي: مجلد الكاش القياسي
      var App = plugin('App');
      var appId = '';
      try {
        if (App && typeof App.getInfo === 'function') {
          var info = await App.getInfo();
          appId = (info && info.appId) || 'com.pre12.medical';
        }
      } catch (e) {}
      fullPath = '/data/user/0/' + (appId || 'com.pre12.medical') + '/cache/' + fileName;
    }

    if (typeof onProgress === 'function') onProgress(0, 'جارٍ التحميل…');

    var result = await FileTransfer.downloadFile({
      url: update.url,
      path: fullPath,
      progress: true
    });

    if (typeof onProgress === 'function') onProgress(100, 'اكتمل التحميل — جارٍ التثبيت…');

    // ⭐ التثبيت عبر مثبّت أندرويد
    var Installer = plugin('ApkInstaller');
    if (Installer && typeof Installer.install === 'function') {
      await Installer.install({ fileName: fileName });
      return result;
    }

    // ⭐ بديل: نفتح رابط الـ APK في المتصفّح (المستخدم يثبّته يدوياً)
    var Browser = plugin('Browser');
    if (Browser && typeof Browser.open === 'function' && update.url) {
      await Browser.open({ url: update.url });
      return result;
    }

    throw new Error('لا يمكن تثبيت الحزمة على هذا الجهاز');
  }

  /* ─────────────────────────────────────────────
     4) نافذة التحديث (Premium green)
     ───────────────────────────────────────────── */
  function showUpdateModal(update) {
    update = update || {};

    var existing = document.getElementById('medappUpdateOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'medapp-update-overlay';
    overlay.id = 'medappUpdateOverlay';

    // ⭐⭐ نقصّ سجلّ التغييرات إلى آخر 3 نقاط فقط
    var notes = extractChangelogHighlights(update.notes);

    overlay.innerHTML =
      '<div class="medapp-update-card" role="dialog" aria-modal="true">' +
        '<div class="medapp-update-badge"><i data-lucide="sparkles" style="width:13px;height:13px;"></i>تحديث متاح</div>' +
        '<div class="medapp-update-icon"><i data-lucide="download"></i></div>' +
        '<div class="medapp-update-title">إصدار جديد متاح!</div>' +
        '<div class="medapp-update-version">v' + escapeHtml(update.version || '') + '</div>' +
        (notes ? '<div class="medapp-update-notes">' + escapeHtml(notes) + '</div>' : '') +
        (update.htmlUrl ? '<button class="medapp-update-link" id="medappUpdateChangelog">' +
          '<i data-lucide="file-text" style="width:14px;height:14px;"></i>عرض التغييرات' +
        '</button>' : '') +
        '<div class="medapp-update-progress" id="medappUpdateProgress">' +
          '<div class="medapp-update-bar"><span id="medappUpdateBar"></span></div>' +
          '<div class="medapp-update-status" id="medappUpdateStatus">جارٍ التحضير…</div>' +
        '</div>' +
        '<div class="medapp-update-actions">' +
          '<button class="medapp-update-btn" id="medappUpdateLater">لاحقاً</button>' +
          '<button class="medapp-update-btn primary" id="medappUpdateNow">' +
            '<i data-lucide="download" style="width:16px;height:16px;"></i>تحديث الآن' +
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

    // ⭐ عرض كل التغييرات في المتصفّح
    var changelogBtn = document.getElementById('medappUpdateChangelog');
    if (changelogBtn) {
      changelogBtn.addEventListener('click', function () {
        openChangelog(update.htmlUrl);
      });
    }

    var nowBtn = document.getElementById('medappUpdateNow');
    if (nowBtn) {
      nowBtn.addEventListener('click', function () {
        startUpdate(update, nowBtn);
      });
    }

    return overlay;
  }

  /** ⭐ التنزيل + التثبيت مع شريط تقدّم */
  async function startUpdate(update, button) {
    var progress = document.getElementById('medappUpdateProgress');
    var bar = document.getElementById('medappUpdateBar');
    var status = document.getElementById('medappUpdateStatus');

    if (progress) progress.classList.add('visible');
    if (button) { button.disabled = true; button.textContent = 'جارٍ التحديث…'; }
    if (status) status.textContent = 'جارٍ التحميل…';

    try {
      await downloadAndInstall(update, function (percent, text) {
        if (bar) bar.style.width = Math.max(2, Math.min(100, percent)) + '%';
        if (status) status.textContent = text || ('جارٍ التحميل… ' + Math.round(percent) + '%');
      });
      if (status) status.textContent = 'تم فتح مثبّت الحزم — أكّد التثبيت.';
    } catch (e) {
      console.error('[update] the update failed:', e);
      if (status) status.textContent = 'تعذّر التحديث: ' + ((e && e.message) || 'خطأ غير معروف');
      if (button) { button.disabled = false; button.textContent = 'تحديث الآن'; }
      if (typeof global.showToast === 'function') {
        global.showToast('تعذّر التحديث — ' + ((e && e.message) || ''), 'error');
      }
    }
  }

  /**
   * ⭐⭐ يستخرج آخر 3 نقاط من سجلّ التغييرات (بدل عرض الملف كاملاً).
   */
  function extractChangelogHighlights(notes) {
    var text = String(notes || '').trim();
    if (!text) return '';

    var lines = text.split('\n');
    var bullets = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      // ⭐ نتجاهل العناوين والروابط ونأخذ النقاط فقط
      if (line.charAt(0) === '#' || line.charAt(0) === '<' || line.charAt(0) === '[') continue;
      if (line.indexOf('---') === 0) continue;
      if (line.indexOf('- ') === 0 || line.indexOf('* ') === 0) {
        bullets.push(line.replace(/^[-*]\s+/, ''));
        if (bullets.length >= 3) break;
      }
    }

    if (!bullets.length) {
      // ⭐ لا نقاط → نعرض أول 3 أسطر مفيدة
      var fallback = lines.filter(function (l) {
        var t = l.trim();
        return t && t.charAt(0) !== '#' && t.charAt(0) !== '<' && t.indexOf('---') !== 0;
      }).slice(0, 3);
      return fallback.join('\n');
    }

    return bullets.map(function (b) { return '• ' + b; }).join('\n');
  }

  /** ⭐ يفتح سجلّ التغييرات كاملاً في المتصفّح */
  function openChangelog(url) {
    var target = url || 'https://github.com/7sn-17/Pre12/blob/main/CHANGELOG.md';
    var Browser = (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Browser) || null;
    if (Browser && typeof Browser.open === 'function') {
      try {
        var result = Browser.open({ url: target });
        if (result && typeof result.catch === 'function') {
          result.catch(function () { global.open(target, '_blank', 'noopener,noreferrer'); });
        }
        return;
      } catch (e) {}
    }
    try { global.open(target, '_blank', 'noopener,noreferrer'); } catch (e) {}
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
    downloadAndInstall: downloadAndInstall,
    showModal: showUpdateModal,
    extractChangelogHighlights: extractChangelogHighlights,
    openChangelog: openChangelog,
    compareVersions: compareVersions,
    isNative: isNative
  };
})(window);
