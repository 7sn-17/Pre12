// ============================================================
// sync.js — Cross-device account synchronization
// ------------------------------------------------------------
// The database is the source of truth for signed-in users. This module
// pulls tasks, favorites and notes into the existing offline caches after
// login so a fresh device immediately mirrors the account.
//
// It never calls auth.js getSession(), because getSession() invokes
// runFullUserSync(). All auth reads here go directly to Supabase to avoid a
// recursive synchronization loop.
// ============================================================
(function (global) {
  'use strict';

  var FULL_SYNC_KEY = 'medapp_cloud_full_sync_v1';
  var TASK_OWNER_KEY = 'medapp_task_progress_owner_v1';
  var FAVORITES_OWNER_KEY = 'medapp_favorites_owner_v1';
  var FAVORITES_LAST_SYNC_KEY = 'medapp_favorites_last_sync_v1';
  var FAVORITE_OPS_KEY = 'medapp_favorite_ops_v1';
  var NOTES_OWNER_KEY = 'medapp_notes_owner_v1';
  var NOTES_LAST_SYNC_KEY = 'medapp_notes_last_sync_v1';
  var NOTES_MY_KEY = 'medfav_my_notes_v3';
  var NOTES_PENDING_KEY = 'medfav_pending_v3';
  var NOTES_SHARED_KEY = 'medfav_shared_cache_v3';
  var NOTES_PROFILE_KEY = 'medfav_profile_cache_v3';
  var NOTES_DELETES_KEY = 'medapp_note_deletes_v1';

  var fullSyncPromise = null;
  var favoritesSyncPromise = null;
  var notesSyncPromise = null;

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : fallback;
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function readArray(key) {
    var value = readJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  function writeArray(key, value) {
    return safeSet(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function userIdOf(userOrId) {
    if (!userOrId) return '';
    if (typeof userOrId === 'string') return userOrId;
    return userOrId.id || (userOrId.user && userOrId.user.id) || '';
  }

  function isUuid(value) {
    return typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function makeId() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (e) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  async function directUserId() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return '';
      var result = await supabaseClient.auth.getSession();
      if (result.error) return '';
      var session = result.data && result.data.session;
      return session && session.user ? session.user.id : '';
    } catch (e) {
      return '';
    }
  }

  function dispatch(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {}
  }

  // ----------------------------------------------------------
  // Notes
  // ----------------------------------------------------------

  function clearNotesLocalState() {
    [NOTES_MY_KEY, NOTES_PENDING_KEY, NOTES_SHARED_KEY, NOTES_PROFILE_KEY,
      NOTES_DELETES_KEY, NOTES_LAST_SYNC_KEY].forEach(safeRemove);
  }

  function readPendingNotes() {
    return readArray(NOTES_PENDING_KEY).filter(function (note) {
      return note && (note.title || note.content);
    });
  }

  function writePendingNotes(notes) {
    return writeArray(NOTES_PENDING_KEY, notes);
  }

  function queuePendingNote(note) {
    var pending = readPendingNotes();
    var idx = pending.findIndex(function (item) { return item.id === note.id; });
    if (idx >= 0) pending[idx] = note;
    else pending.push(note);
    writePendingNotes(pending);
  }

  function readNoteDeletes() {
    return readArray(NOTES_DELETES_KEY).filter(isUuid);
  }

  function writeNoteDeletes(ids) {
    return writeArray(NOTES_DELETES_KEY, ids);
  }

  function queueNoteDelete(noteId) {
    if (!isUuid(noteId)) return false;
    var ids = readNoteDeletes();
    if (ids.indexOf(noteId) === -1) ids.push(noteId);
    writeNoteDeletes(ids);
    return true;
  }

  function removeQueuedNoteDelete(noteId) {
    writeNoteDeletes(readNoteDeletes().filter(function (id) { return id !== noteId; }));
  }

  function notePayload(note, userId) {
    var payload = {
      id: isUuid(note.id) ? note.id : makeId(),
      user_id: userId,
      author_name: note.author_name || '',
      title: note.title || '',
      content: note.content || '',
      is_shared: !!note.is_shared,
      created_at: note.created_at || new Date().toISOString()
    };
    if (note.subject_id) payload.subject_id = note.subject_id;
    return payload;
  }

  async function upsertNote(note, userId) {
    if (!userId) return { ok: false, error: new Error('missing user') };
    var payload = notePayload(note, userId);
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        throw new Error('Supabase unavailable');
      }
      var result = await supabaseClient
        .from('notes')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .single();
      if (result.error) throw result.error;
      return { ok: true, note: result.data || payload, id: payload.id };
    } catch (err) {
      return { ok: false, error: err, id: payload.id };
    }
  }

  async function deleteCloudNote(noteId, userId) {
    if (!isUuid(noteId) || !userId) return true;
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
      var result = await supabaseClient
        .from('notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', userId);
      if (result.error) throw result.error;
      removeQueuedNoteDelete(noteId);
      return true;
    } catch (err) {
      console.warn('deleteCloudNote failed:', err && err.message ? err.message : err);
      queueNoteDelete(noteId);
      return false;
    }
  }

  async function fetchCloudNotes(userId) {
    try {
      var results = await Promise.all([
        supabaseClient
          .from('notes')
          .select('*')
          .eq('user_id', userId)
          .eq('is_shared', false)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('notes')
          .select('*')
          .eq('is_shared', true)
          .order('created_at', { ascending: false })
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      return { mine: results[0].data || [], shared: results[1].data || [] };
    } catch (err) {
      console.warn('fetchCloudNotes failed:', err && err.message ? err.message : err);
      return null;
    }
  }

  async function syncNotesFromCloud(userOrId) {
    var userId = userIdOf(userOrId) || await directUserId();
    if (!userId) return { ok: false, offline: !navigator.onLine };
    if (!navigator.onLine) return { ok: false, offline: true };
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return { ok: false };

    var owner = safeGet(NOTES_OWNER_KEY, '');
    var firstSync = !owner || String(owner) !== String(userId);
    var hasPending = readPendingNotes().length > 0 || readNoteDeletes().length > 0;

    if (!firstSync && !hasPending) {
      var last = readJson(NOTES_LAST_SYNC_KEY, null);
      if (last && String(last.user_id) === String(userId) && Date.now() - Number(last.at || 0) < 5000) {
        return { ok: true, skipped: true, inserted: 0, failed: 0 };
      }
    }

    if (notesSyncPromise) return notesSyncPromise;

    notesSyncPromise = (async function () {
      if (firstSync && owner && String(owner) !== String(userId)) {
        // Another account used this browser: erase its private cache before
        // loading the current account.
        clearNotesLocalState();
      } else if (!owner) {
        // Owner markers were cleared, but a private note still names an old
        // account: never migrate that note into whoever signs in next.
        var cachedMine = readArray(NOTES_MY_KEY).concat(readArray(NOTES_PENDING_KEY));
        var foreignCache = cachedMine.some(function (note) {
          return note && note.user_id && String(note.user_id) !== String(userId);
        });
        if (foreignCache) clearNotesLocalState();
      }

      safeSet(NOTES_OWNER_KEY, userId);
      var inserted = 0;
      var failed = 0;

      // Upgrade path: notes saved by old versions were local-only. Upload
      // them once, using a real UUID so retries are idempotent.
      if (firstSync) {
        var localMine = readArray(NOTES_MY_KEY);
        var retainedMine = [];
        for (var i = 0; i < localMine.length; i++) {
          var localNote = localMine[i];
          if (!localNote || (!localNote.title && !localNote.content)) continue;
          var migratedId = isUuid(localNote.id) ? localNote.id : makeId();
          var migrated = await upsertNote({
            id: migratedId,
            author_name: localNote.author_name || '',
            title: localNote.title || '',
            content: localNote.content || '',
            is_shared: false,
            created_at: localNote.created_at
          }, userId);
          if (migrated.ok) {
            inserted++;
            retainedMine.push(Object.assign({}, localNote, {
              id: migratedId,
              user_id: userId,
              is_shared: false
            }));
          } else {
            failed++;
            // The note moves to the pending queue; keeping the old local_ id
            // here would show a duplicate and make deletion target the wrong
            // identifier.
            queuePendingNote(Object.assign({}, localNote, {
              id: migratedId,
              user_id: userId,
              is_shared: false,
              _pending: true
            }));
          }
        }
        // Rewrite immediately so a failed download cannot leave local_* ids
        // that would bypass cloud deletion.
        safeSet(NOTES_MY_KEY, JSON.stringify(retainedMine));
      }

      // Upload queued notes (private and shared) before downloading. This
      // makes a note written offline on one device appear on the other after
      // reconnecting.
      var pending = readPendingNotes();
      var remaining = [];
      for (var p = 0; p < pending.length; p++) {
        var pendingResult = await upsertNote(pending[p], userId);
        if (pendingResult.ok) {
          inserted++;
          removeQueuedNoteDelete(pendingResult.id);
        } else {
          failed++;
          remaining.push(Object.assign({}, pending[p], {
            id: pendingResult.id || pending[p].id,
            user_id: userId,
            _pending: true
          }));
        }
      }
      writePendingNotes(remaining);

      // Process deletes queued while offline.
      var deleteIds = readNoteDeletes();
      var remainingDeletes = [];
      var deletedThisSync = {};
      for (var d = 0; d < deleteIds.length; d++) {
        var deleted = await deleteCloudNote(deleteIds[d], userId);
        if (deleted) deletedThisSync[deleteIds[d]] = true;
        else remainingDeletes.push(deleteIds[d]);
      }
      writeNoteDeletes(remainingDeletes);

      var cloud = await fetchCloudNotes(userId);
      if (!cloud) {
        return { ok: false, inserted: inserted, failed: remaining.length };
      }

      var deleteSet = {};
      Object.keys(deletedThisSync).forEach(function (id) { deleteSet[id] = true; });
      remainingDeletes.forEach(function (id) { deleteSet[id] = true; });

      var mine = cloud.mine.filter(function (note) {
        return !note || !deleteSet[note.id];
      });
      var shared = cloud.shared.filter(function (note) {
        return !note || !deleteSet[note.id];
      });

      safeSet(NOTES_MY_KEY, JSON.stringify(mine));
      safeSet(NOTES_SHARED_KEY, JSON.stringify(shared));
      safeSet(NOTES_LAST_SYNC_KEY, JSON.stringify({ user_id: userId, at: Date.now() }));

      dispatch('medapp:notes-synced', {
        mine: mine.length,
        shared: shared.length,
        inserted: inserted,
        failed: remaining.length
      });
      return {
        ok: true,
        inserted: inserted,
        failed: remaining.length,
        mine: mine,
        shared: shared
      };
    })();

    try {
      return await notesSyncPromise;
    } finally {
      notesSyncPromise = null;
    }
  }

  // ----------------------------------------------------------
  // Favorites
  // ----------------------------------------------------------

  function readFavoriteOps() {
    return readArray(FAVORITE_OPS_KEY).filter(function (op) {
      return op && op.file_id && typeof op.added === 'boolean';
    });
  }

  function writeFavoriteOps(ops) {
    return writeArray(FAVORITE_OPS_KEY, ops);
  }

  function queueFavoriteOp(userId, fileId, added) {
    var ops = readFavoriteOps().filter(function (op) {
      return !(String(op.user_id || '') === String(userId) && op.file_id === fileId);
    });
    ops.push({ user_id: userId, file_id: fileId, added: !!added, at: Date.now() });
    writeFavoriteOps(ops);
  }

  function removeFavoriteOpsFor(userId, fileId) {
    writeFavoriteOps(readFavoriteOps().filter(function (op) {
      return !(String(op.user_id || '') === String(userId) && op.file_id === fileId);
    }));
  }

  async function readLocalFavorites() {
    if (typeof getAllFavorites !== 'function') return [];
    try {
      var local = await getAllFavorites();
      return Array.isArray(local) ? local : [];
    } catch (e) {
      return [];
    }
  }

  async function applyFavoriteOp(userId, fileId, added) {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;
      if (added) {
        // INSERT (not upsert): retrying an already-synced favorite is a
        // harmless unique violation. Using upsert would require UPDATE
        // privilege/policy, which this relation-only table does not need.
        var insertResult = await supabaseClient
          .from('favorites')
          .insert({ user_id: userId, file_id: fileId });
        if (insertResult.error && insertResult.error.code !== '23505') {
          throw insertResult.error;
        }
      } else {
        var deleteResult = await supabaseClient
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('file_id', fileId);
        if (deleteResult.error) throw deleteResult.error;
      }
      return true;
    } catch (err) {
      console.warn('favorite sync failed:', err && err.message ? err.message : err);
      return false;
    }
  }

  async function flushFavoriteOps(userId) {
    var ops = readFavoriteOps();
    if (!ops.length) return true;
    var remaining = [];
    var failedCurrent = false;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.user_id && String(op.user_id) !== String(userId)) {
        remaining.push(op);
        continue;
      }
      var ok = await applyFavoriteOp(userId, op.file_id, op.added);
      if (!ok) {
        remaining.push(op);
        failedCurrent = true;
      }
    }
    writeFavoriteOps(remaining);
    return !failedCurrent;
  }

  async function ensureFavoriteOwner(userId) {
    var owner = safeGet(FAVORITES_OWNER_KEY, '');
    if (owner && String(owner) !== String(userId)) {
      if (typeof clearAllFavorites === 'function') await clearAllFavorites();
      writeFavoriteOps([]);
      safeRemove(FAVORITES_LAST_SYNC_KEY);
      safeSet(FAVORITES_OWNER_KEY, userId);
    }
  }

  async function pushFavoriteChange(userId, fileId, added) {
    await ensureFavoriteOwner(userId);

    if (navigator.onLine) {
      var ok = await applyFavoriteOp(userId, fileId, added);
      if (ok) {
        removeFavoriteOpsFor(userId, fileId);
        return { synced: true, queued: false };
      }
    }
    queueFavoriteOp(userId, fileId, added);
    return { synced: false, queued: true };
  }

  async function syncFavoriteChange(fileId, added) {
    var userId = await directUserId();
    if (!userId) return { synced: false, localOnly: true };
    return pushFavoriteChange(userId, fileId, added);
  }

  async function toggleCloudFavorite(file, subjectName, subjectSlug) {
    var userId = await directUserId();
    if (userId) await ensureFavoriteOwner(userId);

    var already = await isFavorite(file.id);
    if (already) {
      await removeFavorite(file.id);
      if (userId) await pushFavoriteChange(userId, file.id, false);
      return { added: false };
    }

    await addFavorite({
      id: file.id,
      title: file.title,
      subject_name: subjectName || (file.subjects && file.subjects.name) || '',
      subject_slug: subjectSlug || (file.subjects && file.subjects.slug) || '',
      category: file.category,
      file_size: file.file_size,
      file_url: file.file_url,
      file_path: file.file_path,
      external_url: file.external_url || null,
      source: file.source || 'upload',
      mime_type: file.mime_type || 'application/pdf',
      created_at: file.created_at
    });
    if (userId) await pushFavoriteChange(userId, file.id, true);
    return { added: true };
  }

  async function removeCloudFavorite(fileId) {
    var userId = await directUserId();
    if (userId) await ensureFavoriteOwner(userId);
    await removeFavorite(fileId);
    if (userId) await pushFavoriteChange(userId, fileId, false);
    return true;
  }

  async function fetchCloudFavorites(userId) {
    try {
      var result = await supabaseClient
        .from('favorites')
        .select('file_id,created_at,files(id,title,description,subject_id,file_url,file_path,file_size,mime_type,category,created_at,source,external_url,subjects(name,slug))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (result.error) throw result.error;
      var files = [];
      (result.data || []).forEach(function (row) {
        var file = row.files;
        if (!file) return;
        files.push({
          id: file.id,
          title: file.title,
          description: file.description || '',
          subject_name: file.subjects && file.subjects.name ? file.subjects.name : '',
          subject_slug: file.subjects && file.subjects.slug ? file.subjects.slug : '',
          category: file.category,
          file_size: file.file_size || 0,
          file_url: file.file_url,
          file_path: file.file_path || null,
          external_url: file.external_url || null,
          source: file.source || 'upload',
          mime_type: file.mime_type || 'application/pdf',
          created_at: file.created_at,
          added_at: Date.parse(row.created_at) || Date.now()
        });
      });
      return files;
    } catch (err) {
      console.warn('fetchCloudFavorites failed:', err && err.message ? err.message : err);
      return null;
    }
  }

  async function syncFavoritesFromCloud(userOrId) {
    var userId = userIdOf(userOrId) || await directUserId();
    if (!userId || !navigator.onLine) return false;
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return false;

    var last = readJson(FAVORITES_LAST_SYNC_KEY, null);
    if (last && String(last.user_id) === String(userId) && Date.now() - Number(last.at || 0) < 3000 && readFavoriteOps().length === 0) {
      return true;
    }
    if (favoritesSyncPromise) return favoritesSyncPromise;

    favoritesSyncPromise = (async function () {
      var owner = safeGet(FAVORITES_OWNER_KEY, '');
      if (owner && String(owner) !== String(userId)) {
        if (typeof clearAllFavorites === 'function') await clearAllFavorites();
        writeFavoriteOps([]);
        safeRemove(FAVORITES_LAST_SYNC_KEY);
      } else if (!owner) {
        // Preserve favorites created by the pre-cloud version of the app.
        var local = await readLocalFavorites();
        for (var i = 0; i < local.length; i++) {
          if (local[i] && local[i].id) queueFavoriteOp(userId, local[i].id, true);
        }
      }
      safeSet(FAVORITES_OWNER_KEY, userId);

      // A rejected operation must not block other devices' favorites from
      // downloading. It stays queued and is re-applied to the local view below.
      await flushFavoriteOps(userId);

      var cloudFavorites = await fetchCloudFavorites(userId);
      if (cloudFavorites === null) return false;

      var unresolved = readFavoriteOps().filter(function (op) {
        return !op.user_id || String(op.user_id) === String(userId);
      });
      if (unresolved.length) {
        var cloudById = {};
        cloudFavorites.forEach(function (favorite) { cloudById[favorite.id] = favorite; });
        var localById = {};
        var localSnapshot = await readLocalFavorites();
        localSnapshot.forEach(function (favorite) { localById[favorite.id] = favorite; });
        unresolved.forEach(function (op) {
          if (op.added) {
            if (localById[op.file_id]) cloudById[op.file_id] = localById[op.file_id];
          } else {
            delete cloudById[op.file_id];
          }
        });
        cloudFavorites = Object.keys(cloudById).map(function (id) { return cloudById[id]; });
      }

      if (typeof clearAllFavorites === 'function') {
        var cleared = await clearAllFavorites();
        if (!cleared) return false;
      }
      if (typeof addFavorite === 'function') {
        for (var f = 0; f < cloudFavorites.length; f++) {
          await addFavorite(cloudFavorites[f]);
        }
      }

      safeSet(FAVORITES_LAST_SYNC_KEY, JSON.stringify({ user_id: userId, at: Date.now() }));
      dispatch('medapp:favorites-synced', { count: cloudFavorites.length });
      return true;
    })();

    try {
      return await favoritesSyncPromise;
    } finally {
      favoritesSyncPromise = null;
    }
  }

  // ----------------------------------------------------------
  // Study streak (سلسلة الأيام)
  // ----------------------------------------------------------
  // ⭐ القاعدة الأساسية: اليوم يُعدّ "نشطاً" إذا أنجز المستخدم مهمة
  // **في ذلك اليوم بالذات** — لا في يوم المهمة المخطّط لها.
  //
  // مثال: مهمة مخطّطة ليوم 16 أُنجزت في يوم 19 → اليوم النشط هو 19
  // (اليوم الذي عمل فيه المستخدم فعلياً)، وليس 16.
  //
  // المصادر:
  //   • محلي  → مفاتيح `task_at_<date>_<id>` (وقت الإجازة) في db.js
  //   • سحابي → العمود completed_at في جدول task_progress
  //
  // هكذا لا تُنسب إنجازات الأيام السابقة/القادمة إلى يوم آخر.

  /**
   * ⭐ يجمع كل ما تحتاجه ورقة السلسلة:
   *   dates         → الأيام التي عمل فيها المستخدم فعلاً
   *   tasksCompleted→ عدد المهام المنجزة إجمالاً
   *
   * ⭐ القاعدة: الحالة تُحسب لكل مهمة على حدة ("date|task_id"):
   *   • إذا كانت المهمة ملغاة محلياً (tombstone) → لا تُحتسب إطلاقاً.
   *   • إذا كانت منجزة → يُحتسب يوم إنجازها الحقيقي.
   *   • الحالة المحلية (الطابور) تتقدّم على السحابة دائماً.
   */
  async function collectStreakData() {
    var states = new Map();

    // 1) الحالة المحلية — الطابور + الختم المحلي (الأحدث).
    try {
      if (typeof getLocalTaskStates === 'function') {
        var localStates = getLocalTaskStates();
        if (localStates && typeof localStates.forEach === 'function') {
          localStates.forEach(function (state, id) { states.set(id, state); });
        }
      }
    } catch (e) {}

    // 2) السحابة — مصدر إضافي للأجهزة الأخرى.
    if (navigator.onLine && typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        var userId = await directUserId();
        if (userId) {
          var result = await supabaseClient
            .from('task_progress')
            .select('plan_date,task_id,completed,completed_at')
            .eq('user_id', userId)
            .eq('completed', true);
          if (!result.error && result.data) {
            result.data.forEach(function (row) {
              if (!row || !row.plan_date || !row.task_id) return;
              var id = String(row.plan_date) + '|' + String(row.task_id);
              if (states.has(id)) return;   // ⭐ المحلي يتقدّم
              states.set(id, { done: true, at: row.completed_at || '' });
            });
          }
        }
      } catch (err) {
        console.warn('collectStreakData (cloud) failed:', err && err.message ? err.message : err);
      }
    }

    // 3) تحويل الحالات إلى أيام.
    var dates = Object.create(null);
    var tasksCompleted = 0;
    states.forEach(function (state, id) {
      if (!state || !state.done) return;   // ⭐ المُلغاة لا تُحتسب
      tasksCompleted++;
      var day = '';
      if (state.at) {
        try {
          var stamp = new Date(state.at);
          if (!isNaN(stamp.getTime())) {
            day = stamp.getFullYear() + '-' +
              String(stamp.getMonth() + 1).padStart(2, '0') + '-' +
              String(stamp.getDate()).padStart(2, '0');
          }
        } catch (e) {}
      }
      if (!day) day = String(id).split('|')[0];
      if (day) dates[day] = true;
    });

    return {
      dates: Object.keys(dates),
      tasksCompleted: tasksCompleted
    };
  }

  /**
   * ⭐ Compatibility wrapper — the list of active days only.
   */
  async function collectActiveTaskDates() {
    var data = await collectStreakData();
    return data.dates;
  }

  // ----------------------------------------------------------
  // Streak freezes (تجميد السلسلة) — نمط Duolingo
  // ----------------------------------------------------------
  // تجميدان لكل شهر تقويمي. عند فوات يوم داخل السلسلة، يُستهلك
  // تجميد تلقائياً فلا تنقطع السلسلة.

  var STREAK_FREEZES_TABLE = 'streak_freezes';
  var STREAK_FREEZE_LIMIT = 2;
  var STREAK_FREEZE_LOCAL_KEY = 'medapp_streak_freezes_v1';
  var STREAK_FREEZE_WINDOW_DAYS = 7;   // لا نُجمّد فوات أقدم من أسبوع

  function streakMonthKey(dayKey) {
    return String(dayKey || '').slice(0, 7);
  }

  function streakCurrentMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function readLocalFreezes() {
    try {
      var raw = localStorage.getItem(STREAK_FREEZE_LOCAL_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalFreezes(days) {
    try {
      localStorage.setItem(STREAK_FREEZE_LOCAL_KEY, JSON.stringify(days));
    } catch (e) {}
  }

  /**
   * ⭐-days المحمية بتجميد + المتبقّي لهذا الشهر.
   */
  async function getStreakFreezes() {
    var days = [];
    var userId = '';

    if (navigator.onLine && typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        userId = await directUserId();
        if (userId) {
          var result = await supabaseClient
            .from(STREAK_FREEZES_TABLE)
            .select('day_key,month_key')
            .eq('user_id', userId);
          if (!result.error && result.data) {
            result.data.forEach(function (row) {
              if (row && row.day_key) days.push(String(row.day_key).slice(0, 10));
            });
          }
        }
      } catch (err) {
        console.warn('getStreakFreezes failed:', err && err.message ? err.message : err);
      }
    }

    // ⭐ الزائر أو وضع عدم الاتصال: تجميدات محلية.
    if (!days.length) {
      var local = readLocalFreezes();
      if (local.length) days = local;
    }

    var month = streakCurrentMonthKey();
    var used = days.filter(function (day) { return streakMonthKey(day) === month; }).length;

    return {
      days: days,
      used: used,
      remaining: Math.max(0, STREAK_FREEZE_LIMIT - used),
      limit: STREAK_FREEZE_LIMIT
    };
  }

  /**
   * ⭐ استهلاك تجميد ليوم فائت. يُرجع false إن لم يبقَ رصيد.
   */
  async function consumeStreakFreeze(dayKey) {
    if (!dayKey) return false;
    var day = String(dayKey).slice(0, 10);
    var month = streakMonthKey(day);

    var current = await getStreakFreezes();
    var usedInMonth = current.days.filter(function (item) {
      return streakMonthKey(item) === month;
    }).length;
    if (usedInMonth >= STREAK_FREEZE_LIMIT) return false;

    var userId = '';
    try {
      if (navigator.onLine && typeof supabaseClient !== 'undefined' && supabaseClient) {
        userId = await directUserId();
      }
    } catch (e) {}

    if (userId) {
      try {
        var result = await supabaseClient
          .from(STREAK_FREEZES_TABLE)
          .insert({ user_id: userId, day_key: day, month_key: month });
        if (result.error) {
          // قد يكون اليوم مجمَّداً مسبقاً (تعارض فريد) — نعتبره محمياً.
          if (result.error.code !== '23505') throw result.error;
        }
        return true;
      } catch (err) {
        console.warn('consumeStreakFreeze failed:', err && err.message ? err.message : err);
      }
    }

    // احتياطي محلي (زائر أو تعذّر الحفظ)
    var local = readLocalFreezes();
    if (local.indexOf(day) === -1) {
      local.push(day);
      writeLocalFreezes(local);
    }
    return true;
  }

  /**
   * Returns the full streak state for the UI.
   * Falls back to a zeroed state when streak.js is not loaded.
   */
  async function getStudyStreak() {
    var todayKey = '';
    try {
      if (window.MedAppStreakCore && typeof window.MedAppStreakCore.todayKeyLocal === 'function') {
        todayKey = window.MedAppStreakCore.todayKeyLocal();
      } else {
        var now = new Date();
        todayKey = now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0');
      }
    } catch (e) {}

    var dates = [];
    var tasksCompleted = 0;
    try {
      var streakData = await collectStreakData();
      dates = streakData.dates;
      tasksCompleted = streakData.tasksCompleted;
    } catch (e) {}

    // ⭐ التجميدات المحمية (تُستهلك تلقائياً عند فوات يوم).
    var freezes = { days: [], used: 0, remaining: STREAK_FREEZE_LIMIT, limit: STREAK_FREEZE_LIMIT };
    try { freezes = await getStreakFreezes(); } catch (e) {}

    var result;
    if (window.MedAppStreakCore && typeof window.MedAppStreakCore.compute === 'function') {
      result = window.MedAppStreakCore.compute(dates, todayKey, freezes.days);

      // ⭐ استهلاك تلقائي: إن انقطعت السلسلة وكان في رصيد تجميد،
      //    نحمي اليوم الفائت حتى لا تنقطع السلسلة.
      var guard = 0;
      while (result.breakDay && guard < STREAK_FREEZE_LIMIT) {
        guard++;
        if (!streakFreezeCanCover(result.breakDay, todayKey, dates)) break;
        var consumed = false;
        try { consumed = await consumeStreakFreeze(result.breakDay); } catch (e) {}
        if (!consumed) break;
        if (freezes.days.indexOf(result.breakDay) === -1) freezes.days.push(result.breakDay);
        result = window.MedAppStreakCore.compute(dates, todayKey, freezes.days);
      }

      try {
        var refreshed = await getStreakFreezes();
        freezes.remaining = refreshed.remaining;
        freezes.used = refreshed.used;
        freezes.days = refreshed.days.length ? refreshed.days : freezes.days;
      } catch (e) {}
    } else {
      result = {
        todayKey: todayKey,
        current: 0,
        longest: 0,
        todayActive: false,
        activeDates: dates,
        frozenDates: freezes.days,
        lastActiveDate: '',
        totalActiveDays: dates.length,
        breakDay: ''
      };
    }

    result.tasksCompleted = tasksCompleted;
    result.frozenDays = freezes.days;
    result.freezeRemaining = freezes.remaining;
    result.freezeLimit = freezes.limit;
    result.freezeUsed = freezes.used;
    return result;
  }

  /**
   * ⭐ هل يجوز تجميد هذا اليوم؟
   * • لا يجوز تجميد اليوم (لم يُنجز بعد — هذا طبيعي).
   * • لا نُجمّد فوات أقدم من أسبوع (حماية رصيد المستخدم).
   * • ⭐ ولا نُجمّد إلا فجوة "داخل" السلسلة: يجب أن يكون اليوم
   *   قبلها نشطاً — وإلا فالسلسلة كانت قد انتهت أصلاً ولا داعي للتجميد.
   */
  function streakFreezeCanCover(dayKey, todayKey, activeDates) {
    if (!dayKey || !todayKey) return false;
    var core = window.MedAppStreakCore;
    if (!core || typeof core.diffDays !== 'function') return false;

    var ago = core.diffDays(dayKey, todayKey);
    if (!ago || ago < 1 || ago > STREAK_FREEZE_WINDOW_DAYS) return false;

    var previous = core.addDays(dayKey, -1);
    var list = activeDates || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] === previous) return true;
    }
    return false;
  }

  // ----------------------------------------------------------
  // Full account sync
  // ----------------------------------------------------------

  async function runFullUserSync(user, options) {
    options = options || {};
    var userId = userIdOf(user) || await directUserId();
    if (!userId) return { ok: false, offline: !navigator.onLine };
    if (!navigator.onLine) return { ok: false, offline: true };

    var force = !!options.force;
    if (!force) {
      var last = readJson(FULL_SYNC_KEY, null);
      if (last && String(last.user_id) === String(userId) && Date.now() - Number(last.at || 0) < 30000) {
        return { ok: true, skipped: true };
      }
    }
    if (fullSyncPromise) return fullSyncPromise;

    fullSyncPromise = (async function () {
      var result = {
        ok: true,
        tasks: false,
        favorites: false,
        notes: false,
        profile: false
      };

      if (typeof syncTaskProgressFromCloud === 'function') {
        try { result.tasks = await syncTaskProgressFromCloud(userId); } catch (e) {}
      }
      if (typeof syncFavoritesFromCloud === 'function') {
        try { result.favorites = await syncFavoritesFromCloud(userId); } catch (e) {}
      }
      if (typeof syncNotesFromCloud === 'function') {
        try {
          var notesResult = await syncNotesFromCloud(userId);
          result.notes = !!(notesResult && notesResult.ok);
        } catch (e) {}
      }

      // ⭐ خزّن الملف الشخصي محلياً: بدون اتصال يجب أن يبقى الاسم
      // والرتبة كما هما بدل الرجوع لبيانات المصادقة الأساسية.
      if (typeof getProfile === 'function' && typeof cacheProfile === 'function') {
        try {
          var profile = await getProfile(userId);
          // ⭐⭐⭐ Phase W17 — «الجلسة بلا صفّ ملف شخصي»:
          //   كان الـtrigger على auth.users مفقوداً ⇒ كل مستخدم جديد يدخل
          //   بلا صفّ ⇒ اسمه بريده وصورته غائبة. الآن ننشئ الصفّ فوراً
          //   من بيانات الجلسة (Google) — في كل مزامنة، لا في الصفحة الأولى فقط.
          if ((!profile || !String(profile.full_name || '').trim()) && typeof ensureProfileRow === 'function') {
            try {
              var liveUser = user || null;
              if (!liveUser) {
                var sessionForUser = await supabaseClient.auth.getSession();
                liveUser = sessionForUser && sessionForUser.data && sessionForUser.data.session
                  ? sessionForUser.data.session.user
                  : null;
              }
              if (liveUser) profile = await ensureProfileRow(liveUser);
            } catch (e) {}
          }
          if (profile) {
            var profileEmail = '';
            try {
              var sessionResult = await supabaseClient.auth.getSession();
              var liveSession = sessionResult && sessionResult.data && sessionResult.data.session;
              if (liveSession && liveSession.user) profileEmail = liveSession.user.email || '';
            } catch (e) {}
            cacheProfile(profile, profileEmail);
            result.profile = true;
          }
        } catch (e) {}
      }

      if (result.tasks || result.favorites || result.notes) {
        safeSet(FULL_SYNC_KEY, JSON.stringify({ user_id: userId, at: Date.now() }));
      }
      dispatch('medapp:cloud-synced', result);
      return result;
    })();

    try {
      return await fullSyncPromise;
    } finally {
      fullSyncPromise = null;
    }
  }

  async function clearCloudLocalCaches(options) {
    options = options || {};
    // Keep private notes/deletes across sign-out so unsynced offline notes are
    // not lost. The next sign-in either uploads them (same account) or clears
    // them through the owner check (different account).
    if (!options.keepNotes) clearNotesLocalState();
    safeRemove(FAVORITES_OWNER_KEY);
    safeRemove(FAVORITES_LAST_SYNC_KEY);
    safeRemove(FAVORITE_OPS_KEY);
    safeRemove(FULL_SYNC_KEY);
    if (typeof clearLocalTaskProgressState === 'function') {
      clearLocalTaskProgressState();
    } else {
      safeRemove(TASK_OWNER_KEY);
    }
    if (typeof clearAllFavorites === 'function') {
      try { await clearAllFavorites(); } catch (e) {}
    }
    // ⭐ تجميدات السلسلة محلية — تُمسح مع الحساب حتى لا تنتقل لآخر.
    try { localStorage.removeItem('medapp_streak_freezes_v1'); } catch (e) {}
  }

  global.syncNotesFromCloud = syncNotesFromCloud;
  global.syncFavoritesFromCloud = syncFavoritesFromCloud;
  global.syncFavoriteChange = syncFavoriteChange;
  global.toggleCloudFavorite = toggleCloudFavorite;
  global.removeCloudFavorite = removeCloudFavorite;
  global.upsertCloudNote = upsertNote;
  global.deleteCloudNote = deleteCloudNote;
  global.queueNoteDelete = queueNoteDelete;
  global.runFullUserSync = runFullUserSync;
  global.clearCloudLocalCaches = clearCloudLocalCaches;
  // ----------------------------------------------------------
  // ⭐ المصدر الوحيد لحالة المهام (Single Source of Truth)
  // ----------------------------------------------------------
  // كل مكان في التطبيق يبدّل حالة مهمة يمرّ من هنا:
  //   1) تُكتب الحالة محلياً فوراً (task_* + task_at_*) — بلا شبكة.
  //   2) تُحدَّث طابور المزامنة (فيتجاوز الطابور أي نسخة أقدم).
  //   3) يُوزَّع الحدث العام 'taskUpdated' → تتحدّث كل الواجهات
  //      فوراً: بطاقة اليوم، عدّاد السلسلة، وصفحة "تقدمي".
  //   4) يُرفع التغيير إلى Supabase في الخلفية.

  /**
   * @param {string} planDate  تاريخ المهمة (YYYY-MM-DD)
   * @param {string} taskId    معرّف المهمة
   * @param {boolean} completed الحالة الجديدة
   * @param {object} [task]    تفاصيل المهمة (subject, task, instructor, type)
   * @param {string} [source]  مصدر التغيير (progress / today-card …)
   */
  async function setTaskCompleted(planDate, taskId, completed, task, source) {
    var date = String(planDate || '');
    var id = String(taskId || '');
    if (!date || !id) return { ok: false, error: 'missing task reference' };

    var done = !!completed;

    // 1) الحالة المحلية — فورية.
    if (typeof setLocalTaskCompletion === 'function') {
      try { setLocalTaskCompletion(date, id, done); } catch (e) {}
    }

    // 2) الطابور (محلي، سريع) — نجعل الرفع في الخلفية.
    if (typeof queueTaskProgressSync === 'function') {
      try {
        var payload = Object.assign({}, task || {});
        payload.id = id;
        payload.date = date;
        await queueTaskProgressSync(payload, done, { deferFlush: true });
      } catch (e) {}
    }

    // 3) ⭐ الحدث العام — كل الواجهات تتحدّث في اللحظة نفسها.
    dispatch('taskUpdated', {
      planDate: date,
      taskId: id,
      completed: done,
      source: source || 'unknown'
    });

    // 4) الرفع إلى Supabase في الخلفية.
    if (navigator.onLine) {
      try {
        if (typeof flushTaskProgressQueue === 'function') {
          flushTaskProgressQueue().catch(function () {});
        }
      } catch (e) {}
    }

    return { ok: true, planDate: date, taskId: id, completed: done };
  }

  /**
   * ⭐ قراءة حالة مجموعة مهام (تُستخدم بعد أي حدث تغيير).
   */
  function getTaskCompletionMap() {
    var map = Object.create(null);
    try {
      if (typeof getLocalTaskStates === 'function') {
        var states = getLocalTaskStates();
        states.forEach(function (state, id) {
          map[id] = !!(state && state.done);
        });
      } else if (typeof getLocalCompletedTaskKeys === 'function') {
        getLocalCompletedTaskKeys().forEach(function (key) { map[key] = true; });
      }
    } catch (e) {}
    return map;
  }

  global.collectActiveTaskDates = collectActiveTaskDates;
  global.collectStreakData = collectStreakData;
  global.getStudyStreak = getStudyStreak;
  global.getStreakFreezes = getStreakFreezes;
  global.consumeStreakFreeze = consumeStreakFreeze;
  global.setTaskCompleted = setTaskCompleted;
  global.getTaskCompletionMap = getTaskCompletionMap;

  global.MedAppSync = {
    runFullUserSync: runFullUserSync,
    syncNotesFromCloud: syncNotesFromCloud,
    syncFavoritesFromCloud: syncFavoritesFromCloud,
    syncFavoriteChange: syncFavoriteChange,
    clearCloudLocalCaches: clearCloudLocalCaches,
    collectActiveTaskDates: collectActiveTaskDates,
    collectStreakData: collectStreakData,
    getStudyStreak: getStudyStreak,
    getStreakFreezes: getStreakFreezes,
    consumeStreakFreeze: consumeStreakFreeze,
    setTaskCompleted: setTaskCompleted,
    getTaskCompletionMap: getTaskCompletionMap,
    notesKeys: {
      mine: NOTES_MY_KEY,
      pending: NOTES_PENDING_KEY,
      shared: NOTES_SHARED_KEY,
      deletes: NOTES_DELETES_KEY
    }
  };

  // ⭐⭐⭐ Phase W17.1 — المزامنة الكاملة مرّة واحدة كل ٣٠ ثانية كحدّ أقصى:
  //   كان كل حدث 'online' (وهو يتكرّر على أندرويد) يُطلق مزامنة كاملة
  //   (مهام + مفضّلة + ملاحظات + ملف شخصي) ⇒ tens of requests بلا داعٍ.
  global.addEventListener('online', function () {
    if (!(global.medappThrottle ? global.medappThrottle('sync:full', 30000) : true)) return;
    setTimeout(async function () {
      var userId = await directUserId();
      if (userId) runFullUserSync({ id: userId }, { force: true });
    }, 1200);
  });
})(window);
