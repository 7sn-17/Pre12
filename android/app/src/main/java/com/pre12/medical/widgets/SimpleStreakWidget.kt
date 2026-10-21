package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W2 — «سلسلة الأيام» (Simple Streak) widget.
 *
 * Hero layout: a flame badge in a tonal halo, the streak number at display size,
 * and two quiet stats underneath. The number is the only loud element — that is
 * what a streak widget should be.
 *
 * Zero state stays inside the same layout (no jarring empty card): the flame goes
 * muted and a real CTA chip appears, which opens the app.
 */
class SimpleStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val streak = WidgetBridge.readStreak(context)
        provideContent {
            GlanceTheme(colors = WidgetPalette.colors) {
                SimpleStreakContent(streak)
            }
        }
    }
}

class SimpleStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SimpleStreakWidget()
}

@Composable
private fun SimpleStreakContent(streak: StreakSummary) {
    val colors = GlanceTheme.colors
    val openApp = openAppAction()
    val compact = LocalSize.current.height < 150.dp
    val started = streak.current > 0

    GlassCard(padding = if (compact) 14.dp else 16.dp) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(openApp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(
                iconRes = R.drawable.widget_ic_flame,
                size = if (compact) 26.dp else 30.dp,
                badgeSize = if (compact) 50.dp else 58.dp,
                background = if (started) colors.primaryContainer else colors.surfaceVariant,
                tint = if (started) colors.primary else colors.onSurfaceVariant
            )

            Spacer(GlanceModifier.width(14.dp))

            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = streak.current.toString(),
                    style = TextStyle(
                        color = if (started) colors.onSurface else colors.onSurfaceVariant,
                        fontSize = if (compact) 30.sp else 36.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Text(
                    text = "يوم متتالي",
                    style = TextStyle(
                        color = colors.onSurfaceVariant,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
            }

            if (!started) {
                Chip(
                    text = "ابدأ الآن",
                    background = colors.primary,
                    foreground = colors.onPrimary
                )
            }
        }

        if (!compact) {
            Spacer(GlanceModifier.defaultWeight())
            Hairline()
            Spacer(GlanceModifier.height(8.dp))
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                StatLine(label = "الأفضل", value = streak.longest.toString(), colors = colors)
                Spacer(GlanceModifier.width(14.dp))
                StatLine(label = "تجميدات", value = streak.freezes.toString(), colors = colors)
                Spacer(GlanceModifier.defaultWeight())
                Text(
                    text = if (streak.todayDone) "اليوم مكتمل ✓" else "لم تُنجز اليوم بعد",
                    style = TextStyle(
                        color = if (streak.todayDone) colors.primary else colors.onSurfaceVariant,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.End
                    ),
                    maxLines = 1
                )
            }
        } else {
            Spacer(GlanceModifier.defaultWeight())
            Text(
                text = "أفضل سلسلة: ${streak.longest} يوم",
                style = TextStyle(
                    color = colors.onSurfaceVariant,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Start
                ),
                maxLines = 1
            )
        }
    }
}
