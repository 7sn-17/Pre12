// ============================================================
// notifications.js — محرّك الإشعارات الذكي (Smart Notification Engine)
// ------------------------------------------------------------
// ⭐ 6 فئات، لكل فئة عدة قوالب عربية، والاختيار عشوائي weighted
//    حسب حالة المستخدم (السلسلة، المهام المعلّقة، الإنجازات).
//
// ⭐ يعمل على الويب بلا أثر (لا نطلب إذن الإشعارات إلا في التطبيق).
// ============================================================
(function (global) {
  'use strict';

  var STORAGE_KEY = 'medapp_notification_state_v1';
  var LAST_TEMPLATE_KEY = 'medapp_notification_last_v1';

  // ─────────────────────────────────────────────
  // الفئات الست
  // ─────────────────────────────────────────────
  var CATEGORIES = [
    {
      id: 'task',
      weight: 5,
      titles: ['مهمة اليوم', 'مهمة بانتظارك', 'خطوة واحدة فقط'],
      bodies: [
        'لديك مهمة اليوم: {task}. خمس دقائق تكفي للبداية.',
        'بقيت عليك مهمة واحدة: {task}. لا تتركها untuk الغد!',
        'مهمة اليوم جاهزة: {task}. ابدأ الآن وأنجزها في أقل من ربع ساعة.'
      ]
    },
    {
      id: 'streak',
      weight: 5,
      titles: ['حافظ على سلسلتك', 'سلسلتك تنتظرك', 'يوم واحد ويكفي'],
      bodies: [
        'سلسلتك {days} أيام — أنجز مهمة اليوم حتى لا تنقطع!',
        'سلسلة {days} أيام من الالتزام. لا تكسرها اليوم!',
        'يوم واحد يحمي سلسلة {days} أيام. أنجز أي مهمة الآن.'
      ]
    },
    {
      id: 'motivation',
      weight: 3,
      titles: ['بالتدريج تنجح', 'كل يوم أفضل', 'استمر!'],
      bodies: [
        'أنجزت {count} مهمة حتى الآن. الاستمرارية هي سر النجاح.',
        '{count} مهمة منجزة — أنت تتقدم أكثر مما تظن. واصل!',
        'المثابرة تصنع الفرق. أنجزت {count} مهمة، فلماذا تتوقف؟'
      ]
    },
    {
      id: 'achievement',
      weight: 2,
      titles: ['إنجاز جديد!', 'مبروك!', 'وسام جديد'],
      bodies: [
        'أكملت {count} مهمة 🎉 استمر في هذا الإيقاع!',
        'ممتاز! {count} مهمة منجزة — كل واحدة تقرّبك من هدفك.',
        'رائع! عدد مهامك المنجزة وصل إلى {count}. استمدّ هذا الإنجاز!'
      ]
    },
    {
      id: 'review',
      weight: 2,
      titles: ['وقت المراجعة', 'راجع ما فاتك', 'حصاد اليوم'],
      bodies: [
        'عندك {pending} مهمة معلّقة من الأيام الماضية. راجع واحدة الآن وابدأ يومك مرتاحاً.',
        'ما زالت {pending} مهمة في انتظارك. عشر دقائق تكفي لمراجعة واحدة.',
        'راجع مهامك المعلّقة ({pending}) قبل أن تكبر — مراجعة سريعة اليوم أفضل من تراكم كبير.'
      ]
    },
    {
      id: 'welcome',
      weight: 1,
      titles: ['أهلاً بك', 'المنصة الطبية', 'يوم جديد'],
      bodies: [
        'أهلاً {name}! جاهز لدرس اليوم؟ خمس دقائق تكفي للبداية.',
        'مرحباً {name} — ابدأ بمهمة واحدة، والباقي يأتي بسهولة.',
        'يوم جديد يا {name}! تذكّر أن الالتزام القصير أفضل من التأجيل الطويل.'
      ]
    }
  ];

  // ─────────────────────────────────────────────
  // مساعدات
  // ─────────────────────────────────────────────
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
      var user = (global.MedAppAuthUser && global.MedAppAuthUser()) || null;
      if (user) {
        if (user.user_metadata && user.user_metadata.full_name) {
          return String(user.user_metadata.full_name).split(' ')[0];
        }
        if (user.email) return String(user.email).split('@')[0];
      }
    } catch (e) {}
    return 'يا بطل';
  }

  /**
   * ⭐ يختار فئة + قالب عشوائي حسب حالة المستخدم.
   * @param {object} state {streak, completed, pending, task, subject}
   */
  function pick(state) {
    state = state || {};

    var pool = CATEGORIES.filter(function (category) {
      if (category.id === 'task') return !!state.task;
      if (category.id === 'streak') return Number(state.streak || 0) > 0;
      if (category.id === 'achievement') return Number(state.completed || 0) >= 3;
      if (category.id === 'review') return Number(state.pending || 0) > 0;
      return true;
    });

    if (!pool.length) pool = [CATEGORIES[0]];

    // ⭐ اختيار موزون (weighted) — مع تفضيل فئة تختلف عن آخر مرة.
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
      // ⭐ لا نكرّر نفس الفئة مرتين متتاليتين
      var alternatives = pool.filter(function (c) { return c.id !== last; });
      if (alternatives.length) chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    // ⭐ قالب عشوائي من قوالب الفئة (لا نكرّر آخر قالب).
    var bodies = chosen.bodies || [''];
    var index = Math.floor(Math.random() * bodies.length);
    var lastBody = readLastTemplate();
    if (bodies.length > 1 && bodies[index] === lastBody) {
      index = (index + 1) % bodies.length;
    }
    writeLastTemplate(bodies[index]);

    var title = chosen.titles[Math.floor(Math.random() * chosen.titles.length)];
    var payload = Object.assign({}, state, { name: firstName() });

    return {
      category: chosen.id,
      title: fill(title, payload),
      body: fill(bodies[index], payload)
    };
  }

  /**
   * ⭐ يجدول إشعاراً محلياً (في التطبيق) — صامت بلا أثر على الويب.
   */
  function schedule(state, delayMinutes) {
    var LocalNotifications = global.Capacitor && global.Capacitor.Plugins
      ? global.Capacitor.Plugins.LocalNotifications
      : null;
    if (!LocalNotifications || typeof LocalNotifications.schedule !== 'function') {
      return Promise.resolve(null);
    }

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
    var state = {
      streak: 0,
      completed: 0,
      pending: 0,
      task: '',
      subject: ''
    };

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

  /**
   * ⭐ يقرأ الخطة ليعرف مهمة اليوم والمهام المعلّقة.
   */
  function loadPlan() {
    if (typeof global.fetchPlanData !== 'function') return Promise.resolve(null);
    return global.fetchPlanData().catch(function () { return null; });
  }

  function init() {
    var isNative = !!(global.Capacitor && global.Capacitor.isNativePlatform &&
      global.Capacitor.isNativePlatform());
    if (!isNative) return Promise.resolve(null);

    return Promise.all([collectState(), loadPlan()]).then(function (results) {
      var state = results[0] || {};
      var plan = results[1];

      if (plan) {
        var todayKey = (function () {
          var d = new Date();
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })();
        var todayTasks = Array.isArray(plan[todayKey]) ? plan[todayKey] : [];
        var pending = 0;
        Object.keys(plan).forEach(function (date) {
          if (date >= todayKey) return;
          (plan[date] || []).forEach(function (task) {
            if (task && task.id) pending++;
          });
        });
        state.pending = pending;
        if (todayTasks.length) {
          var task = todayTasks[0];
          state.task = task.task || task.title || '';
          state.subject = task.subject || '';
        }
      }

      // ⭐ نُجدول إشعاراً بعد ساعتين (وليس كل يوم — لا نُزعج المستخدم).
      var last = readState();
      var hoursSince = (Date.now() - (last.lastScheduledAt || 0)) / 3600000;
      if (hoursSince < 6) return null;
      return schedule(state, 120);
    }).catch(function (err) {
      console.warn('[notifications] init failed:', err);
      return null;
    });
  }

  global.MedAppNotifications = {
    CATEGORIES: CATEGORIES,
    pick: pick,
    schedule: schedule,
    init: init,
    collectState: collectState,
    readState: readState
  };
})(window);
