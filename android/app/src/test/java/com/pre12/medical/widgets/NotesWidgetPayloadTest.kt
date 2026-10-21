package com.pre12.medical.widgets

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⭐⭐⭐ Phase W16 — «الودجت يعرض العنوان فقط»: اختبار الجذر.
 *
 * The bug had **two** roots, and both are pinned here so they can never
 * come back silently:
 *
 *  1. **The bridge dropped the content.** A payload whose `text` was empty
 *     skipped the whole row (`if (text.isEmpty()) continue`), and a payload
 *     without a `title` fell back to the *body* — so the two lines were
 *     never distinct. [WidgetBridge.parseNotes] must keep both.
 *
 *  2. **The layout hid the second line.** The content was gated behind a
 *     `twoLines` flag that was `false` for every common widget size (the
 *     2×2 and the 4×2 are both ≈110 dp tall, and the rule was
 *     `height >= 130.dp`), and the row budget was a hard-coded table, so
 *     Glance clipped the content out of the card. [StickyBudget] must
 *     always leave room for at least one title+content row.
 */
class NotesWidgetPayloadTest {

    /** The payload `widgets.js` writes for a note that has both fields. */
    private val fullNote = """
        {"items":[
          {"id":"n1","title":"تجربة","text":"المحتوى الكامل للملاحظة","kind":"note","done":false},
          {"id":"g1","title":"مراجعة كتاب","text":"12 / 50 صفحة","kind":"goal","done":false,"percent":24}
        ],"total":2,"updatedAt":"2026-10-21T00:00:00.000Z"}
    """.trimIndent()

    @Test
    fun `the note keeps its title and its content`() {
        val notes = WidgetBridge.parseNotes(fullNote)

        assertEquals(2, notes.items.size)

        val note = notes.items.first { it.kind == "note" }
        assertEquals("تجربة", note.title)
        assertEquals("المحتوى الكامل للملاحظة", note.text)
        // ⭐ العنوان والمحتوى **مختلفان** ⇒ سطران في الرسم.
        assertTrue("the title and the body must differ", note.title != note.text)
    }

    @Test
    fun `the goal keeps its progress line`() {
        val notes = WidgetBridge.parseNotes(fullNote)
        val goal = notes.items.first { it.kind == "goal" }

        assertEquals("مراجعة كتاب", goal.title)
        assertEquals("12 / 50 صفحة", goal.text)
        assertEquals(24, goal.percent)
    }

    @Test
    fun `a note without a title falls back to the body instead of vanishing`() {
        val json = """{"items":[{"id":"n2","text":"نصّ بلا عنوان","kind":"note","done":false}],"total":1}"""
        val notes = WidgetBridge.parseNotes(json)

        assertEquals(1, notes.items.size)
        assertEquals("نصّ بلا عنوان", notes.items[0].title)
        assertEquals("نصّ بلا عنوان", notes.items[0].text)
    }

    @Test
    fun `an empty payload is empty, not a crash`() {
        val notes = WidgetBridge.parseNotes(null)
        assertNotNull(notes)
        assertTrue(notes.items.isEmpty())
        assertTrue(notes.isEmpty)
    }

    /**
     * ⭐⭐⭐ the regression that mattered: **every** common widget size must
     * leave room for at least one title+content row — otherwise the widget
     * shows the title only (the "immortal bug").
     */
    @Test
    fun `every common widget size shows at least one row`() {
        val sizes = listOf(70, 110, 130, 150, 180, 250, 400) // dp
        for (size in sizes) {
            val budget = StickyBudget.of(androidx.compose.ui.unit.Dp(size.toFloat()))
            assertTrue(
                "a ${size}dp widget must fit at least one row",
                budget.rows >= 1
            )
        }
    }

    @Test
    fun `a tall widget shows more rows than a small one`() {
        val small = StickyBudget.of(androidx.compose.ui.unit.Dp(110f))
        val tall = StickyBudget.of(androidx.compose.ui.unit.Dp(250f))
        assertTrue("250dp must fit more rows than 110dp", tall.rows > small.rows)
    }
}
