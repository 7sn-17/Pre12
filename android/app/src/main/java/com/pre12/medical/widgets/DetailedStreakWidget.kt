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
import androidx.glance.LocalContext
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
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
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
 * ⭐⭐ Phase W9 — «سلسلة الأيام · أسبوعي» (4×2), full and readable.
 *
 * The W8 version had two problems the user felt immediately: a single letter
 * inside each ring was unreadable, and the card looked half empty.
 *
 * Phase W9:
 *   • the seven days carry their **full Arabic name** (السبت، الأحد، الاثنين…)
 *     under a coloured ring — a glance is enough, no decoding;
 *   • the grid is a 4 + 3 block of *weighted* cells, so the week fills the
 *     right half of the card whatever the height;
 *   • the hero keeps the premium language of the 1×1 badge: a vector flame,
 *     the streak at 48 sp and «يوم متتالي».
 *
 * The rings are drawn with nested boxes (a coloured ring + an inner disc)
 * because RemoteViews cannot stroke a shape.
 */
class DetailedStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // ⭐ W9 — read inside the composition (see TodayTasksWidget.kt).
        provideContent {
            val ctx = LocalContext.current
            DetailedStreakCard(WidgetBridge.readStreak(ctx))
        }
    }
}

class DetailedStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DetailedStreakWidget()
}

@Composable
private fun DetailedStreakCard(streak: StreakSummary) {
    val size = LocalSize.current
    val roomy = size.height >= 130.dp
    val marker = if (roomy) 30.dp else 24.dp
    val pad = if (roomy) 14.dp else 10.dp
    val gutter = if (roomy) 12.dp else 8.dp

    val inner = (size.width - pad * 2 - 1.dp - gutter).coerceAtLeast(0.dp)
    val heroWidth = inner * 0.28f

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
            modifier = GlanceModifier.size(if (roomy) 26.dp else 20.dp),
            colorFilter = androidx.glance.ColorFilter.tint(ColorProvider(WidgetSkin.FlameOrange))
        )

        Text(
            text = streak.current.toString(),
            style = wText(
                WidgetSkin.White,
                if (roomy) 48.sp else 40.sp,
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
    Column(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (roomy) {
            Text(
                text = if (streak.todayDone) "أسبوعك · اليوم مكتمل ✓" else "آخر ٧ أيام",
                style = wText(
                    if (streak.todayDone) WidgetSkin.EmeraldBright else WidgetSkin.Slate400,
                    11.sp,
                    FontWeight.Bold
                ),
                maxLines = 1
            )
            Gap(6.dp)
        }

        if (streak.days.isEmpty()) {
            Text(
                text = "أنجز مهمة واحدة لتشعل سلسلتك",
                style = wText(WidgetSkin.Slate400, if (roomy) 10.sp else 9.sp),
                maxLines = 2
            )
            return@Column
        }

        // A 4 + 3 block: the cells are weighted, so the week always fills the
        // right half of the card — no dead space, no clipped names.
        val firstRow = streak.days.take(4)
        val secondRow = streak.days.drop(4)

        DayRow(firstRow, marker, roomy)
        if (secondRow.isNotEmpty()) {
            Gap(if (roomy) 8.dp else 5.dp)
            DayRow(secondRow, marker, roomy)
        }
    }
}

@Composable
private fun ColumnScope.DayRow(days: List<StreakDay>, marker: Dp, roomy: Boolean) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        days.forEach { day ->
            DayCell(day, marker, roomy)
        }
        // Keep the second row aligned with the first (3 cells, not 4).
        repeat(4 - days.size) {
            Box(modifier = GlanceModifier.defaultWeight().size(marker)) {}
        }
    }
}

@Composable
private fun RowScope.DayCell(day: StreakDay, marker: Dp, roomy: Boolean) {
    Column(
        modifier = GlanceModifier.defaultWeight(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        DayMarker(day.state, marker)

        Gap(if (roomy) 3.dp else 2.dp)

        Text(
            text = day.name.ifBlank { day.label },
            style = wText(
                if (day.state == StreakDayState.TODAY || day.state == StreakDayState.TODAY_DONE) {
                    WidgetSkin.White
                } else {
                    WidgetSkin.Slate400
                },
                if (roomy) 9.5.sp else 8.5.sp,
                FontWeight.Bold,
                TextAlign.Center
            ),
            maxLines = 1
        )
    }
}

@Composable
private fun DayMarker(state: StreakDayState, size: Dp) {
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

    val inner = size - 5.dp

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
            when (state) {
                StreakDayState.DONE -> Image(
                    provider = ImageProvider(R.drawable.widget_ic_check),
                    contentDescription = null,
                    modifier = GlanceModifier.size(size * 0.42f),
                    colorFilter = androidx.glance.ColorFilter.tint(ColorProvider(ink))
                )

                StreakDayState.TODAY_DONE -> Image(
                    provider = ImageProvider(R.drawable.widget_ic_check),
                    contentDescription = null,
                    modifier = GlanceModifier.size(size * 0.42f),
                    colorFilter = androidx.glance.ColorFilter.tint(ColorProvider(ink))
                )

                StreakDayState.TODAY -> Box(
                    modifier = GlanceModifier
                        .size(size * 0.3f)
                        .background(ColorProvider(ink))
                        .cornerRadius(size * 0.15f)
                ) {}

                StreakDayState.FREEZE -> Text(
                    text = "❄",
                    style = wText(ink, (size.value / 2f).sp, FontWeight.Bold, TextAlign.Center),
                    maxLines = 1
                )

                StreakDayState.MISSED -> Text(
                    text = "–",
                    style = wText(ink, (size.value / 2f).sp, FontWeight.Bold, TextAlign.Center),
                    maxLines = 1
                )
            }
        }
    }
}
