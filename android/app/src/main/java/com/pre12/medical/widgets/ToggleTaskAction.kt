package com.pre12.medical.widgets

import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import kotlinx.coroutines.delay

/**
 * ⭐⭐ Phase W2/W5 — interactive checkbox, offline-first.
 *
 * Runs inside the widget's own broadcast receiver, with **no WebView** in the
 * picture. The sequence is deliberately optimistic and survives process death:
 *
 *   1. flip the bit inside `tasks.today` + stamp `doneAt` (`commit()`);
 *   2. append the change to `pending.tasks` (with its title) → durable queue;
 *   3. `update(...)` **immediately** → tick (animated vector) + strike-through;
 *   4. broadcast to a *running* app → the WebView/JS syncs in the background;
 *   5. schedule a WorkManager upload → Supabase syncs with the app closed;
 *   6. `delay(900)` + `update(...)` → the completed row leaves the list and the
 *      next pending task takes its place.
 *
 * Step 6 is the honest version of "fade out and slide up": RemoteViews cannot
 * animate layout, so the row is removed on a second frame. The visible motion is
 * the reflow itself, which reads as the list sliding up.
 *
 * Nothing is lost if Android kills the process at any point: prefs are written
 * with `commit()` before the redraw, and the queue is drained by the WebView on
 * the next open *and* by `WidgetSyncWorker` when the network returns.
 */
class ToggleTaskAction : ActionCallback {

    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val taskId = parameters[TaskIdKey] ?: return
        val date = parameters[DateKey] ?: ""
        val done = parameters[DoneKey] ?: false
        val title = parameters[TitleKey] ?: ""
        val subject = parameters[SubjectKey] ?: ""

        // ── 1) LOCAL FIRST (Phase W7) ────────────────────────────────────────
        // prefs are written with `commit()`, so the next line reads the new
        // value from disk. Nothing below may run before the redraw: WorkManager
        // enqueueing and the WebView broadcast are side effects, not the UI.
        WidgetBridge.applyTaskToggle(context, taskId, done)

        // 2) Durable queue. Also a synchronous prefs commit, and the toggle must
        //    survive process death even if the very next frame kills us.
        WidgetBridge.queuePendingToggle(context, taskId, date, done, title, subject)

        // 3) FIRST FRAME NOW — tick + strike-through, straight from prefs.
        try {
            TodayTasksWidget().update(context, glanceId)
        } catch (_: Throwable) {
            return
        }

        // 4) Wake a running app (JS drains the queue + syncs Supabase). This is
        //    fired *after* the redraw: a slow WebView can never delay the tick.
        context.sendBroadcast(
            Intent(ACTION_TASK_TOGGLED)
                .setPackage(context.packageName)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_DATE, date)
                .putExtra(EXTRA_DONE, done)
                .putExtra(EXTRA_TITLE, title)
        )

        // 5) Offline upload — network-constrained WorkManager, no UI dependency.
        WidgetSync.schedule(context)

        // 6) Second frame: the completed row disappears, the list reflows.
        if (!done) return
        delay(VANISH_DELAY_MS)
        try {
            TodayTasksWidget().update(context, glanceId)
        } catch (_: Throwable) {
            // The launcher may have removed the widget while we waited.
        }
    }

    companion object {
        const val ACTION_TASK_TOGGLED = "com.pre12.medical.action.WIDGET_TASK_TOGGLED"
        const val EXTRA_TASK_ID = "taskId"
        const val EXTRA_DATE = "date"
        const val EXTRA_DONE = "done"
        const val EXTRA_TITLE = "title"

        /** Must match the filter window in `TodayTasksWidget`. */
        const val VANISH_DELAY_MS = 900L

        val TaskIdKey = ActionParameters.Key<String>("taskId")
        val DateKey = ActionParameters.Key<String>("date")
        val DoneKey = ActionParameters.Key<Boolean>("done")
        val TitleKey = ActionParameters.Key<String>("title")
        val SubjectKey = ActionParameters.Key<String>("subject")

        fun action(
            taskId: String,
            date: String,
            done: Boolean,
            title: String = "",
            subject: String = ""
        ): Action =
            actionRunCallback<ToggleTaskAction>(
                actionParametersOf(
                    TaskIdKey to taskId,
                    DateKey to date,
                    DoneKey to done,
                    TitleKey to title,
                    SubjectKey to subject
                )
            )
    }
}
