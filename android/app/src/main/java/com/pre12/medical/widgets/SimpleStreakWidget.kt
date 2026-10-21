package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W7 — «سلسلة الأيام» is now a **1×1 badge only**.
 *
 * Reference (`widget_reference_final.html`):
 *   • `#0f172a`, 24 dp radius, 1 dp `#ef4444` border;
 *   • flame 28 px over a 32 sp / 900 number, centred.
 *
 * The dots, the best-streak footer and the Arabic label are gone on purpose: at
 * 1×1 every extra line clips, and the number is the whole message. A vector
 * flame is used instead of the 🔥 emoji so the glyph is exactly 22 dp tall — an
 * emoji line box would make the stack taller than the widget. A tap anywhere
 * opens `pre12://streak`.
 */
class SimpleStreakWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // ⭐ W9 — read inside the composition so every recomposition (and not
        // only the first one) shows the current streak.
        provideContent {
            val ctx = LocalContext.current
            SimpleStreakCard(WidgetBridge.readStreak(ctx))
        }
    }
}

class SimpleStreakWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SimpleStreakWidget()
}

@Composable
private fun SimpleStreakCard(streak: StreakSummary) {
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_streak_simple))
            .padding(4.dp)
            .clickable(openAppAction("streak"))
    ) {
        Column(
            modifier = GlanceModifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Image(
                provider = ImageProvider(R.drawable.widget_ic_flame),
                contentDescription = null,
                modifier = GlanceModifier.size(22.dp),
                colorFilter = ColorFilter.tint(ColorProvider(WidgetSkin.FlameOrange))
            )

            Text(
                text = streak.current.toString(),
                style = wText(WidgetSkin.White, 32.sp, FontWeight.Bold, TextAlign.Center),
                maxLines = 1
            )
        }
    }
}
