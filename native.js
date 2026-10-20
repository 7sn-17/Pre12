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
    tokenAlerted: false,
    pushListenerBound: false,
    authTokenListenerBound: false,
    lastFcmAlert: '',
    lastNotificationTap: null,
    permissionRequested: false,
    notificationPermission: null
  };

  /**
   * ⭐⭐⭐ TASK 4 — تشخيص FCM مرئي على الشاشة.
   * alert() حتى يرى المستخدم الخطأ الحقيقي من Firebase بدل الاكتفاء
   * بسجلّ logcat. نمنع تكرار نفس الرسالة مرّتين متتاليتين فقط
   * (بعض الأحداث تُطلق أكثر من مرّة لنفس السبب).
   */
  function showFcmDebugAlert(message) {
    var text = String(message == null ? '' : message);
    if (!text || nativeState.lastFcmAlert === text) return;
    nativeState.lastFcmAlert = text;
    try {
      if (typeof global.alert === 'function') global.alert(text);
    } catch (e) {
      console.warn('[native] the FCM alert could not be shown:', e);
    }
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
    return global.supabaseClient || null;
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
   * ⭐ TASK 1 — حفظ الرمز مع إعادة محاولة تلقائية.
   * الرمز قد يصل قبل اكتمال تسجيل الدخول (خصوصاً عند الإقلاع)،
   * فنحتفظ به ونعيد المحاولة كل ثانيتين حتى تُستعاد الجلسة.
   */
  function queueFcmTokenSave(token, attempt) {
    token = String(token || '');
    if (!token) return Promise.resolve(false);

    nativeState.pendingFcmToken = token;
    attempt = Number(attempt) || 0;

    return saveFcmToken(token).then(function (saved) {
      // ⭐ وصل رمز أحدث؟ نتوقّف عن محاولة القديم.
      if (nativeState.fcmToken && nativeState.fcmToken !== token) return false;
      if (saved) {
        nativeState.pendingFcmToken = '';
        return true;
      }
      if (attempt >= 8) {
        console.warn('[native] the FCM token is still unsaved after retries.');
        return false;
      }
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(queueFcmTokenSave(token, attempt + 1));
        }, 2000);
      });
    });
  }

  /**
   * ⭐ TASK 1 — عندما تُستعاد الجلسة (SIGNED_IN / TOKEN_REFRESHED)
   *    نحفظ الرمز المعلّق فوراً بدل انتظار المحاولة التالية.
   */
  function bindAuthTokenSave() {
    if (nativeState.authTokenListenerBound) return;
    var client = supabaseClientRef();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== 'function') return;
    nativeState.authTokenListenerBound = true;

    try {
      client.auth.onAuthStateChange(function (event, session) {
        var token = nativeState.pendingFcmToken || nativeState.fcmToken;
        if (!token) return;
        if (session && session.user && session.user.id) {
          console.info('[native] auth is ready (' + event + ') — saving the FCM token.');
          queueFcmTokenSave(token, 0);
        }
      });
    } catch (e) {
      nativeState.authTokenListenerBound = false;
      console.warn('[native] the auth listener for FCM could not be attached:', e);
    }
  }

  /**
   * ⭐ حفظ توكن FCM في جدول profiles حتى تصل الإشعارات لكل جهاز.
   * (update على صفّ المستخدم ثم upsert احتياطي إن لم يوجد الصفّ)
   */
  function saveFcmToken(token) {
    if (!token) return Promise.resolve(false);
    var client = supabaseClientRef();
    if (!client || !client.from) return Promise.resolve(false);

    return Promise.resolve(currentUserId()).then(function (userId) {
      if (!userId) {
        console.warn('[native] the FCM token was not saved: no signed-in user yet.');
        return false;
      }
      // ⭐⭐ التحديث المطلوب حرفياً: profiles.fcm_token للمستخدم الحالي
      return Promise.resolve(
        client.from('profiles').update({ fcm_token: token }).eq('id', userId).select('id')
      )
        .then(function (result) {
          if (result && result.error) {
            // ⭐ TASK 1: كامل تفاصيل الخطأ (RLS مثلاً) على الشاشة
            showFcmDebugAlert('FCM Save Error: ' + JSON.stringify(result.error));
            console.warn('[native] could not save the FCM token:', result.error);
            return false;
          }
          if (((result && result.data) || []).length) return true;

          // ⭐ لا صفّ في profiles؟ نُنشئه.
          return Promise.resolve(
            client.from('profiles').upsert({ id: userId, fcm_token: token }, { onConflict: 'id' })
          )
            .then(function (up) {
              if (up && up.error) {
                showFcmDebugAlert('FCM Save Error: ' + JSON.stringify(up.error));
                console.warn('[native] the token upsert failed:', up.error);
                return false;
              }
              return true;
            });
        })
        .catch(function (e) {
          showFcmDebugAlert(
            'FCM Save Error: ' +
            JSON.stringify(String(e && e.message ? e.message : e))
          );
          console.warn('[native] FCM token save failed:', e);
          return false;
        });
    });
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
        var value = (token && token.value) || token || '';
        if (!value) return;
        // ⭐ TASK 1: التنبيه مرّة واحدة فقط في الجلسة
        if (!nativeState.tokenAlerted) {
          nativeState.tokenAlerted = true;
          showFcmDebugAlert('Token Received: ' + value);
        }
        nativeState.fcmToken = String(value);
        console.info('[native] the FCM token arrived:', nativeState.fcmToken.slice(0, 24) + '…');
        // ⭐ نحفظ الآن، ونعيد المحاولة إن لم تكن الجلسة جاهزة بعد
        bindAuthTokenSave();
        queueFcmTokenSave(nativeState.fcmToken);
      });

      PushNotifications.addListener('registrationError', function (error) {
        // ⭐ TASK 4: الخطأ الحقيقي من Firebase مرئي — لا logcat فقط
        showFcmDebugAlert('FCM Error: ' + JSON.stringify(error));
        console.warn('[native] the FCM registration failed:', error);
      });
    } catch (e) {
      showFcmDebugAlert('FCM Error: ' + JSON.stringify(String(e && e.message ? e.message : e)));
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
        var value = (result && result.value) || result || '';
        if (!value) return nativeState.fcmToken || '';
        nativeState.fcmToken = String(value);
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

    // ⭐ TASK 1: إن كان لدينا رمز معلّق من محاولة سابقة، احفظه أولاً
    if (nativeState.pendingFcmToken) {
      queueFcmTokenSave(nativeState.pendingFcmToken, 0);
    }

    if (!PushNotifications || typeof PushNotifications.register !== 'function') {
      console.warn('[native] the PushNotifications plugin is not available');
      return readAndSaveFcmToken();
    }

    // 1) الإذن أوّلاً
    return Promise.resolve(PushNotifications.requestPermissions())
      .then(function (perm) {
        if (!perm || perm.receive !== 'granted') {
          // ⭐ TASK 4: فشل الإذن مرئي أيضاً
          showFcmDebugAlert('FCM Permission: ' + JSON.stringify(perm || {}));
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
            showFcmDebugAlert('FCM Register Error: ' + JSON.stringify(String(e && e.message ? e.message : e)));
            console.warn('[native] the FCM registration call failed:', e);
            return '';
          });
      })
      .catch(function (e) {
        showFcmDebugAlert('FCM Permission Error: ' + JSON.stringify(String(e && e.message ? e.message : e)));
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
          var value = (token && token.value) || token || '';
          if (!value) return;
          nativeState.fcmToken = String(value);
          bindAuthTokenSave();
          queueFcmTokenSave(nativeState.fcmToken);
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
        Messaging.getToken().then(function (result) {
          var value = (result && result.value) || result || '';
          if (!value) return;
          nativeState.fcmToken = String(value);
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
   *   update · tasks · streak · lectures
   */
  function bindNotificationRouting() {
    if (!isNative) return;

    var LocalNotifications = plugin('LocalNotifications');
    if (LocalNotifications && typeof LocalNotifications.addListener === 'function') {
      try {
        LocalNotifications.addListener('localNotificationActionPerformed', function (event) {
          var payload = (event && event.notification) || event || {};
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
          routeNotification(payload);
        });
      } catch (e) {}
    }
  }

  function routeNotification(payload) {
    try {
      if (global.MedAppNotifications && typeof global.MedAppNotifications.routeNotificationAction === 'function') {
        var handled = global.MedAppNotifications.routeNotificationAction(payload);
        if (handled) return;
      }
      // ⭐ احتياطي: افتح الصفحة المطلوبة
      var data = (payload && payload.data) || payload || {};
      var action = String(data.action || '').toLowerCase();
      if (action === 'tasks' || action === 'streak') {
        global.location.href = 'index.html#' + action;
      } else if (action === 'lectures') {
        global.location.href = 'my-lectures.html';
      } else if (action === 'update') {
        if (global.MedAppUpdate) global.MedAppUpdate.check({ silent: true });
      }
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
    bindNotificationRouting();

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
    closeBrowser: closeNativeBrowser
  };
  global.closeNativeBrowser = closeNativeBrowser;
})(window);
