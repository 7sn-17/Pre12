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
    lastNotificationTap: null,
    permissionRequested: false,
    notificationPermission: null
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
  // 6) الروابط العميقة (Deep Links)
  // ─────────────────────────────────────────────
  // com.pre12.medical://login-callback?code=… → نبدّل الكود بجلسة
  // ونغلق تبويب المتصفح.
  //
  // ⭐⭐ حالتان يجب التغطيتان:
  //   1) التطبيق مفتوح   → appUrlOpen
  //   2) تشغيل بارد      → getLaunchUrl (الرابط الذي فُتح به التطبيق)
  function bindDeepLinks() {
    var App = plugin('App');
    if (!App) return;

    // ⭐ نفس الرابط قد يصل من المصدرين → نعالجه مرّة واحدة فقط
    //    (كود PKCE يُستعمل مرّة واحدة فقط).
    var handled = {};

    function handle(url) {
      if (!url) return;
      if (handled[url]) return;
      handled[url] = true;
      try {
        if (typeof handleAuthDeepLink === 'function') {
          handleAuthDeepLink(url);
        } else {
          // ⭐ auth.js قد لا يكون محمّلاً بعد → نعيد المحاولة بعد قليل
          setTimeout(function () {
            if (typeof handleAuthDeepLink === 'function') handleAuthDeepLink(url);
          }, 400);
        }
      } catch (e) {
        console.warn('[native] deep link handling failed:', e);
      }
    }

    try {
      if (typeof App.addListener === 'function') {
        App.addListener('appUrlOpen', function (data) {
          handle((data && data.url) || '');
        });
      }
    } catch (e) {
      console.warn('[native] appUrlOpen listener failed:', e);
    }

    // ⭐⭐ تشغيل بارد: التطبيق فُتح عبر الرابط — getLaunchUrl يُعيده.
    if (typeof App.getLaunchUrl === 'function') {
      var tryLaunch = function (attempt) {
        Promise.resolve(App.getLaunchUrl())
          .then(function (data) {
            var url = (data && data.url) || '';
            if (!url) return;
            // ⭐ على التشغيل البارد قد لا يكون عميل Supabase جاهزاً بعد
            if (!global.supabaseClient && attempt < 12) {
              setTimeout(function () { tryLaunch(attempt + 1); }, 150);
              return;
            }
            handle(url);
          })
          .catch(function () {});
      };
      tryLaunch(0);
    }
  }

  // ─────────────────────────────────────────────
  // 7) إغلاق تبويب المتصفح
  // ─────────────────────────────────────────────
  function closeNativeBrowser() {
    var Browser = plugin('Browser');
    if (!Browser || typeof Browser.close !== 'function') return;
    try { Browser.close(); } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // 8) المنطقة الآمنة وأشرطة النظام (Safe Area)
  // ─────────────────────────────────────────────
  // ⭐ القيم الفعلية للمنطقة الآمنة يصلنا من CSS:
  //    env(safe-area-inset-top) — يعمل في WebView لأن
  //    Capacitor يفعّل viewport-fit=cover (initialViewportFitCover).
  //    وده_PLUGIN يضبط نمط أشرطة النظام (فاتح/داكن) حسب الثيم.
  function syncSafeArea() {
    var SafeArea = plugin('SafeArea');
    if (!SafeArea) return;
    try {
      if (typeof SafeArea.setSystemBarsStyle === 'function') {
        // ⭐ DARK = محتوى فاتح على خلفية داكنة (وضع ليلي)
        SafeArea.setSystemBarsStyle({
          style: isDarkTheme() ? 'DARK' : 'LIGHT',
          type: 'STATUS_BAR'
        });
      }
    } catch (e) {
      console.warn('[native] safe area sync failed:', e);
    }
  }

  // ─────────────────────────────────────────────
  // 9) أدوات مساعدة صغيرة
  // ─────────────────────────────────────────────
  function toast(message) {
    try {
      if (typeof global.showToast === 'function') global.showToast(message, 'info');
    } catch (e) {}
  }

  // ─────────────────────────────────────────────
  // 10) الإقلاع
  // ─────────────────────────────────────────────
  function initNative() {
    nativeState.ready = true;

    bindBackButton();
    bindNetwork();
    bindFirebase();
    bindDeepLinks();

    // ⭐ منع قائمة الضغط المطوّل (Context Menu) على الصور
    try {
      document.addEventListener('contextmenu', function (event) {
        event.preventDefault();
      });
    } catch (e) {}

    // مزامنة شريط الحالة مع الثيم
    syncStatusBar();
    document.addEventListener('medapp:theme-changed', syncStatusBar);
    try {
      var observer = new MutationObserver(function () { syncStatusBar(); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}

    // المنطقة الآمنة (Notch / شريط الحالة)
    syncSafeArea();
    global.addEventListener('resize', syncSafeArea);

    // ⭐ محرّك الإشعارات الذكي — يجدول إشعاراً مناسباً لحالة المستخدم.
    try {
      if (global.MedAppNotifications && typeof global.MedAppNotifications.init === 'function') {
        global.MedAppNotifications.init();
      }
    } catch (e) {
      console.warn('[native] notification engine failed to start:', e);
    }

    // ⭐ أذونات الإشعارات: نطلبها بعد تسجيل الدخول (وليس قبله)
    //    حتى لا نُزعج الزائر.
    try {
      global.addEventListener('medapp:auth-success', function () {
        requestNotificationPermissionOnce();
      });
      global.addEventListener('medapp:notification-permission', function (event) {
        global.MedAppNative.state.notificationPermission = (event && event.detail) || null;
      });
      // إن كان المستخدم مسجّلاً بالفعل → نطلب الإذن بهدوء.
      if (typeof global.getAuthUser === 'function' && global.getAuthUser()) {
        requestNotificationPermissionOnce();
      }
    } catch (e) {}

    // إخفاء شاشة البدء بعد أول رسم
    if (document.readyState === 'complete') {
      setTimeout(hideSplash, 120);
    } else {
      global.addEventListener('load', function () { setTimeout(hideSplash, 120); });
    }
  }

  /**
   * ⭐ يطلب إذن الإشعارات مرة واحدة فقط (لا نُزعج المستخدم).
   */
  function requestNotificationPermissionOnce() {
    if (nativeState.permissionRequested) return;
    nativeState.permissionRequested = true;
    try {
      if (global.MedAppNotifications &&
          typeof global.MedAppNotifications.requestNotificationPermission === 'function') {
        global.MedAppNotifications.requestNotificationPermission();
      }
    } catch (e) {
      console.warn('[native] notification permission failed:', e);
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
    syncSafeArea: syncSafeArea,
    hideSplash: hideSplash,
    saveFcmToken: saveFcmToken,
    closeBrowser: closeNativeBrowser
  };
  global.closeNativeBrowser = closeNativeBrowser;
})(window);
