package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
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
 * ⭐⭐ Phase W2/W5 — «مهام اليوم» interactive widget.
 *
 * Interaction is split so a mis-tap can never change data:
 *   • the status circle toggles the task ([ToggleTaskAction]);
 *   • the task text and the header deep-link to `pre12://tasks`.
 *
 * ### Completion choreography
 * A checked task stays in the list for [ToggleTaskAction.VANISH_DELAY_MS]:
 * filled tick (animated vector where the launcher honours it) + strike-through.
 * The delayed second frame then drops it, so the widget always list *pending*
 * work and the next task moves up. RemoteViews has no layout animation API —
 * the reflow is the animation.
 *
 * ### Size honesty
 * Instead of hard-coding "4 rows" and letting the launcher clip the last one,
 * the card measures itself with [LocalSize] and spends the height on whole rows:
 *
 *   height 130 dp → compact chrome, 2 rows
 *   height 165 dp → progress bar, 2 rows
 *   height 195 dp → 3 rows
 *   height 230 dp → 4 rows
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
    val openApp = openAppAction("tasks")

    val compact = height < 145.dp
    val withProgress = height >= 165.dp && !state.isEmpty
    val rowHeight = if (compact) 24.dp else 28.dp
    val gap = if (compact) 4.dp else 5.dp
    val chrome = (if (compact) 64.dp else 77.dp) + (if (withProgress) 18.dp else 0.dp)

    // Just-completed tasks keep their row for one beat; everything older is gone,
    // so a widget never becomes a graveyard of struck-through rows.
    val now = System.currentTimeMillis()
    val visible = state.items.filter { item ->
        !item.isCompleted ||
            (item.doneAt > 0 && now - item.doneAt < ToggleTaskAction.VANISH_DELAY_MS)
    }

    val maxRows = if (visible.isEmpty()) 0 else {
        (((height - chrome) + gap) / (rowHeight + gap)).toInt().coerceIn(1, 4)
    }

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
                    text = subtitle(state, visible.size),
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

        when {
            state.isEmpty -> WidgetEmptyState(
                title = "لا توجد مهام لليوم",
                message = "خطّتك لهذا اليوم فارغة — استمتع بيومك 🌿",
                cta = "افتح التطبيق",
                iconRes = R.drawable.widget_ic_tasks,
                path = "tasks"
            )

            visible.isEmpty() -> AllDoneRow(state, colors, openApp)

            else -> TaskList(state, visible, colors, maxRows, openApp, compact)
        }
    }
}

@Composable
private fun TaskList(
    state: TodayTasks,
    visible: List<TaskItem>,
    colors: ColorProviders,
    maxRows: Int,
    openApp: Action,
    compact: Boolean
) {
    val rows = visible.take(maxRows)
    val gap = if (compact) 4.dp else 5.dp

    rows.forEachIndexed { index, item ->
        TaskRow(item, state.date, colors, openApp, compact)
        if (index != rows.lastIndex) {
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
        done = !item.isCompleted,
        title = item.title,
        subject = item.subject
    )
    val rowHeight = if (compact) 24.dp else 28.dp
    val circleSize = if (compact) 16.dp else 18.dp
    val justCompleted = item.isCompleted && item.doneAt > 0 &&
        System.currentTimeMillis() - item.doneAt < ToggleTaskAction.VANISH_DELAY_MS

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
            CheckCircle(item.isCompleted, justCompleted, colors, circleSize)
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

/**
 * Status circle. A completed task shows a real vector tick — and the *animated*
 * variant on the frame right after the tap, so the check draws itself (260 ms
 * trim) wherever the launcher starts animated vectors inside RemoteViews. If it
 * does not, the vector's end state is still a correct tick.
 */
@Composable
private fun CheckCircle(
    completed: Boolean,
    justCompleted: Boolean,
    colors: ColorProviders,
    size: Dp
) {
    Box(
        modifier = GlanceModifier
            .size(size)
            .background(if (completed) colors.primary else colors.outline)
            .cornerRadius(size / 2),
        contentAlignment = Alignment.Center
    ) {
        if (completed) {
            Image(
                provider = ImageProvider(
                    if (justCompleted) R.drawable.widget_anim_check else R.drawable.widget_ic_check
                ),
                contentDescription = null,
                modifier = GlanceModifier.size(size * 0.72f),
                colorFilter = ColorFilter.tint(colors.onPrimary)
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

/** Shown when every task of the day is done (and the rows have vanished). */
@Composable
private fun AllDoneRow(state: TodayTasks, colors: ColorProviders, openApp: Action) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(colors.secondaryContainer)
            .cornerRadius(12.dp)
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .clickable(openApp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconBadge(
            iconRes = R.drawable.widget_ic_check,
            size = 13.dp,
            badgeSize = 24.dp,
            background = colors.primary,
            tint = colors.onPrimary
        )
        Spacer(GlanceModifier.width(8.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = "أنجزت كل مهام اليوم 🎉",
                style = TextStyle(
                    color = colors.onSecondaryContainer,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Start
                ),
                maxLines = 1
            )
            Text(
                text = "${state.completedCount} مهمة مكتملة — سلسلتك بأمان",
                style = TextStyle(
                    color = colors.onSecondaryContainer,
                    fontSize = 9.5.sp,
                    textAlign = TextAlign.Start
                ),
                maxLines = 1
            )
        }
    }
}

private fun subtitle(state: TodayTasks, visibleCount: Int): String {
    if (state.isEmpty) return "خطّتك لهذا اليوم"
    if (state.allDone && visibleCount == 0) return "يوم مكتمل بالكامل"
    return when {
        state.completedCount == 0 -> "لم تبدأ بعد — ابدأ بمهمة واحدة"
        else -> "${state.completedCount} من ${state.totalCount} مكتملة"
    }
}
