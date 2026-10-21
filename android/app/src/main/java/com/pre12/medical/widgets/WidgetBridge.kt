package com.pre12.medical.widgets

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * ⭐⭐ Phase W2 — the widget data bridge (native side).
 *
 * The WebView cannot pass objects to a widget: it writes a **JSON string**
 * through the `MedWidgets` plugin, which stores it in `SharedPreferences`
 * under a group name. Glance re-reads that group every time the launcher asks
 * for a frame, so the widget has no cache to invalidate.
 *
 * ⚠️ `PREFS_GROUP` / `KEY_*` must stay byte-identical to `widgets.js` and
 * `MedWidgetsPlugin.kt`. A mismatch produces a silently empty widget — the most
 * expensive bug class in this feature.
 *
 * Every parser here is pure (no Android calls) and defensive: missing keys,
 * wrong types or malformed JSON degrade to the empty state, never to a crash in
 * the launcher process.
 */

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

data class TaskItem(
    val id: String,
    val title: String,
    val isCompleted: Boolean,
    val subject: String = "",
    /**
     * Epoch millis of the completion. Used by the card to keep a just-checked
     * task on screen for ~0.9 s (strike-through + animated tick), then let it
     * leave the list so the next pending task takes its place.
     */
    val doneAt: Long = 0L
)

data class TodayTasks(
    val date: String = "",
    val items: List<TaskItem> = emptyList(),
    val total: Int = 0,
    val done: Int = 0,
    val updatedAt: String = ""
) {
    val isEmpty: Boolean
        get() = items.isEmpty()

    /** Prefer the server-side counters, fall back to counting the rows. */
    val completedCount: Int
        get() = if (total > 0) done else items.count { it.isCompleted }

    val totalCount: Int
        get() = if (total > 0) total else items.size

    /** Rows the widget should still show (open tasks + the one just ticked). */
    val pendingItems: List<TaskItem>
        get() = items.filter { !it.isCompleted }

    /** Every task of the day is complete — show the celebration row. */
    val allDone: Boolean
        get() = totalCount > 0 && completedCount >= totalCount

    /** 0f..1f, safe for an empty day. */
    val progress: Float
        get() {
            val count = totalCount
            if (count <= 0) return 0f
            return (completedCount.toFloat() / count.toFloat()).coerceIn(0f, 1f)
        }
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

enum class StreakDayState {
    DONE,
    MISSED,
    TODAY,
    TODAY_DONE,
    FREEZE;

    companion object {
        fun from(raw: String?): StreakDayState = when (raw) {
            "done" -> DONE
            "today" -> TODAY
            "today_done" -> TODAY_DONE
            "freeze" -> FREEZE
            else -> MISSED
        }
    }
}

data class StreakDay(
    val date: String = "",
    val label: String = "",
    val state: StreakDayState = StreakDayState.MISSED
)

data class StreakSummary(
    val current: Int = 0,
    val longest: Int = 0,
    val freezes: Int = 0,
    val todayDone: Boolean = false,
    val days: List<StreakDay> = emptyList(),
    val updatedAt: String = ""
) {
    val isEmpty: Boolean
        get() = days.isEmpty() && current == 0 && longest == 0
}

// ---------------------------------------------------------------------------
// Notes & goals
// ---------------------------------------------------------------------------

data class PinnedItem(
    val id: String,
    val text: String,
    val kind: String,        // "goal" | "note"
    val isDone: Boolean
)

data class PinnedNotes(
    val items: List<PinnedItem> = emptyList(),
    val total: Int = 0,
    val updatedAt: String = ""
) {
    val isEmpty: Boolean
        get() = items.isEmpty()
}

// ---------------------------------------------------------------------------
// Pending toggles (widget → app)
// ---------------------------------------------------------------------------

data class PendingToggle(
    val id: String,
    val date: String,
    val done: Boolean,
    val at: String,
    val title: String = "",
    val subject: String = ""
)

/**
 * Supabase credentials handed over by `widgets.js` so a WorkManager job can
 * finish the upload with no WebView alive. The anon key is public by design;
 * the JWT is the user's own session and never leaves the app's private prefs.
 */
data class WidgetSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val expiresAt: Long
)

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

