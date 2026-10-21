package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextDecoration
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — «ملاحظاتي وأهدافي», sticky-note edition.
 *
 * Three providers, chosen from the Android picker:
 *   • [NotesWidget]      combined  — blue goals note + violet notes note;
 *   • [GoalsWidget]      goals only — blue paper;
 *   • [NotesOnlyWidget]  notes only — violet paper.
 *
 * Visual contract
 * ───────────────
 *   • real paper tints (#F0F9FF / #FAF5FF), 18 dp radius, tape drawn **inside**
 *     the top edge (part of the drawable, so it never overflows the radius);
 *   • title + circular "+" button (deep links to `pre12://add-goal` /
 *     `pre12://add-note`);
 *   • rows prefixed with ✦, one line each;
 *   • goals print a percentage pill when they track a target.
 *
 * Combined is responsive: side-by-side when wide (4×2), stacked into two small
 * notes when square (2×2). Both halves keep their own tape.
 *
 * Rows are passive; the card and the header open `pre12://goals|notes`.
 */
enum class NotesVariant {
    COMBINED,
    GOALS,
    NOTES
}

abstract class VariantNotesWidget(private val variant: NotesVariant) : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val notes = WidgetBridge.readNotes(context)
        provideContent { NotesCard(notes, variant) }
    }
}

class NotesWidget : VariantNotesWidget(NotesVariant.COMBINED)

class GoalsWidget : VariantNotesWidget(NotesVariant.GOALS)

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
private fun NotesCard(notes: PinnedNotes, variant: NotesVariant) {
    val size = LocalSize.current
    val goals = notes.items.filter { it.kind == "goal" }
    val plain = notes.items.filter { it.kind == "note" }

    when (variant) {
        NotesVariant.GOALS -> GoalsNote(goals, size.height)
        NotesVariant.NOTES -> PlainNote(plain, size.height)
        NotesVariant.COMBINED -> CombinedNotes(goals, plain, size.width, size.height)
    }
}

@Composable
private fun GoalsNote(items: List<PinnedItem>, height: androidx.compose.ui.unit.Dp) {
    StickyHalf(
        title = "أهدافي",
        paperRes = R.drawable.widget_bg_sticky_goal,
        ink = WidgetSkin.GoalInk,
        accent = WidgetSkin.GoalAccent,
        items = items.take(maxRowsForSingle(height)),
        addPath = "add-goal",
        openPath = "goals",
        showPercent = true,
        showHint = true,
        compact = height < 150.dp,
        modifier = GlanceModifier.fillMaxSize()
    )
}

@Composable
private fun PlainNote(items: List<PinnedItem>, height: androidx.compose.ui.unit.Dp) {
    StickyHalf(
        title = "ملاحظاتي",
        paperRes = R.drawable.widget_bg_sticky_note,
        ink = WidgetSkin.NoteInk,
        accent = WidgetSkin.NoteAccent,
        items = items.take(maxRowsForSingle(height)),
        addPath = "add-note",
        openPath = "notes",
        showPercent = false,
        showHint = true,
        compact = height < 150.dp,
        modifier = GlanceModifier.fillMaxSize()
    )
}

