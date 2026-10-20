// ============================================================
// ui.js — النوافذ المنبثقة المخصّصة (Custom Alerts & Modals)
// ------------------------------------------------------------
// ⭐ تستبدل alert() و confirm() الأصليين في أندرويد (القبيحان).
//
//   showCustomAlert(title, message, type)
//   showCustomConfirm(title, message, onConfirm, options)
//
// ⭐ تعمل في كل الصفحات (الملف محمَّل من partials/head.html).
// ⭐ تحترم الثيم (فاتح/داكن) عبر متغيّرات CSS.
// ============================================================
(function (global) {
  'use strict';

  var ICONS = {
    info: 'info',
    success: 'check-circle-2',
    error: 'alert-triangle',
    warning: 'alert-circle',
    question: 'help-circle'
  };

  var TONES = {
    info: 'var(--medapp-blue, #60a5fa)',
    success: 'var(--medapp-emerald, #10b981)',
    error: 'var(--medapp-red, #f87171)',
    warning: 'var(--medapp-amber, #fbbf24)',
    question: 'var(--medapp-violet, #a78bfa)'
  };

  var current = null;   // { resolve, onCancel }

  function ensureRoot() {
    var root = document.getElementById('medappUiRoot');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'medappUiRoot';
    root.className = 'medapp-ui-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }

  function closeCurrent(result) {
    if (!current) return;
    var state = current;
    current = null;
    var root = document.getElementById('medappUiRoot');
    if (root) {
      root.classList.remove('open');
      var overlay = root.querySelector('.medapp-ui-overlay');
      if (overlay) {
        setTimeout(function () {
          if (root && root.querySelector('.medapp-ui-overlay')) root.innerHTML = '';
        }, 220);
      }
    }
    document.removeEventListener('keydown', onKeyDown, true);
    if (state.resolve) state.resolve(result);
  }

  function onKeyDown(event) {
    if (!current) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (current.onCancel) current.onCancel();
      closeCurrent(false);
    }
  }

  /**
   * ⭐ نافذة تنبيه مخصّصة.
   * @param {string} title
   * @param {string} message
   * @param {string} type  info | success | error | warning | question
   * @returns {Promise<void>}
   */
  function showCustomAlert(title, message, type) {
    type = TONES[type] ? type : 'info';
    var root = ensureRoot();

    return new Promise(function (resolve) {
      current = { resolve: resolve, onCancel: null };
      root.innerHTML =
        '<div class="medapp-ui-overlay" data-tone="' + type + '">' +
          '<div class="medapp-ui-card" role="alertdialog" aria-modal="true">' +
            '<div class="medapp-ui-icon"><i data-lucide="' + ICONS[type] + '"></i></div>' +
            '<div class="medapp-ui-title">' + escapeHtml(title || '') + '</div>' +
            '<div class="medapp-ui-message">' + (message || '') + '</div>' +
            '<button class="medapp-ui-btn primary" data-medapp-ui-ok>' +
              '<i data-lucide="check" style="width:16px;height:16px;"></i>' +
              '<span>حسناً</span>' +
            '</button>' +
          '</div>' +
        '</div>';

      root.classList.add('open');
      bind();
      document.addEventListener('keydown', onKeyDown, true);

      function bind() {
        var ok = root.querySelector('[data-medapp-ui-ok]');
        if (ok) ok.addEventListener('click', function () { closeCurrent(true); });
        var overlay = root.querySelector('.medapp-ui-overlay');
        if (overlay) {
          overlay.addEventListener('click', function (event) {
            if (event.target === overlay) closeCurrent(true);
          });
        }
      }

      refreshIcons();
      var btn = root.querySelector('[data-medapp-ui-ok]');
      if (btn) btn.focus();
    });
  }

  /**
   * ⭐ نافذة تأكيد مخصّصة (بديل confirm()).
   * @param {string} title
   * @param {string} message
   * @param {function} onConfirm  يُستدعى عند الموافقة
   * @param {object} [options]    { confirmText, cancelText, type, danger }
   * @returns {Promise<boolean>}
   */
  function showCustomConfirm(title, message, onConfirm, options) {
    options = options || {};
    var type = options.type || 'question';
    var root = ensureRoot();

    return new Promise(function (resolve) {
      var settled = false;
      current = {
        resolve: function (value) { if (!settled) { settled = true; resolve(value); } },
        onCancel: null
      };

      root.innerHTML =
        '<div class="medapp-ui-overlay" data-tone="' + type + '">' +
          '<div class="medapp-ui-card" role="dialog" aria-modal="true">' +
            '<div class="medapp-ui-icon"><i data-lucide="' + (ICONS[type] || 'help-circle') + '"></i></div>' +
            '<div class="medapp-ui-title">' + escapeHtml(title || 'تأكيد') + '</div>' +
            '<div class="medapp-ui-message">' + (message || '') + '</div>' +
            '<div class="medapp-ui-actions">' +
              '<button class="medapp-ui-btn ghost" data-medapp-ui-cancel>' +
                '<span>' + escapeHtml(options.cancelText || 'إلغاء') + '</span>' +
              '</button>' +
              '<button class="medapp-ui-btn ' + (options.danger ? 'danger' : 'primary') + '" data-medapp-ui-confirm>' +
                '<i data-lucide="' + (options.danger ? 'trash-2' : 'check') + '" style="width:16px;height:16px;"></i>' +
                '<span>' + escapeHtml(options.confirmText || 'تأكيد') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.classList.add('open');

      var cancelBtn = root.querySelector('[data-medapp-ui-cancel]');
      var confirmBtn = root.querySelector('[data-medapp-ui-confirm]');
      var overlay = root.querySelector('.medapp-ui-overlay');

      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          closeCurrent(false);
        });
      }
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          closeCurrent(true);
          if (typeof onConfirm === 'function') {
            setTimeout(function () { onConfirm(); }, 120);
          }
        });
      }
      if (overlay) {
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) closeCurrent(false);
        });
      }

      document.addEventListener('keydown', onKeyDown, true);
      refreshIcons();
      if (confirmBtn) confirmBtn.focus();
    });
  }

  function refreshIcons() {
    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    } catch (e) {}
  }

  function escapeHtml(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  global.showCustomAlert = showCustomAlert;
  global.showCustomConfirm = showCustomConfirm;
  global.MedAppUI = {
    alert: showCustomAlert,
    confirm: showCustomConfirm
  };
})(window);
