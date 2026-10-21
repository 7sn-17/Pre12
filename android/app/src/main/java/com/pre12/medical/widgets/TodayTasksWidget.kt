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
import androidx.glance.LocalContext
import androidx.glance.LocalState
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
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextDecoration
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W9 — «مهام اليوم», wide 3×2 (250×120 dp minimum).
 *
 * Reference dimensions (`widget_reference_final.html`):
 *   • `linear-gradient(145deg, #1e293b, #0f172a)`, 28 dp radius, 16 dp padding;
 *   • title 20 sp / 800, task text 16 sp / 500.
 *
 * Phase W9 changes:
 *   • the title is **centred** and a hairline separates the header from the list;
 *   • every task of the day is rendered (no truncation, no weights): a completed
 *     task stays in the list with its ✓ and its strike-through;
 *   • the payload is read **inside the composition** — Glance keeps the
 *     composition alive, so a value captured before `provideContent` would be
 *     redrawn forever (that was the "the checkbox does nothing" bug).
 *
 * Interaction is split so a mis-tap can never change data: the status ring
 * toggles; the text and the header deep-link to `pre12://tasks`.
 */
class TodayTasksWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // ⭐⭐⭐ Phase W9 — the payload is read INSIDE the composition.
        //
        // Glance 1.x keeps the composition alive in a session for ~45 s and
        // `update()` only asks that session to recompose. A value read *before*
        // `provideContent` is captured by the closure forever, so every redraw
        // re-used the payload from the first composition — the checkbox moved,
        // the screen did not. Reading on each recomposition is what makes the
        // tap visible in the same second.
        provideContent {
            val ctx = LocalContext.current
            // ⭐⭐⭐ Phase W14 — بلا هذه القراءة يتخطّى Compose هذا الـlambda
            //   (لا تغيّر معاملاته ولا يقرأ حالةً) فيبقى الرسم على أول
            //   حمولة للأبد — وهو سبب «الودجت لا يتغيّر حتى إعادة التشغيل».
            //   قراءة حالة Glance تجعل الـcomposition يعتمد عليها، فيُعاد
            //   تشغيله مع كل update() وتُقرأ البيانات الحديثة.
            @Suppress("UNUSED_VARIABLE")
            val glanceState = LocalState.current
            // ⭐⭐⭐ W14 — قراءة نبضة التحديث: تجعل هذا الـcomposition يعتمد على
            //   حالة حقيقية، فلا يتخطّاه Compose، فتُقرأ البيانات الحديثة وتُرسم.
            @Suppress("UNUSED_VARIABLE")
            val refreshVersion = WidgetRefreshSignal.version.value
            TodayTasksCard(WidgetBridge.readTodayTasks(ctx))
        }
    }
}

class TodayTasksWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayTasksWidget()
}

@Composable
private fun TodayTasksCard(state: TodayTasks) {
    val size = LocalSize.current
    val wide = size.width >= 230.dp
    val tight = size.height < 150.dp

    val pad = if (tight) 12.dp else 16.dp
    val headerLine = 28.dp
    val metaLine = 17.dp
    val hairlineGap = if (tight) 4.dp else 6.dp
    // ⭐⭐ Phase W12 — نُظهر **كل** المهام التي تتّسع لها البطاقة:
    //   صفّ 16sp يحتاج ~21dp، والفجوة 4dp، والحدّ الأقصى صار 12
    //   (maximum الحمولة) بدل 6.
    val rowGap = 4.dp
    val minRow = 21.dp
    val circle = if (tight) 20.dp else 22.dp
    val rowText = 16.sp

    val openApp = openAppAction("tasks")

    // ⭐⭐ Phase W14 — **نُظهر كل المهام**: لا اقتطاع ولا صفوف مخفيّة.
    //   المهمة المنجزة **تبقى** في القائمة بعلامة ✓ وشطب — هي الدليل
    //   على أن الضغطة نجحت، وإخفاؤها كان يوهم بأن الودجت لا يعمل.
    val rows = state.items

    val headerHeight = if (wide) headerLine else headerLine + metaLine
    val chrome = pad * 2 + headerHeight + hairlineGap + 1.dp + hairlineGap
    val available = (size.height - chrome).coerceAtLeast(0.dp)

    // ⭐ ارتفاع الصفّ يتقلّص قليلاً إذا كثرت المهام (بلا weights وبلا اقتطاع).
    val rowHeight = if (rows.isEmpty()) {
        0.dp
    } else {
        (available / rows.size).coerceAtMost(26.dp).coerceAtLeast(minRow)
    }

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_tasks))
            .padding(pad)
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            if (wide) {
                WideHeader(state, openApp)
            } else {
                NarrowHeader(state, openApp, tight)
            }

            Gap(hairlineGap)

            Hairline(WidgetSkin.Hairline, 1.dp)

            Gap(hairlineGap)

            when {
                state.isEmpty -> EmptyDay(openApp)
                else -> TaskList(
                    rows = rows,
                    date = state.date,
                    openApp = openApp,
                    rowGap = rowGap,
                    rowHeight = rowHeight,
                    circle = circle,
                    textSize = rowText
                )
            }
        }
    }
}

