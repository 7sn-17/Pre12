package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.color.ColorProviders
import androidx.glance.layout.Alignment
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
 * ⭐⭐ Phase W2 — «ملاحظاتي وأهدافي» widget.
 *
 * Shows up to three pinned items: active goals first (nearest deadline wins),
 * then the newest personal notes. Each row carries the pin glyph, so the widget
 * reads as a pinboard rather than a generic list.
 *
 * The whole card is tappable (opens the app); the rows themselves stay passive so
 * a stray tap can never delete or edit a note from the home screen.
 */
class NotesWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val notes = WidgetBridge.readNotes(context)
        provideContent {
            GlanceTheme(colors = WidgetPalette.colors) {
                NotesContent(notes)
            }
        }
    }
}

class NotesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotesWidget()
}

@Composable
private fun NotesContent(notes: PinnedNotes) {
    val colors = GlanceTheme.colors
    val openApp = openAppAction()
    val maxItems = if (LocalSize.current.height >= 150.dp) 3 else 2

    GlassCard(padding = 14.dp) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(openApp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(
                iconRes = R.drawable.widget_ic_pin,
                size = 15.dp,
                badgeSize = 30.dp,
                background = colors.primaryContainer,
                tint = colors.primary
            )

            Spacer(GlanceModifier.width(9.dp))

            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = "ملاحظاتي وأهدافي",
                    style = TextStyle(
                        color = colors.onSurface,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Text(
                    text = if (notes.isEmpty) "مساحة صغيرة لأفكارك" else "${notes.total} عنصر محفوظ",
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

        Spacer(GlanceModifier.height(7.dp))
        Hairline()
        Spacer(GlanceModifier.height(7.dp))

        if (notes.isEmpty) {
            WidgetEmptyState(
                title = "لا توجد ملاحظات بعد",
                message = "أضف هدفاً أو ملاحظة لتظهر هنا",
                cta = "أضف الآن",
                iconRes = R.drawable.widget_ic_pin
            )
        } else {
            notes.items.take(maxItems).forEachIndexed { index, item ->
                NoteRow(item, colors)
                if (index != notes.items.take(maxItems).lastIndex) {
                    Spacer(GlanceModifier.height(5.dp))
                }
            }
        }
    }
}

@Composable
private fun NoteRow(item: PinnedItem, colors: ColorProviders) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            provider = ImageProvider(R.drawable.widget_ic_pin),
            contentDescription = null,
            modifier = GlanceModifier.size(12.dp),
            colorFilter = androidx.glance.ColorFilter.tint(colors.primary)
        )

        Spacer(GlanceModifier.width(7.dp))

        Text(
            text = item.text,
            modifier = GlanceModifier.defaultWeight(),
            style = TextStyle(
                color = if (item.kind == "goal") colors.onSurface else colors.onSurfaceVariant,
                fontSize = 11.5.sp,
                fontWeight = if (item.kind == "goal") FontWeight.Medium else FontWeight.Normal,
                textAlign = TextAlign.Start
            ),
            maxLines = 1
        )
    }
}
