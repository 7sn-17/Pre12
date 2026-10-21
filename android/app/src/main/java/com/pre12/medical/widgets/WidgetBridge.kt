package com.pre12.medical.widgets

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * ⭐⭐ Phase W1 — the widget data bridge (native side).
 *
 * The WebView cannot pass objects to a widget: it writes a **JSON string**
 * through the `capacitor-widget-bridge` plugin, which stores it in
 * `SharedPreferences` under a group name. This file reads that group and turns
 * the JSON into plain Kotlin data classes that Glance can render.
 *
 * ⚠️ `PREFS_GROUP` / `KEY_TASKS_TODAY` must stay byte-identical to the values
 * used by `src/widgets/bridge.js` (W2). A mismatch produces a silently empty
 * widget — the most expensive bug class in this feature.
 *
 * The parse functions are pure (no Android calls) so they can be unit-tested
 * against the exact payload the web layer will produce.
 */
data class TaskItem(
    val id: String,
    val title: String,
    val isCompleted: Boolean
)

data class TodayTasks(
    val date: String = "",
    val items: List<TaskItem> = emptyList(),
    val total: Int = 0,
    val done: Int = 0
) {
    val isEmpty: Boolean
        get() = items.isEmpty()

    /** Prefer the server-side counters, fall back to counting the rows. */
    val completedCount: Int
        get() = if (total > 0) done else items.count { it.isCompleted }

    val totalCount: Int
        get() = if (total > 0) total else items.size

    /** 0f..1f, safe for an empty day. */
    val progress: Float
        get() {
            val count = totalCount
            if (count <= 0) return 0f
            return (completedCount.toFloat() / count.toFloat()).coerceIn(0f, 1f)
        }
}

object WidgetBridge {

    /** SharedPreferences group written by `capacitor-widget-bridge`. */
    const val PREFS_GROUP = "medapp_widget_state"
    const val KEY_TASKS_TODAY = "tasks.today"

    /** Hard ceiling so a corrupt payload can never bloat the RemoteViews tree. */
    private const val MAX_ITEMS = 12

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE)

    /** Current payload, or an empty day if the app has not synced yet. */
    fun readTodayTasks(context: Context): TodayTasks =
        parseTodayTasks(prefs(context).getString(KEY_TASKS_TODAY, null))

    /**
     * Defensive parser: every field is optional, malformed JSON degrades to the
     * empty state instead of crashing the launcher process.
     */
    fun parseTodayTasks(raw: String?): TodayTasks {
        if (raw.isNullOrBlank()) return TodayTasks()
        return try {
            val root = JSONObject(raw)
            val array = root.optJSONArray("items") ?: JSONArray()
            val limit = minOf(array.length(), MAX_ITEMS)
            val items = ArrayList<TaskItem>(limit)
            for (index in 0 until limit) {
                val obj = array.optJSONObject(index) ?: continue
                val title = obj.optString("title", "").trim()
                if (title.isEmpty()) continue
                items += TaskItem(
                    id = obj.optString("id", "task-$index"),
                    title = title,
                    isCompleted = obj.optBoolean("done", obj.optBoolean("isCompleted", false))
                )
            }
            val total = root.optInt("total", items.size).takeIf { it > 0 } ?: items.size
            val done = root.optInt("done", items.count { it.isCompleted })
            TodayTasks(
                date = root.optString("date", ""),
                items = items,
                total = total,
                done = done.coerceIn(0, maxOf(total, items.size))
            )
        } catch (_: Exception) {
            TodayTasks()
        }
    }
}
