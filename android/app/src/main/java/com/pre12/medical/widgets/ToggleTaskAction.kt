package com.pre12.medical.widgets

import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback

/**
 * ⭐⭐ Phase W2 — interactive checkbox.
 *
 * Runs inside the widget's own broadcast receiver, with **no WebView** in the
 * picture. The sequence is deliberately optimistic:
 *
 *   1. flip the bit inside `tasks.today` → the redraw is instant;
 *   2. append the change to `pending.tasks` → durable, survives process death;
 *   3. broadcast to a *running* app → instant Supabase sync via the plugin;
 *   4. `update(...)` → the checkbox renders its new state (filled + ✓ + strike).
 *
 * When the app is closed, nothing is lost: `widgets.js` drains `pending.tasks`
 * on the next launch (see `MedWidgets.getPendingToggles`), which writes
 * localStorage and queues the Supabase row. That is the "WorkManager on next
 * open" behaviour the phase asked for, without a battery-hungry worker.
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

        // 1) Optimistic local state (Glance redraws straight from prefs).
        WidgetBridge.applyTaskToggle(context, taskId, done)

        // 2) Durable queue for the WebView, the owner of Supabase + localStorage.
        WidgetBridge.queuePendingToggle(context, taskId, date, done)

        // 3) Wake a running app. `setPackage` keeps the broadcast private.
        context.sendBroadcast(
            Intent(ACTION_TASK_TOGGLED)
                .setPackage(context.packageName)
                .putExtra(EXTRA_TASK_ID, taskId)
                .putExtra(EXTRA_DATE, date)
                .putExtra(EXTRA_DONE, done)
        )

        // 4) Redraw this widget immediately.
        TodayTasksWidget().update(context, glanceId)
    }

    companion object {
        const val ACTION_TASK_TOGGLED = "com.pre12.medical.action.WIDGET_TASK_TOGGLED"
        const val EXTRA_TASK_ID = "taskId"
        const val EXTRA_DATE = "date"
        const val EXTRA_DONE = "done"

        val TaskIdKey = ActionParameters.Key<String>("taskId")
        val DateKey = ActionParameters.Key<String>("date")
        val DoneKey = ActionParameters.Key<Boolean>("done")

        fun action(taskId: String, date: String, done: Boolean): Action =
            actionRunCallback<ToggleTaskAction>(
                actionParametersOf(
                    TaskIdKey to taskId,
                    DateKey to date,
                    DoneKey to done
                )
            )
    }
}
