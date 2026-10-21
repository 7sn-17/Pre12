package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
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
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — «سلسلة الأيام» (simple, 2×2, approved design).
 *
 * Midnight card, a red ember bloom behind the hero number, the flame, the 58 pt
 * streak and a seven-dot week. Everything is centred: this widget is a trophy,
 * not a dashboard.
 *
 * Responsiveness ([LocalSize]):
 *   • 2×2 → flame + 58 pt number + label + dots;
 *   • shorter than 140 dp → 46 pt number, dots kept;
 *   • 1×1 → 40 pt number, flame and dots hidden (no clipped glyphs).
 *
 * A tap anywhere opens `pre12://streak`.
 */
class SimpleStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val streak = WidgetBridge.readStreak(context)
        provideContent { SimpleStreakCard(streak) }
    }
}

class SimpleStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SimpleStreakWidget()
}

@Composable
private fun SimpleStreakCard(streak: StreakSummary) {
    val size = LocalSize.current
    val tiny = size.width < 110.dp || size.height < 125.dp
    val compact = size.height < 140.dp
    val showDots = !tiny && streak.days.isNotEmpty() && size.height >= 125.dp
    val numberSize = when {
        tiny -> 40.sp
        compact -> 46.sp
        else -> 58.sp
    }

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_streak_simple))
            .padding(if (tiny) 10.dp else 12.dp)
            .clickable(openAppAction("streak"))
    ) {
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!tiny) {
                    Text(
                        text = "🔥",
                        style = wText(WidgetSkin.FlameOrange, 24.sp, FontWeight.Bold, TextAlign.Center),
                        maxLines = 1
                    )
                    HGap(3.dp)
                }
                Text(
                    text = streak.current.toString(),
                    style = wText(
                        WidgetSkin.White,
                        numberSize,
                        FontWeight.Bold,
                        TextAlign.Center
                    ),
                    maxLines = 1
                )
            }

            Text(
                text = "يوم متتالي",
                style = wText(WidgetSkin.Slate400, if (tiny) 9.sp else 10.5.sp, FontWeight.Medium, TextAlign.Center),
                maxLines = 1
            )

            if (showDots) {
                Gap(10.dp)
                WeekDots(streak.days)
            }
        }
    }
}

/** Seven dots: done = emerald, today = white, missed = slate, freeze = soft grey. */
@Composable
private fun WeekDots(days: List<StreakDay>) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEach { day ->
            Column(
                modifier = GlanceModifier.defaultWeight(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Dot(
                    diameter = dotDiameter(day.state),
                    color = dotColor(day.state)
                )
            }
        }
    }
}

private fun dotDiameter(state: StreakDayState): Dp = when (state) {
    StreakDayState.TODAY, StreakDayState.TODAY_DONE -> 9.dp
    else -> 7.dp
}

private fun dotColor(state: StreakDayState) = when (state) {
    StreakDayState.DONE, StreakDayState.TODAY_DONE -> WidgetSkin.Emerald
    StreakDayState.TODAY -> WidgetSkin.White
    StreakDayState.FREEZE -> WidgetSkin.Slate400
    StreakDayState.MISSED -> WidgetSkin.Ink700
}

/** Exposed for the empty state of the detailed variant (kept for symmetry). */
@Composable
internal fun FlameGlyph(size: Dp = 26.dp) {
    Box(
        modifier = GlanceModifier.size(size).cornerRadius(size / 2),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "🔥",
            style = wText(WidgetSkin.FlameOrange, (size.value * 0.62f).sp, FontWeight.Bold, TextAlign.Center),
            maxLines = 1
        )
    }
}