@Composable
private fun CombinedNotes(
    goals: List<PinnedItem>,
    notes: List<PinnedItem>,
    width: androidx.compose.ui.unit.Dp,
    height: androidx.compose.ui.unit.Dp
) {
    val sideBySide = width >= 230.dp
    val compact = height < 150.dp
    val rows = when {
        !sideBySide -> when {
            height >= 170.dp -> 2
            height >= 130.dp -> 1
            else -> 0
        }
        height >= 170.dp -> 3
        else -> 2
    }

    if (sideBySide) {
        Row(modifier = GlanceModifier.fillMaxSize()) {
            StickyHalf(
                title = "أهداف",
                paperRes = R.drawable.widget_bg_sticky_goal,
                ink = WidgetSkin.GoalInk,
                accent = WidgetSkin.GoalAccent,
                items = goals.take(rows),
                addPath = "add-goal",
                openPath = "goals",
                showPercent = true,
                showHint = true,
                compact = compact,
                modifier = GlanceModifier.defaultWeight().fillMaxHeight()
            )
            HGap(8.dp)
            StickyHalf(
                title = "ملاحظات",
                paperRes = R.drawable.widget_bg_sticky_note,
                ink = WidgetSkin.NoteInk,
                accent = WidgetSkin.NoteAccent,
                items = notes.take(rows),
                addPath = "add-note",
                openPath = "notes",
                showPercent = false,
                showHint = true,
                compact = compact,
                modifier = GlanceModifier.defaultWeight().fillMaxHeight()
            )
        }
    } else {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            StickyHalf(
                title = "أهداف",
                paperRes = R.drawable.widget_bg_sticky_goal,
                ink = WidgetSkin.GoalInk,
                accent = WidgetSkin.GoalAccent,
                items = goals.take(rows),
                addPath = "add-goal",
                openPath = "goals",
                showPercent = true,
                showHint = false,
                compact = true,
                modifier = GlanceModifier.defaultWeight().fillMaxWidth()
            )
            Gap(6.dp)
            StickyHalf(
                title = "ملاحظات",
                paperRes = R.drawable.widget_bg_sticky_note,
                ink = WidgetSkin.NoteInk,
                accent = WidgetSkin.NoteAccent,
                items = notes.take(rows),
                addPath = "add-note",
                openPath = "notes",
                showPercent = false,
                showHint = false,
                compact = true,
                modifier = GlanceModifier.defaultWeight().fillMaxWidth()
            )
        }
    }
}

private fun maxRowsForSingle(height: androidx.compose.ui.unit.Dp): Int = when {
    height >= 220.dp -> 4
    height >= 170.dp -> 3
    height >= 140.dp -> 2
    else -> 1
}

@Composable
private fun StickyHalf(
    title: String,
    paperRes: Int,
    ink: Color,
    accent: Color,
    items: List<PinnedItem>,
    addPath: String,
    openPath: String,
    showPercent: Boolean,
    showHint: Boolean,
    compact: Boolean,
    modifier: GlanceModifier
) {
    val open = openAppAction(openPath)
    val plusDiameter = if (compact) 20.dp else 22.dp

    Box(
        modifier = modifier
            .background(ImageProvider(paperRes))
            // The tape lives inside the drawable: 18 dp clears it at small sizes.
            .padding(
                start = 9.dp,
                end = 9.dp,
                top = if (compact) 18.dp else 22.dp,
                bottom = if (compact) 4.dp else 8.dp
            )
            .clickable(open)
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    modifier = GlanceModifier.defaultWeight(),
                    style = wText(ink, 18.sp, FontWeight.Bold),
                    maxLines = 1
                )
                RoundIconButton(
                    iconRes = R.drawable.widget_ic_plus,
                    action = openAppAction(addPath),
                    diameter = plusDiameter,
                    background = accent.copy(alpha = 0.14f),
                    tint = ink
                )
            }

            Gap(if (compact) 2.dp else 4.dp)

            if (items.isEmpty()) {
                if (showHint) {
                    Text(
                        text = if (showPercent) "أضف هدفك الأول من +" else "دوّن فكرتك الأولى من +",
                        style = wText(WidgetSkin.PaperMuted, 11.sp),
                        maxLines = 2
                    )
                }
            } else {
                items.forEachIndexed { index, item ->
                    StickyRow(item, ink, accent, showPercent, compact)
                    if (index != items.lastIndex) Gap(if (compact) 2.dp else 3.dp)
                }
            }
        }
    }
}

@Composable
private fun StickyRow(
    item: PinnedItem,
    ink: Color,
    accent: Color,
    showPercent: Boolean,
    compact: Boolean
) {
    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "✦",
            style = wText(accent, 9.sp, FontWeight.Bold, TextAlign.Center),
            maxLines = 1
        )
        HGap(3.dp)
        Text(
            text = item.text,
            modifier = GlanceModifier.defaultWeight(),
            style = wText(
                color = if (item.isDone) WidgetSkin.PaperMuted else WidgetSkin.PaperInk,
                size = 14.sp,
                weight = FontWeight.Medium,
                decoration = if (item.isDone) TextDecoration.LineThrough else null
            ),
            maxLines = 1
        )
        if (showPercent) {
            item.percent?.let { value ->
                HGap(3.dp)
                Badge(
                    text = "$value%",
                    background = accent.copy(alpha = 0.14f),
                    foreground = ink,
                    horizontal = 5.dp,
                    vertical = 1.dp,
                    corner = 6.dp,
                    fontSize = 9.5.sp
                )
            }
        }
    }
}
