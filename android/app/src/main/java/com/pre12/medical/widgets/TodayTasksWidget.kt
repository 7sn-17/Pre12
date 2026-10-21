package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
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
import androidx.glance.layout.fillMaxSize
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
 * Tap a row → [ToggleTaskAction] flips the checkbox, stores the change and
 * redraws. Tap the header → the app opens. The widget is responsive: a 4×2 grid
 * shows 2 rows, a taller resize grows to 4 rows (see [rowsForHeight]).
 *
 * Visual language: 24 dp glass card, 16 dp padding, tonal header, 4 dp progress
 * bar, 18 dp status circles, strikethrough + muted colour when done.
 */
private const val MAX_VISIBLE_TASKS = 4

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
    val maxRows = rowsForHeight(LocalSize.current.height)
    val openApp = openAppAction()

    GlassCard {
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
                        fontSize = 16.sp,
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
                        fontSize = 11.sp,
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

        if (state.isEmpty) {
            WidgetEmptyState(
                title = "لا توجد مهام لليوم",
                message = "خطّتك لهذا اليوم فارغة — استمتع بيومك 🌿",
                cta = "افتح التطبيق",
                iconRes = R.drawable.widget_ic_tasks
            )
        } else {
            TaskList(state, colors, maxRows)
        }
    }
}

@Composable
private fun TaskList(state: TodayTasks, colors: ColorProviders, maxRows: Int) {
    val visible = state.items.take(maxRows)
    val completed = state.items.count { it.isCompleted }

    visible.forEachIndexed { index, item ->
        TaskRow(item, state.date, colors)
        if (index != visible.lastIndex) {
            Spacer(GlanceModifier.height(6.dp))
        }
    }

    val remaining = state.items.size - visible.size
    if (remaining > 0 && maxRows >= 3) {
        Spacer(GlanceModifier.height(8.dp))
        Text(
            text = "+$remaining مهام أخرى · $completed مكتملة",
            style = TextStyle(
                color = colors.onSurfaceVariant,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Start
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun TaskRow(item: TaskItem, date: String, colors: ColorProviders) {
    val toggle = ToggleTaskAction.action(
        taskId = item.id,
        date = date,
        done = !item.isCompleted
    )

    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .cornerRadius(9.dp)
            .padding(vertical = 3.dp)
            .clickable(toggle),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // A 1 dp ring without a border modifier: outer circle + surface core.
        Box(
            modifier = GlanceModifier
                .size(18.dp)
                .background(if (item.isCompleted) colors.primary else colors.outline)
                .cornerRadius(9.dp),
            contentAlignment = Alignment.Center
        ) {
            if (item.isCompleted) {
                Text(
                    text = "✓",
                    style = TextStyle(
                        color = colors.onPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    ),
                    maxLines = 1
                )
            } else {
                // Empty core = the "hole" of the ring.
                Box(
                    modifier = GlanceModifier
                        .size(14.dp)
                        .background(colors.surface)
                        .cornerRadius(7.dp)
                ) {}
            }
        }

        Spacer(GlanceModifier.width(10.dp))

        Text(
            text = item.title,
            modifier = GlanceModifier.defaultWeight(),
            style = TextStyle(
                color = if (item.isCompleted) colors.onSurfaceVariant else colors.onSurface,
                fontSize = 12.5.sp,
                fontWeight = if (item.isCompleted) FontWeight.Normal else FontWeight.Medium,
                textAlign = TextAlign.Start,
                textDecoration = if (item.isCompleted) TextDecoration.LineThrough else null
            ),
            maxLines = 1
        )
    }
}

/**
 * Cell → rows. A 4×2 launcher cell is ~140 dp of usable height, so two rows is
 * the honest default; resizing the widget vertically reveals more tasks instead
 * of clipping the list.
 */
private fun rowsForHeight(height: androidx.compose.ui.unit.Dp): Int = when {
    height >= 200.dp -> 4
    height >= 168.dp -> 3
    else -> 2
}

private fun subtitle(state: TodayTasks): String {
    if (state.isEmpty) return "خطّتك لهذا اليوم"
    return when {
        state.completedCount >= state.totalCount -> "أنجزت كل مهام اليوم 🎉"
        state.completedCount == 0 -> "لم تبدأ بعد — ابدأ بمهمة واحدة"
        else -> "${state.completedCount} من ${state.totalCount} مكتملة"
    }
}
