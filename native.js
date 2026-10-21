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
    pendingFcmToken: '',
    pushListenerBound: false,
    foregroundPushBound: false,
    authTokenListenerBound: false,
    lastNotificationTap: null,
    lastForegroundNotificationKey: '',
    lastForegroundNotificationAt: 0,
    permissionRequested: false,
    notificationPermission: null,
    cacheKillerRunning: false
  };

  // ⭐ v4.3.0 — آخر رمز FCM معروف. نحتفظ به محلياً حتى تستعيد الجلسة
  //   بعد إعادة التشغيل أو تسجيل الدخول، فنجدّد الحفظ بدون انتظار Firebase.
  var FCM_TOKEN_KEY = 'medapp_fcm_token';
  var MAX_SAVE_ATTEMPTS = 8;

  function cachedFcmToken() {
    try { return localStorage.getItem(FCM_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function rememberFcmToken(token) {
    if (!token) return;
    try { localStorage.setItem(FCM_TOKEN_KEY, String(token)); } catch (e) {}
  }

  /**
   * ⭐ v4.4.0 — استخراج الرمز الحقيقي من أي شكل ترجعه الإضافات.
   * كان FirebaseMessaging.getToken() يُرجع { token: "..." } بينما الكود
   * يقرأ value فقط، فيُحوَّل الكائن إلى النص "[object Object]" ويُحفظ
   * في profiles.fcm_token. لا نستخدم String(object) أبداً.
   */
  function extractFcmToken(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value !== 'object') return '';

    var keys = ['token', 'value', 'registrationId', 'registrationToken', 'id'];
    for (var i = 0; i < keys.length; i++) {
      var nested = value[keys[i]];
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
      if (nested && typeof nested === 'object') {
        var deeper = extractFcmToken(nested);
        if (deeper) return deeper;
      }
    }
    return '';
  }

  /** ⭐ رمز FCM صالح: نصّ طويل بلا مسافات، وليس "[object Object]". */
  function isUsableFcmToken(token) {
    token = String(token || '');
    return token.length >= 20 &&
      token.length <= 4096 &&
      token.indexOf('[object') === -1 &&
      !/\s/.test(token);
  }

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
    // ⭐ window.supabaseClient is set by supabase-config.js (v4.3.0).
    //   The bare fallback also covers the global lexical `const` binding
    //   in case the window assignment is ever removed.
    if (global.supabaseClient) return global.supabaseClient;
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    } catch (e) {}
    return null;
  }

  function currentUserId() {
    // ⭐ TASK 1 (v4.1.2): أولاً المستخدم المتزامن الذي يحفظه auth.js.
    //    كان الرمز يصل قبل استعادة الجلسة فيعود getUser() فارغاً
    //    ويُحفظ الرمز في الذاكرة فقط — ومن هنا بقاء fcm_token = NULL.
    try {
      if (typeof global.getAuthUser === 'function') {
        var cached = global.getAuthUser();
        if (cached && cached.id) return Promise.resolve(cached.id);
      }
    } catch (e) {}

    var client = supabaseClientRef();
    if (!client || !client.auth) return Promise.resolve('');

    try {
      // ⭐ الجلسة المحلية أولاً (لا تحتاج شبكة)
      if (typeof client.auth.getSession === 'function') {
        return Promise.resolve(client.auth.getSession())
          .then(function (res) {
            var user = res && res.data && res.data.session && res.data.session.user;
            if (user && user.id) return user.id;
            if (typeof client.auth.getUser !== 'function') return '';
            return Promise.resolve(client.auth.getUser())
              .then(function (r) {
                return (r && r.data && r.data.user && r.data.user.id) || '';
              })
              .catch(function () { return ''; });
          })
          .catch(function () { return ''; });
      }

      if (typeof client.auth.getUser === 'function') {
        return Promise.resolve(client.auth.getUser())
          .then(function (r) {
            return (r && r.data && r.data.user && r.data.user.id) || '';
          })
          .catch(function () { return ''; });
      }
    } catch (e) {}
    return Promise.resolve('');
  }

  /**
   * ⭐ v4.3.0 — حفظ الرمز مع إعادة محاولة تلقائية.
   * الرمز قد يصل قبل اكتمال الدخول (خصوصاً عند الإقلاع)، فنحتفظ به
   * في الذاكرة وفي localStorage ونعيد المحاولة كل ثانيتين حتى تُستعاد
   * الجلسة. لا نستخدم upsert: إنشاء الصفّ مسؤولية trigger القاعدة.
   */
  function queueFcmTokenSave(token) {
    // ⭐ v4.4.0 — نقبل كائناً ({token}/{value}) ونستخرج النصّ الحقيقي.
    token = extractFcmToken(token);
    if (!isUsableFcmToken(token)) {
      console.warn('[native] ignored an invalid FCM token shape.');
      return Promise.resolve(false);
    }

    nativeState.pendingFcmToken = token;
    rememberFcmToken(token);

    return saveTokenToDB(token, 0).then(function (saved) {
      if (saved) nativeState.pendingFcmToken = '';
      return saved;
    });
  }

  function retryTokenSave(token, attempt) {
    if (attempt >= MAX_SAVE_ATTEMPTS) {
      console.warn(
        '[native] the FCM token is still unsaved after ' + MAX_SAVE_ATTEMPTS + ' retries.'
      );
      return false;
    }
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(saveTokenToDB(token, attempt + 1));
      }, 2000);
    });
  }

  /**
   * ⭐ TASK 3 — saveTokenToDB: يتحقّق من المستخدم (ذاكرة → جلسة → getUser)،
   *   يحدّث profiles.fcm_token فقط، ويعيد المحاولة إن لم تكن الجلسة جاهزة.
   */
  function saveTokenToDB(token, attempt) {
    // ⭐ TASK 1 (v4.4.0) — نحفظ النصّ فقط. لا JSON.stringify، ولا String(object).
    token = extractFcmToken(token);
    attempt = Number(attempt) || 0;
    if (!isUsableFcmToken(token)) {
      console.warn('[native] saveTokenToDB received an invalid token; not saving.');
      return Promise.resolve(false);
    }

    var client = supabaseClientRef();
    if (!client || !client.from) {
      console.warn('[native] the Supabase client is not ready — retrying the FCM save.');
      return Promise.resolve(retryTokenSave(token, attempt));
    }

    return Promise.resolve(currentUserId()).then(function (userId) {
      if (!userId) {
        // ⭐ نفس منطق المطلوب: المستخدم غير جاهز → ننتظر ثم نعيد.
        console.warn('[native] User not ready, retrying the FCM save in 2s...');
        return retryTokenSave(token, attempt);
      }

      return Promise.resolve(
        client.from('profiles').update({ fcm_token: token }).eq('id', userId).select('id')
      )
        .then(function (result) {
          if (result && result.error) {
            console.warn('[native] Failed to save token:', result.error);
            return retryTokenSave(token, attempt);
          }
          if (((result && result.data) || []).length) {
            console.info('[native] Token saved successfully!');
            rememberFcmToken(token);
            return true;
          }
          // ⭐ الصفّ غير موجود بعد (trigger لم ينتهِ / جلسة قديمة) → إعادة محاولة.
          console.warn('[native] no profile row matched the signed-in user yet.');
          return retryTokenSave(token, attempt);
        })
        .catch(function (e) {
          console.warn('[native] FCM token save failed:', e);
          return retryTokenSave(token, attempt);
        });
    });
  }

  /** ⭐ اسم متوافق للواجهة العامة */
  function saveFcmToken(token) {
    return saveTokenToDB(token, 0);
  }

  /**
   * ⭐ TASK 3 — عندما تُستعاد الجلسة (SIGNED_IN / TOKEN_REFRESHED)
   *    نحفظ الرمز المعلّق/المخزّن محلياً فوراً.
   */
  function bindAuthTokenSave() {
    if (nativeState.authTokenListenerBound) return;
    var client = supabaseClientRef();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
    nativeState.authTokenListenerBound = true;

    try {
      client.auth.onAuthStateChange(function (event, session) {
        var token = nativeState.pendingFcmToken || nativeState.fcmToken || cachedFcmToken();
        if (!token) return;
        if (session && session.user && session.user.id) {
          console.info('[native] auth is ready (' + event + ') — saving the FCM token.');
          queueFcmTokenSave(token);
        }
      });
    } catch (e) {
      nativeState.authTokenListenerBound = false;
      console.warn('[native] the auth listener for FCM could not be attached:', e);
    }
  }

  /**
   * ⭐⭐⭐ TASK 6 — التسلسل الصحيح لتوليد رمز FCM وحفظه:
   *
   *   1) `const perm = await PushNotifications.requestPermissions();`
   *   2) `if (perm.receive === 'granted') { await PushNotifications.register(); }`
   *   3) المستمع على حدث 'registration' يُعرَّف **قبل** register()
   *      فيحفظ الرمز فور وصوله.
   *   4) `setTimeout` بمقدار 3 ثوانٍ بعد register() قبل قراءة الرمز
   *      وحفظه — ليعطي Firebase وقته في توليد الرمز.
   *
   * هذه هي العلّة الفعلية لبقاء `profiles.fcm_token = NULL`: كان
   * التسجيل يتمّ بلا إذن إشعارات، وبلا أي مهلة انتظار.
   */
  function bindPushRegistrationListener() {
    if (nativeState.pushListenerBound) return;
    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications || typeof PushNotifications.addListener !== 'function') return;
    nativeState.pushListenerBound = true;

    try {
      // ⚠️ الترتيب مهم: المستمع أوّلاً … ثم register()
      PushNotifications.addListener('registration', function (token) {
        var value = extractFcmToken(token);
        if (!isUsableFcmToken(value)) return;
        nativeState.fcmToken = value;
        rememberFcmToken(nativeState.fcmToken);
        // ⭐ console only — the user must never see a debug alert.
        console.info('[native] Token Received:', nativeState.fcmToken.slice(0, 24) + '…');
        // ⭐ نحفظ الآن، ونعيد المحاولة إن لم تكن الجلسة جاهزة بعد
        bindAuthTokenSave();
        queueFcmTokenSave(nativeState.fcmToken);
      });

      PushNotifications.addListener('registrationError', function (error) {
        console.warn('[native] the FCM registration failed:', error);
      });
    } catch (e) {
      console.warn('[native] the registration listener could not be attached:', e);
    }
  }

  /** ⭐ يقرأ الرمز (PushNotifications ثم FirebaseMessaging) ويحفظه */
  function readAndSaveFcmToken() {
    var PushNotifications = plugin('PushNotifications');
    var Messaging = plugin('FirebaseMessaging');

    var read = null;
    if (PushNotifications && typeof PushNotifications.getToken === 'function') {
      read = PushNotifications.getToken.bind(PushNotifications);
    } else if (Messaging && typeof Messaging.getToken === 'function') {
      read = Messaging.getToken.bind(Messaging);
    }
    if (!read) return Promise.resolve(nativeState.fcmToken || '');

    return Promise.resolve(read())
      .then(function (result) {
        var value = extractFcmToken(result);
        if (!isUsableFcmToken(value)) {
          console.warn('[native] the FCM plugin did not return a token string.');
          return nativeState.fcmToken || '';
        }
        nativeState.fcmToken = value;
        rememberFcmToken(nativeState.fcmToken);
        console.info('[native] the FCM token was read:', nativeState.fcmToken.slice(0, 24) + '…');
        return Promise.resolve(queueFcmTokenSave(nativeState.fcmToken)).then(function () {
          return nativeState.fcmToken;
        });
      })
      .catch(function (e) {
        console.warn('[native] could not read the FCM token:', e);
        return nativeState.fcmToken || '';
      });
  }

  /** ⭐⭐⭐ يضمن وجود رمز FCM محفوظ (يُستدعى بعد الدخول وعند الإقلاع) */
  function ensureFcmToken() {
    if (!isNative) return Promise.resolve('');
    var PushNotifications = plugin('PushNotifications');

    // 3) المستمع قبل register + حفظ الرمز عند استعادة الجلسة
    bindPushRegistrationListener();
    bindAuthTokenSave();

    // ⭐ TASK 3: إن كان لدينا رمز معلّق أو مخزّن محلياً، احفظه فوراً
    //   حتى لو لم يُطلق Firebase حدث registration في هذه الجلسة.
    if (nativeState.pendingFcmToken || nativeState.fcmToken) {
      queueFcmTokenSave(nativeState.pendingFcmToken || nativeState.fcmToken);
    }

    if (!PushNotifications || typeof PushNotifications.register !== 'function') {
      console.warn('[native] the PushNotifications plugin is not available');
      return readAndSaveFcmToken();
    }

    // 1) الإذن أوّلاً
    return Promise.resolve(PushNotifications.requestPermissions())
      .then(function (perm) {
        if (!perm || perm.receive !== 'granted') {
          console.warn('[native] the notification permission was not granted:',
            (perm && (perm.receive || perm.status)) || 'unknown');
          return '';
        }

        // 2) ثم التسجيل
        return Promise.resolve(PushNotifications.register())
          .then(function () {
            // 4) 3 ثوانٍ قبل القراءة والحفظ
            return new Promise(function (resolve) {
              setTimeout(function () {
                readAndSaveFcmToken().then(resolve, function () { resolve(''); });
              }, 3000);
            });
          })
          .catch(function (e) {
            console.warn('[native] the FCM registration call failed:', e);
            return '';
          });
      })
      .catch(function (e) {
        console.warn('[native] ensuring the FCM token failed:', e);
        return '';
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
          var value = extractFcmToken(token);
          if (!isUsableFcmToken(value)) return;
          nativeState.fcmToken = value;
          rememberFcmToken(nativeState.fcmToken);
          bindAuthTokenSave();
          queueFcmTokenSave(nativeState.fcmToken);
        });

        // ⭐ v4.4.1 — @capacitor-firebase/messaging v8 emits
        //   `notificationReceived` (not `messageReceived`). We still
        //   use PushNotifications as the primary foreground path below.
        Messaging.addListener('notificationReceived', function (action) {
          displayForegroundNotification(action, 'messaging');
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
        Messaging.getToken().then(function (result) {
          // ⭐ FirebaseMessaging returns { token: "..." } — not { value }.
          var value = extractFcmToken(result);
          if (!isUsableFcmToken(value)) return;
          nativeState.fcmToken = value;
          rememberFcmToken(nativeState.fcmToken);
          bindAuthTokenSave();
          queueFcmTokenSave(nativeState.fcmToken);
        }).catch(function (e) {
          console.warn('[native] could not read the FCM token:', e);
        });
      }
    } catch (e) {
      console.warn('[native] Firebase binding failed:', e);
    }
  }

  /**
   * ⭐⭐⭐ التوجيه الذكي — يستمع لضغطة الإشعار (محلي أو بعيد)
   * ويقرأ data.action لتحديد ما يُفتح:
   *   update · tasks · streak · lectures · notes · content
   *
   * ⭐ v4.5.1 — TASK 4: أزرار الإجراء «تم الإنجاز» و«لاحقاً».
   */
  function bindNotificationRouting() {
    if (!isNative) return;

    var LocalNotifications = plugin('LocalNotifications');
    if (LocalNotifications && typeof LocalNotifications.addListener === 'function') {
      try {
        LocalNotifications.addListener('localNotificationActionPerformed', function (event) {
          var payload = (event && event.notification) || event || {};
          if (handleNotificationAction(event && event.actionId, payload, event)) return;
          routeNotification(payload);
        });
      } catch (e) {
        console.warn('[native] the local notification listener failed:', e);
      }
    }

    var PushNotifications = plugin('PushNotifications');
    if (PushNotifications && typeof PushNotifications.addListener === 'function') {
      try {
        PushNotifications.addListener('pushNotificationActionPerformed', function (event) {
          var payload = (event && event.notification) || event || {};
          if (handleNotificationAction(event && event.actionId, payload, event)) return;
          routeNotification(payload);
        });
      } catch (e) {
        console.warn('[native] the push notification listener failed:', e);
      }
    }

    var Messaging = plugin('FirebaseMessaging');
    if (Messaging && typeof Messaging.addListener === 'function') {
      try {
        Messaging.addListener('notificationActionPerformed', function (action) {
          var payload = (action && action.notification) || action || {};
          if (handleNotificationAction(action && action.actionId, payload, action)) return;
          routeNotification(payload);
        });
      } catch (e) {}
    }

    // ⭐ v4.4.1 — TASK 2: FCM لا يعرض شيئاً تلقائياً والتطبيق في المقدمة.
    bindForegroundPushDisplay();
  }

  /**
   * ⭐ v4.5.1 — TASK 4: يقرأ زر الإجراء المضغوط في الإشعار.
   * @returns {boolean} true إذا كان ضغطاً على زر إجراء (لا نوجّه بعدها).
   */
  function handleNotificationAction(actionId, payload, event) {
    var id = String(actionId || '').toLowerCase();
    if (id !== 'mark_done' && id !== 'later') return false;

    var data = (payload && (payload.data || payload)) || {};
    if (!data || typeof data !== 'object') data = {};

    try {
      global.dispatchEvent(new CustomEvent('medapp:notification-action', {
        detail: { actionId: id, data: data }
      }));
    } catch (e) {}

    if (id === 'mark_done') markNotificationTaskDone(data, event);
    else snoozeNotificationTask(data, event);

    return true;
  }

  /**
   * ⭐ v4.5.1 — TASK 4: يزيل الإشعار الظاهر من شاشة الإشعارات.
   */
  function dismissDeliveredNotification(event) {
    try {
      var LocalNotifications = plugin('LocalNotifications');
      if (!LocalNotifications) return;
      var raw = event && event.notification && event.notification.id;
      if (raw === undefined || raw === null) return;
      var numeric = parseInt(raw, 10);
      if (isNaN(numeric)) return;
      if (typeof LocalNotifications.removeDeliveredNotificationsById === 'function') {
        Promise.resolve(LocalNotifications.removeDeliveredNotificationsById({ ids: [numeric] }))
          .catch(function () {});
      }
    } catch (e) {}
  }

  /** ⭐ تاريخ اليوم بصيغة YYYY-MM-DD. */
  function todayPlanKey() {
    var now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  /** ⭐ إشعار قصير للمستخدم (Toast). */
  function notifyUser(message, type) {
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(message, type || 'info');
      } else {
        console.info('[native] ' + message);
      }
    } catch (e) {
      console.info('[native] ' + message);
    }
  }

  /** ⭐ يحدّث بطاقة «مهام اليوم» إن كانت ظاهرة. */
  function refreshTodayUi() {
    try {
      if (typeof global.renderTodayCard === 'function') global.renderTodayCard();
    } catch (e) {}
    try {
      if (typeof global.updateStreakCounter === 'function') global.updateStreakCounter();
    } catch (e) {}
  }

  /**
   * ⭐ v4.5.1 — TASK 4: زر «تم الإنجاز» → يحدّث المهمة في Supabase
   *   ويلغي الإشعار ويحدّث الواجهة.
   */
  function markNotificationTaskDone(data, event) {
    data = data || {};
    var taskId = String(data.task_id || data.taskId || '');
    var planDate = String(data.plan_date || data.planDate || '');

    dismissDeliveredNotification(event);

    if (!taskId) {
      notifyUser('لا توجد مهمة مرتبطة بهذا الإشعار', 'info');
      return;
    }

    var user = null;
    try {
      user = typeof global.getAuthUser === 'function' ? global.getAuthUser() : null;
    } catch (e) {}
    if (!user || !user.id) {
      notifyUser('سجّل الدخول أولاً لتحديث المهمة', 'info');
      return;
    }

    if (!planDate) planDate = todayPlanKey();

    var title = String(data.task_title || data.taskTitle || '');
    var task = {
      id: taskId,
      date: planDate,
      subject: String(data.subject || ''),
      task: title,
      title: title
    };

    // ⭐ المسار المفضّل: نفس دالة التطبيق (محلي + طابور + حدث + رفع سحابي).
    var handled = false;
    try {
      if (typeof global.setTaskCompleted === 'function') {
        handled = true;
        Promise.resolve(global.setTaskCompleted(planDate, taskId, true, task, 'notification'))
          .then(function (result) {
            if (result && result.ok === false) {
              notifyUser('تعذّر تحديث المهمة', 'error');
              return;
            }
            notifyUser('تم إنجاز المهمة ✔', 'success');
            refreshTodayUi();
          })
          .catch(function (e) {
            console.warn('[native] the task could not be updated:', e);
            notifyUser('تعذّر تحديث المهمة', 'error');
          });
      }
    } catch (e) {
      handled = false;
    }

    if (handled) return;

    // ⭐ احتياط: رفع مباشر إلى جدول task_progress.
    try {
      if (global.supabaseClient) {
        handled = true;
        Promise.resolve(global.supabaseClient
          .from('task_progress')
          .upsert({
            user_id: user.id,
            plan_date: planDate,
            task_id: taskId,
            subject: task.subject || null,
            task_title: title || null,
            completed: true,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,plan_date,task_id' }))
          .then(function (result) {
            if (result && result.error) {
              console.warn('[native] the task could not be saved:', result.error);
              notifyUser('تعذّر تحديث المهمة', 'error');
              return;
            }
            notifyUser('تم إنجاز المهمة ✔', 'success');
            refreshTodayUi();
          })
          .catch(function (e) {
            console.warn('[native] the task could not be saved:', e);
            notifyUser('تعذّر تحديث المهمة', 'error');
          });
      }
    } catch (e) {
      handled = false;
    }

    if (!handled) notifyUser('تعذّر تحديث المهمة', 'error');
  }

  /**
   * ⭐ v4.5.1 — TASK 4: زر «لاحقاً» → يؤجّل التذكير 30 دقيقة.
   */
  function snoozeNotificationTask(data, event) {
    data = data || {};
    dismissDeliveredNotification(event);

    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') {
      notifyUser('سنُذكّرك بعد 30 دقيقة', 'info');
      return;
    }

    var title = String(data.title || '⏰ تذكير بمهامك');
    var body = String(data.body || 'عد لمهامك الآن.');
    var id = Math.floor(Date.now() / 1000) % 2147483647;

    try {
      Promise.resolve(LocalNotifications.schedule({
        notifications: [{
          id: id,
          title: title,
          body: body,
          smallIcon: 'ic_stat_icon',
          channelId: 'medapp_tasks',
          sound: 'default',
          schedule: { at: new Date(Date.now() + 30 * 60 * 1000) },
          extra: { action: 'tasks' }
        }]
      })).then(function () {
        notifyUser('سنُذكّرك بعد 30 دقيقة', 'info');
      }).catch(function (e) {
        console.warn('[native] the snooze could not be scheduled:', e);
      });
    } catch (e) {
      console.warn('[native] the snooze could not be scheduled:', e);
    }
  }

  /**
   * ⭐ v4.4.1 — TASK 2: when the app is open, Android does not draw an
   * FCM notification. We mirror the incoming title/body into a local
   * notification so the user always sees it.
   */
  function bindForegroundPushDisplay() {
    if (!isNative || nativeState.foregroundPushBound) return;

    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications || typeof PushNotifications.addListener !== 'function') return;

    try {
      PushNotifications.addListener('pushNotificationReceived', function (notification) {
        displayForegroundNotification(notification, 'push');
      });
      nativeState.foregroundPushBound = true;
      console.info('[native] foreground push listener bound');
    } catch (e) {
      console.warn('[native] the foreground push listener failed:', e);
    }
  }

  /**
   * ⭐ v4.5.0 — TASK 3: قنوات إشعارات متعددة بهويات مختلفة.
   *   high + default sound: السلسلة، المهام، التحديثات.
   *   default + silent: المحتوى الجديد.
   */
  var NOTIFICATION_CHANNELS = [
    { id: 'medapp_reminders', name: 'تذكيرات المنصة', description: 'تذكيرات عامة من المنصة الطبية', importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#10b981' },
    { id: 'medapp_streak', name: 'سلسلة الدراسة', description: 'تنبيهات حماية سلسلة الأيام المتتالية', importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#f59e0b' },
    { id: 'medapp_tasks', name: 'المهام اليومية', description: 'تذكير بالمهام وجدول اليوم', importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#10b981' },
    { id: 'medapp_content', name: 'محتوى جديد', description: 'ملخصات وملفات جديدة في المواد', importance: 3, visibility: 1, vibration: false, lights: false },
    { id: 'medapp_updates', name: 'تحديثات التطبيق', description: 'إصدارات جديدة وإعلانات مهمة', importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#3b82f6' },
  ];

  /** ⭐ ينشئ كل قنوات الإشعارات، مع استخدام محرّك الإشعارات إن توفّر. */
  function ensureNotificationChannels() {
    try {
      if (global.MedAppNotifications &&
          typeof global.MedAppNotifications.ensureChannels === 'function') {
        return Promise.resolve(global.MedAppNotifications.ensureChannels());
      }
    } catch (e) {}

    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.createChannel !== 'function') {
      return Promise.resolve(false);
    }

    var jobs = NOTIFICATION_CHANNELS.map(function (config) {
      var channel = Object.assign({}, config);
      if (channel.sound === 'default') delete channel.sound;
      try {
        var result = LocalNotifications.createChannel(channel);
        if (result && typeof result.then === 'function') {
          return result.then(function () { return true; }).catch(function () { return false; });
        }
        return Promise.resolve(true);
      } catch (e) {
        return Promise.resolve(false);
      }
    });

    return Promise.all(jobs).then(function (results) {
      return results.every(Boolean);
    });
  }

  /** ⭐ توافق خلفي: يستخدمه مسار عرض إشعار المقدمة. */
  function ensureForegroundChannel() {
    return ensureNotificationChannels();
  }

  /** ⭐ v4.5.0 — يختار قناة الإشعار حسب نوع المحتوى/الإجراء. */
  function notificationChannelFor(data, action) {
    var requested = String((data && (data.channel || data.channelId)) || '').toLowerCase();
    var allowed = {
      medapp_reminders: 1,
      medapp_streak: 1,
      medapp_tasks: 1,
      medapp_content: 1,
      medapp_updates: 1,
    };
    if (allowed[requested]) return requested;

    var value = String(action || (data && data.action) || '').toLowerCase();
    if (value === 'streak') return 'medapp_streak';
    if (value === 'content') return 'medapp_content';
    if (value === 'update') return 'medapp_updates';
    if (value === 'tasks' || value === 'lectures') return 'medapp_tasks';
    return 'medapp_reminders';
  }

  /**
   * ⭐ v4.4.1 — mirror a foreground FCM message into a local notification.
   *   Supports both PushNotifications (flat schema) and
   *   FirebaseMessaging ({ notification: { title, body, data } }).
   */
  function displayForegroundNotification(payload, source) {
    if (!isNative) return;

    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') return;

    var raw = payload || {};
    var notification = raw.notification || raw;
    var data = (notification && notification.data) || raw.data || {};
    var title = (notification && notification.title) || data.title || '🔔 المنصة الطبية';
    var body = (notification && notification.body) || data.body || '';

    title = String(title || '').trim();
    body = String(body || '').trim();
    if (!title && !body) return;
    if (!title) title = '🔔 المنصة الطبية';
    if (!body) body = 'لديك إشعار جديد من المنصة الطبية.';

    // ⭐ منع التكرار: قد يصل نفس الإشعار من PushNotifications
    //   وFirebaseMessaging معاً في نفس اللحظة.
    var key = title + '|' + body;
    var now = Date.now();
    if (nativeState.lastForegroundNotificationKey === key &&
        now - nativeState.lastForegroundNotificationAt < 2500) {
      return;
    }
    nativeState.lastForegroundNotificationKey = key;
    nativeState.lastForegroundNotificationAt = now;

    // ⭐ أبقِ حدث الواجهة الحالي يعمل أيضاً.
    try {
      global.dispatchEvent(new CustomEvent('medapp:notification', {
        detail: raw
      }));
    } catch (e) {}

    var id = (now % 2000000000) + Math.floor(Math.random() * 1000);
    var channelId = notificationChannelFor(data, data.action);
    var localNotification = {
      id: id,
      title: title,
      body: body,
      smallIcon: 'ic_stat_icon',
      channelId: channelId,
      sound: 'default',
      schedule: { at: new Date(now + 350) },
      extra: data,
    };
    if (channelId === 'medapp_content') delete localNotification.sound;

    var schedule = { notifications: [localNotification] };

    Promise.resolve(ensureForegroundChannel())
      .then(function () { return LocalNotifications.schedule(schedule); })
      .then(function () {
        console.info('[native] foreground FCM displayed locally (' + source + '):', title);
      })
      .catch(function (e) {
        console.warn('[native] foreground local notification failed:', e);
      });
  }

  /** ⭐ v4.5.0 — يتحقق من أن هدف الإشعار صفحة داخلية آمنة. */
  function safeInternalTarget(target) {
    var value = String(target || '').trim();
    if (!value) return '';
    if (value.charAt(0) === '/') value = value.slice(1);
    if (!/^(index|subject|viewer|my-lectures|goals|gpa|notes|plans|progress|about|settings)\.html(\?[^#]*)?$/i.test(value)) {
      return '';
    }
    return value;
  }

  /** ⭐ v4.5.0 — يبني هدف إشعار المحتوى (مادة/ملف/رابط صريح). */
  function contentNotificationTarget(data) {
    var explicit = safeInternalTarget(data && (data.url || data.target || data.path));
    if (explicit) return explicit;

    var subjectSlug = data && (data.subject_slug || data.subjectSlug);
    if (subjectSlug) return 'subject.html?subject=' + encodeURIComponent(String(subjectSlug));

    var subjectId = data && (data.subject_id || data.subjectId);
    if (subjectId && global.supabaseClient) {
      // لا نستطيع الانتظار هنا؛ نعيد الوعد عبر مسار خاص.
      return 'subject-id:' + String(subjectId);
    }

    var fileId = data && (data.file_id || data.fileId);
    if (fileId) return 'viewer.html?id=' + encodeURIComponent(String(fileId));

    return 'index.html';
  }

  /**
   * ⭐ v4.5.1 — TASK 4: أزرار الإشعار القادمة من الخادم.
   *   (FCM v1 لا يسمح بـ actions داخل الإشعار، فنرسلها في البيانات.)
   */
  function notificationActionButtons(data) {
    var ids = String((data && data.actions) || '').split(',');
    ids = ids.map(function (id) { return String(id || '').trim(); }).filter(Boolean);
    if (!ids.length) return [];
    var titles = String((data && data.actions_titles) || '').split('|');
    return ids.map(function (id, index) {
      return { id: id, title: String(titles[index] || id) };
    });
  }

  /**
   * ⭐ v4.5.1 — TASK 4: شريط إجراءات حقيقي داخل التطبيق
   *   (بديل عملي لأزرار أندرويد التي لا تدعمها FCM v1).
   * @returns {boolean} true إذا عُرض الشريط.
   */
  function showNotificationActionSheet(data) {
    var buttons = notificationActionButtons(data);
    if (!buttons.length) return false;

    try {
      if (!global.document || !global.document.body) return false;
      if (global.document.getElementById('medappNotifActions')) return true;

      var overlay = global.document.createElement('div');
      overlay.id = 'medappNotifActions';
      overlay.setAttribute('dir', 'rtl');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:200000;display:flex;align-items:flex-end;' +
        'justify-content:center;background:rgba(3,10,8,0.74);' +
        'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:18px;';

      var card = global.document.createElement('div');
      card.style.cssText =
        'width:100%;max-width:420px;background:rgba(9,23,17,0.97);' +
        'border:1px solid rgba(251,191,36,0.28);border-radius:22px;padding:18px;' +
        'box-shadow:0 24px 60px rgba(0,0,0,0.55);color:#fff;font-family:inherit;';

      var title = global.document.createElement('div');
      title.style.cssText = 'font-size:1.02rem;font-weight:800;margin-bottom:6px;';
      title.textContent = String((data && data.title) || 'لديك إشعار جديد');

      var body = global.document.createElement('div');
      body.style.cssText =
        'font-size:0.88rem;line-height:1.7;color:rgba(255,255,255,0.82);margin-bottom:14px;';
      body.textContent = String((data && data.body) || '');

      var row = global.document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

      function close() {
        try { overlay.remove(); } catch (e) {}
      }

      buttons.forEach(function (button) {
        var element = global.document.createElement('button');
        element.type = 'button';
        element.textContent = button.title;
        element.style.cssText =
          'flex:1 1 0;min-width:110px;border:none;border-radius:14px;padding:12px 14px;' +
          'font:inherit;font-weight:800;font-size:0.88rem;cursor:pointer;' +
          'background:linear-gradient(135deg,#10b981,#047857);color:#fff;';
        if (button.id === 'later') {
          element.style.background = 'rgba(255,255,255,0.10)';
          element.style.color = '#ffffff';
          element.style.border = '1px solid rgba(255,255,255,0.18)';
        }
        element.addEventListener('click', function () {
          close();
          handleNotificationAction(button.id, data, null);
        });
        row.appendChild(element);
      });

      // ⭐ زر «فتح» ينقل إلى الوجهة (المهام/السلسلة/…) دون تكرار الشريط.
      var open = global.document.createElement('button');
      open.type = 'button';
      open.textContent = 'فتح';
      open.style.cssText =
        'flex:0 0 auto;border:none;border-radius:14px;padding:12px 16px;font:inherit;' +
        'font-weight:800;font-size:0.85rem;cursor:pointer;background:transparent;' +
        'color:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.14);';
      open.addEventListener('click', function () {
        close();
        openNotificationTarget(data);
      });
      row.appendChild(open);

      card.appendChild(title);
      card.appendChild(body);
      card.appendChild(row);
      overlay.appendChild(card);

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) close();
      });

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close();
          global.document.removeEventListener('keydown', onKeyDown);
        }
      }
      global.document.addEventListener('keydown', onKeyDown);

      global.document.body.appendChild(overlay);
      return true;
    } catch (e) {
      console.warn('[native] the notification action sheet failed:', e);
      return false;
    }
  }

  /** ⭐ يفتح وجهة الإشعار (بدون شريط الإجراءات). */
  function openNotificationTarget(data) {
    try {
      // ⭐⭐ W10 — إن حملت الحمولة رابط pre12:// فمرّره عبر محرّك الروابط
      //   العميقة (نفس سلوك ضغط الودجت تماماً).
      var deepUrl = String((data && (data.url || data.deep_link)) || '');
      if (deepUrl.indexOf('pre12://') === 0 && routePre12Link(deepUrl)) return;

      var action = String((data && data.action) || '').toLowerCase();
      if (action === 'tasks' || action === 'streak') {
        global.location.href = 'index.html#' + action;
      } else if (action === 'lectures') {
        global.location.href = 'my-lectures.html';
      } else if (action === 'notes') {
        global.location.href = 'notes.html';
      } else if (action === 'content') {
        var target = contentNotificationTarget(data);
        if (target.indexOf('subject-id:') === 0) {
          var subjectId = target.slice('subject-id:'.length);
          Promise.resolve(global.supabaseClient
            .from('subjects')
            .select('slug')
            .eq('id', subjectId)
            .maybeSingle())
            .then(function (result) {
              var slug = result && result.data && result.data.slug;
              global.location.href = slug
                ? 'subject.html?subject=' + encodeURIComponent(slug)
                : 'index.html';
            })
            .catch(function () { global.location.href = 'index.html'; });
        } else {
          global.location.href = target;
        }
      } else if (action === 'update') {
        // ⭐⭐ W10 — كان `silent: true` فلا تظهر النافذة أبداً: الضغط على إشعار
        //   التحديث كان يبدو كأنه "لا شيء يحدث". الآن نفتح النافذة صراحةً.
        if (global.MedAppUpdate) {
          Promise.resolve(global.MedAppUpdate.check({ silent: false }))
            .then(function (result) {
              if (result && result.updateAvailable) return;
              if (typeof global.showUpdateModal === 'function' && data.version) {
                global.showUpdateModal({
                  version: data.version,
                  notes: data.notes || '',
                  url: data.url || ''
                });
              }
            })
            .catch(function () {
              if (typeof global.showUpdateModal === 'function' && data.version) {
                global.showUpdateModal({
                  version: data.version,
                  notes: data.notes || '',
                  url: data.url || ''
                });
              }
            });
        }
      } else if (action === 'goals') {
        // ⭐ W10 — هدف «أهدافي» يفتح صفحة الأهداف مباشرة.
        global.location.href = 'goals.html';
      } else if (action === 'content' && !data.subject_id && !data.subject_slug) {
        global.location.href = 'all-files.html';
      } else {
        var explicit = safeInternalTarget(data && (data.url || data.target || data.path));
        global.location.href = explicit || 'index.html';
      }
    } catch (e) {
      console.warn('[native] the notification target failed:', e);
    }
  }

  /**
   * ⭐⭐ W10 — يوجّه رابط pre12:// إلى الوجهة الصحيحة.
   * يستعمل نفس منطق `widgets.js` حتى لا يختلف السلوك بين الإشعار والودجت.
   */
  function routePre12Link(url) {
    try {
      var match = String(url).match(/^pre12:\/\/([^\/?#]+)/i);
      if (!match) return false;
      var target = String(match[1] || '').toLowerCase();
      var here = (global.location.pathname || '').split('/').pop() || 'index.html';

      if (target === 'tasks' || target === 'today') {
        if (here === 'index.html') {
          setTimeout(function () {
            if (typeof global.openTodaySheet === 'function') global.openTodaySheet('today');
          }, 400);
        } else {
          global.location.href = 'index.html#tasks';
        }
        return true;
      }
      if (target === 'streak') {
        if (here === 'index.html') {
          setTimeout(function () {
            if (typeof global.openStreakSheet === 'function') global.openStreakSheet();
          }, 400);
        } else {
          global.location.href = 'index.html#streak';
        }
        return true;
      }
      if (target === 'notes') { global.location.href = 'notes.html'; return true; }
      if (target === 'goals') { global.location.href = 'goals.html'; return true; }
      if (target === 'lectures' || target === 'lecture') {
        global.location.href = 'my-lectures.html';
        return true;
      }
      if (target === 'content') { global.location.href = 'all-files.html'; return true; }
      if (target === 'updates' || target === 'update') {
        if (global.MedAppUpdate) global.MedAppUpdate.check({ silent: false });
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[native] the pre12 link failed:', e);
      return false;
    }
  }

  function routeNotification(payload) {
    try {
      // ⭐ v4.5.1 — TASK 4: شريط الإجراءات (تم الإنجاز / لاحقاً) قبل التنقّل.
      var payloadData = (payload && (payload.data || payload.extra)) || payload || {};

      // ⭐⭐ W10 — روابط pre12:// الموحّدة: المحرّك الذكي يرسل
      //   `url: 'pre12://tasks'` مع كل إشعار، فنعالجها بنفس محرّك الروابط
      //   العميقة (يصلح سواء كان التطبيق مفتوحاً أو أُطلق من الإشعار).
      var deepUrl = String(payloadData.url || payloadData.deep_link || '');
      if (deepUrl.indexOf('pre12://') === 0) {
        if (routePre12Link(deepUrl)) return;
      }

      if (showNotificationActionSheet(payloadData)) return;

      if (global.MedAppNotifications && typeof global.MedAppNotifications.routeNotificationAction === 'function') {
        var handled = global.MedAppNotifications.routeNotificationAction(payload);
        if (handled) return;
      }
      // ⭐ احتياطي: افتح الصفحة المطلوبة
      openNotificationTarget(payloadData);
    } catch (e) {
      console.warn('[native] the notification routing failed:', e);
    }
  }

  /**
   * ⭐⭐ يطبع رمز FCM عند بدء التطبيق — الخطوة الأولى في تشخيص
   *    "الإشعار لا يصل". يظهر في سجلّ الكونسول.
   */
  function logFcmTokenOnStartup() {
    try {
      var user = (typeof global.getAuthUser === 'function') ? global.getAuthUser() : null;
      if (!user || !user.id) {
        console.warn('[native] the FCM token: not logged in yet.');
        return;
      }
      if (typeof global.getProfile !== 'function') return;

      global.getProfile(user.id).then(function (profile) {
        var token = profile && profile.fcm_token;
        console.warn(
          '[native] the FCM token: ' +
          (token ? token : 'Token not found') +
          (token ? ' (' + token.slice(0, 28) + '…)' : ''),
        );
      }).catch(function (e) {
        console.warn('[native] the FCM token could not be read:', e);
      });
    } catch (e) {
      console.warn('[native] the FCM token check failed:', e);
    }
  }

  function navigateFromNotification(action) {
    var data = (action && (action.data || action.notification)) || {};
    var act = String(data.action || '').toLowerCase();

    // ⭐ v4.5.1 — إجراءات معروفة لها وجهتها الثابتة.
    if (act === 'notes') {
      try { global.location.href = 'notes.html'; } catch (e) {}
      return;
    }
    if (act === 'tasks' || act === 'streak') {
      try { global.location.href = 'index.html#' + act; } catch (e) {}
      return;
    }
    if (act === 'lectures') {
      try { global.location.href = 'my-lectures.html'; } catch (e) {}
      return;
    }

    var target = data.target || data.url || data.path || '';
    if (!target) target = 'index.html';
    if (target.indexOf('/') === 0) target = target.slice(1);
    if (!/^[\w./-]+\.html([?#].*)?$/.test(target)) target = 'index.html';
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
  /**
   * ⭐⭐⭐ v4.6.0 — TASK 1: «Cache Killer».
   *   المشكلة: ملفات JS قديمة تُقدَّم من كاش الـWebView أو الـService
   *   Worker، فتبقى أخطاء قديمة (مثل تجمّد حذف الحساب) بعد التحديث.
   *   الحل: نقارن إصدار التطبيق المثبَّت بالإصدار المخزَّن؛ وعند
   *   الاختلاف نُلغي كل Service Workers، ونمسح كل الكاش، ونمسح
   *   بيانات التطبيق (مع استثناء رموز الدخول)، ثم نعيد التحميل قسراً.
   */
  var CACHE_KILLER_KEY = 'app_version';
  // ⭐ مفاتيح لا نمسحها أبداً: جلسة Supabase (+ مفاتيح تدفّق الدخول)،
  //   وتفضيلات المستخدم (الثيم) وعلامة إتمام التعريف، ورمز FCM،
  //   وطابور المهام والملاحظات غير المزامنة (بيانات عمل لا كاش).
  var CACHE_KILLER_KEEP = new RegExp([
    'auth-token', 'auth_token', 'session',
    'pending_verification', 'medapp_pending_email',
    'medfav_onboarding_done', 'medfav_theme',
    'medapp_fcm_token',
    'medapp_task_progress_queue', 'medapp_task_progress_owner',
    'medfav_pending'
  ].join('|'), 'i');

  /** ⭐ الإصدار الحالي: من App.getInfo() أو من meta[name=app-version]. */
  function getCurrentAppVersion() {
    return new Promise(function (resolve) {
      var meta = '';
      try {
        var el = document.querySelector('meta[name="app-version"]');
        meta = el ? String(el.getAttribute('content') || '').trim() : '';
      } catch (e) {}

      if (!isNative) { resolve(meta); return; }

      try {
        var App = plugin('App');
        if (App && typeof App.getInfo === 'function') {
          Promise.resolve(App.getInfo()).then(function (info) {
            var version = info && (info.version || info.versionName);
            resolve(String(version || meta || '').trim());
          }).catch(function () { resolve(meta); });
          return;
        }
      } catch (e) {}

      resolve(meta);
    });
  }

  /** ⭐ يمسح localStorage ما عدا رموز الدخول والجلسة. */
  function clearStaleLocalStorage() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key) keys.push(key);
      }
      keys.forEach(function (key) {
        if (CACHE_KILLER_KEEP.test(key)) return;
        try { localStorage.removeItem(key); } catch (e) {}
      });
    } catch (e) {}
  }

  /**
   * ⭐ ينفّذ «Cache Killer» عند تغيّر الإصدار.
   * @returns {Promise<boolean>} true إذا تمّت التنظيف (وسيُعاد التحميل).
   */
  function runCacheKiller() {
    if (!isNative) return Promise.resolve(false);
    if (nativeState.cacheKillerRunning) return Promise.resolve(false);

    return getCurrentAppVersion().then(function (current) {
      if (!current) return false;

      var stored = null;
      try { stored = localStorage.getItem(CACHE_KILLER_KEY); } catch (e) {}

      if (stored === current) return false;

      var firstRun = !stored;
      try { localStorage.setItem(CACHE_KILLER_KEY, current); } catch (e) {}

      if (firstRun) {
        console.info('[native] the cache killer: first run — nothing to clean.');
        return false;
      }

      nativeState.cacheKillerRunning = true;
      console.warn('[native] the cache killer: ' + stored + ' → ' + current + ' — cleaning the old cache.');

      // 1) إلغاء كل Service Workers.
      var unregister = Promise.resolve();
      try {
        if (navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') {
          unregister = navigator.serviceWorker.getRegistrations().then(function (registrations) {
            return Promise.all((registrations || []).map(function (registration) {
              try { return registration.unregister(); } catch (e) { return null; }
            }));
          }).catch(function () {});
        }
      } catch (e) {}

      // 2) مسح كل الكاش.
      var clearCaches = Promise.resolve();
      try {
        if (global.caches && typeof global.caches.keys === 'function') {
          clearCaches = global.caches.keys().then(function (names) {
            return Promise.all((names || []).map(function (name) {
              try { return global.caches.delete(name); } catch (e) { return null; }
            }));
          }).catch(function () {});
        }
      } catch (e) {}

      return unregister.then(function () { return clearCaches; })
        .then(function () {
          // 3) مسح بيانات التطبيق (مع استثناء رموز الدخول).
          clearStaleLocalStorage();
          // 4) تثبيت الإصدار الجديد + إعادة تحميل قسرية.
          try { localStorage.setItem(CACHE_KILLER_KEY, current); } catch (e) {}
          try { global.location.reload(true); } catch (e) {
            try { global.location.reload(); } catch (e2) {}
          }
          return true;
        });
    }).catch(function (e) {
      console.warn('[native] the cache killer failed:', e);
      return false;
    });
  }

  function initNative() {
    nativeState.ready = true;

    // ⭐ v4.3.0 — استعادة آخر رمز محفوظ محلياً حتى لو لم يُطلق Firebase
    //   حدث registration في هذه الجلسة (تسجيل دخول لحساب قديم).
    nativeState.fcmToken = nativeState.fcmToken || cachedFcmToken();

    bindBackButton();
    bindNetwork();
    bindFirebase();
    bindDeepLinks();
    // ⭐ v4.5.0 — أنشئ قنوات الإشعارات المتنوّعة مبكراً.
    ensureNotificationChannels();
    bindNotificationRouting();
    // ⭐ v4.6.0 — TASK 1: «Cache Killer» — يُلغي الكاش القديم عند تغيّر الإصدار.
    runCacheKiller();

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

    // ⭐⭐ تشخيص: اطبع رمز FCM عند بدء التطبيق (أول خطوة في تشخيص الإشعارات)
    setTimeout(function () { logFcmTokenOnStartup(); }, 2500);

    // ⭐⭐⭐ TASK 6 — نضمن رمز FCM عند البدء (إن كان المستخدم مسجّلاً).
    //    التسلسل: الإذن → register() → 3 ثوانٍ → قراءة وحفظ الرمز.
    setTimeout(function () {
      try {
        var user = (typeof global.getAuthUser === 'function') ? global.getAuthUser() : null;
        if (!user || !user.id) return;
        ensureFcmToken().then(function (token) {
          if (token) return;
          // ⭐ احتياطي: محرّك الإشعارات يعرف كيف يقرأ الرمز أيضاً.
          if (global.MedAppNotifications && typeof global.MedAppNotifications.ensurePushToken === 'function') {
            global.MedAppNotifications.ensurePushToken();
          }
        });
      } catch (e) {}
    }, 4000);

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
        // ⭐⭐⭐ TASK 6 — بعد كل تسجيل دخول: أنشئ الرمز واحفظه في profiles
        setTimeout(function () { ensureFcmToken(); }, 1200);
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
    ensureFcmToken: ensureFcmToken,
    readAndSaveFcmToken: readAndSaveFcmToken,
    runCacheKiller: runCacheKiller,
    closeBrowser: closeNativeBrowser
  };
  global.closeNativeBrowser = closeNativeBrowser;
})(window);
