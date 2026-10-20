// ============================================================
// notifications.js — محرّك الإشعارات الذكي + أذونات الإشعارات
// ------------------------------------------------------------
// ⭐ Phase 15/16 — Universal Notification Engine
//
//  • أذونات الإشعارات (Android 13+) عبر @capacitor/push-notifications
//  • الإعداد البديل: فتح إعدادات التطبيق عبر capacitor-native-settings
//  • محرّك من 6 فئات، قوالب عربية ضخمة، اختيار عشوائي موزون
//  • جدولة محلية عبر @capacitor/local-notifications
//
// ⭐ يعمل على الويب بلا أثر — كل شيء يتحقق من Capacitor.isNativePlatform().
// ============================================================
(function (global) {
  'use strict';

  var STORAGE_KEY = 'medapp_notification_state_v1';
  var LAST_TEMPLATE_KEY = 'medapp_notification_last_v1';
  var PERMISSION_KEY = 'medapp_notification_permission_v1';

  /* ══════════════════════════════════════════════════════════
     1. الفئات الست — قوالب ضخمة (prompt26 Task 4)
     ══════════════════════════════════════════════════════════ */

  var CATEGORIES = [
    {
      id: 'onboarding',
      label: 'البداية والخطوات الأولى',
      weight: 2,
      titles: ['أهلاً بك في المنصة الطبية', 'رحلتك بدأت', 'خطوة أولى'],
      bodies: [
        'أهلاً بك يا {name} في المنصة الطبية! رحلتك تبدأ الآن 👨‍⚕️.',
        'خطوتك الأولى نحو التفوق بدأت. لنضع خطة اليوم!',
        'مرحباً {name}! سجّل أول مهمة لك ولنبدأ بناء سلسلتك 💪.',
        'معنا نتعلّم بانتظام: مهام صغيرة كل يوم = منافسة تفوز.',
        'خطوة اليوم: افتح أول مادة وابدأ مهمة واحدة فقط ✅.',
        'أنت الآن في بداية طريق التفوق — وكل يوم هنا يصنع الفرق 🎯.'
      ]
    },
    {
      id: 'agenda',
      label: 'المتابعة اليومية',
      weight: 5,
      titles: ['صباح الخير', 'مهام اليوم', 'لنبدأ', 'تذكير سريع', 'وقت الانطلاق'],
      bodies: [
        'صباح الخير يا {name} ☀️! لديك {task_count} مهام اليوم. لنبدأ بنشاط!',
        'يوم جديد، فرصة جديدة للتفوق. مهامك بانتظارك 📚.',
        'طالب الطب لا ينام على مهامه! ابدأ يومك الآن 💪.',
        'مر الوقت ولم تبدأ بعد! تذكّر هدفك، ابدأ بمهمة واحدة الآن ⏳.',
        'أنت في منتصف الطريق! أنجزت نصف المهام. واصل التقدم 🚀.',
        'رائع يا {name}! أكملت جميع مهام اليوم. أنت أسطورة 🏆.',
        'مهمة واحدة الآن تكفي لتُكمل يومك بنجاح — خلّينا نبدأ.',
        'جدولك جاهز: {task_count} مهام. أتمم واحدة منهم وابدأ.',
        'قاعدة اليوم: الأهم أولاً، ثم الباقي. ابدأ بالمهمة الأهم 🎯.'
      ]
    },
    {
      id: 'streak',
      label: 'حماية السلسلة',
      weight: 5,
      titles: ['حافظ على سلسلتك', 'سلسلتك في خطر!', 'يوم واحد يحميك', 'وسام الأسبوع'],
      bodies: [
        '🔥 انتبه! سلسلتك ({streak} أيام) في خطر. أنجز مهمة سريعة قبل منتصف الليل!',
        'لا تدع تعب اليوم يضيع إنجاز الأمس. مهمة واحدة تنقذ سلسلتك ⏰.',
        'سلسلتك {streak} أيام — لا تكسرها اليوم!',
        'غداً هو اليوم السابع! حافظ على حماسك لتحصل على شارة الأسبوع 🔥.',
        'يوم واحد يحمي سلسلة {streak} أيام. أنجز أي مهمة الآن.',
        'أنجزت {streak} يوماً متتالياً — هل تحطّمها اليوم؟ لا!',
        'السلسلة كنز: احمِ {streak} يوماً بتعبير بسيط اليوم 💎.'
      ]
    },
    {
      id: 'reengagement',
      label: 'إعادة التفاعل',
      weight: 4,
      titles: ['افتقدناك', 'أين أنت؟', 'عد إلينا', 'المكان ينتظرك'],
      bodies: [
        'افتقدناك اليوم يا {name}! لديك مهام تنتظرك 📖.',
        '👋 أين أنت يا {name}؟ زملاؤك يتقدمون، لا تتأخر. لديك {missed_count} مهام فائتة.',
        'هل تواجه صعوبة؟ تذكّر لماذا بدأت. نحن هنا لدعمك 🤝.',
        '🚀 {name}، عودتك ستصنع الفارق! لنعوّض ما فات معاً.',
        'النجاح ليس ألا تسقط، بل أن تنهض بعد السقوط. عد الآن!',
        'مهمة واحدة اليوم تكفي لعودة القاع. لنبدأ من جديد 🌱.',
        'المهمة اليوم أهم من الكمال — عودتك تكفي.'
      ]
    },
    {
      id: 'content',
      label: 'محتوى جديد',
      weight: 3,
      titles: ['محتوى جديد', 'محتوى جديد', 'ملف جديد بانتظارك'],
      bodies: [
        '📚 تمت إضافة ملخص/ملف جديد في مادة {subject}. كن أول من يطّلع عليه!',
        '🆕 محتوى جديد بانتظارك في {subject}. لا تفوّته!',
        'ملخص {subject} وصل حديثاً — خمس دقائق تكفي لتعرف الجديد.',
        'أضفنا مادة إلى {subject}. راجعها قبل أن تتراكم.'
      ]
    },
    {
      id: 'achievement',
      label: 'الإنجازات',
      weight: 2,
      titles: ['إنجاز جديد!', 'مبروك!', 'وسام جديد', 'أداء رائع'],
      bodies: [
        'أكملت {count} مهمة 🎉 استمر في هذا الإيقاع!',
        'ممتاز! {count} مهمة منجزة — كل واحدة تقرّبك من هدفك.',
        'رائع! عدد مهامك المنجزة وصل إلى {count}. استمدّ هذا الإنجاز!',
        'أنجزت {count} مهمة — الفارق بين طالب وطالب متفوق هو الاستمرارية.',
        'وسام جديد باسمك 🏅 — استمر، القمة أقرب مما تظن.'
      ]
    }
  ];

  /* ══════════════════════════════════════════════════════════
     2. مساعدات
     ══════════════════════════════════════════════════════════ */

  function plugin(name) {
    return (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins[name]) || null;
  }

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeState(patch) {
    try {
      var state = readState();
      Object.keys(patch || {}).forEach(function (key) { state[key] = patch[key]; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    } catch (e) {
      return {};
    }
  }

  function readLastTemplate() {
    try { return localStorage.getItem(LAST_TEMPLATE_KEY) || ''; } catch (e) { return ''; }
  }

  function writeLastTemplate(id) {
    try { localStorage.setItem(LAST_TEMPLATE_KEY, id); } catch (e) {}
  }

  function fill(template, state) {
    return String(template || '').replace(/\{(\w+)\}/g, function (match, key) {
      var value = state && state[key];
      return (value === undefined || value === null || value === '') ? '' : String(value);
    });
  }

  function firstName() {
    try {
      var user = null;
      if (typeof global.getAuthUser === 'function') user = global.getAuthUser();
      if (!user && global.MedAppAuthUser) user = global.MedAppAuthUser();
      if (user) {
        var meta = user.user_metadata || {};
        if (meta.full_name) return String(meta.full_name).split(' ')[0];
        if (meta.name) return String(meta.name).split(' ')[0];
        if (user.email) return String(user.email).split('@')[0];
      }
    } catch (e) {}
    return 'يا بطل';
  }

  /**
   * ⭐ يختار فئة + قالب عشوائي حسب حالة المستخدم.
   * @param {object} state {streak, completed, pending, task, subject, name}
   */
  function pick(state) {
    state = state || {};

    var pool = CATEGORIES.filter(function (category) {
      if (category.id === 'streak') return Number(state.streak || 0) > 0;
      if (category.id === 'achievement') return Number(state.completed || 0) >= 3;
      if (category.id === 'content') return !!state.subject;
      return true;
    });

    if (!pool.length) pool = [CATEGORIES[0]];

    var last = readLastTemplate();
    var totalWeight = 0;
    pool.forEach(function (category) { totalWeight += category.weight; });

    var roll = Math.random() * totalWeight;
    var chosen = pool[pool.length - 1];
    for (var i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { chosen = pool[i]; break; }
    }
    if (pool.length > 1 && chosen.id === last) {
      var alternatives = pool.filter(function (c) { return c.id !== last; });
      if (alternatives.length) chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    var bodies = chosen.bodies || [''];
    var index = Math.floor(Math.random() * bodies.length);
    var lastBody = readLastTemplate();
    if (bodies.length > 1 && bodies[index] === lastBody) {
      index = (index + 1) % bodies.length;
    }
    writeLastTemplate(bodies[index]);

    var title = chosen.titles[Math.floor(Math.random() * chosen.titles.length)];
    var payload = {};
    Object.keys(state).forEach(function (k) { payload[k] = state[k]; });
    payload.name = firstName();
    if (payload.count === undefined || payload.count === null) payload.count = payload.completed || 0;

    return {
      category: chosen.id,
      title: fill(title, payload),
      body: fill(bodies[index], payload)
    };
  }

  /* ══════════════════════════════════════════════════════════
     3. الأذونات (Android 13+)
     ══════════════════════════════════════════════════════════ */

  function emitPermission(state) {
    try {
      global.dispatchEvent(new CustomEvent('medapp:notification-permission', { detail: state }));
    } catch (e) {}
  }

  /**
   * ⭐ يطلب إذن الإشعارات ويتصرّف حسب النتيجة.
   * @returns {Promise<{granted:boolean, status:string, token?:string, reason?:string}>}
   */
  function requestNotificationPermission() {
    var PushNotifications = plugin('PushNotifications');

    if (!isNative()) {
      // على الويب: لا إذن نظام — نعتبرها "غير متاحة" بهدوء.
      return Promise.resolve({ granted: false, status: 'unsupported', reason: 'web' });
    }

    if (!PushNotifications || typeof PushNotifications.checkPermissions !== 'function') {
      return Promise.resolve({ granted: false, status: 'unavailable', reason: 'plugin-missing' });
    }

    ensureChannel();

    return Promise.resolve(PushNotifications.checkPermissions())
      .then(function (result) {
        var status = (result && (result.receive || result.status)) || 'prompt';

        if (status === 'granted') {
          return registerForPush().then(function (token) {
            var state = { granted: true, status: 'granted', token: token || '' };
            rememberPermission(state);
            emitPermission(state);
            return state;
          });
        }

        if (status === 'denied') {
          // ⭐ لا نعيد الطلب — نفتح إعدادات التطبيق بدلاً منه.
          var denied = { granted: false, status: 'denied', reason: 'blocked' };
          rememberPermission(denied);
          emitPermission(denied);
          return denied;
        }

        // 'prompt' → نطلب الآن
        return Promise.resolve(PushNotifications.requestPermissions())
          .then(function (result2) {
            var status2 = (result2 && (result2.receive || result2.status)) || 'denied';
            if (status2 === 'granted') {
              return registerForPush().then(function (token) {
                var state = { granted: true, status: 'granted', token: token || '' };
                rememberPermission(state);
                emitPermission(state);
                return state;
              });
            }
            var refused = { granted: false, status: 'denied', reason: 'refused' };
            rememberPermission(refused);
            emitPermission(refused);
            return refused;
          });
      })
      .catch(function (err) {
        console.warn('[notifications] permission request failed:', err);
        var failed = { granted: false, status: 'error', reason: String(err && err.message || err) };
        emitPermission(failed);
        return failed;
      });
  }

  /** ⭐ يسجّل الجهاز في FCM ويحفظ التوكن في Supabase */
  /**
   * ⭐⭐ يسجّل الجهاز في FCM ويحفظ التوكن في Supabase.
   *
   * ⭐⭐ الطريقة الصحيحة في @capacitor/push-notifications v8 هي
   *    `register()` — وليست `registerForPushNotifications()` (وهي
   *    غير موجودة) — ولهذا كان fcm_token يبقى NULL.
   *
   * ⭐⭐ المستمع على حدث 'registration' يُعرَّف **قبل** الاستدعاء.
   */
  var pushListenerAttached = false;
  var pushWaiters = [];

  /** ⭐ يُبلّغ كل المنتظرين عند وصول التوكن */
  function flushPushWaiters(token) {
    if (!token) return;
    var waiters = pushWaiters.splice(0, pushWaiters.length);
    for (var i = 0; i < waiters.length; i++) {
      try { waiters[i](token); } catch (e) {}
    }
  }

  /**
   * ⭐⭐ مُستمع واحد دائم لحدث 'registration'.
   *    الاستدعاءات المتكرّرة كانت تُنشئ مستمعين مكرّرين (تسجيل التوكن عدّة مرّات).
   */
  function attachPushListener() {
    if (pushListenerAttached) return;
    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications || typeof PushNotifications.addListener !== 'function') return;

    try {
      PushNotifications.addListener('registration', function (token) {
        var value = extractFcmToken(token);
        if (!isUsableFcmToken(value)) return;
        rememberFcmToken(value);
        console.info('[notifications] the FCM token arrived:', value.slice(0, 18) + '…');
        saveFcmToken(value);
        flushPushWaiters(value);
      });

      // ⭐⭐ Firebase قد يُنشئ الرمز بعد ثانية أو ثانيتين — ننتظر 3 ثوانٍ
      //    ثم نقرأ الرمز من جديد ونحفظه (حتى لا يبقى فارغاً).
      setTimeout(function () { readAndSavePushToken(); }, 3000);

      PushNotifications.addListener('registrationError', function (error) {
        console.warn('[notifications] the FCM registration failed:', error);
        flushPushWaiters('');
      });

      pushListenerAttached = true;
    } catch (e) {
      console.warn('[notifications] the registration listener could not be attached:', e);
    }
  }

  /**
   * ⭐⭐⭐ يضمن وجود رمز FCM صالح — يُستدعى بعد تسجيل الدخول
   *    وعند فتح التطبيق (لا نعتمد على المستخدم أن يفتح زر الاختبار).
   * @returns {Promise<string>} الرمز (أو نص فارغ)
   */
  function ensurePushToken() {
    if (!isNative()) return Promise.resolve('');
    attachPushListener();

    // ⭐⭐⭐ لا بدّ من طلب الإذن **قبل** التسجيل:
    //    بدون إذن الإشعارات (Android 13+) لا يُنشئ Firebase الرمز ✗
    //    فتبقى profiles.fcm_token فارغة ("Token not found").
    return requestNotificationPermission().then(function (permission) {
      if (!permission || !permission.granted) {
        console.warn('[notifications] the notification permission was not granted.');
        return '';
      }
      return registerForPush();
    });
  }


  function registerForPush() {
    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications) {
      console.warn('[notifications] the PushNotifications plugin is not available');
      return Promise.resolve('');
    }

    // ⭐ بعض الإصدارات استخدمت اسماً آخر
    var register = null;
    if (typeof PushNotifications.register === 'function') {
      register = PushNotifications.register.bind(PushNotifications);
    } else if (typeof PushNotifications.registerForPushNotifications === 'function') {
      register = PushNotifications.registerForPushNotifications.bind(PushNotifications);
    }
    if (!register) {
      console.warn('[notifications] the plugin has no register() method');
      return Promise.resolve('');
    }

    return new Promise(function (resolve) {
      var settled = false;

      function done(token) {
        if (settled) return;
        settled = true;
        if (token) {
          saveFcmToken(token);
        }
        resolve(token || '');
      }

      // ⭐⭐ 1) ننتظر حدث 'registration' (المُستمع مُثبَّت مسبقاً مرة واحدة)
      attachPushListener();
      pushWaiters.push(done);

      // ⭐⭐ 2) ثم الاستدعاء
      try {
        var result = register();
        if (result && typeof result.then === 'function') {
          result.catch(function (e) {
            console.warn('[notifications] the registration call failed:', e);
            done('');
          });
        }
      } catch (e) {
        console.warn('[notifications] the registration threw:', e);
        done('');
      }

      // ⭐ حماية: لا ننتظر طويلاً لو لم يصل التوكن
      setTimeout(function () { done(''); }, 10000);
    });
  }

  var FCM_TOKEN_KEY = 'medapp_fcm_token';

  function rememberFcmToken(token) {
    if (!token) return;
    try { localStorage.setItem(FCM_TOKEN_KEY, String(token)); } catch (e) {}
  }

  /**
   * ⭐ v4.4.0 — { token }, { value }, or a nested object → the real string.
   * Never fall back to String(object): that stored "[object Object]".
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

  function isUsableFcmToken(token) {
    token = String(token || '');
    return token.length >= 20 &&
      token.length <= 4096 &&
      token.indexOf('[object') === -1 &&
      !/\s/.test(token);
  }

  /** ⭐ يحفظ توكن الإشعارات في جدول profiles — update فقط (RLS آمن) */
  function saveFcmToken(token) {
    token = extractFcmToken(token);
    if (!isUsableFcmToken(token)) {
      console.warn('[notifications] ignored an invalid FCM token shape.');
      return Promise.resolve(false);
    }
    rememberFcmToken(token);
    // ⭐ v4.3.0 — the client is exposed on window by supabase-config.js.
    var client = global.supabaseClient ||
      (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client || !client.from) {
      console.warn('[notifications] the Supabase client is not ready yet.');
      return Promise.resolve(false);
    }

    function userId() {
      try {
        if (typeof global.getAuthUser === 'function') {
          var user = global.getAuthUser();
          if (user && user.id) return Promise.resolve(user.id);
        }
      } catch (e) {}
      if (!client.auth || typeof client.auth.getUser !== 'function') return Promise.resolve('');
      try {
        return client.auth.getUser()
          .then(function (r) { return (r && r.data && r.data.user && r.data.user.id) || ''; })
          .catch(function () { return ''; });
      } catch (e) {
        return Promise.resolve('');
      }
    }

    return userId().then(function (id) {
      if (!id) return false;
      return client.from('profiles')
        .update({ fcm_token: token })
        .eq('id', id)
        .select('id')
        .then(function (result) {
          if (result && result.error) {
            console.warn('[notifications] could not save the token:', result.error.message);
            return false;
          }
          var rows = (result && result.data) || [];
          if (rows.length) {
            console.info(
              '[notifications] the FCM token saved:',
              String(token).slice(0, 18) + '…'
            );
            return true;
          }

          // ⭐ v4.3.0 — لا upsert من العميل: إنشاء الصفّ مسؤولية
          //   trigger handle_new_user. الـ upsert كان يصطدم بسياسة INSERT
          //   غير الموجودة فيسجّل "new row violates row-level security policy".
          console.warn('[notifications] no profile row matched — will retry after auth.');
          return false;
        })
        .catch(function (e) {
          console.warn('[notifications] token save failed:', e);
          return false;
        });
    });
  }

  function rememberPermission(state) {
    try {
      localStorage.setItem(PERMISSION_KEY, JSON.stringify({
        status: state.status,
        at: Date.now()
      }));
    } catch (e) {}
  }

  /** ⭐ حالة الإذن المحفوظة (لعرض المفتاح في الإعدادات) */
  function getStoredPermission() {
    try {
      var raw = localStorage.getItem(PERMISSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * ⭐ الحالة الحالية للإذن — 'granted' | 'denied' | 'prompt' | 'unsupported'
   */
  function getPermissionStatus() {
    var PushNotifications = plugin('PushNotifications');
    if (!isNative()) return Promise.resolve('unsupported');
    if (!PushNotifications || typeof PushNotifications.checkPermissions !== 'function') {
      return Promise.resolve('unavailable');
    }
    return Promise.resolve(PushNotifications.checkPermissions())
      .then(function (result) {
        return (result && (result.receive || result.status)) || 'prompt';
      })
      .catch(function () { return 'unknown'; });
  }

  /**
   * ⭐ الوضع البديل: فتح إعدادات التطبيق في الهاتف.
   */
  function openAppSettings() {
    var NativeSettings = plugin('NativeSettings');
    if (NativeSettings && typeof NativeSettings.openAndroid === 'function') {
      try {
        var result = NativeSettings.openAndroid({ option: 'app' });
        if (result && typeof result.then === 'function') {
          return result.then(function () { return true; }).catch(function () { return false; });
        }
        return Promise.resolve(true);
      } catch (e) {}
    }
    // ⭐ بديل عند غياب الإضافة
    try {
      if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App) {
        global.Capacitor.Plugins.App.openUrl({ url: 'app-settings:' });
        return Promise.resolve(true);
      }
    } catch (e) {}
    return Promise.resolve(false);
  }

  /* ══════════════════════════════════════════════════════════
     4. الجدولة المحلية
     ══════════════════════════════════════════════════════════ */

  /**
   * ⭐ v4.5.0 — عائلة قنوات الإشعارات (TASK 3).
   *   كل قناة لها هوية وصوت مختلفان حتى يفهم المستخدم نوع الإشعار
   *   من دون فتحه: السلسلة، المهام، المحتوى، التحديثات.
   */
  var NOTIFICATION_CHANNELS = [
    {
      id: 'medapp_reminders',
      name: 'تذكيرات المنصة',
      description: 'تذكيرات عامة من المنصة الطبية',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#10b981',
    },
    {
      id: 'medapp_streak',
      name: 'سلسلة الدراسة',
      description: 'تنبيهات حماية سلسلة الأيام المتتالية',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#f59e0b',
    },
    {
      id: 'medapp_tasks',
      name: 'المهام اليومية',
      description: 'تذكير بالمهام وجدول اليوم',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#10b981',
    },
    {
      id: 'medapp_content',
      name: 'محتوى جديد',
      description: 'ملخصات وملفات جديدة في المواد',
      importance: 3,
      visibility: 1,
      vibration: false,
      lights: false,
    },
    {
      id: 'medapp_updates',
      name: 'تحديثات التطبيق',
      description: 'إصدارات جديدة وإعلانات مهمة',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#3b82f6',
    },
  ];

  /**
   * ⭐ v4.5.0 — ينشئ كل القنوات مرّة واحدة. إنشاء القناة آمن ومتكرّر
   *   (Android يتجاهل الطلب إذا كانت القناة موجودة مسبقاً).
   * @returns {Promise<boolean>} true إذا أصبحت كل القنوات جاهزة.
   */
  function ensureChannels() {
    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.createChannel !== 'function') {
      return Promise.resolve(false);
    }

    var jobs = NOTIFICATION_CHANNELS.map(function (config) {
      var channel = Object.assign({}, config);

      // ⭐ Capacitor interprets `sound` as a res/raw resource name, so
      //   the literal "default" would point at a missing file. Omitting
      //   the key lets Android use the system default notification sound.
      if (channel.sound === 'default') delete channel.sound;

      try {
        var result = LocalNotifications.createChannel(channel);
        if (result && typeof result.then === 'function') {
          return result.then(function () { return true; }).catch(function (e) {
            console.warn('[notifications] could not create the channel ' + channel.id + ':', e);
            return false;
          });
        }
        return Promise.resolve(true);
      } catch (e) {
        console.warn('[notifications] could not create the channel ' + channel.id + ':', e);
        return Promise.resolve(false);
      }
    });

    return Promise.all(jobs).then(function (results) {
      return results.every(Boolean);
    });
  }

  /** ⭐ توافق خلفي: الاسم القديم يشير إلى إنشاء كل القنوات. */
  function ensureChannel() {
    return ensureChannels();
  }

  /**
   * ⭐ يجدول إشعاراً محلياً (في التطبيق) — صامت بلا أثر على الويب.
   */
  function schedule(state, delayMinutes) {
    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') {
      return Promise.resolve(null);
    }

    ensureChannel();

    var message = pick(state);
    var delay = Math.max(1, delayMinutes || 60) * 60 * 1000;

    try {
      if (typeof LocalNotifications.requestPermissions === 'function') {
        LocalNotifications.requestPermissions();
      }
    } catch (e) {}

    var id = Math.floor(Date.now() / 1000) % 2147483647;

    return LocalNotifications.schedule({
      notifications: [{
        id: id,
        title: message.title,
        body: message.body,
        smallIcon: 'ic_stat_icon',
        channelId: 'medapp_tasks',
        sound: 'default',
        schedule: { at: new Date(Date.now() + delay) },
        extra: { category: message.category }
      }]
    }).then(function () {
      writeState({ lastCategory: message.category, lastScheduledAt: Date.now() });
      return message;
    }).catch(function (err) {
      console.warn('[notifications] could not schedule:', err);
      return null;
    });
  }

  /**
   * ⭐ TASK 4 (v4.3.0) — إشعار محلي اختباري بعد `seconds` ثانية.
   *    يُستخدم من قسم التشخيص للتأكد من أن @capacitor/local-notifications
   *    يعمل فعلياً على الجهاز (بدون انتظار الساعة 8 مساءً).
   * @returns {Promise<{ok:boolean,id?:number,at?:string,error?:string}>}
   */
  function scheduleTest(seconds) {
    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') {
      return Promise.resolve({
        ok: false,
        error: 'الإشعارات المحلية غير متاحة في هذا البناء'
      });
    }

    var wait = Math.max(1, Number(seconds) || 10);
    ensureChannel();

    return Promise.resolve(
      typeof LocalNotifications.requestPermissions === 'function'
        ? LocalNotifications.requestPermissions()
        : null
    )
      .then(function (perm) {
        var status = perm && (perm.display || perm.receive || perm.status);
        if (status && status !== 'granted') {
          return { ok: false, error: 'إذن الإشعارات غير ممنوح (' + status + ')' };
        }

        var id = Math.floor(Date.now() / 1000) % 2147483647;
        var at = new Date(Date.now() + wait * 1000);

        return Promise.resolve(LocalNotifications.schedule({
          notifications: [{
            id: id,
            title: '⏰ اختبار التذكير المحلي',
            body: 'إذا وصلتك هذه الرسالة فالتذكير المحلي يعمل — بعد ' + wait + ' ثوانٍ.',
            smallIcon: 'ic_stat_icon',
            channelId: 'medapp_tasks',
            sound: 'default',
            schedule: { at: at },
            extra: { action: 'tasks', test: 'local' }
          }]
        }))
          .then(function () {
            return { ok: true, id: id, at: at.toISOString() };
          })
          .catch(function (err) {
            return { ok: false, error: String((err && (err.message || err)) || err) };
          });
      })
      .catch(function (err) {
        return { ok: false, error: String((err && (err.message || err)) || err) };
      });
  }

  /**
   * ⭐ يجمع حالة المستخدم لاختيار الرسالة المناسبة.
   */
  function collectState() {
    var state = { streak: 0, completed: 0, pending: 0, task: '', subject: '' };

    try {
      if (typeof global.getStudyStreak === 'function') {
        var streak = global.getStudyStreak();
        if (streak && typeof streak.then === 'function') {
          return streak.then(function (data) {
            state.streak = (data && data.current) || 0;
            state.completed = (data && data.tasksCompleted) || 0;
            return state;
          }).catch(function () { return state; });
        }
        if (streak) {
          state.streak = streak.current || 0;
          state.completed = streak.tasksCompleted || 0;
        }
      }
    } catch (e) {}

    return Promise.resolve(state);
  }

  /** ⭐ يقرأ الخطة ليعرف مهمة اليوم والمهام المعلّقة */
  function loadPlan() {
    if (typeof global.fetchPlanData !== 'function') return Promise.resolve(null);
    try {
      return global.fetchPlanData().catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /**
   * ⭐ يجمع كل الحالة ثم يجدول إشعاراً مناسباً.
   */
  function init(options) {
    if (!isNative()) return Promise.resolve(null);
    options = options || {};

    // ⭐ v4.4.1 — أنشئ قناة heads-up فوراً عند الإقلاع، حتى تصل
    //   إشعارات FCM قبل أن يفتح المستخدم أي شاشة إشعارات.
    ensureChannel();

    // ⭐ نعيد جدولة التذكير اليومي عند كل إقلاع
    try { restoreDailyReminder(); } catch (e) {}

    return Promise.all([collectState(), loadPlan()]).then(function (results) {
      var state = results[0] || {};
      var plan = results[1];

      if (plan) {
        var today = todayKey();
        var todayTasks = Array.isArray(plan[today]) ? plan[today] : [];
        var pending = 0;
        Object.keys(plan).forEach(function (date) {
          if (date >= today) return;
          (plan[date] || []).forEach(function (task) {
            if (task && (task.id || task.task)) pending++;
          });
        });
        state.pending = pending;
        if (todayTasks.length) {
          var task = todayTasks[0];
          state.task = task.task || task.title || '';
          state.subject = task.subject || task.subject_name || '';
        }
      }

      // ⭐ لا نُزعج المستخدم: إشعار واحد كل 6 ساعات على الأكثر.
      var last = readState();
      var hoursSince = (Date.now() - (last.lastScheduledAt || 0)) / 3600000;
      if (hoursSince < 6) return null;

      return schedule(state, options.delayMinutes || 120);
    }).catch(function (err) {
      console.warn('[notifications] init failed:', err);
      return null;
    });
  }

  /* ══════════════════════════════════════════════════════════
     ⭐ التذكير اليومي الثابت (8 مساءً) + التوجيه الذكي
     ══════════════════════════════════════════════════════════ */

  var DAILY_REMINDER_ID = 9001;
  var DAILY_REMINDER_HOUR = 20;     // 8 مساءً
  var DAILY_REMINDER_KEY = 'medapp_daily_reminder_v1';

  /** ⭐ هل التذكير اليومي مفعّل؟ */
  function isDailyReminderEnabled() {
    try {
      return localStorage.getItem(DAILY_REMINDER_KEY) !== '0';
    } catch (e) {
      return true;
    }
  }

  /**
   * ⭐⭐ يجدول التذكير اليومي (8 مساءً) أو يلغيه.
   * @param {boolean} enabled
   */
  function scheduleDailyReminder(enabled) {
    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') {
      return Promise.resolve(false);
    }

    try {
      localStorage.setItem(DAILY_REMINDER_KEY, enabled ? '1' : '0');
    } catch (e) {}

    // ⭐ نلغي التذكير القديم أولاً
    try {
      if (typeof LocalNotifications.cancel === 'function') {
        LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
      }
    } catch (e) {}

    if (!enabled) return Promise.resolve(true);

    ensureChannel();

    return LocalNotifications.schedule({
      notifications: [{
        id: DAILY_REMINDER_ID,
        title: '📚 مراجعة يومية',
        body: '📚 لا تنسَ مراجعة مهامك اليومية. أنت تستطيع!',
        smallIcon: 'ic_stat_icon',
        channelId: 'medapp_tasks',
        sound: 'default',
        schedule: { on: { hour: DAILY_REMINDER_HOUR, minute: 0 }, every: 'day' },
        extra: { action: 'tasks' }
      }]
    }).then(function () {
      writeState({ dailyReminder: true, dailyReminderAt: DAILY_REMINDER_HOUR });
      return true;
    }).catch(function (err) {
      console.warn('[notifications] the daily reminder could not be scheduled:', err);
      return false;
    });
  }

  /** ⭐ يستعيد جدولة التذكير عند بدء التطبيق */
  function restoreDailyReminder() {
    if (!isDailyReminderEnabled()) return Promise.resolve(false);
    return scheduleDailyReminder(true);
  }

  /**
   * ⭐⭐ التوجيه الذكي — أيقونة الإشعار تحدّد ما يُفتح:
   *   update  → نافذة التحديث
   *   tasks   → مهام اليوم
   *   streak  → ورقة السلسلة
   *   lectures → محاضراتي
   */
  /** ⭐ v4.5.0 — هدف داخلي آمن فقط. */
  function safeInternalTarget(target) {
    var value = String(target || '').trim();
    if (!value) return '';
    if (value.charAt(0) === '/') value = value.slice(1);
    if (!/^(index|subject|viewer|my-lectures|goals|gpa|notes|plans|progress|about|settings)\.html(\?[^#]*)?$/i.test(value)) {
      return '';
    }
    return value;
  }

  /** ⭐ v4.5.0 — يبني هدف إشعار المحتوى. */
  function contentTarget(data) {
    var explicit = safeInternalTarget(data && (data.url || data.target || data.path));
    if (explicit) return explicit;

    var subjectSlug = data && (data.subject_slug || data.subjectSlug);
    if (subjectSlug) return 'subject.html?subject=' + encodeURIComponent(String(subjectSlug));

    var subjectId = data && (data.subject_id || data.subjectId);
    if (subjectId && global.supabaseClient) return 'subject-id:' + String(subjectId);

    var fileId = data && (data.file_id || data.fileId);
    if (fileId) return 'viewer.html?id=' + encodeURIComponent(String(fileId));

    return 'index.html';
  }

  function routeNotificationAction(payload) {
    var data = payload || {};
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { data = { action: data }; }
    }
    // ⭐ v4.5.0 — بعض الإضافات تمرّر الحمولة داخل data.
    if (data && data.data && typeof data.data === 'object') data = data.data;

    var action = String(data.action || data.target || '').toLowerCase();

    if (!action) return false;

    if (action === 'update') {
      // ⭐ TASK 3: نجلب أحدث إصدار من GitHub API دائماً (رابط APK ديناميكي)
      if (global.MedAppUpdate && typeof global.MedAppUpdate.check === 'function') {
        Promise.resolve(global.MedAppUpdate.check({ silent: true })).catch(function () {
          if (typeof global.showUpdateModal === 'function' && data.version) {
            global.showUpdateModal({
              version: data.version,
              notes: data.notes || '',
              url: ''
            });
          }
        });
      } else if (typeof global.showUpdateModal === 'function' && data.version) {
        global.showUpdateModal({ version: data.version, notes: data.notes || '', url: '' });
      }
      return true;
    }

    if (action === 'tasks') {
      try { global.location.href = 'index.html#tasks'; } catch (e) {}
      return true;
    }

    if (action === 'streak') {
      try { global.location.href = 'index.html#streak'; } catch (e) {}
      return true;
    }

    if (action === 'lectures') {
      try { global.location.href = 'my-lectures.html'; } catch (e) {}
      return true;
    }

    if (action === 'content') {
      var target = contentTarget(data);
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
        try { global.location.href = target; } catch (e) {}
      }
      return true;
    }

    return false;
  }

  /**
   * ⭐⭐ يقرأ رمز FCM من الجهاز (إن وُجد) ويحفظه في Supabase.
   *    يُستدعى بعد 3 ثوانٍ من التسجيل لأن Firebase قد يتأخّر.
   */
  function readAndSavePushToken() {
    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications || typeof PushNotifications.getToken !== 'function') return Promise.resolve('');

    return Promise.resolve(PushNotifications.getToken())
      .then(function (result) {
        var value = extractFcmToken(result);
        if (!isUsableFcmToken(value)) {
          console.warn('[notifications] the device still has no FCM token.');
          return '';
        }
        console.info('[notifications] the FCM token saved:', value.slice(0, 18) + '…');
        return saveFcmToken(value).then(function () { return value; });
      })
      .catch(function (e) {
        console.warn('[notifications] the token could not be read:', e);
        return '';
      });
  }

  /**
   * ⭐⭐ يجدّد رمز الإشعارات يدوياً (زر في الإعدادات) — يُرجع
   *    { ok, token, error }.
   */
  function refreshPushToken() {
    var PushNotifications = plugin('PushNotifications');
    if (!PushNotifications) {
      return Promise.resolve({ ok: false, error: 'الإضافة غير متاحة في هذا التطبيق' });
    }

    return registerForPush().then(function (token) {
      if (token) return { ok: true, token: token };
      return { ok: false, error: 'لم يصل الرمز — تحقّق من الإذن ومن الاتصال بالإنترنت' };
    });
  }

  global.MedAppNotifications = {
    CATEGORIES: CATEGORIES,
    pick: pick,
    schedule: schedule,
    scheduleTest: scheduleTest,
    init: init,
    collectState: collectState,
    requestNotificationPermission: requestNotificationPermission,
    getPermissionStatus: getPermissionStatus,
    getStoredPermission: getStoredPermission,
    openAppSettings: openAppSettings,
    refreshPushToken: refreshPushToken,
    ensurePushToken: ensurePushToken,
    ensureChannel: ensureChannel,
    ensureChannels: ensureChannels,
    readAndSavePushToken: readAndSavePushToken,
    attachPushListener: attachPushListener,
    scheduleDailyReminder: scheduleDailyReminder,
    isDailyReminderEnabled: isDailyReminderEnabled,
    restoreDailyReminder: restoreDailyReminder,
    routeNotificationAction: routeNotificationAction,
    DAILY_REMINDER_ID: DAILY_REMINDER_ID,
    saveFcmToken: saveFcmToken,
    readState: readState
  };
})(window);
