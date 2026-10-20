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

      // ⭐⭐ 1) المستمع أولاً — ثم الاستدعاء
      try {
        if (typeof PushNotifications.addListener === 'function') {
          PushNotifications.addListener('registration', function (token) {
            var value = (token && token.value) || token || '';
            console.log('[notifications] the FCM token arrived:', String(value).slice(0, 18) + '…');
            done(value);
          });

          PushNotifications.addListener('registrationError', function (error) {
            console.warn('[notifications] the FCM registration failed:', error);
            done('');
          });
        }
      } catch (e) {
        console.warn('[notifications] could not attach the registration listener:', e);
      }

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

  /** ⭐ يحفظ توكن الإشعارات في جدول profiles */
  function saveFcmToken(token) {
    if (!token) return Promise.resolve(false);
    var client = global.supabaseClient;
    if (!client || !client.from) return Promise.resolve(false);

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
          if (rows.length) return true;

          // ⭐ لا صفّ في profiles؟ نُنشئه (upsert)
          return client.from('profiles')
            .upsert({ id: id, fcm_token: token }, { onConflict: 'id' })
            .then(function (up) {
              if (up && up.error) {
                console.warn('[notifications] the token upsert failed:', up.error.message);
                return false;
              }
              return true;
            });
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
   * ⭐ ينشئ قناة الإشعارات ("medapp_reminders") — بدونها تُسقط الإشعارات
   *   على أندرويد 8+ إذا لم تكن موجودة.
   */
  function ensureChannel() {
    var LocalNotifications = plugin('LocalNotifications');
    if (!LocalNotifications || typeof LocalNotifications.createChannel !== 'function') return;
    try {
      LocalNotifications.createChannel({
        id: 'medapp_reminders',
        name: 'تذكيرات المنصة',
        description: 'تذكير بالمهام وحماية سلسلة الدراسة',
        importance: 4,
        visibility: 1,
        vibration: true,
      });
    } catch (e) {
      console.warn('[notifications] could not create the channel:', e);
    }
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
        channelId: 'medapp_reminders',
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
    init: init,
    collectState: collectState,
    requestNotificationPermission: requestNotificationPermission,
    getPermissionStatus: getPermissionStatus,
    getStoredPermission: getStoredPermission,
    openAppSettings: openAppSettings,
    refreshPushToken: refreshPushToken,
    saveFcmToken: saveFcmToken,
    readState: readState
  };
})(window);
