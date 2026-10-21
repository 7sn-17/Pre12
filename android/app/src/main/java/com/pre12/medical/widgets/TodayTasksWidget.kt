package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — «مهام اليوم» (approved design).
 *
 * Visual contract
 * ───────────────
 *   • slate 135° gradient (#1E293B → #0F172A), 28 dp radius, 1 dp glass hairline;
 *   • header: Tajawal title + emerald count pill (`3/7`);
 *   • rows: empty ring → tap → filled emerald tick (animated vector) + strike →
 *     0.9 s later the row leaves and the next pending task slides up;
 *   • only **pending** work is listed, so the card never becomes a graveyard.
 *
 * Size contract
 * ─────────────
 * 4×2 → 3 rows, 4×4 → 6 rows. Rows are budgeted from [LocalSize] instead of
 * hard-coded, so a taller resize buys one more task and nothing is ever clipped.
 *
 * Interaction is split so a mis-tap can never change data: the status ring
 * toggles; the text and the header deep-link to `pre12://tasks`.
 */
class TodayTasksWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // Read before composing: prefs I/O must never run inside a composition.
        val state = WidgetBridge.readTodayTasks(context)
        provideContent { TodayTasksCard(state) }
    }
}

class TodayTasksWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayTasksWidget()
}

@Composable
private fun TodayTasksCard(state: TodayTasks) {
    val height = LocalSize.current.height
    val compact = height < 170.dp

    val pad = if (compact) 11.dp else 15.dp
    val headerHeight = if (compact) 23.dp else 28.dp
    val headerGap = if (compact) 5.dp else 8.dp
    val rowHeight = if (compact) 24.dp else 30.dp
    val rowGap = if (compact) 2.dp else 4.dp
    val circle = if (compact) 18.dp else 21.dp

    val openApp = openAppAction("tasks")

    // A task checked in the last 0.9 s keeps its row: that frame is the tick and
    // the strike-through. Older completed rows are gone, so what remains is work.
    val now = System.currentTimeMillis()
    val visible = state.items.filter { item ->
        !item.isCompleted ||
            (item.doneAt > 0 && now - item.doneAt < ToggleTaskAction.VANISH_DELAY_MS)
    }

    val chrome = pad * 2 + headerHeight + headerGap
    val maxRows = (((height - chrome) + rowGap) / (rowHeight + rowGap))
        .toInt()
        .coerceIn(1, 6)
    val rows = visible.take(maxRows)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(androidx.glance.ImageProvider(R.drawable.widget_bg_tasks))
            .padding(pad)
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Header(state, openApp, headerHeight, compact)

            Gap(headerGap)

            when {
                state.isEmpty -> EmptyDay(openApp)
                rows.isEmpty() -> CelebrationRow(state, openApp, compact)
                else -> TaskList(
                    rows = rows,
                    date = state.date,
                    openApp = openApp,
                    rowHeight = rowHeight,
                    rowGap = rowGap,
                    circle = circle,
                    compact = compact
                )
            }
        }
    }
}

@Composable
private fun Header(
    state: TodayTasks,
    openApp: Action,
    height: androidx.compose.ui.unit.Dp,
    compact: Boolean
) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(height)
            .clickable(openApp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "مهام اليوم",
            modifier = GlanceModifier.defaultWeight(),
            style = wText(WidgetSkin.White, if (compact) 14.sp else 15.sp, FontWeight.Bold),
            maxLines = 1
        )

        if (!state.isEmpty) {
            Badge(
                text = "${state.completedCount}/${state.totalCount}",
                background = WidgetSkin.EmeraldSoft,
                foreground = WidgetSkin.EmeraldBright,
                fontSize = if (compact) 9.5.sp else 10.sp
            )
        }
    }
}

@Composable
private fun TaskList(
    rows: List<TaskItem>,
    date: String,
    openApp: Action,
    rowHeight: androidx.compose.ui.unit.Dp,
    rowGap: androidx.compose.ui.unit.Dp,
    circle: androidx.compose.ui.unit.Dp,
    compact: Boolean
) {
    rows.forEachIndexed { index, item ->
        TaskRow(item, date, openApp, rowHeight, circle, compact)
        if (index != rows.lastIndex) Gap(rowGap)
    }
}

@Composable
private fun TaskRow(
    item: TaskItem,
    date: String,
    openApp: Action,
    rowHeight: androidx.compose.ui.unit.Dp,
    circle: androidx.compose.ui.unit.Dp,
    compact: Boolean
) {
    val toggle = ToggleTaskAction.action(
        taskId = item.id,
        date = date,
        done = !item.isCompleted,
        title = item.title,
        subject = item.subject
    )
    val justCompleted = item.isCompleted && item.doneAt > 0 &&
        System.currentTimeMillis() - item.doneAt < ToggleTaskAction.VANISH_DELAY_MS

    Row(
        modifier = GlanceModifier.fillMaxWidth().height(rowHeight),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Wide hit box around a small ring: easy to hit, visually quiet.
        Box(
            modifier = GlanceModifier
                .width(rowHeight + 6.dp)
                .height(rowHeight)
                .clickable(toggle),
            contentAlignment = Alignment.Center
        ) {
            StatusCircle(completed = item.isCompleted, justCompleted = justCompleted, size = circle)
        }

        HGap(4.dp)

        Box(
            modifier = GlanceModifier
                .defaultWeight()
                .height(rowHeight)
                .clickable(openApp),
            contentAlignment = Alignment.CenterStart
        ) {
            Text(
                text = item.title,
                style = wText(
                    color = if (item.isCompleted) WidgetSkin.Slate400 else WidgetSkin.Slate300,
                    size = if (compact) 11.5.sp else 12.5.sp,
                    weight = if (item.isCompleted) FontWeight.Normal else FontWeight.Medium,
                    decoration = if (item.isCompleted) TextDecoration.LineThrough else null
                ),
                maxLines = 1
            )
        }
    }
}

/** Every task is done: the list is empty by design, so celebrate instead. */
@Composable
private fun CelebrationRow(state: TodayTasks, openApp: Action, compact: Boolean) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(ColorProvider(WidgetSkin.EmeraldSoft))
            .cornerRadius(12.dp)
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .clickable(openApp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StatusCircle(completed = true, justCompleted = false, size = if (compact) 20.dp else 24.dp)
        HGap(8.dp)
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = "أنجزت كل مهام اليوم 🎉",
                style = wText(WidgetSkin.White, if (compact) 11.5.sp else 12.5.sp, FontWeight.Bold),
                maxLines = 1
            )
            Text(
                text = "${state.completedCount} مهمة مكتملة — سلسلتك بأمان",
                style = wText(WidgetSkin.Slate400, if (compact) 8.5.sp else 9.5.sp),
                maxLines = 1
            )
        }
    }
}

@Composable
private fun EmptyDay(openApp: Action) {
    Column(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(openApp)
    ) {
        Text(
            text = "لا توجد مهام لليوم",
            style = wText(WidgetSkin.White, 12.sp, FontWeight.Bold),
            maxLines = 1
        )
        Gap(2.dp)
        Text(
            text = "خطّتك لهذا اليوم فارغة — استمتع بيومك 🌿",
            style = wText(WidgetSkin.Slate400, 9.5.sp),
            maxLines = 1
        )
        Gap(6.dp)
        Badge(
            text = "افتح الخطة",
            background = WidgetSkin.EmeraldSoft,
            foreground = WidgetSkin.EmeraldBright,
            horizontal = 8.dp,
            vertical = 3.dp,
            fontSize = 9.5.sp
        )
    }
}
