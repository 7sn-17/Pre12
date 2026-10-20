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

  /**
   * ⭐⭐ نافذة إدخال (Prompt) — بديل prompt() الأصلي.
   * @param {string} title
   * @param {string} message
   * @param {string} defaultValue
   * @param {function} onSave  يُستدعى بالقيمة الجديدة
   * @param {object} [options] { placeholder, confirmText, cancelText, type, maxLength }
   * @returns {Promise<string|null>}
   */
  function showCustomPrompt(title, message, defaultValue, onSave, options) {
    options = options || {};
    var root = ensureRoot();
    var type = options.type || 'info';

    return new Promise(function (resolve) {
      var settled = false;
      current = {
        resolve: function (value) { if (!settled) { settled = true; resolve(value); } },
        onCancel: null
      };

      root.innerHTML =
        '<div class="medapp-ui-overlay" data-tone="' + type + '">' +
          '<div class="medapp-ui-card" role="dialog" aria-modal="true">' +
            '<div class="medapp-ui-icon"><i data-lucide="' + (ICONS[type] || 'info') + '"></i></div>' +
            '<div class="medapp-ui-title">' + escapeHtml(title || '') + '</div>' +
            (message ? '<div class="medapp-ui-message">' + message + '</div>' : '') +
            '<input class="medapp-ui-input" id="medappUiInput" type="text" ' +
              'placeholder="' + escapeHtml(options.placeholder || '') + '" ' +
              'maxlength="' + (options.maxLength || 60) + '" ' +
              'value="' + escapeHtml(defaultValue || '') + '" ' +
              'autocomplete="off" spellcheck="false">' +
            '<div class="medapp-ui-actions">' +
              '<button class="medapp-ui-btn ghost" data-medapp-ui-cancel>' +
                '<span>' + escapeHtml(options.cancelText || 'إلغاء') + '</span>' +
              '</button>' +
              '<button class="medapp-ui-btn primary" data-medapp-ui-save>' +
                '<i data-lucide="check" style="width:16px;height:16px;"></i>' +
                '<span>' + escapeHtml(options.confirmText || 'حفظ') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.classList.add('open');

      var input = document.getElementById('medappUiInput');
      var cancelBtn = root.querySelector('[data-medapp-ui-cancel]');
      var saveBtn = root.querySelector('[data-medapp-ui-save]');
      var overlay = root.querySelector('.medapp-ui-overlay');

      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { closeCurrent(null); });
      }
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var value = input ? input.value.trim() : '';
          if (!value) {
            if (input) { input.focus(); input.classList.add('shake'); }
            return;
          }
          closeCurrent(value);
          if (typeof onSave === 'function') {
            setTimeout(function () { onSave(value); }, 120);
          }
        });
      }
      if (overlay) {
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) closeCurrent(null);
        });
      }
      if (input) {
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (saveBtn) saveBtn.click();
          }
        });
      }

      document.addEventListener('keydown', onKeyDown, true);
      refreshIcons();
      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      }
    });
  }

  /**
   * ⭐⭐⭐ v4.6.1 — TASK 2: نافذة تأكيد واحدة للإجراءات الخطرة.
   *   تحوي الرسالة + حقل كتابة، ولا يُفعَّل زرّ التأكيد الأحمر
   *   إلّا بعد كتابة الكلمة المطلوبة بالضبط (مثل "delete").
   *
   * @param {object} options {
   *   title, message, confirmWord, confirmText, cancelText, tone
   * }
   * @returns {Promise<boolean>} true بعد الضغط على التأكيد.
   */
  function showDangerConfirm(options) {
    options = options || {};
    var root = ensureRoot();
    var type = options.tone || 'warning';
    var word = String(options.confirmWord || 'delete');

    return new Promise(function (resolve) {
      var settled = false;
      current = {
        resolve: function (value) { if (!settled) { settled = true; resolve(!!value); } },
        onCancel: null
      };

      root.innerHTML =
        '<div class="medapp-ui-overlay" data-tone="' + type + '">' +
          '<div class="medapp-ui-card" role="dialog" aria-modal="true">' +
            '<div class="medapp-ui-icon"><i data-lucide="' + (ICONS[type] || 'alert-triangle') + '"></i></div>' +
            '<div class="medapp-ui-title">' + escapeHtml(options.title || 'هل أنت متأكد؟') + '</div>' +
            (options.message ? '<div class="medapp-ui-message">' + options.message + '</div>' : '') +
            '<div class="medapp-ui-message" style="margin-top:-4px;font-size:0.82rem;opacity:0.85;">' +
              'اكتب <strong style="letter-spacing:1px;">' + escapeHtml(word) + '</strong> لتأكيد الإجراء.' +
            '</div>' +
            '<input class="medapp-ui-input" id="medappUiDangerInput" type="text" ' +
              'placeholder="' + escapeHtml(word) + '" ' +
              'maxlength="40" autocomplete="off" spellcheck="false" ' +
              'aria-label="' + escapeHtml(options.title || 'confirm') + '">' +
            '<div class="medapp-ui-actions">' +
              '<button class="medapp-ui-btn ghost" data-medapp-ui-cancel>' +
                '<span>' + escapeHtml(options.cancelText || 'إلغاء') + '</span>' +
              '</button>' +
              '<button class="medapp-ui-btn danger" data-medapp-ui-confirm disabled>' +
                '<i data-lucide="trash-2" style="width:16px;height:16px;"></i>' +
                '<span>' + escapeHtml(options.confirmText || 'تأكيد') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.classList.add('open');

      var input = document.getElementById('medappUiDangerInput');
      var cancelBtn = root.querySelector('[data-medapp-ui-cancel]');
      var confirmBtn = root.querySelector('[data-medapp-ui-confirm]');
      var overlay = root.querySelector('.medapp-ui-overlay');

      /** ⭐ يفعّل زر التأكيد فقط عند كتابة الكلمة المطلوبة. */
      function syncConfirmState() {
        if (!input || !confirmBtn) return;
        var value = String(input.value || '').trim().toLowerCase();
        var ok = value === word.toLowerCase();
        confirmBtn.disabled = !ok;
        confirmBtn.style.opacity = ok ? '1' : '0.45';
        confirmBtn.style.filter = ok ? 'none' : 'grayscale(0.4)';
        confirmBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
      }

      /** ⭐ الكلمات المقبولة (الكلمة الأساسية + مرادفات). */
      function isAccepted(value) {
        var v = String(value || '').trim().toLowerCase();
        if (v === word.toLowerCase()) return true;
        var extra = options.alsoAccept || [];
        for (var i = 0; i < extra.length; i++) {
          if (v === String(extra[i]).trim().toLowerCase()) return true;
        }
        return false;
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { closeCurrent(false); });
      }
      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
          var value = input ? String(input.value || '').trim().toLowerCase() : '';
          if (!isAccepted(value)) {
            if (input) { input.focus(); input.classList.add('shake'); }
            return;
          }
          closeCurrent(true);
        });
      }
      if (input) {
        input.addEventListener('input', function () {
          if (input) input.classList.remove('shake');
          syncConfirmState();
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
          }
        });
        syncConfirmState();
      }
      if (overlay) {
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) closeCurrent(false);
        });
      }

      document.addEventListener('keydown', onKeyDown, true);
      refreshIcons();
      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      }
    });
  }

  /**
   * ⭐⭐⭐ نافذة "تسجيل الدخول مطلوب".
   *
   * ⭐ القاعدة: **لا تُستدعى إلا** عندما يحاول زائر (غير مسجّل) تنفيذ
   *   إجراء يتطلّب حساباً (مفضّلة · تنزيل · محاضراتي · التقدّم).
   *   لا وجود لها في تدفّق الصفحة ✗ (هذا ما كان يسبّب طبقة شفافة
   *   فوق كل الشاشات).
   *
   * @param {string} message  سبب الطلب (عربي)
   * @param {object} [options] { title, loginText, cancelText }
   * @returns {Promise<boolean>} true إذا اختار المستخدم تسجيل الدخول
   */
  function showLoginPrompt(message, options) {
    options = options || {};
    var root = ensureRoot();

    return new Promise(function (resolve) {
      var settled = false;
      current = {
        resolve: function (value) { if (!settled) { settled = true; resolve(value); } },
        onCancel: null
      };

      root.innerHTML =
        '<div class="medapp-ui-overlay" data-tone="info">' +
          '<div class="medapp-ui-card" role="dialog" aria-modal="true">' +
            '<div class="medapp-ui-icon"><i data-lucide="log-in"></i></div>' +
            '<div class="medapp-ui-title">' + escapeHtml(options.title || 'تسجيل الدخول مطلوب') + '</div>' +
            '<div class="medapp-ui-message">' + (message || 'سجّل الدخول للمتابعة — يمكنك التصفّح كمشاهد بلا حساب.') + '</div>' +
            '<div class="medapp-ui-actions">' +
              '<button class="medapp-ui-btn ghost" data-medapp-ui-cancel>' +
                '<span>' + escapeHtml(options.cancelText || 'لاحقاً') + '</span>' +
              '</button>' +
              '<button class="medapp-ui-btn primary" data-medapp-ui-login>' +
                '<i data-lucide="log-in" style="width:16px;height:16px;"></i>' +
                '<span>' + escapeHtml(options.loginText || 'تسجيل الدخول') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      root.classList.add('open');

      var cancelBtn = root.querySelector('[data-medapp-ui-cancel]');
      var loginBtn = root.querySelector('[data-medapp-ui-login]');
      var overlay = root.querySelector('.medapp-ui-overlay');

      function finish(value) {
        closeCurrent(value);
        if (value) {
          try { global.location.href = 'login.html'; } catch (e) {}
        }
      }

      if (cancelBtn) cancelBtn.addEventListener('click', function () { finish(false); });
      if (loginBtn) loginBtn.addEventListener('click', function () { finish(true); });
      if (overlay) {
        overlay.addEventListener('click', function (event) {
          if (event.target === overlay) finish(false);
        });
      }

      document.addEventListener('keydown', onKeyDown, true);
      refreshIcons();
      if (loginBtn) loginBtn.focus();
    });
  }

  /**
   * ⭐⭐⭐ يفتح رابطاً خارجياً — أصلياً في التطبيق (Browser.open)
   *          وموبّاً على الويب (window.open).
   *
   * ⭐ هذه هي دالة "المسح بدون ويب": كل رابط خارجي في التطبيق
   *   يُفتح في Custom Tab (Browser) بدل تبويب المتصفّح المدمج.
   */
  function openExternal(url) {
    if (!url) return;
    var target = String(url);
    if (!/^(https?:|mailto:|tel:|geo:|sms:)/i.test(target)) {
      // ⭐ رابط داخلي — نترك المتصفّح يتولّاه
      try { global.location.href = target; } catch (e) {}
      return;
    }

    var Browser = (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Browser) || null;
    if (Browser && typeof Browser.open === 'function') {
      try {
        var result = Browser.open({ url: target });
        if (result && typeof result.catch === 'function') {
          result.catch(function () { openExternalInWeb(target); });
        }
        return;
      } catch (e) {}
    }

    openExternalInWeb(target);
  }

  function openExternalInWeb(url) {
    try {
      global.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      try { global.location.href = url; } catch (e2) {}
    }
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

  /**
   * ⭐ v4.5.0 — إغلاق أي نافذة مفتوحة فوراً (يُستخدم بعد إجراء
   *   حساس مثل حذف الحساب حتى لا تبقى طبقة عالقة تمنع اللمس).
   * ⭐ v4.6.0 — TASK 1: إغلاق قسري — حتى لو ضاع مرجع النافذة
   *   (current = null) نُزيل الـoverlay من الـDOM كي لا تتجمّد الواجهة.
   */
  function closeAll() {
    closeCurrent(null);
    try {
      var root = document.getElementById('medappUiRoot');
      if (root) {
        root.classList.remove('open');
        var overlay = root.querySelector('.medapp-ui-overlay');
        if (overlay) root.innerHTML = '';
      }
    } catch (e) {}
  }

  global.showCustomAlert = showCustomAlert;
  global.showCustomConfirm = showCustomConfirm;
  global.showCustomPrompt = showCustomPrompt;
  global.showLoginPrompt = showLoginPrompt;
  global.openExternal = openExternal;
  global.MedAppUI = {
    alert: showCustomAlert,
    confirm: showCustomConfirm,
    prompt: showCustomPrompt,
    dangerConfirm: showDangerConfirm,
    loginPrompt: showLoginPrompt,
    openExternal: openExternal,
    closeAll: closeAll
  };
})(window);
