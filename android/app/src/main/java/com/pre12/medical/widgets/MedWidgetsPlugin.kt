package com.pre12.medical.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ⭐⭐ Phase W2 — the app ↔ widget bridge (Capacitor side).
 *
 * Responsibilities:
 *  • **publishWidgets** — the single write path used by `widgets.js`; three JSON
 *    payloads at once, then one redraw per widget.
 *  • **updateWidgetTasks / updateWidgetStreak / updateWidgetNotes** — granular
 *    variants (the phase asked for `updateWidgetTasks(tasksJson)` explicitly).
 *  • **openWidgetPicker** — asks the launcher for its widget picker so the user
 *    can choose among all the widgets (see [PICKER_ACTIONS] for the honest
 *    story: Android exposes no public picker intent, so this is best-effort).
 *  • **requestPinWidget** — opens the system "add to home screen" dialog for a
 *    chosen widget (Android 8+; the launcher may still refuse, which we report).
 *  • **getPendingToggles / clearPendingToggles** — drain the checkbox changes the
 *    widget queued while the WebView was closed.
 *  • **widgetTaskToggled / taskUpdated** events — forwarded to JS while the app
 *    is running, so the open screen repaints at once and Supabase syncs in
 *    seconds instead of on the next launch.
 *
 * Writes are `commit()` (synchronous) on purpose: an optimistic checkbox must be
 * on disk before the redraw reads it back.
 *
 * Redraws go through `ACTION_APPWIDGET_UPDATE` instead of `GlanceAppWidget
 * .updateAll()`. Glance's receiver then does the composition inside its own
 * `goAsync()` window — no coroutine scope of our own, no work that can outlive
 * the plugin instance, and an empty widget list simply no-ops.
 */
@CapacitorPlugin(name = "MedWidgets")
class MedWidgetsPlugin : Plugin() {

    private var toggleReceiver: BroadcastReceiver? = null

