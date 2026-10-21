package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
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
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W2 — «سلسلة الأيام · أسبوعي» (Detailed Streak) widget.
 *
 * A 7-day map that reads at a glance:
 *
 *   done        filled primary circle + ✓
 *   today       primary ring inside a tonal halo (the "glow")
 *   today done  filled circle inside the same halo
 *   missed      thin outline circle
 *   freeze      secondary-container circle with ❄
 *
 * The halo replaces a real shadow: RemoteViews cannot draw one, so the glow is
 * a second concentric layer — which is also what Material You does for focus.
 */
class DetailedStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val streak = WidgetBridge.readStreak(context)
        provideContent {
            GlanceTheme(colors = WidgetPalette.colors) {
                DetailedStreakContent(streak)
            }
        }
    }
}

class DetailedStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DetailedStreakWidget()
}

@Composable
private fun DetailedStreakContent(streak: StreakSummary) {
    val colors = GlanceTheme.colors
    val openApp = openAppAction("streak")

    GlassCard(padding = 14.dp) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(openApp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(
                iconRes = R.drawable.widget_ic_flame,
                size = 18.dp,
                badgeSize = 34.dp,
                background = colors.primaryContainer,
                tint = colors.primary
            )

            Spacer(GlanceModifier.width(9.dp))

            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = "سلسلة الأيام",
                    style = TextStyle(
                        color = colors.onSurface,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Text(
                    text = "${streak.current} يوم متتالي",
                    style = TextStyle(
                        color = colors.onSurfaceVariant,
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
            }

            Chip(
                text = "الأفضل ${streak.longest}",
                background = colors.primaryContainer,
                foreground = colors.onPrimaryContainer,
                horizontal = 8.dp,
                vertical = 4.dp
            )
        }

        // 8 dp gutters keep the full card at ~128 dp: header 34 + gutters 17 +
        // week row 49 + padding 28. At the provider's 130 dp minimum, 10 dp
        // gutters would clip the today halo.
        Spacer(GlanceModifier.height(8.dp))
        Hairline()
        Spacer(GlanceModifier.height(8.dp))

        if (streak.days.isEmpty()) {
            WidgetEmptyState(
                path = "streak",
                title = "لا توجد بيانات بعد",
                message = "أنجز مهمة واحدة لتشعل سلسلتك",
                cta = "افتح التطبيق",
                iconRes = R.drawable.widget_ic_flame
            )
        } else {
            WeekRow(streak, colors)
        }
    }
}

@Composable
private fun WeekRow(streak: StreakSummary, colors: ColorProviders) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        streak.days.forEach { day ->
            Column(
                modifier = GlanceModifier.defaultWeight(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = day.label,
                    style = TextStyle(
                        color = when (day.state) {
                            StreakDayState.TODAY, StreakDayState.TODAY_DONE -> colors.primary
                            else -> colors.onSurfaceVariant
                        },
                        fontSize = 10.sp,
                        fontWeight = if (day.state == StreakDayState.TODAY ||
                            day.state == StreakDayState.TODAY_DONE
                        ) FontWeight.Bold else FontWeight.Medium,
                        textAlign = TextAlign.Center
                    ),
                    maxLines = 1
                )
                Spacer(GlanceModifier.height(6.dp))
                DayDot(day.state, colors)
            }
        }
    }
}

@Composable
private fun DayDot(state: StreakDayState, colors: ColorProviders) {
    when (state) {
        StreakDayState.DONE -> FilledDot(colors)
        StreakDayState.TODAY_DONE -> HaloDot(colors) { FilledDot(colors) }
        StreakDayState.TODAY -> HaloDot(colors) { RingDot(colors, ringWidth = 2.dp, ring = colors.primary) }
        StreakDayState.FREEZE -> Box(
            modifier = GlanceModifier
                .size(26.dp)
                .background(colors.secondaryContainer)
                .cornerRadius(13.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "❄",
                style = TextStyle(
                    color = colors.onSecondaryContainer,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                ),
                maxLines = 1
            )
        }
        StreakDayState.MISSED -> RingDot(colors, ringWidth = 1.dp, ring = colors.outline)
    }
}

/** Tonal halo behind today's dot — the honest RemoteViews "glow". */
@Composable
private fun HaloDot(colors: ColorProviders, content: @Composable () -> Unit) {
    Box(
        modifier = GlanceModifier
            .size(30.dp)
            .background(colors.primaryContainer)
            .cornerRadius(15.dp),
        contentAlignment = Alignment.Center
    ) {
        content()
    }
}

@Composable
private fun FilledDot(colors: ColorProviders) {
    Box(
        modifier = GlanceModifier
            .size(26.dp)
            .background(colors.primary)
            .cornerRadius(13.dp),
        contentAlignment = Alignment.Center
    ) {
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
    }
}

/** Circle drawn as ring + surface core (Glance has no border modifier). */
@Composable
private fun RingDot(colors: ColorProviders, ringWidth: androidx.compose.ui.unit.Dp, ring: androidx.glance.unit.ColorProvider) {
    val outer = 26.dp
    val inner = outer - ringWidth * 2
    Box(
        modifier = GlanceModifier
            .size(outer)
            .background(ring)
            .cornerRadius(outer / 2),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = GlanceModifier
                .size(inner)
                .background(colors.surface)
                .cornerRadius(inner / 2)
        ) {}
    }
}
