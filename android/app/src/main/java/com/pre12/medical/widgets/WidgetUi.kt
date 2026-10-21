package com.pre12.medical.widgets

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProviders
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import ColorProvider
import com.pre12.medical.MainActivity

/**
 * ⭐⭐ Phase W2 — shared widget chrome.
 *
 * Glance renders through RemoteViews, so there is no blur, no shadow and no
 * gradient. The "glass" look is therefore built honestly from things RemoteViews
 * *can* draw:
 *
 *   1. a 1 dp translucent emerald hairline around the card (outer Box),
 *   2. an opaque tonal surface inset by that hairline (inner Column),
 *   3. a 23–24 dp radius on both layers,
 *   4. a single accent colour per widget (progress / flame / rings).
 *
 * Everything is driven by resource-backed [ColorProviders], so Material You
 * (API 31+) and the emerald fallback share this code.
 */

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

/** The 1 dp glass edge; safe to reuse as a hairline divider. */
internal val ColorProviders.glassEdge
    get() = WidgetPalette.glassStroke

/** Opens the app (single-top) from any widget surface. */
@Composable
internal fun openAppAction(): Action {
    val context = LocalContext.current
    val intent = Intent(context, MainActivity::class.java).apply {
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
    }
    return actionStartActivity(intent)
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/**
 * The glass card used by all four widgets: 24 dp outer radius, 1 dp edge,
 * 16 dp content padding.
 */
@Composable
internal fun GlassCard(
    modifier: GlanceModifier = GlanceModifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    val colors = GlanceTheme.colors
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.glassEdge)
            .cornerRadius(24.dp)
            .padding(1.dp)
            .appWidgetBackground()
    ) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(colors.surface)
                .cornerRadius(23.dp)
                .padding(padding),
            horizontalAlignment = Alignment.Start,
            content = content
        )
    }
}

/** 1 dp divider that matches the glass edge in every theme. */
@Composable
internal fun Hairline() {
    val colors = GlanceTheme.colors
    Box(
        GlanceModifier
            .fillMaxWidth()
            .height(1.dp)
            .background(colors.glassEdge)
    ) {}
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

/** Rounded "chip" with a single short string (counters, best streak, …). */
@Composable
internal fun Chip(
    text: String,
    background: ColorProvider,
    foreground: ColorProvider,
    horizontal: Dp = 10.dp,
    vertical: Dp = 5.dp
) {
    Box(
        modifier = GlanceModifier
            .background(background)
            .cornerRadius(12.dp)
            .padding(horizontal = horizontal, vertical = vertical),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = TextStyle(
                color = foreground,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            ),
            maxLines = 1
        )
    }
}

/** Circular icon badge — the flame, the pin, the empty-state glyph. */
@Composable
internal fun IconBadge(
    iconRes: Int,
    size: Dp,
    badgeSize: Dp,
    background: ColorProvider,
    tint: ColorProvider
) {
    Box(
        modifier = GlanceModifier.size(badgeSize).background(background).cornerRadius(badgeSize / 2),
        contentAlignment = Alignment.Center
    ) {
        Image(
            provider = ImageProvider(iconRes),
            contentDescription = null,
            modifier = GlanceModifier.size(size),
            colorFilter = ColorFilter.tint(tint)
        )
    }
}

/** One-line label/value pair used in the streak header. */
@Composable
internal fun StatLine(
    label: String,
    value: String,
    colors: ColorProviders
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = TextStyle(
                color = colors.onSurfaceVariant,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Start
            ),
            maxLines = 1
        )
        Spacer(GlanceModifier.width(4.dp))
        Text(
            text = value,
            style = TextStyle(
                color = colors.onSurface,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Start
            ),
            maxLines = 1
        )
    }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/**
 * Friendly empty state with a working CTA. The CTA is a real Glance action, not
 * decoration: it launches [MainActivity] through a PendingIntent.
 */
@Composable
internal fun WidgetEmptyState(
    title: String,
    message: String,
    cta: String,
    iconRes: Int? = null
) {
    val colors = GlanceTheme.colors
    val openApp = openAppAction()

    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (iconRes != null) {
                IconBadge(
                    iconRes = iconRes,
                    size = 20.dp,
                    badgeSize = 40.dp,
                    background = colors.primaryContainer,
                    tint = colors.primary
                )
                Spacer(GlanceModifier.height(10.dp))
            }

            Text(
                text = title,
                style = TextStyle(
                    color = colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                ),
                maxLines = 1
            )

            Spacer(GlanceModifier.height(3.dp))

            Text(
                text = message,
                style = TextStyle(
                    color = colors.onSurfaceVariant,
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                ),
                maxLines = 2
            )

            Spacer(GlanceModifier.height(10.dp))

            Box(
                modifier = GlanceModifier
                    .background(colors.primary)
                    .cornerRadius(14.dp)
                    .padding(horizontal = 14.dp, vertical = 7.dp)
                    .clickable(openApp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = cta,
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
    }
}
