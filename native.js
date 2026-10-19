// ============================================================
// native.js — جسر Android الأصلي (Capacitor)
// ------------------------------------------------------------
// يعمل تلقائياً على الويب (بلا أثر) وعلى التطبيق الأصلي ( Capacitor ).
// responsibilities:
//   • زر الرجوع في الأندرويد (Hardware Back Button)
//   • مزامنة لون شريط الحالة مع الوضع النهاري/الليلي
//   • إخفاء شاشة البدء (Splash Screen) بعد تحميل التطبيق
//   • كشف حالة الشبكة + إطلاق أحداث online / offline عالمية
//   • إشعارات Firebase (FCM): حفظ التوكن، استقبال الرسائل، والتنقل
//
// ⭐ كل شيء هنا اختياري: إن لم يكن التطبيق مثبتاً (الويب) لا يحدث شيء.
// ============================================================
(function (global) {
  'use strict';

  var Capacitor = global.Capacitor;
  var isNative = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  var Plugins = (Capacitor && Capacitor.Plugins) || {};

  var nativeState = {
    ready: false,
    isNative: isNative,
    backButtonBound: false,
    fcmToken: '',
    lastNotificationTap: null
  };

  function plugin(name) {
    return Plugins[name] || null;
  }

  // ─────────────────────────────────────────────
  // 1) زر الرجوع (Hardware Back Button)
  // ─────────────────────────────────────────────
  function bindBackButton() {
    if (!isNative || nativeState.backButtonBound) return;
    var App = plugin('App');
    if (!App || typeof App.addListener !== 'function') return;

    try {
      App.addListener('backButton', function () {
        // إن كانت هناك نافذة مفتوحة → أغلقها بدل الخروج.
        if (closeTopOverlay()) return;

        // إن كنا في صفحة فرعية → ارجع للرئيسية.
        var path = global.location && global.location.pathname ? global.location.pathname : '/index.html';
        var file = path.split('/').pop() || 'index.html';
        if (file && file !== 'index.html' && !/\.html$/i.test(file) === false) {
          // صفحة HTML أخرى → ارجع عبر السجلّ
          if (global.history && global.history.length > 1) {
            global.history.back();
            return;
          }
        }
        if (file !== 'index.html') {
          global.location.href = 'index.html';
          return;
        }

        // في الرئيسية: مرّرPressed مرة أخرى للخروج (سلوك apps اعتيادي).
        if (Date.now() - (nativeState.lastBackPress || 0) < 2000) {
          App.exitApp();
        } else {
          nativeState.lastBackPress = Date.now();
          toast('اضغط مرة أخرى للخروج');
        }
      });
      nativeState.backButtonBound = true;
    } catch (e) {
      console.warn('[native] could not bind the back button:', e);
    }
  }

  function closeTopOverlay() {
    // أغلق أي طبقة مفتوحة (streak sheet / modals / lightbox …)
    var overlays = document.querySelectorAll(
      '.streak-sheet-overlay.open, .modal-overlay.open, .lec-overlay.open, ' +
      '.crop-overlay.open, .gallery.open, .auth-required-overlay.active, ' +
      '.sheet-overlay.open, .toast-modal.active, .search-modal-overlay.active'
    );
    for (var i = overlays.length - 1; i >= 0; i--) {
      var el = overlays[i];
      if (el.id && typeof global.closeStreakSheet === 'function' && el.id === 'streakSheetOverlay') {
        global.closeStreakSheet();
        return true;
      }
      if (el.id === 'cropOverlay' && typeof global.closeCropTool === 'function') {
        global.closeCropTool();
        return true;
      }
      if (el.id === 'gallery' && typeof global.closeGallery === 'function') {
        global.closeGallery();
        return true;
      }
      el.classList.remove('open', 'active');
      el.style.pointerEvents = 'none';
      document.body.style.overflow = '';
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────
  // 2) شريط الحالة (Status Bar) + الوضع الليلي
  // ─────────────────────────────────────────────
  function isDarkTheme() {
    try {
      var stored = localStorage.getItem('medfav_theme');
      if (stored === 'light' || stored === 'dark') return stored === 'dark';
      var attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr === 'dark';
    } catch (e) {}
    try {
      return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {}
    return true;
  }

  function syncStatusBar() {
    if (!isNative) return;
    var StatusBar = plugin('StatusBar');
    if (!StatusBar) return;
    try {
      var dark = isDarkTheme();
      // في الوضع الليلي: أيقونات فاتحة على خلفية داكنة.
      if (typeof StatusBar.setStyle === 'function') {
        StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
      }
      if (typeof StatusBar.setBackgroundColor === 'function') {
        StatusBar.setBackgroundColor({ color: dark ? '#06110d' : '#f8fafb' });
      }
      if (typeof StatusBar.setOverlaysWebView === 'function') {
        StatusBar.setOverlaysWebView({ overlay: false });
      }
    } catch (e) {
      console.warn('[native] status bar sync failed:', e);
    }
  }

  // ─────────────────────────────────────────────
  // 3) شاشة البدء (Splash Screen)
  // ─────────────────────────────────────────────
  function hideSplash() {
    if (!isNative) return;
    var Splash = plugin('SplashScreen');
    if (!Splash) return;
    try {
      if (typeof Splash.hide === 'function') Splash.hide();
    } catch (e) {
      console.warn('[native] splash hide failed:', e);
    }
  }

  // ─────────────────────────────────────────────
  // 4) حالة الشبكة + أحداث عامة
  // ─────────────────────────────────────────────
  function dispatchNet(state) {
    try {
      global.dispatchEvent(new CustomEvent(state, { detail: { online: state === 'online' } }));
    } catch (e) {}
  }

  function bindNetwork() {
    if (!isNative) {
      // على الويب نستمع لحدثي المتصفح القياسيين.
      global.addEventListener('online', function () { dispatchNet('online'); });
      global.addEventListener('offline', function () { dispatchNet('offline'); });
      return;
    }

    var Network = plugin('Network');
    if (!Network || typeof Network.addListener !== 'function') return;
    try {
      Network.addListener('networkStatusChange', function (status) {
        var online = !!(status && status.connected);
        dispatchNet(online ? 'online' : 'offline');
      });
      if (typeof Network.getStatus === 'function') {
        Network.getStatus().then(function (status) {
          dispatchNet(status && status.connected ? 'online' : 'offline');
        }).catch(function () {});
      }
    } catch (e) {
      console.warn('[native] network binding failed:', e);
    }
  }

  // ─────────────────────────────────────────────
  // 5) إشعارات Firebase (FCM)
  // ─────────────────────────────────────────────
  function supabaseClientRef() {
    return global.supabaseClient || null;
  }

  function currentUserId() {
    var client = supabaseClientRef();
    if (!client || !client.auth || typeof client.auth.getUser !== 'function') return '';
    try {
      var result = client.auth.getUser();
      if (result && typeof result.then === 'function') {
        return result.then(function (r) {
          return (r && r.data && r.data.user && r.data.user.id) || '';
        }).catch(function () { return ''; });
      }
    } catch (e) {}
    return '';
  }

  /**
   * ⭐ حفظ توكن FCM في جدول profiles حتى تصل الإشعارات لكل جهاز.
   */
  function saveFcmToken(token) {
    if (!token) return Promise.resolve(false);
    var client = supabaseClientRef();
    if (!client) return Promise.resolve(false);

    return currentUserId().then(function (userId) {
      if (!userId) return false;
      return client.from('profiles')
        .update({ fcm_token: token })
        .eq('id', userId)
        .then(function (result) {
          if (result && result.error) {
            // قد لا يوجد العمود — نتجاهل بهدوء.
            console.warn('[native] could not save the FCM token:', result.error.message);
            return false;
          }
          return true;
        })
        .catch(function (e) {
          console.warn('[native] FCM token save failed:', e);
          return false;
        });
    });
  }

  function bindFirebase() {
    if (!isNative) return;
    var Messaging = plugin('FirebaseMessaging');
    if (!Messaging) {
      console.warn('[native] FirebaseMessaging plugin not available');
      return;
    }

    try {
      if (typeof Messaging.addListener === 'function') {
        Messaging.addListener('tokenReceived', function (token) {
          nativeState.fcmToken = token || '';
          saveFcmToken(nativeState.fcmToken);
        });

        Messaging.addListener('messageReceived', function (action) {
          // رسالة وال التطبيق في المقدمة
          try {
            global.dispatchEvent(new CustomEvent('medapp:notification', {
              detail: action || {}
            }));
          } catch (e) {}
        });

        Messaging.addListener('notificationActionPerformed', function (action) {
          // نقر على الإشعار → انتقل للصفحة المطلوبة
          nativeState.lastNotificationTap = action || {};
          try {
            global.dispatchEvent(new CustomEvent('medapp:notification-tap', {
              detail: action || {}
            }));
          } catch (e) {}
          navigateFromNotification(action || {});
        });
      }

      if (typeof Messaging.getToken === 'function') {
        Messaging.getToken().then(function (token) {
          nativeState.fcmToken = token || '';
          saveFcmToken(nativeState.fcmToken);
        }).catch(function (e) {
          console.warn('[native] could not read the FCM token:', e);
        });
      }
    } catch (e) {
      console.warn('[native] Firebase binding failed:', e);
    }
  }

  function navigateFromNotification(action) {
    var data = (action && (action.data || action.notification)) || {};
    var target = data.target || data.url || data.path || '';
    if (!target) target = 'index.html';
    if (target.indexOf('/') === 0) target = target.slice(1);
    if (!/^[\w./-]+\.html(\?.*)?$/.test(target)) target = 'index.html';
    try {
      global.location.href = target;
    } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // 6) مساعدات صغيرة
  // ─────────────────────────────────────────────
  function toast(message) {
    try {
      if (typeof global.showToast === 'function') global.showToast(message, 'info');
    } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // 7) الإقلاع
  // ─────────────────────────────────────────────
  function initNative() {
    nativeState.ready = true;

    bindBackButton();
    bindNetwork();
    bindFirebase();

    // مزامنة شريط الحالة مع الثيم
    syncStatusBar();
    document.addEventListener('medapp:theme-changed', syncStatusBar);
    try {
      var observer = new MutationObserver(function () { syncStatusBar(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}

    // إخفاء شاشة البدء بعد أول رسم
    if (document.readyState === 'complete') {
      setTimeout(hideSplash, 120);
    } else {
      global.addEventListener('load', function () { setTimeout(hideSplash, 120); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNative);
  } else {
    initNative();
  }

  // واجهة عامة صغيرة
  global.MedAppNative = {
    state: nativeState,
    isNative: function () { return isNative; },
    syncStatusBar: syncStatusBar,
    hideSplash: hideSplash,
    saveFcmToken: saveFcmToken
  };
})(window);