/** Wide layout: the title is centred between the pill and the counter. */
@Composable
private fun WideHeader(state: TodayTasks, openApp: Action) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(openApp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = GlanceModifier.defaultWeight(),
            contentAlignment = Alignment.TopStart
        ) {
            if (!state.isEmpty) {
                Badge(
                    text = "${state.completedCount}/${state.totalCount}",
                    background = WidgetSkin.EmeraldSoft,
                    foreground = WidgetSkin.EmeraldBright,
                    horizontal = 7.dp,
                    vertical = 2.dp,
                    corner = 7.dp,
                    fontSize = 10.sp
                )
            }
        }

        Text(
            text = "مهام اليوم",
            style = wText(WidgetSkin.White, 20.sp, FontWeight.Bold, TextAlign.Center),
            maxLines = 1
        )

        Box(
            modifier = GlanceModifier.defaultWeight(),
            contentAlignment = Alignment.TopEnd
        ) {
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
                    10.sp,
                    FontWeight.Medium,
                    TextAlign.End
                ),
                maxLines = 1
            )
        }
    }
}

/** Narrow layout (2×3): the title is centred on its own line. */
@Composable
private fun NarrowHeader(state: TodayTasks, openApp: Action, tight: Boolean) {
    Column(
        modifier = GlanceModifier
            .fillMaxWidth()
            .clickable(openApp)
    ) {
        Text(
            text = "مهام اليوم",
            modifier = GlanceModifier.fillMaxWidth(),
            style = wText(WidgetSkin.White, 20.sp, FontWeight.Bold, TextAlign.Center),
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

/**
 * The task list.
 *
 * Every task gets its own row with a fixed height; when there are many tasks
 * the height shrinks a little so all of them stay visible.
 */
/**
 * ⭐⭐ Phase W14 — عمود بسيط: كل مهمة صفٌّ بارتفاع ثابت.
 * (لا weights ولا Spacers: هي التي كانت تُخفي المهام وتُنتج «مهمة واحدة فقط».)
 */
@Composable
private fun TaskList(
    rows: List<TaskItem>,
    date: String,
    openApp: Action,
    rowGap: Dp,
    rowHeight: Dp,
    circle: Dp,
    textSize: TextUnit
) {
    rows.forEachIndexed { index, item ->
        TaskRow(
            item = item,
            date = date,
            openApp = openApp,
            circle = circle,
            textSize = textSize,
            modifier = GlanceModifier.fillMaxWidth().height(rowHeight)
        )
        if (index != rows.lastIndex) Gap(rowGap)
    }
}

@Composable
private fun TaskRow(
    item: TaskItem,
    date: String,
    openApp: Action,
    circle: Dp,
    textSize: TextUnit,
    modifier: GlanceModifier
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
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Tall hit box around a small ring: easy to hit, visually quiet.
        Box(
            modifier = GlanceModifier
                .size(circle + 10.dp)
                .clickable(toggle),
            contentAlignment = Alignment.Center
        ) {
            StatusCircle(completed = item.isCompleted, justCompleted = justCompleted, size = circle)
        }

        HGap(2.dp)

        Box(
            modifier = GlanceModifier
                .defaultWeight()
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
