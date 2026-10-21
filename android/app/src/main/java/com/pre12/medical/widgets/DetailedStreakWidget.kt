package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
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
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W8 — «سلسلة الأيام · أسبوعي» rebuilt (4×2).
 *
 * The old card was unreadable: a tiny emoji flame, a number that lost its
 * scale and week dots that were too small to scan. The new one follows the
 * premium language of the 1×1 badge:
 *
 *   • **left** — a vector flame, the streak at 48 sp and «يوم متتالي»;
 *   • **right** — the seven days as 32 dp rings, each with a thick border and
 *     its Arabic initial (س، ح، ن، ث، ر، خ، ج) inside, so a glance is enough.
 *
 * The rings are drawn with nested boxes (a coloured ring + an inner disc)
 * because RemoteViews cannot stroke a shape.
 *
 * Glance 1.2 has no fractional weights, so the 26 / 74 split is computed from
 * the real card width: exact on every launcher, no guessing.
 */
class DetailedStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val streak = WidgetBridge.readStreak(context)
        provideContent { DetailedStreakCard(streak) }
    }
}

class DetailedStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DetailedStreakWidget()
}

@Composable
private fun DetailedStreakCard(streak: StreakSummary) {
    val size = LocalSize.current
    val roomy = size.height >= 130.dp
    val marker = if (roomy) 32.dp else 26.dp
    val pad = if (roomy) 14.dp else 10.dp
    val gutter = if (roomy) 12.dp else 8.dp

    val inner = (size.width - pad * 2 - 1.dp - gutter).coerceAtLeast(0.dp)
    val heroWidth = inner * 0.26f

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_streak_detailed))
            .padding(pad)
            .clickable(openAppAction("streak"))
    ) {
        Row(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HeroColumn(
                streak = streak,
                roomy = roomy,
                modifier = GlanceModifier.width(heroWidth)
            )
            VerticalHairline()
            HGap(gutter)
            WeekMap(
                streak = streak,
                marker = marker,
                roomy = roomy,
                modifier = GlanceModifier.width(inner - heroWidth)
            )
        }
    }
}

@Composable
private fun HeroColumn(streak: StreakSummary, roomy: Boolean, modifier: GlanceModifier) {
    Column(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            provider = ImageProvider(R.drawable.widget_ic_flame),
            contentDescription = null,
            modifier = GlanceModifier.size(if (roomy) 28.dp else 22.dp),
            colorFilter = androidx.glance.ColorFilter.tint(ColorProvider(WidgetSkin.FlameOrange))
        )

        Text(
            text = streak.current.toString(),
            style = wText(
                WidgetSkin.White,
                48.sp,
                FontWeight.Bold,
                TextAlign.Center
            ),
            maxLines = 1
        )

        Text(
            text = "يوم متتالي",
            style = wText(
                WidgetSkin.Slate400,
                if (roomy) 11.sp else 9.sp,
                FontWeight.Medium,
                TextAlign.Center
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun WeekMap(streak: StreakSummary, marker: Dp, roomy: Boolean, modifier: GlanceModifier) {
    Column(modifier = modifier) {
        Text(
            text = if (streak.todayDone) "أسبوعك · اليوم مكتمل ✓" else "آخر ٧ أيام",
            style = wText(
                if (streak.todayDone) WidgetSkin.EmeraldBright else WidgetSkin.Slate400,
                if (roomy) 11.sp else 9.sp,
                FontWeight.Bold
            ),
            maxLines = 1
        )

        Gap(if (roomy) 8.dp else 5.dp)

        if (streak.days.isEmpty()) {
            Text(
                text = "أنجز مهمة واحدة لتشعل سلسلتك",
                style = wText(WidgetSkin.Slate400, if (roomy) 10.sp else 9.sp),
                maxLines = 1
            )
            return@Column
        }

        // Seven rings in a 4 + 3 grid: a single row of 32 dp rings does not fit
        // in the right half of a 4×2 card, and the two rows stay perfectly even.
        val firstRow = streak.days.take(4)
        val secondRow = streak.days.drop(4)

        DayRow(firstRow, marker)
        if (secondRow.isNotEmpty()) {
            Gap(if (roomy) 10.dp else 6.dp)
            DayRow(secondRow, marker)
        }
    }
}

@Composable
private fun DayRow(days: List<StreakDay>, marker: Dp) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEach { day ->
            Column(
                modifier = GlanceModifier.defaultWeight(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                DayMarker(day.state, day.label, marker)
            }
        }
        // Keep the second row aligned with the first (3 rings, not 4).
        repeat(4 - days.size) {
            Box(modifier = GlanceModifier.defaultWeight().size(marker)) {}
        }
    }
}

@Composable
private fun DayMarker(state: StreakDayState, label: String, size: Dp) {
    val ring: Color
    val fill: Color
    val ink: Color

    when (state) {
        StreakDayState.DONE -> {
            ring = WidgetSkin.Emerald
            fill = WidgetSkin.Ink900
            ink = WidgetSkin.EmeraldBright
        }

        StreakDayState.TODAY_DONE -> {
            ring = WidgetSkin.EmeraldBright
            fill = WidgetSkin.Emerald
            ink = WidgetSkin.White
        }

        StreakDayState.TODAY -> {
            ring = WidgetSkin.White
            fill = WidgetSkin.Ink800
            ink = WidgetSkin.White
        }

        StreakDayState.FREEZE -> {
            ring = Color(0xFF38BDF8)
            fill = WidgetSkin.Ink900
            ink = Color(0xFFBAE6FD)
        }

        StreakDayState.MISSED -> {
            ring = WidgetSkin.Ink700
            fill = WidgetSkin.Ink900
            ink = WidgetSkin.Slate500
        }
    }

    val inner = size - 6.dp

    Box(
        modifier = GlanceModifier
            .size(size)
            .background(ColorProvider(ring))
            .cornerRadius(size / 2),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = GlanceModifier
                .size(inner)
                .background(ColorProvider(fill))
                .cornerRadius(inner / 2),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = label,
                style = wText(ink, 13.sp, FontWeight.Bold, TextAlign.Center),
                maxLines = 1
            )
        }
    }
}
