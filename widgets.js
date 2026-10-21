// ============================================================
// widgets.js — Home-screen widgets bridge (Phase W2)
// ------------------------------------------------------------
// The WebView owns the data (plans-data.json + localStorage + Supabase); the
// widgets are native Glance views that cannot read any of it. This file is the
// only place that turns app state into the three JSON payloads the widgets
// understand, and it is the only place that drains checkbox taps made on the
// home screen.
//
//   tasks.today    ← plans-data.json + task_<date>_<id> keys
//   streak.summary ← MedAppStreakCore over the same completion keys
//   notes.pinned   ← medfav_goals + medfav_my_notes_v3
//   pending.tasks  → drained here, then written through setTaskCompleted()
//
// Everything is best-effort: on the web (no native plugin) every entry point is
// a no-op, so the same pages keep working in a browser.
// ============================================================
(function (global) {
  'use strict';

  var PLUGIN_NAME = 'MedWidgets';
  var KEY_FREEZES = 'medapp_streak_freezes_v1';
  var KEY_GOALS = 'medfav_goals';
  var KEY_NOTES = 'medfav_my_notes_v3';
  var MAX_TASKS = 12;
  var MAX_NOTES = 3;

  var planPromise = null;
  var refreshing = null;

  // ----------------------------------------------------------
  // Environment
  // ----------------------------------------------------------

  function capacitor() {
    try {
      return global.Capacitor || null;
    } catch (e) {
      return null;
    }
  }

  function plugin() {
    var cap = capacitor();
    if (!cap || !cap.Plugins) return null;
    try {
      if (cap.isPluginAvailable && !cap.isPluginAvailable(PLUGIN_NAME)) return null;
    } catch (e) {}
    return cap.Plugins[PLUGIN_NAME] || null;
  }

  function isNativeAndroid() {
    var cap = capacitor();
    try {
      return !!(cap && cap.isNativePlatform && cap.isNativePlatform() &&
        (!cap.getPlatform || cap.getPlatform() === 'android'));
    } catch (e) {
      return false;
    }
  }

  // ----------------------------------------------------------
  // Storage helpers
  // ----------------------------------------------------------

  function todayKey() {
    try {
      if (global.MedAppStreakCore && MedAppStreakCore.todayKeyLocal) {
        return MedAppStreakCore.todayKeyLocal();
      }
    } catch (e) {}
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Rebuilds completion state straight from localStorage. Mirrors db.js:
   *   1) the pending queue is already reflected in `task_at_*` (setTaskCompleted
   *      writes it synchronously),
   *   2) `task_at_*` = { done, at } is authoritative,
   *   3) plain `task_* = '1'` is the legacy format (no timestamp).
   */
  function scanCompletions() {
    var done = Object.create(null);
    var tomb = Object.create(null);
    var legacy = Object.create(null);
    var dates = Object.create(null);

    function parseKey(key, prefix) {
      var rest = key.slice(prefix.length);
      if (rest.length < 12) return null;
      return { date: rest.slice(0, 10), id: rest.slice(11) };
    }

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i) || '';
        if (key.indexOf('task_at_') === 0) {
          var at = parseKey(key, 'task_at_');
          if (!at) continue;
          var stamp = readJson(key, null);
          var id = at.date + '|' + at.id;
          if (stamp && stamp.done === true) {
            done[id] = true;
            dates[at.date] = true;
          } else if (stamp && stamp.done === false) {
            tomb[id] = true;
          }
        } else if (key.indexOf('task_') === 0) {
          var lg = parseKey(key, 'task_');
          if (!lg) continue;
          if (localStorage.getItem(key) === '1') {
            legacy[lg.date + '|' + lg.id] = true;
          }
        }
      }
    } catch (e) {}

    Object.keys(legacy).forEach(function (id) {
      if (!tomb[id]) {
        done[id] = true;
        dates[id.slice(0, 10)] = true;
      }
    });
    Object.keys(tomb).forEach(function (id) {
      delete done[id];
      delete legacy[id];
    });

    return { done: done, dates: dates };
  }

  // ----------------------------------------------------------
  // Plan
  // ----------------------------------------------------------

  function loadPlan() {
    if (planPromise) return planPromise;
    try {
      if (typeof global.fetchPlanData === 'function') {
        planPromise = Promise.resolve(global.fetchPlanData({}));
      }
    } catch (e) {}
    if (!planPromise) {
      planPromise = fetch('plans-data.json', { cache: 'default' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        });
    }
    planPromise = planPromise.catch(function (err) {
      console.warn('[widgets] plan unavailable:', err && err.message ? err.message : err);
      return {};
    });
    return planPromise;
  }

  function tasksForDate(plan, date) {
    var list = plan && Array.isArray(plan[date]) ? plan[date] : [];
    return list.filter(function (task) {
      return task && task.id;
    });
  }

  // ----------------------------------------------------------
  // Payload builders
  // ----------------------------------------------------------

  async function buildTasksPayload(pending) {
    var plan = await loadPlan();
    var date = todayKey();
    var scan = scanCompletions();
    var all = tasksForDate(plan, date);

    // A toggle made on the widget while the app was closed lives only in
    // `pending.tasks`. Merge it over localStorage so the card never flickers
    // back to the old state on a page that cannot drain the queue yet.
    var overrides = Object.create(null);
    (pending || []).forEach(function (change) {
      if (change && change.id) {
        overrides[String(change.date || date) + '|' + String(change.id)] = !!change.done;
      }
    });

    var items = all.map(function (task) {
      var title = String(task.task || task.subject || '').trim();
      var key = date + '|' + task.id;
      var isDone = key in overrides ? overrides[key] : !!scan.done[key];
      return {
        id: String(task.id),
        title: title || String(task.subject || 'مهمة'),
        date: date,
        done: isDone,
        isCompleted: isDone
      };
    });

    var done = items.reduce(function (count, item) {
      return count + (item.done ? 1 : 0);
    }, 0);

    return {
      date: date,
      total: items.length,
      done: done,
      progress: items.length ? done / items.length : 0,
      items: items.slice(0, MAX_TASKS),
      updatedAt: new Date().toISOString()
    };
  }

  /** Reads the widget's checkbox queue (never clears it). */
  async function readPending() {
    var api = plugin();
    if (!api) return [];
    try {
      var response = await api.getPendingToggles();
      var list = JSON.parse((response && response.json) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  var WEEKDAY_INITIALS = {
    'الأحد': 'ح',
    'الإثنين': 'ن',
    'الثلاثاء': 'ث',
    'الأربعاء': 'ر',
    'الخميس': 'خ',
    'الجمعة': 'ج',
    'السبت': 'س'
  };

  function initialOf(weekday) {
    return WEEKDAY_INITIALS[weekday] || String(weekday || '').charAt(0);
  }

  function buildStreakPayload() {
    var core = global.MedAppStreakCore;
    var today = todayKey();
    var scan = scanCompletions();
    var dates = Object.keys(scan.dates).sort();
    var frozen = readJson(KEY_FREEZES, []);
    if (!Array.isArray(frozen)) frozen = [];

    if (!core || typeof core.compute !== 'function') {
      return {
        current: 0,
        longest: 0,
        freezes: frozen.length,
        todayDone: false,
        days: [],
        updatedAt: new Date().toISOString()
      };
    }

    var result = core.compute(dates, today, frozen);
    var week = typeof core.week === 'function'
      ? core.week(today, 7, dates, frozen)
      : [];

    var days = week.map(function (day) {
      var state;
      if (day.frozen) state = 'freeze';
      else if (day.isToday) state = day.active ? 'today_done' : 'today';
      else state = day.active ? 'done' : 'missed';

      return {
        date: day.key,
        label: initialOf(day.weekday),
        state: state
      };
    });

    return {
      current: result.current || 0,
      longest: result.longest || 0,
      freezes: frozen.length,
      todayDone: !!result.todayActive,
      days: days,
      updatedAt: new Date().toISOString()
    };
  }

  function buildNotesPayload() {
    var goals = readJson(KEY_GOALS, []);
    var notes = readJson(KEY_NOTES, []);
    if (!Array.isArray(goals)) goals = [];
    if (!Array.isArray(notes)) notes = [];

    var items = [];

    // Goals first: unfinished, nearest deadline wins, then newest.
    goals
      .filter(function (goal) { return goal && !goal.completed && goal.text; })
      .sort(function (a, b) {
        var da = a.deadline || '9999-12-31';
        var db = b.deadline || '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })
      .forEach(function (goal) {
        if (items.length >= MAX_NOTES) return;
        items.push({
          id: String(goal.id || ('goal-' + items.length)),
          text: String(goal.text).trim(),
          kind: 'goal',
          done: !!goal.completed
        });
      });

    // Then the newest personal notes.
    notes
      .filter(function (note) { return note && (note.title || note.content); })
      .sort(function (a, b) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })
      .forEach(function (note) {
        if (items.length >= MAX_NOTES) return;
        var text = note.title || note.content || '';
        items.push({
          id: String(note.id || ('note-' + items.length)),
          text: String(text).replace(/\s+/g, ' ').trim().slice(0, 90),
          kind: 'note',
          done: false
        });
      });

    return {
      items: items,
      total: goals.length + notes.length,
      updatedAt: new Date().toISOString()
    };
  }

  // ----------------------------------------------------------
  // Sync
  // ----------------------------------------------------------

  /**
   * Applies checkbox taps that happened while the WebView was closed.
   * Only pages that load sync.js can do this properly (Supabase + queue), so on
   * other pages the queue stays intact for the next index/progress visit.
   */
  async function drainPending(pending) {
    var api = plugin();
    if (!api) return 0;
    if (!Array.isArray(pending) || pending.length === 0) return 0;

    // Only pages that load sync.js can write localStorage *and* Supabase.
    // Elsewhere the queue is preserved and merged into the display instead.
    if (typeof global.setTaskCompleted !== 'function') return 0;

    var plan = await loadPlan();
    var failed = 0;
    for (var i = 0; i < pending.length; i++) {
      var change = pending[i] || {};
      if (!change.id) continue;
      var date = String(change.date || '') || todayKey();
      var match = tasksForDate(plan, date).filter(function (task) {
        return String(task.id) === String(change.id);
      })[0] || { id: change.id, date: date };

      try {
        await global.setTaskCompleted(date, change.id, !!change.done, match, 'widget');
      } catch (e) {
        failed++;
        console.warn('[widgets] could not apply widget toggle:', e);
      }
    }

    // All-or-nothing: a failed write must stay queued, not disappear.
    if (failed > 0) return 0;

    try {
      await api.clearPendingToggles();
    } catch (e) {}
    return pending.length;
  }

  async function publish(reason, pending) {
    var api = plugin();
    if (!api) return false;

    var tasks = await buildTasksPayload(pending);
    var streak = buildStreakPayload();
    var notes = buildNotesPayload();

    try {
      await api.publishWidgets({
        tasks: JSON.stringify(tasks),
        streak: JSON.stringify(streak),
        notes: JSON.stringify(notes),
        source: reason || 'auto'
      });
      return true;
    } catch (e) {
      console.warn('[widgets] publish failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  /**
   * The public refresh: drain → rebuild → push. Serialised so the boot, the
   * visibility handler and the taskUpdated handler cannot race each other.
   */
  function refresh(reason) {
    if (!plugin()) return Promise.resolve(false);
    if (refreshing) return refreshing;

    refreshing = (async function () {
      try {
        var pending = await readPending();
        var drained = await drainPending(pending);
        return await publish(reason || 'auto', drained > 0 ? [] : pending);
      } catch (e) {
        console.warn('[widgets] refresh failed:', e && e.message ? e.message : e);
        return false;
      } finally {
        refreshing = null;
      }
    })();

    return refreshing;
  }

  // ----------------------------------------------------------
  // In-app discovery (Settings → الشاشة الرئيسية)
  // ----------------------------------------------------------

  function toast(message, type) {
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(message, type || 'info');
        return;
      }
    } catch (e) {}
    try { console.log('[widgets]', message); } catch (e) {}
  }

  async function addHomeWidget(kind) {
    var api = plugin();
    if (!api) {
      toast('إضافة الودجات متاحة في تطبيق أندرويد فقط', 'info');
      return;
    }

    try {
      var response = await api.requestPinWidget({ kind: kind || 'tasks' });
      if (response && response.requested === false) {
        toast('لا يدعم المُشغّل هذه النافذة — اضغط مطوّلاً على الشاشة الرئيسية ثم «الودجات»', 'info');
      }
    } catch (e) {
      console.warn('[widgets] pin failed:', e);
      toast('تعذّر فتح نافذة الإضافة — حاول من الشاشة الرئيسية', 'error');
    }
  }

  /**
   * Hides the discovery card on the web and keeps it on Android. Also reflects
   * whether the launcher supports pinning at all.
   */
  function syncDiscoveryUi() {
    var group = document.getElementById('homeWidgetsGroup');
    if (!group) return;

    var api = plugin();
    if (!api) {
      group.style.display = 'none';
      return;
    }
    group.style.display = '';

    try {
      api.isPinWidgetSupported().then(function (result) {
        var hint = document.getElementById('widgetHint');
        if (!hint) return;
        if (result && result.supported === false) {
          hint.textContent = 'مُشغّلك لا يدعم الإضافة السريعة — اضغط مطوّلاً على الشاشة الرئيسية ثم «الودجات».';
        }
      }).catch(function () {});
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------

  function boot() {
    syncDiscoveryUi();
    // The Capacitor bridge can finish registering a beat after DOMContentLoaded.
    setTimeout(syncDiscoveryUi, 1500);
    document.addEventListener('deviceready', syncDiscoveryUi);
    if (!plugin()) return;

    refresh('boot');

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh('visible');
    });

    global.addEventListener('taskUpdated', function () {
      setTimeout(function () { refresh('task'); }, 350);
    });

    global.addEventListener('online', function () {
      setTimeout(function () { refresh('online'); }, 1200);
    });

    try {
      var api = plugin();
      if (api && typeof api.addListener === 'function') {
        api.addListener('widgetTaskToggled', function () {
          setTimeout(function () { refresh('widget-toggle'); }, 250);
        });
      }
    } catch (e) {}
  }

  global.MedAppWidgets = {
    refresh: refresh,
    addHomeWidget: addHomeWidget,
    buildTasksPayload: buildTasksPayload,
    buildStreakPayload: buildStreakPayload,
    buildNotesPayload: buildNotesPayload,
    isAvailable: function () { return !!plugin(); },
    isNativeAndroid: isNativeAndroid
  };

  // `onclick="addHomeWidget('tasks')"` needs a real global.
  global.addHomeWidget = addHomeWidget;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
