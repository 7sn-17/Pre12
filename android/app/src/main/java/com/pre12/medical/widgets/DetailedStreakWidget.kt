package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
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
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — «سلسلة الأيام · أسبوعي» (detailed, 4×2, approved design).
 *
 * Split view:
 *   • left  — ember glow, flame, current streak at display size;
 *   • right — the last seven days as labelled circles: emerald tick for a done
 *     day, a white ring for today, a slate dash for a missed day and ❄ for a
 *     freeze.
 *
 * The halo/ring replaces a real shadow: RemoteViews cannot draw one, so the glow
 * is a concentric layer — which is also how Material treats focus.
 *
 * A tap anywhere opens `pre12://streak`.
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
    val compact = size.height < 150.dp
    val marker = if (compact) 20.dp else 24.dp
    val pad = if (compact) 12.dp else 14.dp
    val gutter = if (compact) 10.dp else 14.dp

    // Glance 1.2 has no fractional weights, so the 36 / 64 split is computed
    // from the real card width: exact on every launcher, no guessing.
    val inner = (size.width - pad * 2 - 1.dp - gutter).coerceAtLeast(0.dp)
    val heroWidth = inner * 0.36f

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
                compact = compact,
                modifier = GlanceModifier.width(heroWidth)
            )
            VerticalHairline()
            HGap(gutter)
            WeekMap(
                streak = streak,
                marker = marker,
                compact = compact,
                modifier = GlanceModifier.width(inner - heroWidth)
            )
        }
    }
}

@Composable
private fun HeroColumn(streak: StreakSummary, compact: Boolean, modifier: GlanceModifier) {
    Column(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "🔥",
            style = wText(
                WidgetSkin.FlameOrange,
                if (compact) 16.sp else 19.sp,
                FontWeight.Bold,
                TextAlign.Center
            ),
            maxLines = 1
        )
        Text(
            text = streak.current.toString(),
            style = wText(
                WidgetSkin.White,
                if (compact) 36.sp else 42.sp,
                FontWeight.Bold,
                TextAlign.Center
            ),
            maxLines = 1
        )
        Text(
            text = "يوم متتالي",
            style = wText(WidgetSkin.Slate400, if (compact) 8.5.sp else 9.5.sp, FontWeight.Medium, TextAlign.Center),
            maxLines = 1
        )
    }
}

@Composable
private fun WeekMap(streak: StreakSummary, marker: Dp, compact: Boolean, modifier: GlanceModifier) {
    Column(modifier = modifier) {
        Text(
            text = if (streak.todayDone) "أسبوعك · اليوم مكتمل ✓" else "آخر ٧ أيام",
            style = wText(
                if (streak.todayDone) WidgetSkin.EmeraldBright else WidgetSkin.Slate400,
                if (compact) 8.sp else 9.sp,
                FontWeight.Medium
            ),
            maxLines = 1
        )

        Gap(if (compact) 5.dp else 7.dp)

        if (streak.days.isEmpty()) {
            Text(
                text = "أنجز مهمة واحدة لتشعل سلسلتك",
                style = wText(WidgetSkin.Slate400, 9.sp),
                maxLines = 1
            )
            return@Column
        }

        Row(modifier = GlanceModifier.fillMaxWidth()) {
            streak.days.forEach { day ->
                Column(
                    modifier = GlanceModifier.defaultWeight(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = day.label,
                        style = wText(
                            if (day.state == StreakDayState.TODAY ||
                                day.state == StreakDayState.TODAY_DONE
                            ) {
                                WidgetSkin.White
                            } else {
                                WidgetSkin.Slate500
                            },
                            8.sp,
                            FontWeight.Medium,
                            TextAlign.Center
                        ),
                        maxLines = 1
                    )
                    Gap(3.dp)
                    DayMarker(day.state, marker)
                }
            }
        }
    }
}

@Composable
private fun DayMarker(state: StreakDayState, size: Dp) {
    when (state) {
        StreakDayState.DONE -> FilledMarker(size)

        StreakDayState.TODAY_DONE -> Box(
            modifier = GlanceModifier
                .size(size)
                .background(ImageProvider(R.drawable.widget_circle_today)),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = GlanceModifier
                    .size(size - 8.dp)
                    .background(WidgetSkin.Emerald)
                    .cornerRadius((size - 8.dp) / 2),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    provider = ImageProvider(R.drawable.widget_ic_check),
                    contentDescription = null,
                    modifier = GlanceModifier.size(size * 0.38f),
                    colorFilter = androidx.glance.ColorFilter.tint(
                        androidx.glance.unit.ColorProvider(WidgetSkin.White)
                    )
                )
            }
        }

        StreakDayState.TODAY -> Box(
            modifier = GlanceModifier
                .size(size)
                .background(ImageProvider(R.drawable.widget_circle_today)),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = GlanceModifier
                    .size(size * 0.34f)
                    .background(WidgetSkin.White)
                    .cornerRadius(size * 0.17f)
            ) {}
        }

        StreakDayState.FREEZE -> Box(
            modifier = GlanceModifier
                .size(size)
                .background(ImageProvider(R.drawable.widget_circle_missed)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "❄",
                style = wText(WidgetSkin.Slate300, 9.sp, FontWeight.Bold, TextAlign.Center),
                maxLines = 1
            )
        }

        StreakDayState.MISSED -> Box(
            modifier = GlanceModifier
                .size(size)
                .background(ImageProvider(R.drawable.widget_circle_missed)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "–",
                style = wText(WidgetSkin.Slate500, 9.sp, FontWeight.Bold, TextAlign.Center),
                maxLines = 1
            )
        }
    }
}

@Composable
private fun FilledMarker(size: Dp) {
    Box(
        modifier = GlanceModifier
            .size(size)
            .background(WidgetSkin.Emerald)
            .cornerRadius(size / 2),
        contentAlignment = Alignment.Center
    ) {
        Image(
            provider = ImageProvider(R.drawable.widget_ic_check),
            contentDescription = null,
            modifier = GlanceModifier.size(size * 0.48f),
            colorFilter = androidx.glance.ColorFilter.tint(
                androidx.glance.unit.ColorProvider(WidgetSkin.White)
            )
        )
    }
}
