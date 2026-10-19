// ============================================================
// streak.js — نواة حساب "سلسلة الأيام" (Study Streak)
// ------------------------------------------------------------
// منطق نقي (Pure logic) بلا أي اعتماد على DOM أو الشبكة، حتى
// يمكن تشغيله داخل المتصفح مباشرةً، وفي Node أثناء الاختبارات.
//
// الاستخدام في المتصفح:
//   MedAppStreakCore.compute(dateKeys, todayKey)
//   MedAppStreakCore.week(todayKey, 7)
//
// الاستخدام في Node (master.test.js):
//   const core = require('./streak.js');
// ============================================================
(function (root, factory) {
  'use strict';

  var api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MedAppStreakCore = api;
    // ⭐ في المتصفح globalThis === window، لكن بعض البيئات (الاختبارات،
    // إطار العمل) تفصلهما — فننشر على الاثنين معاً.
    if (typeof window !== 'undefined' && window !== root) {
      window.MedAppStreakCore = api;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DAY_MS = 86400000;

  var WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /**
   * يتحقق من صيغة التاريخ YYYY-MM-DD ومن صحة اليوم فعلياً.
   */
  function isValidDateKey(value) {
    if (typeof value !== 'string') return false;
    var m = value.match(DATE_RE);
    if (!m) return false;

    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);

    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;

    var probe = new Date(Date.UTC(year, month - 1, day));
    return probe.getUTCFullYear() === year &&
           probe.getUTCMonth() === month - 1 &&
           probe.getUTCDate() === day;
  }

  /**
   * مفتاح اليوم بالتوقيت المحلي (وليس UTC) حتى لا يختلف اليوم
   * عن يوم المستخدم في المناطق القريبة من منتصف الليل.
   */
  function todayKeyLocal(now) {
    var d = now instanceof Date ? now : new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function toUTC(dateKey) {
    var m = String(dateKey).match(DATE_RE);
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /**
   * عدد الأيام بين مفتاحي تاريخ (b - a). موجب إذا كان b بعد a.
   */
  function diffDays(fromKey, toKey) {
    var a = toUTC(fromKey);
    var b = toUTC(toKey);
    if (isNaN(a) || isNaN(b)) return NaN;
    return Math.round((b - a) / DAY_MS);
  }

  /**
   * إزاحة مفتاح تاريخ بعدد أيام (قد يكون سالباً).
   */
  function addDays(dateKey, days) {
    var stamp = toUTC(dateKey);
    if (isNaN(stamp)) return '';
    var d = new Date(stamp + days * DAY_MS);
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  /**
   * يطبّع مجموعة من مفاتيح التاريخ: يزيل المكرّر، يتجاهل الصيغ
   * الصحيحة، ويتجاهل تواريخ المستقبل.
   */
  function normalizeDates(dateKeys, todayKey) {
    var today = isValidDateKey(todayKey) ? todayKey : todayKeyLocal();
    var seen = Object.create(null);
    var out = [];

    (dateKeys || []).forEach(function (key) {
      if (!isValidDateKey(key)) return;
      if (key > today) return;          // المستقبل لا يُحتسب
      if (seen[key]) return;
      seen[key] = true;
      out.push(key);
    });

    out.sort();
    return out;
  }

  /**
   * الحساب الأساسي:
   *  - current: عدد الأيام المتتالية النشطة. إذا لم يكمل المستخدم
   *    مهمة اليوم بعد، نحتسب السلسلة من أمس (سلوك Duolingo).
   *  - longest: أطول سلسلة في كامل السجل.
   *  - todayActive: هل أُنجزت مهمة اليوم؟
   */
  function compute(dateKeys, todayKey) {
    var today = isValidDateKey(todayKey) ? todayKey : todayKeyLocal();
    var active = normalizeDates(dateKeys, today);
    var set = Object.create(null);
    active.forEach(function (key) { set[key] = true; });

    // أطول سلسلة
    var longest = 0;
    var run = 0;
    var prev = '';
    active.forEach(function (key) {
      if (prev && diffDays(prev, key) === 1) {
        run++;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = key;
    });

    // السلسلة الحالية
    var anchor = set[today] ? today : addDays(today, -1);
    var current = 0;
    var cursor = anchor;
    while (cursor && set[cursor]) {
      current++;
      cursor = addDays(cursor, -1);
    }

    return {
      todayKey: today,
      current: current,
      longest: longest,
      todayActive: !!set[today],
      activeDates: active,
      lastActiveDate: active.length ? active[active.length - 1] : '',
      totalActiveDays: active.length
    };
  }

  /**
   * يبني نافذة الأيام (مثلاً آخر 7 أيام) مع يوم الأسبوع وحالة النشاط.
   */
  function week(todayKey, count, activeDates) {
    var today = isValidDateKey(todayKey) ? todayKey : todayKeyLocal();
    var days = count || 7;
    var set = Object.create(null);
    (activeDates || []).forEach(function (key) { set[key] = true; });

    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var key = addDays(today, -i);
      if (!key) continue;
      var stamp = toUTC(key);
      out.push({
        key: key,
        weekday: WEEKDAYS_AR[new Date(stamp).getUTCDay()],
        dayNumber: new Date(stamp).getUTCDate(),
        active: !!set[key],
        isToday: key === today
      });
    }
    return out;
  }

  /**
   * رسالة جاهزة للعرض حسب قيمة السلسلة.
   */
  function streakMessage(data) {
    if (!data) return '';
    if (data.current <= 0) return 'ابدأ سلسلتك اليوم — أنجز مهمة واحدة!';
    if (data.current === 1) return 'بدأت السلسلة! أنجز مهمة أخرى اليوم لتكملها.';
    return 'ممتاز! أنت مستمر منذ ' + data.current + ' أيام متتالية.';
  }

  return {
    isValidDateKey: isValidDateKey,
    todayKeyLocal: todayKeyLocal,
    diffDays: diffDays,
    addDays: addDays,
    normalizeDates: normalizeDates,
    compute: compute,
    week: week,
    streakMessage: streakMessage,
    WEEKDAYS_AR: WEEKDAYS_AR
  };
});
