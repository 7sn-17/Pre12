package com.pre12.medical.widgets

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.pre12.medical.MainActivity
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — the approved prototype palette.
 *
 * These are **fixed** brand colours, not Material-You roles. The sign-off design
 * pairs a slate gradient with an emerald accent, and a dynamic surface would
 * break the composition: the dark card needs a dark backdrop on every device, and
 * the sticky notes need their paper tint regardless of wallpaper. Semantic accents
 * (emerald = done, red = streak) stay literal for the same reason.
 */
internal object WidgetSkin {
    val Ink900 = Color(0xFF0F172A)
    val Ink800 = Color(0xFF1E293B)
    val Ink700 = Color(0xFF334155)
    val Slate300 = Color(0xFFCBD5E1)
    val Slate400 = Color(0xFF94A3B8)
    val Slate500 = Color(0xFF64748B)
    val White = Color(0xFFFFFFFF)
    val Hairline = Color(0x1FFFFFFF)

    val Emerald = Color(0xFF10B981)
    val EmeraldBright = Color(0xFF34D399)
    val EmeraldSoft = Color(0x1F34D399)

    val FlameRed = Color(0xFFEF4444)
    val FlameOrange = Color(0xFFF97316)

    // Sticky notes — Goals (blue paper) · Notes (violet paper).
    val GoalPaper = Color(0xFFF0F9FF)
    val GoalInk = Color(0xFF075985)
    val GoalAccent = Color(0xFF0EA5E9)

    val NotePaper = Color(0xFFFAF5FF)
    val NoteInk = Color(0xFF6B21A8)
    val NoteAccent = Color(0xFFA855F7)

    val PaperInk = Color(0xFF1E293B)
    val PaperMuted = Color(0xFF64748B)
}

/**
 * ⭐⭐ Tajawal everywhere.
 *
 * The TTFs ship in `res/font/` (`tajawal_regular/bold/extrabold.ttf`). Glance's
 * `FontFamily` is a **family name**, not a resource: `TextTranslator` emits a
 * `TypefaceSpan(family)` that the launcher resolves inside its own process, so a
 * TTF bundled in the APK cannot be addressed directly by Glance 1.2 (there is no
 * `FontFamily(@FontRes Int)`). The family name matches the shipped face, so the
 * moment that API lands — or on a device/launcher that exposes Tajawal — every
 * string switches without touching a single composable. Until then Android falls
 * back to the platform Arabic face, and the assets are already in the APK.
 *
 * This object is the **only** place a widget declares its family: every text in
 * every widget goes through [wText], which is what guarantees no default-font
 * text can sneak in.
 */
internal object WidgetFonts {
    val Tajawal = FontFamily("Tajawal")
}

/** The single text factory of the widget layer. */
internal fun wText(
    color: Color,
    size: TextUnit,
    weight: FontWeight = FontWeight.Normal,
    align: TextAlign = TextAlign.Start,
    decoration: TextDecoration? = null
): TextStyle = TextStyle(
    color = ColorProvider(color),
    fontSize = size,
    fontWeight = weight,
    fontFamily = WidgetFonts.Tajawal,
    textAlign = align,
    textDecoration = decoration
)

/** Small pill used for counters, percentages and the all-done state. */
@Composable
internal fun Badge(
    text: String,
    background: Color,
    foreground: Color,
    horizontal: Dp = 7.dp,
    vertical: Dp = 2.dp,
    corner: Dp = 7.dp,
    fontSize: TextUnit = 10.sp
) {
    Box(
        modifier = GlanceModifier
            .background(ColorProvider(background))
            .cornerRadius(corner)
            .padding(horizontal = horizontal, vertical = vertical),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = wText(foreground, fontSize, FontWeight.Bold, TextAlign.Center),
            maxLines = 1
        )
    }
}

/** 1 dp separator matching the glass language. */
@Composable
internal fun Hairline(color: Color = WidgetSkin.Hairline, height: Dp = 1.dp) {
    Box(
        GlanceModifier
            .fillMaxWidth()
            .height(height)
            .background(ColorProvider(color))
    ) {}
}

/**
 * Opens the app from any widget surface.
 *
 * A path (`tasks|streak|notes|goals|add-note|add-goal|lectures`) travels as
 * `pre12://<path>`; Capacitor's App plugin forwards it to JS (`getLaunchUrl` on a
 * cold start, `appUrlOpen` while alive) and `widgets.js` lands on the right
 * screen. The explicit component keeps the intent out of browsers and gives each
 * PendingIntent its own identity.
 */
@Composable
internal fun openAppAction(path: String? = null): Action {
    val context = LocalContext.current
    val intent = if (path.isNullOrBlank()) {
        Intent(context, MainActivity::class.java)
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("pre12://$path"), context, MainActivity::class.java)
    }
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_CLEAR_TOP or
            Intent.FLAG_ACTIVITY_SINGLE_TOP
    )
    return actionStartActivity(intent)
}

/** A circular button with a vector glyph (the sticky-note "+"). */
@Composable
internal fun RoundIconButton(
    iconRes: Int,
    action: Action,
    diameter: Dp,
    background: Color,
    tint: Color
) {
    Box(
        modifier = GlanceModifier
            .size(diameter)
            .background(ColorProvider(background))
            .cornerRadius(diameter / 2)
            .clickable(action),
        contentAlignment = Alignment.Center
    ) {
        Image(
            provider = ImageProvider(iconRes),
            contentDescription = null,
            modifier = GlanceModifier.size(diameter * 0.52f),
            colorFilter = ColorFilter.tint(ColorProvider(tint))
        )
    }
}

/**
 * Status ring of the task list.
 *
 * A just-checked row shows the **animated** vector (260 ms trim) wherever the
 * launcher starts animated vectors inside RemoteViews; elsewhere the vector's end
 * state is still a correct tick, so the control is never wrong — only the flourish
 * is device-dependent.
 */
@Composable
internal fun StatusCircle(completed: Boolean, justCompleted: Boolean, size: Dp) {
    Box(
        modifier = GlanceModifier
            .size(size)
            .background(
                ImageProvider(
                    if (completed) R.drawable.widget_circle_done else R.drawable.widget_circle_empty
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        if (completed) {
            Image(
                provider = ImageProvider(
                    if (justCompleted) R.drawable.widget_anim_check else R.drawable.widget_ic_check
                ),
                contentDescription = null,
                modifier = GlanceModifier.size(size * 0.60f),
                colorFilter = ColorFilter.tint(ColorProvider(WidgetSkin.White))
            )
        }
    }
}

/** Full-height hairline used by the split streak card. */
@Composable
internal fun VerticalHairline() {
    Box(
        GlanceModifier
            .width(1.dp)
            .fillMaxHeight()
            .background(ColorProvider(WidgetSkin.Hairline))
    ) {}
}

/** Column spacer. */
@Composable
internal fun Gap(height: Dp) {
    Spacer(GlanceModifier.height(height))
}

/** Row spacer. */
@Composable
internal fun HGap(width: Dp) {
    Spacer(GlanceModifier.width(width))
}

/** A small status dot used by the compact streak card. */
@Composable
internal fun Dot(
    diameter: Dp,
    color: Color,
    ring: Boolean = false
) {
    Box(
        modifier = GlanceModifier
            .size(diameter)
            .background(ColorProvider(if (ring) WidgetSkin.White else color))
            .cornerRadius(diameter / 2)
    ) {}
}