    override fun load() {
        // A previous run may have queued toggles and died before uploading.
        // WorkManager is unique + network-constrained, so this is cheap.
        WidgetSync.schedule(context)

        val filter = IntentFilter(ToggleTaskAction.ACTION_TASK_TOGGLED)
        val listener = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, intent: Intent?) {
                val payload = JSObject()
                payload.put("taskId", intent?.getStringExtra(ToggleTaskAction.EXTRA_TASK_ID))
                payload.put("date", intent?.getStringExtra(ToggleTaskAction.EXTRA_DATE))
                payload.put("done", intent?.getBooleanExtra(ToggleTaskAction.EXTRA_DONE, false) ?: false)
                // ⭐⭐ Phase W8 — the widget speaks to the WebView in both
                //    dialects: `widgetTaskToggled` (the raw tap) and
                //    `taskUpdated` (the generic "your data changed" event the
                //    app listens to). Both are local — no network involved.
                notifyListeners("widgetTaskToggled", payload)
                notifyListeners("taskUpdated", payload)
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(listener, filter)
            }
            toggleReceiver = listener
        } catch (_: Exception) {
            // A missing receiver only costs us the "instant" path; the pending
            // queue still syncs on the next launch.
        }
    }

    override fun handleOnDestroy() {
        try {
            toggleReceiver?.let { context.unregisterReceiver(it) }
        } catch (_: Exception) {
        }
        toggleReceiver = null
        super.handleOnDestroy()
    }

    // -----------------------------------------------------------------------
    // Publishing
    // -----------------------------------------------------------------------

    /** One call, every payload, one redraw per placed widget. */
    @PluginMethod
    fun publishWidgets(call: PluginCall) {
        val ctx = context
        var written = 0

        call.getString("tasks")?.let { raw ->
            val merged = WidgetBridge.mergePending(ctx, raw)
            if (WidgetBridge.write(ctx, WidgetBridge.KEY_TASKS_TODAY, merged)) written++
        }
        call.getString("streak")?.let {
            if (WidgetBridge.write(ctx, WidgetBridge.KEY_STREAK, it)) written++
        }
        call.getString("notes")?.let {
            if (WidgetBridge.write(ctx, WidgetBridge.KEY_NOTES, it)) written++
        }

        // ⭐ Phase W7 — repaint BEFORE any secondary bookkeeping. The writes
        //    above use `commit()`, so the launcher can already read fresh state;
        //    session/meta writes must never sit between the data and the frame.
        requestUpdate(
            ctx,
            TodayTasksWidgetReceiver::class.java,
            SimpleStreakWidgetReceiver::class.java,
            DetailedStreakWidgetReceiver::class.java,
            NotesWidgetReceiver::class.java,
            GoalsWidgetReceiver::class.java,
            NotesOnlyWidgetReceiver::class.java
        )

        // ⭐ Offline-first: the WorkManager job needs a JWT to upload a checkbox
        //    change while the WebView is gone. The session is refreshed by JS on
        //    every publish, so it is never staler than the last app visit.
        call.getObject("session")?.let { WidgetBridge.saveSession(ctx, it.toString()) }

        WidgetBridge.writeMeta(ctx, call.getString("source") ?: "app")
        call.resolve(JSObject().put("written", written))
    }

    /** `updateWidgetTasks(tasksJson)` — explicit contract from the phase brief. */
    @PluginMethod
    fun updateWidgetTasks(call: PluginCall) {
        val json = call.getString("json")
        if (json.isNullOrBlank()) {
            call.reject("json is required")
            return
        }
        val ctx = context
        val ok = WidgetBridge.write(
            ctx,
            WidgetBridge.KEY_TASKS_TODAY,
            WidgetBridge.mergePending(ctx, json)
        )
        WidgetBridge.writeMeta(ctx, "tasks")
        requestUpdate(ctx, TodayTasksWidgetReceiver::class.java)
        call.resolve(JSObject().put("updated", ok))
    }

    @PluginMethod
    fun updateWidgetStreak(call: PluginCall) {
        val json = call.getString("json")
        if (json.isNullOrBlank()) {
            call.reject("json is required")
            return
        }
        val ctx = context
        val ok = WidgetBridge.write(ctx, WidgetBridge.KEY_STREAK, json)
        WidgetBridge.writeMeta(ctx, "streak")
        requestUpdate(ctx, SimpleStreakWidgetReceiver::class.java, DetailedStreakWidgetReceiver::class.java)
        call.resolve(JSObject().put("updated", ok))
    }

    @PluginMethod
    fun updateWidgetNotes(call: PluginCall) {
        val json = call.getString("json")
        if (json.isNullOrBlank()) {
            call.reject("json is required")
            return
        }
        val ctx = context
        val ok = WidgetBridge.write(ctx, WidgetBridge.KEY_NOTES, json)
        WidgetBridge.writeMeta(ctx, "notes")
        requestUpdate(
            ctx,
            NotesWidgetReceiver::class.java,
            GoalsWidgetReceiver::class.java,
            NotesOnlyWidgetReceiver::class.java
        )
        call.resolve(JSObject().put("updated", ok))
    }

    // -----------------------------------------------------------------------
    // Pinning
    // -----------------------------------------------------------------------

    @PluginMethod
    fun requestPinWidget(call: PluginCall) {
        val ctx = context
        val receiver = receiverFor(call.getString("kind"))
        if (receiver == null) {
            call.reject("Unknown widget kind")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve(JSObject().put("supported", false).put("requested", false))
            return
        }

        val manager = AppWidgetManager.getInstance(ctx)
        if (!manager.isRequestPinAppWidgetSupported) {
            call.resolve(JSObject().put("supported", false).put("requested", false))
            return
        }

        val host = activity
        if (host == null) {
            call.reject("No foreground activity")
            return
        }

        host.runOnUiThread {
            val requested = try {
                manager.requestPinAppWidget(ComponentName(ctx, receiver), null, null)
            } catch (_: Exception) {
                false
            }
            call.resolve(JSObject().put("supported", true).put("requested", requested))
        }
    }

    /**
     * ⭐⭐ Phase W7 — "إضافة ودجت للشاشة" now asks for the **picker**, not one tile.
     *
     * Android has no public "open the widget picker" API: launchers own that
     * surface and the only documented call is `requestPinAppWidget` for one
     * provider. Every OEM launcher that *does* expose a picker uses a different
     * action though, so we try them in order. A `startActivity` that cannot be
     * served throws synchronously (`ActivityNotFoundException` / `SecurityException`)
     * and we move to the next candidate — no package-visibility `<queries>` needed.
     *
     * If none works (Pixel Launcher is the notable one), `opened` is false and
     * the page shows its own five-widget chooser, each row calling the documented
     * `requestPinWidget`. The user always gets to choose; nothing is pinned blind.
     */
    @PluginMethod
    fun openWidgetPicker(call: PluginCall) {
        val host = activity
        if (host == null) {
            call.reject("No foreground activity")
            return
        }

        host.runOnUiThread {
            for (action in PICKER_ACTIONS) {
                try {
                    host.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    call.resolve(JSObject().put("opened", true).put("action", action))
                    return@runOnUiThread
                } catch (_: Throwable) {
                    // Not exported / not installed: try the next launcher dialect.
                }
            }

            val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                AppWidgetManager.getInstance(host).isRequestPinAppWidgetSupported
            call.resolve(
                JSObject()
                    .put("opened", false)
                    .put("supported", supported)
            )
        }
    }

    @PluginMethod
    fun isPinWidgetSupported(call: PluginCall) {
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
        call.resolve(JSObject().put("supported", supported))
    }

    // -----------------------------------------------------------------------
    // Pending checkbox changes
    // -----------------------------------------------------------------------

    @PluginMethod
    fun getPendingToggles(call: PluginCall) {
        val raw = WidgetBridge.prefs(context).getString(WidgetBridge.KEY_PENDING, "[]") ?: "[]"
        call.resolve(JSObject().put("json", raw))
    }

    @PluginMethod
    fun clearPendingToggles(call: PluginCall) {
        WidgetBridge.clearPending(context)
        call.resolve(JSObject().put("cleared", true))
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    /**
     * Asks the launchers to repaint the given providers. An explicit component
     * keeps the broadcast inside our UID even though the receivers are
     * `exported="false"`.
     */
    private fun requestUpdate(ctx: Context, vararg receivers: Class<out AppWidgetProvider>) {
        // ⭐⭐⭐ Phase W14 — نبضة التحديث: تُبطل الـcompositions الحيّة حتى
        //   تُعاد قراءة SharedPreferences وتُرسَل الـRemoteViews الجديدة فوراً
        //   (بلا انتظار إعادة تشغيل أو دورة حياة جديدة).
        WidgetRefreshSignal.bump()

        val manager = AppWidgetManager.getInstance(ctx)
        receivers.forEach { receiver ->
            try {
                val component = ComponentName(ctx, receiver)
                val ids = manager.getAppWidgetIds(component)
                if (ids == null || ids.isEmpty()) return@forEach
                ctx.sendBroadcast(
                    Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
                        this.component = component
                        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    }
                )
            } catch (_: Exception) {
                // A widget that cannot be reached must never fail the JS call.
            }
        }
    }

    private fun receiverFor(kind: String?): Class<out AppWidgetProvider>? = when (kind) {
        null, "", "tasks" -> TodayTasksWidgetReceiver::class.java
        "streak" -> SimpleStreakWidgetReceiver::class.java
        "streak_detail", "streakDetail" -> DetailedStreakWidgetReceiver::class.java
        "notes" -> NotesWidgetReceiver::class.java
        "goals" -> GoalsWidgetReceiver::class.java
        "notes_only", "notesOnly" -> NotesOnlyWidgetReceiver::class.java
        else -> null
    }

    private companion object {
        /**
         * Known launcher entry points, most explicit first. `APPWIDGET_PICK` is the
         * hidden platform action (system-permission gated on most ROMs) — it costs
         * one failed attempt and pays off on the ROMs that export it.
         */
        val PICKER_ACTIONS = listOf(
            "android.appwidget.action.APPWIDGET_PICK",
            "com.android.launcher3.action.PICK_WIDGET",
            "com.sec.android.app.launcher.action.PICK_WIDGET",
            "com.miui.home.intent.action.PICK_WIDGET",
            "com.huawei.android.launcher.action.PICK_WIDGET",
            "com.oppo.launcher.action.PICK_WIDGET",
            "com.vivo.launcher.action.PICK_WIDGET"
        )
    }
}
