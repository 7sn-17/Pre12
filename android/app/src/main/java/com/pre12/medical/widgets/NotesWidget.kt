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
 * ⭐⭐ Phase W2/W5 — Notes & Goals, three picker variants.
 *
 *   • [NotesWidget]      «ملاحظاتي وأهدافي» — goals and notes interleaved
 *   • [GoalsWidget]      «أهدافي»           — goals only
 *   • [NotesOnlyWidget]  «ملاحظاتي»         — notes only
 *
 * Android's widget picker lists each provider separately, so the *variant is
 * chosen from the system dialog* — no configuration activity, no extra tap, and
 * the launcher keeps three independent instances the user can place side by side.
 *
 * The JS payload carries up to six items interleaved (`goal, note, goal, …`), so
 * filtering here is enough for every variant to find its own top three. Combined
 * slices the interleaved list; the focused variants filter by kind.
 *
 * The rows are passive by design (a stray tap can never edit a note); the header
 * and the empty-state CTA deep-link to `pre12://notes` or `pre12://goals`.
 */
enum class NotesVariant {
    COMBINED,
    GOALS,
    NOTES
}

abstract class VariantNotesWidget(private val variant: NotesVariant) : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val notes = WidgetBridge.readNotes(context)
        provideContent {
            GlanceTheme(colors = WidgetPalette.colors) {
                NotesContent(notes, variant)
            }
        }
    }
}

/** Combined variant — the one referenced by `notes_widget_info.xml`. */
class NotesWidget : VariantNotesWidget(NotesVariant.COMBINED)

/** Goals-only variant. */
class GoalsWidget : VariantNotesWidget(NotesVariant.GOALS)

/** Notes-only variant. */
class NotesOnlyWidget : VariantNotesWidget(NotesVariant.NOTES)

class NotesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotesWidget()
}

class GoalsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GoalsWidget()
}

class NotesOnlyWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotesOnlyWidget()
}

@Composable
private fun NotesContent(notes: PinnedNotes, variant: NotesVariant) {
    val colors = GlanceTheme.colors
    val maxItems = if (LocalSize.current.height >= 150.dp) 3 else 2

    val items = when (variant) {
        NotesVariant.COMBINED -> notes.items
        NotesVariant.GOALS -> notes.items.filter { it.kind == "goal" }
        NotesVariant.NOTES -> notes.items.filter { it.kind == "note" }
    }.take(maxItems)

    val title = when (variant) {
        NotesVariant.COMBINED -> "ملاحظاتي وأهدافي"
        NotesVariant.GOALS -> "أهدافي"
        NotesVariant.NOTES -> "ملاحظاتي"
    }
    val iconRes = when (variant) {
        NotesVariant.GOALS -> R.drawable.widget_ic_target
        NotesVariant.NOTES -> R.drawable.widget_ic_note
        NotesVariant.COMBINED -> R.drawable.widget_ic_pin
    }
    val path = if (variant == NotesVariant.GOALS) "goals" else "notes"
    val openApp = openAppAction(path)

    GlassCard(padding = 14.dp) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(openApp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconBadge(
                iconRes = iconRes,
                size = 15.dp,
                badgeSize = 30.dp,
                background = colors.primaryContainer,
                tint = colors.primary
            )

            Spacer(GlanceModifier.width(9.dp))

            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = title,
                    style = TextStyle(
                        color = colors.onSurface,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Text(
                    text = subtitle(variant, notes, items.size),
                    style = TextStyle(
                        color = colors.onSurfaceVariant,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
            }

            if (items.isNotEmpty()) {
                Spacer(GlanceModifier.width(6.dp))
                Chip(
                    text = "${items.size}",
                    background = colors.primaryContainer,
                    foreground = colors.onPrimaryContainer
                )
            }
        }

        Spacer(GlanceModifier.height(7.dp))
        Hairline()
        Spacer(GlanceModifier.height(7.dp))

        if (items.isEmpty()) {
            WidgetEmptyState(
                title = emptyTitle(variant),
                message = emptyMessage(variant),
                cta = if (variant == NotesVariant.GOALS) "أضف هدفاً" else "أضف الآن",
                iconRes = iconRes,
                path = path
            )
        } else {
            items.forEachIndexed { index, item ->
                NoteRow(item, colors)
                if (index != items.lastIndex) {
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
            provider = ImageProvider(
                if (item.kind == "goal") R.drawable.widget_ic_target else R.drawable.widget_ic_note
            ),
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

private fun subtitle(variant: NotesVariant, notes: PinnedNotes, visible: Int): String {
    if (visible == 0) {
        return when (variant) {
            NotesVariant.COMBINED -> "مساحة صغيرة لأفكارك"
            NotesVariant.GOALS -> "حدّد ما تريد إنجازه"
            NotesVariant.NOTES -> "أفكارك السريعة في مكان واحد"
        }
    }
    return when (variant) {
        NotesVariant.GOALS -> "$visible هدف قيد العمل"
        NotesVariant.NOTES -> "$visible ملاحظة مثبّتة"
        NotesVariant.COMBINED -> "${notes.total} عنصر محفوظ"
    }
}

private fun emptyTitle(variant: NotesVariant): String = when (variant) {
    NotesVariant.COMBINED -> "لا توجد ملاحظات بعد"
    NotesVariant.GOALS -> "لا توجد أهداف بعد"
    NotesVariant.NOTES -> "لا توجد ملاحظات بعد"
}

private fun emptyMessage(variant: NotesVariant): String = when (variant) {
    NotesVariant.COMBINED -> "أضف هدفاً أو ملاحظة لتظهر هنا"
    NotesVariant.GOALS -> "هدف واحد صغير يكفي للبدء"
    NotesVariant.NOTES -> "اكتب فكرتك الأولى وثبّتها هنا"
}
