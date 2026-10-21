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
//   notes.pinned   ← medfav_goals (with progress %) + medfav_my_notes_v3
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
  var MAX_NOTES = 6;          // 3 goals + 3 notes — each variant filters its own
  var MAX_PER_KIND = 3;

  var planPromise = null;
  var refreshing = null;
  var refreshQueued = false;
  // The last payload that actually had tasks: a failed plan fetch must never
  // wipe a working card.
  var lastTasksJson = '';

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
    var at = Object.create(null);

    function parseKey(key, prefix) {
      var rest = key.slice(prefix.length);
      if (rest.length < 12) return null;
      return { date: rest.slice(0, 10), id: rest.slice(11) };
    }

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i) || '';
        if (key.indexOf('task_at_') === 0) {
          var parsedKey = parseKey(key, 'task_at_');
          if (!parsedKey) continue;
          var stamp = readJson(key, null);
          var id = parsedKey.date + '|' + parsedKey.id;
          if (stamp && stamp.done === true) {
            done[id] = true;
            dates[parsedKey.date] = true;
            if (stamp.at) at[id] = stamp.at;
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

    return { done: done, dates: dates, at: at };
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

    // Pending taps also carry their timestamp, so the widget can show the
    // strike-through frame before the row disappears.
    var pendingAt = Object.create(null);
    (pending || []).forEach(function (change) {
      if (change && change.id && change.at) {
        pendingAt[String(change.date || date) + '|' + String(change.id)] = change.at;
      }
    });

    var items = all.map(function (task) {
      var title = String(task.task || task.subject || '').trim();
      var key = date + '|' + task.id;
      var isDone = key in overrides ? overrides[key] : !!scan.done[key];
      var stamp = isDone ? (pendingAt[key] || scan.at[key] || '') : '';
      var doneAt = 0;
      if (stamp) {
        var parsed = Date.parse(stamp);
        if (!isNaN(parsed)) doneAt = parsed;
      }
      return {
        id: String(task.id),
        title: title || String(task.subject || 'مهمة'),
        subject: String(task.subject || ''),
        date: date,
        done: isDone,
        isCompleted: isDone,
        doneAt: doneAt
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
        // ⭐ W9 — the full Arabic name (السبت، الأحد…) plus the one-letter
        //    initial as a fallback for a payload from an older build.
        label: initialOf(day.weekday),
        name: String(day.weekday || ''),
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

  /**
   * Cuts a string and adds a real ellipsis.
   *
   * RemoteViews cannot ellipsize by itself, so the widget would show a hard
   * cut. Cutting here keeps the last line readable.
   */
  function cutText(value, limit) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    var max = Math.max(8, Number(limit) || 60);
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
  }

  function buildNotesPayload() {
    var goals = readJson(KEY_GOALS, []);
    var notes = readJson(KEY_NOTES, []);
    if (!Array.isArray(goals)) goals = [];
    if (!Array.isArray(notes)) notes = [];

    var goalRows = goals
      .filter(function (goal) { return goal && !goal.completed && goal.text; })
      .sort(function (a, b) {
        var da = a.deadline || '9999-12-31';
        var db = b.deadline || '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })
      .slice(0, MAX_PER_KIND)
      .map(function (goal, index) {
        var target = Number(goal.target_value) || 0;
        var current = Number(goal.current_value) || 0;
        var percent = target > 0
          ? Math.max(0, Math.min(100, Math.round((current / target) * 100)))
          : null;
        var title = String(goal.text || '').replace(/\s+/g, ' ').trim();
        // ⭐ W9 — the second line of a goal is its progress: «12 / 50 صفحة».
        var unit = String(goal.unit || '').trim();
        var progress = target > 0
          ? (current + ' / ' + target + (unit ? ' ' + unit : ''))
          : '';
        return {
          id: String(goal.id || ('goal-' + index)),
          title: cutText(title, 46),
          text: cutText(progress || title, 90),
          kind: 'goal',
          done: !!goal.completed,
          percent: percent
        };
      });

    var noteRows = notes
      .filter(function (note) {
        return note && (note.content || note.body || note.title);
      })
      .sort(function (a, b) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })
      .slice(0, MAX_PER_KIND)
      .map(function (note, index) {
        // ⭐⭐ Phase W9 — the widget shows the **title** on the first line and
        // the **content** underneath. Both are cut with a real ellipsis,
        // because RemoteViews cannot ellipsize by itself.
        var body = String(note.content || note.body || note.text || '')
          .replace(/\s+/g, ' ')
          .trim();
        var title = String(note.title || '').replace(/\s+/g, ' ').trim();
        // ⭐⭐⭐ Phase W16 — «الخريطة الصريحة» لعنوان/محتوى الملاحظة:
        //   العنوان: من `title`، وإلا أول ١٥ حرفاً من المحتوى، وإلا «ملاحظة».
        //   المحتوى: من `content`، وإلا العنوان نفسه (فلا سطر ثانٍ فارغ،
        //   ولا تكرار — الKotlin يتجاهل النصّ المطابق للعنوان تماماً).
        if (!title) title = cutText(body, 15) || 'ملاحظة';
        if (!body) body = title;
        return {
          id: String(note.id || ('note-' + index)),
          title: cutText(title, 46),
          // ⭐ ٦٤ حرفاً: ما يتّسع فعلياً في سطرين من العمود الضيّق،
          //   مع «…» حقيقي لأن الـRemoteViews لا يقصّ بالنقاط.
          text: cutText(body, 64),
          kind: 'note',
          done: false
        };
      });

    // Interleave: goal, note, goal, note, goal, note.
    // Combined widget → first 3 (both kinds); goals-only → filter; notes-only → filter.
    var items = [];
    for (var i = 0; i < MAX_PER_KIND; i++) {
      if (goalRows[i]) items.push(goalRows[i]);
      if (noteRows[i]) items.push(noteRows[i]);
    }

    return {
      items: items.slice(0, MAX_NOTES),
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

  /**
   * The WorkManager uploader needs a JWT to write `task_progress` while the
   * WebView is gone. It lives in the same private prefs group as the payloads;
   * `refreshSession` keeps it fresh on every publish.
   */
  async function readSession() {
    try {
      var client = global.supabaseClient;
      if (!client || !client.auth || typeof client.auth.getSession !== 'function') return null;
      var result = await client.auth.getSession();
      var session = result && result.data ? result.data.session : null;
      if (!session || !session.access_token || !session.user) return null;
      return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token || '',
        userId: session.user.id,
        expiresAt: session.expires_at || 0
      };
    } catch (e) {
      return null;
    }
  }

  async function publish(reason, pending) {
    var api = plugin();
    if (!api) return false;

    var tasks = await buildTasksPayload(pending);
    var tasksJson = JSON.stringify(tasks);
    if (tasks.items && tasks.items.length) {
      lastTasksJson = tasksJson;
    } else if (lastTasksJson) {
      // ⭐ W8 — the plan fetch failed (offline / cold start): keep the card
      //    that is already on the home screen instead of blanking it.
      tasksJson = lastTasksJson;
    }

    var streak = buildStreakPayload();
    var notes = buildNotesPayload();
    var session = await readSession();

    try {
      await api.publishWidgets({
        tasks: tasksJson,
        streak: JSON.stringify(streak),
        notes: JSON.stringify(notes),
        session: session,
        source: reason || 'auto'
      });
      return true;
    } catch (e) {
      console.warn('[widgets] publish failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  /**
   * ⭐⭐ Phase W14 — نشر الملاحظات وحدها فوراً (بلا تحميل الخطة).
   *
   * إضافة أو حذف ملاحظة داخل التطبيق يجب أن يظهر في الودجت في نفس اللحظة:
   * نكتب الحمولة في prefs ثم نطلب من الودجت أن يُعاد رسمه — بلا شبكة.
   */
  async function pushNotesNow() {
    var api = plugin();
    if (!api || typeof api.updateWidgetNotes !== 'function') return false;
    try {
      await api.updateWidgetNotes({ json: JSON.stringify(buildNotesPayload()) });
      return true;
    } catch (e) {
      console.warn('[widgets] the notes push failed:', e);
      return false;
    }
  }

  /**
   * ⭐⭐ Phase W8 — the fast path: repaint *only* the tasks card, right now.
   *
   * `publishWidgets` is the full pipeline (plan fetch + streak + notes + a
   * session round-trip). For a checkbox tap only the task list changed, so
   * this writes the task payload and asks the launcher to repaint — no
   * network, no plan reload, no Supabase.
   */
  async function pushTasksNow() {
    var api = plugin();
    if (!api || typeof api.updateWidgetTasks !== 'function') return false;
    try {
      var pending = await readPending();
      var tasks = await buildTasksPayload(pending);
      if (!tasks.items || !tasks.items.length) return false;
      lastTasksJson = JSON.stringify(tasks);
      await api.updateWidgetTasks({ json: lastTasksJson });
      // ⭐ W14 — السلسلة تتغيّر مع كل مهمة منجزة، فنبثّها في اللحظة نفسها
      //   (بلا شبكة: العدّاد محليّ بالكامل).
      try {
        if (typeof api.updateWidgetStreak === 'function') {
          await api.updateWidgetStreak({ json: JSON.stringify(buildStreakPayload()) });
        }
      } catch (e) {}
      return true;
    } catch (e) {
      console.warn('[widgets] fast task push failed:', e && e.message ? e.message : e);
      return false;
    }
  }

  /**
   * The public refresh: drain → rebuild → push. Serialised so the boot, the
   * visibility handler and the taskUpdated handler cannot race each other.
   */
  function refresh(reason) {
    if (!plugin()) return Promise.resolve(false);

    // A burst of edits (e.g. three «+10» taps) must not be collapsed into the
    // first snapshot: keep the in-flight run and schedule exactly one more.
    if (refreshing) {
      refreshQueued = true;
      return refreshing;
    }

    refreshing = (async function () {
      try {
        var pending = await readPending();
        var drained = await drainPending(pending);
        return await publish(reason || 'auto', drained > 0 ? [] : pending);
      } catch (e) {
        console.warn('[widgets] refresh failed:', e && e.message ? e.message : e);
        return false;
      }
    })().finally(function () {
      refreshing = null;
      if (refreshQueued) {
        refreshQueued = false;
        setTimeout(function () { refresh('queued'); }, 80);
      }
    });

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

  /**
   * Phase W7 — the button opens the launcher's **picker** (all widgets), not a
   * hard-coded card. Android has no public picker intent, so `openWidgetPicker`
   * tries every known launcher dialect and falls back to the documented pin
   * dialog for the requested kind when none answers.
   */
  async function addHomeWidget(kind) {
    var api = plugin();
    if (!api) {
      toast('إضافة الودجات متاحة في تطبيق أندرويد فقط', 'info');
      return;
    }

    try {
      if (typeof api.openWidgetPicker === 'function') {
        var picked = await api.openWidgetPicker();
        if (picked && picked.opened) return;
      }

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
   * ⭐⭐ Phase W6 — one premium button instead of six tiny tiles.
   *
   * The prompt locks the settings surface to a single action («إضافة ودجت
   * للشاشة»), while `src/index.html` may not be touched in this phase. The
   * transformation therefore happens here, once, at boot: the section keeps its
   * heading and the six tiles become one tall, emerald card that pins the main
   * tasks widget (the other variants remain available from the system picker).
   */
  function renderPremiumSettings() {
    var group = document.getElementById('homeWidgetsGroup');
    if (!group) return;

    // ⭐⭐ Phase W9 — `index.html` now carries the final single premium button
    // (#addWidgetHeroBtn + the helper text). There is nothing to inject, and
    // the hero must NOT be hidden any more: it *is* the button.
    if (document.getElementById('addWidgetHeroBtn')) return;

    var grid = group.querySelector('.widget-grid');
    if (!grid) return;
    if (grid.getAttribute('data-premium') === '1') return;
    grid.setAttribute('data-premium', '1');

    if (!document.getElementById('wpbStyles')) {
      var style = document.createElement('style');
      style.id = 'wpbStyles';
      style.textContent = [
        '.widget-grid[data-premium="1"]{display:block!important;grid-template-columns:none!important}',
        '.widget-premium-btn{display:flex;align-items:center;gap:14px;width:100%;padding:16px 18px;',
        'border-radius:20px;border:1px solid rgba(16,185,129,.30);',
        'background:linear-gradient(135deg,rgba(16,185,129,.20),rgba(5,150,105,.06));',
        'color:#ECFDF5;font-family:inherit;text-align:start;cursor:pointer;',
        'box-shadow:0 12px 30px rgba(0,0,0,.20);transition:transform .16s ease,box-shadow .16s ease}',
        '.widget-premium-btn:active{transform:scale(.985);box-shadow:0 6px 18px rgba(0,0,0,.22)}',
        '.wpb-icon{width:46px;height:46px;flex:0 0 auto;border-radius:15px;display:flex;',
        'align-items:center;justify-content:center;color:#fff;',
        'background:linear-gradient(135deg,#10B981,#047857);',
        'box-shadow:0 6px 16px rgba(16,185,129,.35)}',
        '.wpb-copy{display:flex;flex-direction:column;min-width:0}',
        '.wpb-title{font-weight:700;font-size:15px;line-height:1.3}',
        '.wpb-sub{font-size:11.5px;line-height:1.5;opacity:.72;margin-top:2px}'
      ].join('');
      document.head.appendChild(style);
    }

    grid.innerHTML = '';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'widget-premium-btn';
    button.innerHTML =
      '<span class="wpb-icon">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/>' +
        '<rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" ' +
        'rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>' +
      '</span>' +
      '<span class="wpb-copy">' +
        '<span class="wpb-title">إضافة ودجت للشاشة</span>' +
        '<span class="wpb-sub">مهامك وسلسلتك وأهدافك — بلمسة واحدة</span>' +
      '</span>';
    button.addEventListener('click', function () { addHomeWidget('tasks'); });
    grid.appendChild(button);

    // The legacy hero + hint duplicated the button copy; one card is the spec.
    var hero = group.querySelector('.widget-hero');
    if (hero) hero.style.display = 'none';
    var hint = document.getElementById('widgetHint');
    if (hint) hint.style.display = 'none';
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
        // ⭐ W9 — the hint lives inside the hero block now (no id), so the
        //    launcher support is reported with a toast instead.
        if (result && result.supported === false) {
          var hint = document.getElementById('widgetHint');
          if (hint) {
            hint.textContent = 'مُشغّلك لا يدعم الإضافة السريعة — اضغط مطوّلاً على الشاشة الرئيسية ثم «التطبيقات المصغرة».';
          }
        }
      }).catch(function () {});
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Deep links (Phase W4) — pre12://tasks | streak | notes | goals
  // ----------------------------------------------------------

  var pendingDeepLink = null;

  function currentPage() {
    return (location.pathname || '').split('/').pop() || 'index.html';
  }

  function navigateTo(url) {
    try {
      if (global.MedApp && typeof global.MedApp.navigate === 'function') {
        global.MedApp.navigate(url);
        return true;
      }
    } catch (e) {}
    try {
      location.href = url;
      return true;
    } catch (e) {
      return false;
    }
  }

  function openTodayCard() {
    var card = document.getElementById('todayCard');
    if (!card) {
      // The home tab may not be active yet (settings opens first on some flows).
      var home = document.querySelector('[data-tab="home"], #navHome');
      if (home) {
        try { home.click(); } catch (e) {}
      }
      card = document.getElementById('todayCard');
    }
    if (card) {
      try { card.click(); } catch (e) {}
      try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }
  }

  function scrollToFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var node = document.querySelector(selectors[i]);
      if (node) {
        try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        return true;
      }
    }
    return false;
  }

  /**
   * `pre12://tasks` lands on the today card, `streak` on the progress page,
   * `notes`/`goals` on their pages. The path comes from the widget's
   * `openAppAction(path)` in Kotlin.
   */
  function handleDeepLink(url) {
    if (!url) return false;
    var match = String(url).match(/^pre12:\/\/([^\/?#]+)/i);
    if (!match) return false;
    var target = match[1].toLowerCase();
    var here = currentPage();

    if (target === 'tasks') {
      if (here === 'index.html') {
        setTimeout(openTodayCard, 450);
      } else {
        navigateTo('index.html?deep=tasks');
      }
      return true;
    }

    if (target === 'streak') {
      if (here === 'progress.html') {
        setTimeout(function () {
          scrollToFirst(['#streakSection', '#streakCard', '[data-streak]', '.streak-card']);
        }, 500);
      } else {
        navigateTo('progress.html?deep=streak');
      }
      return true;
    }

    if (target === 'notes') {
      if (here !== 'notes.html') navigateTo('notes.html');
      return true;
    }

    if (target === 'goals') {
      if (here !== 'goals.html') navigateTo('goals.html');
      return true;
    }

    // The sticky-note "+" buttons: land on the page **with its add sheet open**.
    if (target === 'add-goal') {
      if (here === 'goals.html') {
        setTimeout(function () {
          try { if (typeof global.openAddModal === 'function') global.openAddModal(); } catch (e) {}
        }, 450);
      } else {
        navigateTo('goals.html?add=1');
      }
      return true;
    }

    if (target === 'add-note') {
      if (here !== 'notes.html') navigateTo('notes.html?add=1');
      return true;
    }

    // ⭐ W9 — the update notifications land on the update dialog.
    // ⭐ W14 — سيناريوهات «المحتوى» تصل بـ pre12://content ⇒ صفحة الملفات.
    if (target === 'content' || target === 'contentNew' || target === 'contentForYou') {
      if (here !== 'all-files.html') navigateTo('all-files.html');
      return true;
    }

    if (target === 'updates' || target === 'update') {
      if (here === 'index.html') {
        setTimeout(function () {
          try {
            if (typeof global.checkForAppUpdate === 'function') global.checkForAppUpdate();
          } catch (e) {}
        }, 450);
      } else {
        navigateTo('index.html?deep=updates');
      }
      return true;
    }

    if (target === 'lectures' || target === 'lecture') {
      if (here !== 'my-lectures.html') navigateTo('my-lectures.html');
      return true;
    }

    return false;
  }

  /**
   * Cold start: the URL is on the activity intent (captured by @capacitor/app's
   * getLaunchUrl). Warm start: `appUrlOpen`. The `?deep=` query is the fallback
   * used when the navigation happens between pages.
   */
  async function primeDeepLinks() {
    try {
      var params = new URLSearchParams(location.search || '');
      var queued = params.get('deep');
      if (queued) {
        setTimeout(function () { handleDeepLink('pre12://' + queued); }, 700);
      }
    } catch (e) {}

    var cap = capacitor();
    var app = cap && cap.Plugins ? cap.Plugins.App : null;
    if (!app) return;

    try {
      if (typeof app.getLaunchUrl === 'function') {
        var launch = await app.getLaunchUrl();
        if (launch && launch.url) {
          pendingDeepLink = launch.url;
          setTimeout(function () { handleDeepLink(pendingDeepLink); }, 800);
        }
      }
      // ⭐ W9 — when the shell (app.js) is present it owns the Capacitor
      //    listener and re-dispatches every link as a 'medapp:deeplink' DOM
      //    event (also after an SPA swap). Two owners would navigate twice.
      if (!global.MedApp && typeof app.addListener === 'function') {
        var handle = app.addListener('appUrlOpen', function (data) {
          if (data && data.url) handleDeepLink(data.url);
        });
        if (handle && typeof handle.catch === 'function') handle.catch(function () {});
      }
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------

  /**
   * ⭐⭐⭐ Phase W9 — the bridge listeners must survive an SPA navigation.
   *
   * The shell (`app.js`) removes every window/document listener of the view it
   * replaces — and `widgets.js` is an *external* script, so it is never
   * executed again. Without this fix the whole widget bridge died after the
   * first navigation: tapping a task in the app updated nothing on the home
   * screen.
   *
   * `bindBridge()` is idempotent (it detaches the previous handlers first), so
   * it can be called again whenever the body is swapped.
   */
  var bridgeHandlers = null;

  function unbindBridge() {
    if (!bridgeHandlers) return;
    var h = bridgeHandlers;
    bridgeHandlers = null;
    try { global.removeEventListener('taskUpdated', h.taskUpdated); } catch (e) {}
    try { global.removeEventListener('online', h.online); } catch (e) {}
    try { document.removeEventListener('medapp:deeplink', h.deepLink); } catch (e) {}
    try { global.removeEventListener('visibilitychange', h.visibility); } catch (e) {}
    try { global.removeEventListener('pagehide', h.pagehide); } catch (e) {}
    if (h.pluginTask && typeof h.pluginTask.remove === 'function') {
      try { h.pluginTask.remove(); } catch (e) {}
    }
    if (h.pluginUpdate && typeof h.pluginUpdate.remove === 'function') {
      try { h.pluginUpdate.remove(); } catch (e) {}
    }
  }

  function bindBridge() {
    unbindBridge();

    var handlers = {};

    // Publish *before* the WebView is frozen: the launcher repaints as soon as
    // the user reaches the home screen, so a goals/notes edit must already be in
    // prefs. `visible` stays for the reverse direction and for missed publishes.
    handlers.visibility = function () {
      refresh(document.hidden ? 'hidden' : 'visible');
    };
    document.addEventListener('visibilitychange', handlers.visibility);

    handlers.pagehide = function () {
      refresh('pagehide');
    };
    global.addEventListener('pagehide', handlers.pagehide);

    handlers.taskUpdated = function () {
      // ⭐ W8 — repaint the card first (no network), then let the full
      //    publish catch up with the streak and the notes.
      pushTasksNow();
      setTimeout(function () { refresh('task'); }, 350);
    };
    global.addEventListener('taskUpdated', handlers.taskUpdated);

    handlers.online = function () {
      // ⭐⭐⭐ Phase W17.1 — نشر الودجات مرّة واحدة كل ٣٠ ثانية كحدّ أقصى.
      if (!(global.medappThrottle ? global.medappThrottle('widgets:refresh', 30000) : true)) return;
      setTimeout(function () { refresh('online'); }, 1200);
    };
    global.addEventListener('online', handlers.online);

    // ⭐ W9 — the shell (app.js) owns the Capacitor deep-link listener and
    //    re-dispatches it as a DOM event, also after an SPA swap.
    handlers.deepLink = function (event) {
      var url = event && event.detail ? event.detail.url : '';
      if (url) handleDeepLink(url);
    };
    document.addEventListener('medapp:deeplink', handlers.deepLink);

    try {
      var api = plugin();
      if (api && typeof api.addListener === 'function') {
        // ⭐ W8 — a widget tap is applied to the app *now*: the pending queue
        //    is drained locally, `setTaskCompleted` writes the local state and
        //    dispatches 'taskUpdated', so the open screen repaints at once.
        handlers.pluginTask = api.addListener('widgetTaskToggled', function () {
          refresh('widget-toggle');
        });
        if (handlers.pluginTask && typeof handlers.pluginTask.catch === 'function') {
          handlers.pluginTask.catch(function () {});
        }

        handlers.pluginUpdate = api.addListener('taskUpdated', function () {
          refresh('widget-task');
        });
        if (handlers.pluginUpdate && typeof handlers.pluginUpdate.catch === 'function') {
          handlers.pluginUpdate.catch(function () {});
        }
      }
    } catch (e) {}

    bridgeHandlers = handlers;
  }

  /**
   * Re-binds the bridge after every body swap.
   *
   * A `MutationObserver` is not a DOM listener, so the shell cannot remove it
   * when it replaces the view — it is the only reliable "the page changed"
   * signal an external script can get.
   */
  function watchViewSwaps() {
    if (typeof global.MutationObserver !== 'function') return;
    if (!document.body) return;
    try {
      var observer = new MutationObserver(function () {
        // The shell swaps the whole body in one go; a microtask is enough.
        setTimeout(function () { bindBridge(); }, 0);
      });
      observer.observe(document.body, { childList: true });
    } catch (e) {}
  }

  function boot() {
    renderPremiumSettings();
    syncDiscoveryUi();
    // The Capacitor bridge can finish registering a beat after DOMContentLoaded.
    setTimeout(syncDiscoveryUi, 1500);
    document.addEventListener('deviceready', syncDiscoveryUi);
    bindBridge();
    watchViewSwaps();
    if (!plugin()) {
      primeDeepLinks();
      return;
    }

    refresh('boot');
    primeDeepLinks();
  }

  global.MedAppWidgets = {
    refresh: refresh,
    pushTasksNow: pushTasksNow,
    pushNotesNow: pushNotesNow,
    addHomeWidget: addHomeWidget,
    buildTasksPayload: buildTasksPayload,
    buildStreakPayload: buildStreakPayload,
    buildNotesPayload: buildNotesPayload,
    handleDeepLink: handleDeepLink,
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
