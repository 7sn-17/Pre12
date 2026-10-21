package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalState
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
 *   • rows prefixed with ✦, **two lines each**: the headline (bold) and the
 *     body underneath (grey);
 *   • goals print a percentage pill when they track a target.
 *
 * Combined is responsive: side-by-side when wide (4×2, 4×4), and a **single**
 * paper when square (2×2) — see [CombinedNotes] for why.
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
        // ⭐ W9 — read inside the composition (see TodayTasksWidget.kt).
        provideContent {
            val ctx = LocalContext.current
            // ⭐⭐⭐ Phase W14 — بلا هذه القراءة يتخطّى Compose هذا الـlambda
            //   (لا تغيّر معاملاته ولا يقرأ حالةً) فيبقى الرسم على أول
            //   حمولة للأبد — وهو سبب «الودجت لا يتغيّر حتى إعادة التشغيل».
            //   قراءة حالة Glance تجعل الـcomposition يعتمد عليها، فيُعاد
            //   تشغيله مع كل update() وتُقرأ البيانات الحديثة.
            @Suppress("UNUSED_VARIABLE")
            val glanceState = LocalState.current
            // ⭐⭐⭐ W14 — قراءة نبضة التحديث: تجعل هذا الـcomposition يعتمد على
            //   حالة حقيقية، فلا يتخطّاه Compose، فتُقرأ البيانات الحديثة وتُرسم.
            @Suppress("UNUSED_VARIABLE")
            val refreshVersion = WidgetRefreshSignal.version.value
            NotesCard(WidgetBridge.readNotes(ctx), variant)
        }
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

/* ══════════════════════════════════════════════════════════════════════
   ⭐⭐⭐ Phase W16 — «ميزانية الارتفاع»: كم صفاً يتّسع في الودجت فعلاً؟
   ──────────────────────────────────────────────────────────────────────
   الجذر الحقيقي لعطل «الودجت يعرض العنوان فقط»:

   • السطر الثاني (المحتوى) كان مربوطاً بعلم `twoLines`، وهذا العلم كان
     `false` في كل الحالات الشائعة:
       – الودجت المربّع (2×2 ≈ 110dp) ⇒ `height >= 130.dp` = false؛
       – الودجت العريض (4×2 ≈ 110dp) ⇒ نفس الشيء؛
       – والنسخة المدمجة في حالة المربّع كانت تمرّر `twoLines = false` صراحةً.
     ⇒ المحتوى **لا يُرسَم إطلاقاً** ⇒ العنوان فقط.
   • وحتى حين يُرسَم، كانت «صفوف» ثابتة (2 أو 3) لا تُحسب من الارتفاع ⇒
     الـRemoteViews يقصّ السطر الثاني خارج البطاقة.

   الآن: الميزانية **محسوبة** من الارتفاع الحقيقي، والسطر الثاني يُرسَم
   **دائماً** حين يوجد نصّ، والخطوط والمقاسات تتقلّص في الأحجام الصغيرة
   حتى يتّسع العنوان + المحتوى معاً.
   ══════════════════════════════════════════════════════════════════════ */
