package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
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
 * ⭐⭐ Phase W7 — «مهام اليوم» at the approved 2×3 size.
 *
 * Reference dimensions (`widget_reference_final.html`):
 *   • `linear-gradient(145deg, #1e293b, #0f172a)`, 28 dp radius, 16 dp padding;
 *   • title 20 sp / 800, task text 16 sp / 500.
 *
 * The card is now **portrait**: at 140–160 dp wide a title + counter badge on one
 * line would clip, so the 20 sp title gets its own row and the `done/total` pill
 * sits on a compact meta line underneath. Rows are still budgeted from
 * [LocalSize], so a resize never draws outside the RemoteViews bounds.
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
    val size = LocalSize.current
    val tight = size.height < 200.dp

    val pad = if (tight) 12.dp else 16.dp
    val titleLine = 27.dp
    val metaLine = 15.dp
    val headerGap = if (tight) 6.dp else 8.dp
    val rowHeight = if (tight) 28.dp else 30.dp
    val rowGap = 6.dp
    val circle = if (tight) 20.dp else 22.dp
    val rowText = 16.sp

    val openApp = openAppAction("tasks")

    // A task checked in the last 0.9 s keeps its row: that frame is the tick and
    // the strike-through. Older completed rows are gone, so what remains is work.
    val now = System.currentTimeMillis()
    val visible = state.items.filter { item ->
        !item.isCompleted ||
            (item.doneAt > 0 && now - item.doneAt < ToggleTaskAction.VANISH_DELAY_MS)
    }

    val chrome = pad * 2 + titleLine + 2.dp + metaLine + headerGap
    val maxRows = (((size.height - chrome) + rowGap) / (rowHeight + rowGap))
        .toInt()
        .coerceIn(1, 6)
    val rows = visible.take(maxRows)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_tasks))
            .padding(pad)
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Header(state, openApp, tight)

            Gap(headerGap)

            when {
                state.isEmpty -> EmptyDay(openApp)
                rows.isEmpty() -> CelebrationRow(state, openApp, tight)
                else -> TaskList(
                    rows = rows,
                    date = state.date,
                    openApp = openApp,
                    rowHeight = rowHeight,
                    rowGap = rowGap,
                    circle = circle,
                    textSize = rowText
                )
            }
        }
    }
}

@Composable
private fun Header(state: TodayTasks, openApp: Action, tight: Boolean) {
    Column(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(openApp)
    ) {
        Text(
            text = "مهام اليوم",
            style = wText(WidgetSkin.White, 20.sp, FontWeight.Bold),
            maxLines = 1
        )

        Gap(2.dp)

        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (!state.isEmpty) {
                Badge(
                    text = "${state.completedCount}/${state.totalCount}",
                    background = WidgetSkin.EmeraldSoft,
                    foreground = WidgetSkin.EmeraldBright,
                    horizontal = 6.dp,
                    vertical = 1.dp,
                    corner = 6.dp,
                    fontSize = 10.sp
                )
                HGap(6.dp)
            }
            Text(
                text = if (state.allDone) {
                    "أنجزت كل مهام اليوم"
                } else if (state.isEmpty) {
                    "لا مهام لهذا اليوم"
                } else {
                    "مكتملة اليوم"
                },
                style = wText(
                    if (state.allDone) WidgetSkin.EmeraldBright else WidgetSkin.Slate400,
                    if (tight) 9.5.sp else 10.sp,
                    FontWeight.Medium
                ),
                maxLines = 1
            )
        }
    }
}

@Composable
private fun TaskList(
    rows: List<TaskItem>,
    date: String,
    openApp: Action,
    rowHeight: Dp,
    rowGap: Dp,
    circle: Dp,
    textSize: TextUnit
) {
    rows.forEachIndexed { index, item ->
        TaskRow(item, date, openApp, rowHeight, circle, textSize)
        if (index != rows.lastIndex) Gap(rowGap)
    }
}

@Composable
private fun TaskRow(
    item: TaskItem,
    date: String,
    openApp: Action,
    rowHeight: Dp,
    circle: Dp,
    textSize: TextUnit
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
        // Tall hit box around a small ring: easy to hit, visually quiet.
        Box(
            modifier = GlanceModifier
                .width(rowHeight + 4.dp)
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
                    size = textSize,
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
private fun CelebrationRow(state: TodayTasks, openApp: Action, tight: Boolean) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(ColorProvider(WidgetSkin.EmeraldSoft))
            .cornerRadius(12.dp)
            .padding(horizontal = 10.dp, vertical = 8.dp)
            .clickable(openApp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        StatusCircle(completed = true, justCompleted = false, size = if (tight) 22.dp else 26.dp)
        HGap(8.dp)
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = "أنجزت كل مهام اليوم 🎉",
                style = wText(WidgetSkin.White, 14.sp, FontWeight.Bold),
                maxLines = 2
            )
            Text(
                text = "${state.completedCount} مهمة مكتملة",
                style = wText(WidgetSkin.Slate400, 11.sp),
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
            style = wText(WidgetSkin.White, 16.sp, FontWeight.Bold),
            maxLines = 1
        )
        Gap(3.dp)
        Text(
            text = "خطّتك لهذا اليوم فارغة — استمتع بيومك 🌿",
            style = wText(WidgetSkin.Slate400, 12.sp),
            maxLines = 2
        )
        Gap(8.dp)
        Badge(
            text = "افتح الخطة",
            background = WidgetSkin.EmeraldSoft,
            foreground = WidgetSkin.EmeraldBright,
            horizontal = 9.dp,
            vertical = 3.dp,
            fontSize = 11.sp
        )
    }
}
