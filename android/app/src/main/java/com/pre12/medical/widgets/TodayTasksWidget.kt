package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.appWidgetBackground
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

/**
 * ⭐⭐ Phase W1 — «مهام اليوم» (Today's Tasks) home-screen widget.
 *
 * Renders a 4×2 card:
 *
 *   ┌────────────────────────────────────┐
 *   │ مهام اليوم           3 / 8          │  title + counter chip
 *   │ 3 من 8 مكتملة                       │  subtitle
 *   │ ▰▰▰▰▱▱▱▱▱▱                          │  progress (Material You primary)
 *   │ ✓( مراجعة التشريح )                  │  completed · struck through
 *   │ ○  تمارين الفسيولوجيا                │  open
 *   │ ○  قراءة ملخص الكيمياء               │
 *   └────────────────────────────────────┘
 *
 * W1 is intentionally **static** (no click actions yet); W2 adds
 * `ToggleTaskAction` on each row. Data comes from SharedPreferences through
 * [WidgetBridge], so the widget renders real numbers as soon as the web layer
 * starts publishing them.
 *
 * Design notes:
 *  • RTL is honoured by Glance at translation time — the checkbox circle is the
 *    first logical child, so it lands on the right edge in Arabic.
 *  • No shadows/blur: widgets render through RemoteViews. The "premium" feel
 *    comes from the 24 dp radius, generous padding, tonal hierarchy and a
 *    single 4 dp accent bar — not from effects that cannot be drawn.
 *  • Colours always come from [WidgetPalette], never from literal ints, so the
 *    Material You + dark-mode matrices work without branching in UI code.
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

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(colors.surface)
            .cornerRadius(24.dp)
            .padding(16.dp)
            .appWidgetBackground(),
        horizontalAlignment = Alignment.Start
    ) {
        Header(state, colors)

        Spacer(GlanceModifier.height(12.dp))

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
            EmptyState(colors)
        } else {
            TaskList(state, colors)
        }
    }
}

@Composable
private fun Header(state: TodayTasks, colors: ColorProviders) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
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
            Box(
                modifier = GlanceModifier
                    .background(colors.primaryContainer)
                    .cornerRadius(11.dp)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "${state.completedCount} / ${state.totalCount}",
                    style = TextStyle(
                        color = colors.onPrimaryContainer,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    ),
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun TaskList(state: TodayTasks, colors: ColorProviders) {
    val visible = state.items.take(MAX_VISIBLE_TASKS)

    visible.forEachIndexed { index, item ->
        TaskRow(item, colors)
        if (index != visible.lastIndex) {
            Spacer(GlanceModifier.height(9.dp))
        }
    }

    val remaining = state.items.size - visible.size
    if (remaining > 0) {
        Spacer(GlanceModifier.height(9.dp))
        Text(
            text = "+$remaining مهام أخرى",
            style = TextStyle(
                color = colors.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Start
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun TaskRow(item: TaskItem, colors: ColorProviders) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
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
                Box(
                    modifier = GlanceModifier
                        .size(14.dp)
                        .background(colors.surface)
                        .cornerRadius(7.dp)
                )
            }
        }

        Spacer(GlanceModifier.width(10.dp))

        Text(
            text = item.title,
            modifier = GlanceModifier.defaultWeight(),
            style = TextStyle(
                color = if (item.isCompleted) colors.onSurfaceVariant else colors.onSurface,
                fontSize = 13.sp,
                fontWeight = if (item.isCompleted) FontWeight.Normal else FontWeight.Medium,
                textAlign = TextAlign.Start,
                textDecoration = if (item.isCompleted) TextDecoration.LineThrough else null
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun EmptyState(colors: ColorProviders) {
    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "لا توجد مهام لليوم",
                style = TextStyle(
                    color = colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                ),
                maxLines = 1
            )
            Spacer(GlanceModifier.height(4.dp))
            Text(
                text = "استمتع بيومك 🌿",
                style = TextStyle(
                    color = colors.onSurfaceVariant,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                ),
                maxLines = 1
            )
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