object WidgetBridge {

    /** SharedPreferences group shared with the Capacitor bridge plugin. */
    const val PREFS_GROUP = "medapp_widget_state"

    const val KEY_META = "widget.meta"
    const val KEY_TASKS_TODAY = "tasks.today"
    const val KEY_STREAK = "streak.summary"
    const val KEY_NOTES = "notes.pinned"
    const val KEY_PENDING = "pending.tasks"
    const val KEY_SESSION = "sync.session"

    /** Hard ceilings so a corrupt payload can never bloat the RemoteViews tree. */
    private const val MAX_TASKS = 12
    private const val MAX_DAYS = 7
    private const val MAX_NOTES = 6
    private const val MAX_PENDING = 50

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE)

    // -- writes ---------------------------------------------------------------

    @Synchronized
    fun write(context: Context, key: String, json: String?): Boolean {
        if (json.isNullOrBlank()) return false
        return prefs(context).edit().putString(key, json).commit()
    }

    @Synchronized
    fun writeMeta(context: Context, source: String) {
        val meta = JSONObject()
            .put("updatedAt", isoNow())
            .put("source", source)
        prefs(context).edit().putString(KEY_META, meta.toString()).apply()
    }

    // -- tasks ----------------------------------------------------------------

    fun readTodayTasks(context: Context): TodayTasks =
        parseTodayTasks(prefs(context).getString(KEY_TASKS_TODAY, null))

    /**
     * Applies an optimistic checkbox change inside the stored payload.
     * Returns the new state of the task, or null when it is not in the payload.
     */
    @Synchronized
    fun applyTaskToggle(context: Context, taskId: String, done: Boolean): Boolean? {
        val raw = prefs(context).getString(KEY_TASKS_TODAY, null) ?: return null
        return try {
            val root = JSONObject(raw)
            val array = root.optJSONArray("items") ?: return null
            var found = false
            var completed = 0
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                if (item.optString("id") != taskId) continue
                item.put("done", done)
                item.put("isCompleted", done)
                // The stamp is what drives the "disappear after 0.9 s" effect:
                // the immediate redraw keeps the row (strike + tick), the delayed
                // one filters it out and the list reflows.
                item.put("doneAt", if (done) System.currentTimeMillis() else 0L)
                found = true
                if (done) completed++
            }
            if (!found) return null
            root.put("done", completed)
            root.put("total", array.length())
            root.put("updatedAt", isoNow())
            prefs(context).edit().putString(KEY_TASKS_TODAY, root.toString()).commit()
            done
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Re-applies every queued checkbox change on top of a *fresh* payload coming
     * from the app.
     *
     * Why this exists: the widget can be tapped while `widgets.js` is publishing
     * (e.g. the app just resumed). The JS payload is built from localStorage,
     * which does not yet contain that tap, so writing it blindly would flip the
     * checkbox back until the queue is drained. Merging here makes the optimistic
     * state win the race — a toggle can never be lost, even for one frame.
     *
     * `done` is adjusted by the delta rather than recounted, so a payload that
     * was capped at [MAX_TASKS] rows still reports the correct total.
     */
    @Synchronized
    fun mergePending(context: Context, tasksJson: String): String {
        val pending = readPending(context)
        if (pending.isEmpty()) return tasksJson

        return try {
            val root = JSONObject(tasksJson)
            val items = root.optJSONArray("items") ?: return tasksJson
            val date = root.optString("date", "")

            val overrides = HashMap<String, Boolean>()
            pending.forEach { overrides[it.date + "|" + it.id] = it.done }

            var delta = 0
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                val key = date + "|" + item.optString("id")
                val desired = overrides[key] ?: continue
                val before = item.optBoolean("done", false)
                if (before != desired) {
                    item.put("done", desired)
                    item.put("isCompleted", desired)
                    delta += if (desired) 1 else -1
                }
            }

            if (delta != 0) {
                val done = (root.optInt("done", 0) + delta)
                    .coerceIn(0, root.optInt("total", 0).coerceAtLeast(1))
                root.put("done", done)
                val total = root.optInt("total", 0)
                root.put("progress", if (total > 0) done.toFloat() / total.toFloat() else 0f)
                root.put("updatedAt", isoNow())
            }
            root.toString()
        } catch (_: Exception) {
            tasksJson
        }
    }

    fun parseTodayTasks(raw: String?): TodayTasks {
        if (raw.isNullOrBlank()) return TodayTasks()
        return try {
            val root = JSONObject(raw)
            val array = root.optJSONArray("items") ?: JSONArray()
            val limit = minOf(array.length(), MAX_TASKS)
            val items = ArrayList<TaskItem>(limit)
            for (index in 0 until limit) {
                val obj = array.optJSONObject(index) ?: continue
                val title = obj.optString("title", "").trim()
                if (title.isEmpty()) continue
                items += TaskItem(
                    id = obj.optString("id", "task-$index"),
                    title = title,
                    isCompleted = obj.optBoolean("done", obj.optBoolean("isCompleted", false)),
                    subject = obj.optString("subject", ""),
                    doneAt = obj.optLong("doneAt", 0L)
                )
            }
            val total = root.optInt("total", items.size).takeIf { it > 0 } ?: items.size
            val done = root.optInt("done", items.count { it.isCompleted })
            TodayTasks(
                date = root.optString("date", ""),
                items = items,
                total = total,
                done = done.coerceIn(0, maxOf(total, items.size)),
                updatedAt = root.optString("updatedAt", "")
            )
        } catch (_: Exception) {
            TodayTasks()
        }
    }

    // -- streak ---------------------------------------------------------------

    fun readStreak(context: Context): StreakSummary =
        parseStreak(prefs(context).getString(KEY_STREAK, null))

    fun parseStreak(raw: String?): StreakSummary {
        if (raw.isNullOrBlank()) return StreakSummary()
        return try {
            val root = JSONObject(raw)
            val array = root.optJSONArray("days") ?: JSONArray()
            val limit = minOf(array.length(), MAX_DAYS)
            val days = ArrayList<StreakDay>(limit)
            for (index in 0 until limit) {
                val obj = array.optJSONObject(index) ?: continue
                days += StreakDay(
                    date = obj.optString("date", ""),
                    label = obj.optString("label", ""),
                    state = StreakDayState.from(obj.optString("state", "missed"))
                )
            }
            StreakSummary(
                current = root.optInt("current", 0).coerceAtLeast(0),
                longest = root.optInt("longest", 0).coerceAtLeast(0),
                freezes = root.optInt("freezes", 0).coerceAtLeast(0),
                todayDone = root.optBoolean("todayDone", false),
                days = days,
                updatedAt = root.optString("updatedAt", "")
            )
        } catch (_: Exception) {
            StreakSummary()
        }
    }

    // -- notes ----------------------------------------------------------------

    fun readNotes(context: Context): PinnedNotes =
        parseNotes(prefs(context).getString(KEY_NOTES, null))

    fun parseNotes(raw: String?): PinnedNotes {
        if (raw.isNullOrBlank()) return PinnedNotes()
        return try {
            val root = JSONObject(raw)
            val array = root.optJSONArray("items") ?: JSONArray()
            val limit = minOf(array.length(), MAX_NOTES)
            val items = ArrayList<PinnedItem>(limit)
            for (index in 0 until limit) {
                val obj = array.optJSONObject(index) ?: continue
                val text = obj.optString("text", "").trim()
                if (text.isEmpty()) continue
                items += PinnedItem(
                    id = obj.optString("id", "note-$index"),
                    text = text,
                    kind = obj.optString("kind", "note"),
                    isDone = obj.optBoolean("done", false)
                )
            }
            PinnedNotes(
                items = items,
                total = root.optInt("total", items.size).coerceAtLeast(items.size),
                updatedAt = root.optString("updatedAt", "")
            )
        } catch (_: Exception) {
            PinnedNotes()
        }
    }

    // -- pending queue (widget → app) ------------------------------------------

    /**
     * Appends one widget checkbox change. Keys are de-duplicated by
     * `date|id`, so rapid taps keep only the latest intent.
     */
    @Synchronized
    fun queuePendingToggle(
        context: Context,
        taskId: String,
        date: String,
        done: Boolean,
        title: String = "",
        subject: String = ""
    ) {
        try {
            val existing = parsePending(prefs(context).getString(KEY_PENDING, null))
            val merged = LinkedHashMap<String, PendingToggle>()
            existing.forEach { merged[it.date + "|" + it.id] = it }
            merged[date + "|" + taskId] = PendingToggle(taskId, date, done, isoNow(), title, subject)
            val trimmed = merged.values.toList().takeLast(MAX_PENDING)
            val array = JSONArray()
            trimmed.forEach { item ->
                array.put(
                    JSONObject()
                        .put("id", item.id)
                        .put("date", item.date)
                        .put("done", item.done)
                        .put("at", item.at)
                        .put("title", item.title)
                        .put("subject", item.subject)
                )
            }
            prefs(context).edit().putString(KEY_PENDING, array.toString()).commit()
        } catch (_: Exception) {
            // Never let a queue failure break the checkbox animation.
        }
    }

    fun readPending(context: Context): List<PendingToggle> =
        parsePending(prefs(context).getString(KEY_PENDING, null))

    fun parsePending(raw: String?): List<PendingToggle> {
        if (raw.isNullOrBlank()) return emptyList()
        return try {
            val array = JSONArray(raw)
            val out = ArrayList<PendingToggle>(array.length())
            for (index in 0 until array.length()) {
                val obj = array.optJSONObject(index) ?: continue
                val id = obj.optString("id", "")
                if (id.isEmpty()) continue
                out += PendingToggle(
                    id = id,
                    date = obj.optString("date", ""),
                    done = obj.optBoolean("done", false),
                    at = obj.optString("at", ""),
                    title = obj.optString("title", ""),
                    subject = obj.optString("subject", "")
                )
            }
            out
        } catch (_: Exception) {
            emptyList()
        }
    }

    @Synchronized
    fun clearPending(context: Context) {
        prefs(context).edit().remove(KEY_PENDING).apply()
    }

    // -- Supabase session (used by WidgetSyncWorker) ----------------------------

    /**
     * `widgets.js` forwards the live Supabase session on every publish, so the
     * WorkManager job can upload a checkbox change long after the WebView died.
     * Stored in the same private prefs group as the widget payloads.
     */
    @Synchronized
    fun saveSession(context: Context, json: String?) {
        if (json.isNullOrBlank()) return
        try {
            val root = JSONObject(json)
            if (root.optString("accessToken", "").isEmpty()) return
            prefs(context).edit().putString(KEY_SESSION, root.toString()).commit()
        } catch (_: Exception) {
        }
    }

    fun readSession(context: Context): WidgetSession? {
        val raw = prefs(context).getString(KEY_SESSION, null) ?: return null
        return try {
            val root = JSONObject(raw)
            val access = root.optString("accessToken", "")
            val user = root.optString("userId", "")
            if (access.isEmpty() || user.isEmpty()) return null
            WidgetSession(
                accessToken = access,
                refreshToken = root.optString("refreshToken", ""),
                userId = user,
                expiresAt = root.optLong("expiresAt", 0L)
            )
        } catch (_: Exception) {
            null
        }
    }

    /** Persists a refreshed token pair without touching the user id. */
    @Synchronized
    fun updateSessionTokens(context: Context, accessToken: String, refreshToken: String, expiresAt: Long) {
        val current = readSession(context) ?: return
        val root = JSONObject()
            .put("accessToken", accessToken)
            .put("refreshToken", refreshToken.ifEmpty { current.refreshToken })
            .put("userId", current.userId)
            .put("expiresAt", expiresAt)
        prefs(context).edit().putString(KEY_SESSION, root.toString()).commit()
    }

    private fun isoNow(): String =
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
            .format(java.util.Date())
}
