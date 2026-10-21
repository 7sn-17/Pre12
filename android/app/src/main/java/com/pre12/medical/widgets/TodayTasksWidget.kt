package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProviders
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W2 — «مهام اليوم» interactive widget.
 *
 * Interaction is split so a mis-tap can never change data:
 *   • the status circle toggles the task ([ToggleTaskAction]);
 *   • the task text and the header open the app.
 *
 * The card is genuinely responsive. Instead of hard-coding "4 rows" and letting
 * the launcher clip the last one, it measures itself with [LocalSize] and spends
 * the available height on whole rows:
 *
 *   height 130 dp → compact chrome, 2 rows
 *   height 180 dp → progress bar, 3 rows
 *   height 210 dp → 4 rows
 *
 * The alternative (a fixed 4-row list) is the most common widget bug: the fourth
 * checkbox is drawn outside the RemoteViews bounds and simply never appears.
 */
class TodayTasksWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read before composing: prefs I/O must not run inside the composition.
        val state = WidgetBridge.readTodayTasks(context)

        provideContent {
            GlanceTheme(colors = WidgetPalette.colors) {
                TodayTasksContent(state)
            }
        }
    }
}

/**
 * Launcher entry point. Declared in `AndroidManifest.xml` with
 * `today_tasks_widget_info.xml` as its provider metadata.
 */
class TodayTasksWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayTasksWidget()
}

@Composable
private fun TodayTasksContent(state: TodayTasks) {
    val colors = GlanceTheme.colors
    val height = LocalSize.current.height
    val compact = height < 145.dp
    val withProgress = height >= 165.dp && !state.isEmpty
    val openApp = openAppAction()
    val rowHeight = if (compact) 24.dp else 28.dp
    val gap = if (compact) 4.dp else 5.dp
    val chrome = (if (compact) 64.dp else 77.dp) + (if (withProgress) 18.dp else 0.dp)
    val maxRows = (((height - chrome) + gap) / (rowHeight + gap)).toInt().coerceIn(1, 4)

    GlassCard(padding = if (compact) 12.dp else 16.dp) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .cornerRadius(10.dp)
                .clickable(openApp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = "مهام اليوم",
                    style = TextStyle(
                        color = colors.onSurface,
                        fontSize = if (compact) 14.sp else 16.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Spacer(GlanceModifier.height(2.dp))
                Text(
                    text = subtitle(state),
                    style = TextStyle(
                        color = colors.onSurfaceVariant,
                        fontSize = if (compact) 9.5.sp else 10.5.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
            }

            if (!state.isEmpty) {
                Spacer(GlanceModifier.width(8.dp))
                Chip(
                    text = "${state.completedCount} / ${state.totalCount}",
                    background = colors.primaryContainer,
                    foreground = colors.onPrimaryContainer
                )
            }
        }

        if (withProgress) {
            Spacer(GlanceModifier.height(10.dp))
            LinearProgressIndicator(
                progress = state.progress,
                modifier = GlanceModifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .cornerRadius(2.dp),
                color = colors.primary,
                backgroundColor = colors.surfaceVariant
            )
            Spacer(GlanceModifier.height(12.dp))
        } else {
            Spacer(GlanceModifier.height(if (compact) 6.dp else 8.dp))
        }

        if (state.isEmpty) {
            WidgetEmptyState(
                title = "لا توجد مهام لليوم",
                message = "خطّتك لهذا اليوم فارغة — استمتع بيومك 🌿",
                cta = "افتح التطبيق",
                iconRes = R.drawable.widget_ic_tasks
            )
        } else {
            TaskList(state, colors, maxRows, openApp, compact)
        }
    }
}

@Composable
private fun TaskList(
    state: TodayTasks,
    colors: ColorProviders,
    maxRows: Int,
    openApp: Action,
    compact: Boolean
) {
    val visible = state.items.take(maxRows)
    val gap = if (compact) 4.dp else 5.dp

    // The counter chip already says how many tasks exist; a "+N more" line would
    // steal a row's worth of height and risk clipping on a 4×2 grid.
    visible.forEachIndexed { index, item ->
        TaskRow(item, state.date, colors, openApp, compact)
        if (index != visible.lastIndex) {
            Spacer(GlanceModifier.height(gap))
        }
    }
}

@Composable
private fun TaskRow(
    item: TaskItem,
    date: String,
    colors: ColorProviders,
    openApp: Action,
    compact: Boolean
) {
    val toggle = ToggleTaskAction.action(
        taskId = item.id,
        date = date,
        done = !item.isCompleted
    )
    val rowHeight = if (compact) 24.dp else 28.dp
    val circleSize = if (compact) 16.dp else 18.dp

    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Full-row-height hit area around the circle: easy to tap, hard to miss.
        Box(
            modifier = GlanceModifier
                .size(rowHeight)
                .cornerRadius(8.dp)
                .clickable(toggle),
            contentAlignment = Alignment.Center
        ) {
            CheckCircle(item.isCompleted, colors, circleSize)
        }

        Spacer(GlanceModifier.width(8.dp))

        Box(
            modifier = GlanceModifier
                .defaultWeight()
                .cornerRadius(8.dp)
                .padding(vertical = 4.dp)
                .clickable(openApp),
            contentAlignment = Alignment.CenterStart
        ) {
            Text(
                text = item.title,
                style = TextStyle(
                    color = if (item.isCompleted) colors.onSurfaceVariant else colors.onSurface,
                    fontSize = if (compact) 12.sp else 12.5.sp,
                    fontWeight = if (item.isCompleted) FontWeight.Normal else FontWeight.Medium,
                    textAlign = TextAlign.Start,
                    textDecoration = if (item.isCompleted) TextDecoration.LineThrough else null
                ),
                maxLines = 1
            )
        }
    }
}

/** 18 dp checkbox: filled + ✓ when done, 1 dp ring when open. */
@Composable
private fun CheckCircle(completed: Boolean, colors: ColorProviders, size: Dp) {
    Box(
        modifier = GlanceModifier
            .size(size)
            .background(if (completed) colors.primary else colors.outline)
            .cornerRadius(size / 2),
        contentAlignment = Alignment.Center
    ) {
        if (completed) {
            Text(
                text = "✓",
                style = TextStyle(
                    color = colors.onPrimary,
                    fontSize = if (size <= 16.dp) 10.sp else 11.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                ),
                maxLines = 1
            )
        } else {
            // Empty core = the "hole" of the ring (no border modifier exists).
            Box(
                modifier = GlanceModifier
                    .size(size - 4.dp)
                    .background(colors.surface)
                    .cornerRadius((size - 4.dp) / 2)
            ) {}
        }
    }
}

private fun subtitle(state: TodayTasks): String {
    if (state.isEmpty) return "خطّتك لهذا اليوم"
    return when {
        state.completedCount >= state.totalCount -> "أنجزت كل مهام اليوم 🎉"
        state.completedCount == 0 -> "لم تبدأ بعد — ابدأ بمهمة واحدة"
        else -> "${state.completedCount} من ${state.totalCount} مكتملة"
    }
}