internal data class StickyBudget(
    /** كم صفاً (عنوان + محتوى) يتّسع فعلاً. */
    val rows: Int,
    /** وضع الأحجام الصغيرة (الودجت القصير). */
    val compact: Boolean
) {
    companion object {
        /**
         * @param height ارتفاع نصف الورقة بالـdp.
         */
        fun of(height: Dp): StickyBudget {
            val compact = height < 150.dp
            // ── «الكروم» = الحشو العلوي + سطر العنوان + الفاصل + الحشو السفلي.
            val chrome = if (compact) 44.dp else 62.dp
            // ── ارتفاع الصفّ = سطر العنوان + سطران من المحتوى + الفاصل.
            val row = if (compact) 49.dp else 56.dp
            val gap = if (compact) 2.dp else 3.dp

            val free = height - chrome + gap
            val rows = if (free <= 0.dp) {
                1
            } else {
                ((free / (row + gap)).toInt()).coerceIn(1, 4)
            }
            return StickyBudget(rows, compact)
        }
    }
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
private fun GoalsNote(items: List<PinnedItem>, height: Dp) {
    val budget = StickyBudget.of(height)
    StickyHalf(
        title = "أهدافي",
        paperRes = R.drawable.widget_bg_sticky_goal,
        ink = WidgetSkin.GoalInk,
        accent = WidgetSkin.GoalAccent,
        items = items.take(budget.rows),
        addPath = "add-goal",
        openPath = "goals",
        showPercent = true,
        showHint = true,
        compact = budget.compact,
        modifier = GlanceModifier.fillMaxSize()
    )
}

@Composable
private fun PlainNote(items: List<PinnedItem>, height: Dp) {
    val budget = StickyBudget.of(height)
    StickyHalf(
        title = "ملاحظاتي",
        paperRes = R.drawable.widget_bg_sticky_note,
        ink = WidgetSkin.NoteInk,
        accent = WidgetSkin.NoteAccent,
        items = items.take(budget.rows),
        addPath = "add-note",
        openPath = "notes",
        showPercent = false,
        showHint = true,
        compact = budget.compact,
        modifier = GlanceModifier.fillMaxSize()
    )
}

@Composable
private fun CombinedNotes(
    goals: List<PinnedItem>,
    notes: List<PinnedItem>,
    width: Dp,
    height: Dp
) {
    val sideBySide = width >= 230.dp
    val budget = StickyBudget.of(height)

    if (sideBySide) {
        Row(modifier = GlanceModifier.fillMaxSize()) {
            StickyHalf(
                title = "أهداف",
                paperRes = R.drawable.widget_bg_sticky_goal,
                ink = WidgetSkin.GoalInk,
                accent = WidgetSkin.GoalAccent,
                items = goals.take(budget.rows),
                addPath = "add-goal",
                openPath = "goals",
                showPercent = true,
                showHint = true,
                compact = budget.compact,
                modifier = GlanceModifier.defaultWeight().fillMaxHeight()
            )
            HGap(8.dp)
            StickyHalf(
                title = "ملاحظات",
                paperRes = R.drawable.widget_bg_sticky_note,
                ink = WidgetSkin.NoteInk,
                accent = WidgetSkin.NoteAccent,
                items = notes.take(budget.rows),
                addPath = "add-note",
                openPath = "notes",
                showPercent = false,
                showHint = true,
                compact = budget.compact,
                modifier = GlanceModifier.defaultWeight().fillMaxHeight()
            )
        }
    } else {
        // ⭐⭐⭐ Phase W16 — الودجت المربّع (2×2 ≈ 110×110) لا يتّسع **لورقتين**:
        //   نصفٌ لكل ورقة = 52dp، بينما العنوان + شريط الأدوات وحدهما يلتهمان
        //   44dp ⇒ لا مكان للمحتوى إطلاقاً ⇒ كان يظهر «العنوان فقط» (أو لا شيء).
        //   الحل: ورقة واحدة تجمع الأهداف والملاحظات (الملاحظات أولاً لأنّها
        //   تحمل العنوان والمحتوى)، فيتّسع صفّ واحد كامل بسطرَيْه.
        StickyHalf(
            title = "ملاحظاتي وأهدافي",
            paperRes = R.drawable.widget_bg_sticky_note,
            ink = WidgetSkin.NoteInk,
            accent = WidgetSkin.NoteAccent,
            items = (notes + goals).take(budget.rows),
            addPath = "add-note",
            openPath = "notes",
            showPercent = true,
            showHint = true,
            compact = budget.compact,
            modifier = GlanceModifier.fillMaxSize()
        )
    }
}

/**
 * ⭐⭐⭐ W16 — سطر العنوان (15sp) وسطر المحتوى (13sp) **دائماً**.
 */
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
    val plusDiameter = if (compact) 16.dp else 22.dp

    Box(
        modifier = modifier
            .background(ImageProvider(paperRes))
            // The tape lives inside the drawable: 18 dp clears it at small sizes.
            .padding(
                start = 9.dp,
                end = 9.dp,
                top = if (compact) 18.dp else 22.dp,
                bottom = if (compact) 2.dp else 8.dp
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
                    style = wText(ink, if (compact) 15.sp else 18.sp, FontWeight.Bold),
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

            // ⭐⭐ Phase W12 — خطّ فاصل تحت العنوان: يفصل «العنوان» عن
            //   «المحتوى» بصرياً، تماماً كما في الورق اللاصق.
            Gap(if (compact) 2.dp else 4.dp)
            Hairline(WidgetSkin.PaperHairline, 1.dp)
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

/**
 * ⭐⭐⭐ W16 — صفّ ورقة لاصقة = **سطران**:
 *
 *   ✦ {title}      ← 15 sp bold (13 sp في الأحجام الصغيرة), السطر الأول
 *     {content}    ← 13 sp grey (12 sp في الأحجام الصغيرة), سطران كحدّ أقصى
 *
 * ⚠️ السطر الثاني **لا يُشترَط** anymore: كان مربوطاً بعلم `twoLines` كان
 *   `false` في كل الأحجام الشائعة ⇒ العنوان فقط. الآن يُرسَم كلما وُجد نصّ.
 *
 * Both strings are cut in `widgets.js` with a real ellipsis, because
 * RemoteViews cannot ellipsize by itself.
 */
@Composable
private fun StickyRow(
    item: PinnedItem,
    ink: Color,
    accent: Color,
    showPercent: Boolean,
    compact: Boolean
) {
    val title = item.title.ifBlank { item.text }
    val body = item.text

    Row(
        modifier = GlanceModifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = "✦",
            style = wText(accent, 9.sp, FontWeight.Bold, TextAlign.Center),
            maxLines = 1
        )
        HGap(3.dp)

        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                text = title,
                style = wText(
                    color = if (item.isDone) WidgetSkin.PaperMuted else ink,
                    size = if (compact) 14.sp else 15.sp,
                    weight = FontWeight.Bold,
                    decoration = if (item.isDone) TextDecoration.LineThrough else null
                ),
                maxLines = 1
            )

            // ⭐⭐⭐ W16 — سطر المحتوى: يُرسَم **دائماً** (لا شرط `twoLines`).
            if (body.isNotBlank() && body != title) {
                Text(
                    text = body,
                    style = wText(
                        color = if (item.isDone) WidgetSkin.PaperMuted else WidgetSkin.PaperMuted,
                        size = if (compact) 12.sp else 13.sp,
                        weight = FontWeight.Medium,
                        decoration = if (item.isDone) TextDecoration.LineThrough else null
                    ),
                    maxLines = 2
                )
            }
        }

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
