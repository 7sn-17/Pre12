package com.pre12.medical.widgets

import android.content.Intent
import android.net.Uri
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
import androidx.glance.unit.ColorProvider
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

/**
 * Opens the app from any widget surface.
 *
 * Phase W4: pass a path (`"tasks"`, `"streak"`, `"notes"`, `"goals"`) and the
 * intent carries `pre12://<path>` as its data. Capacitor's App plugin surfaces
 * that URL to JS (`getLaunchUrl` on a cold start, `appUrlOpen` when the app is
 * already alive), so `widgets.js` can land the user on the right screen instead
 * of the generic home tab. The explicit component keeps the intent out of any
 * browser/chooser; the data URI also makes each PendingIntent unique, which is
 * what stops Glance from conflating the four header actions.
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
 * Friendly empty state with a working CTA.
 *
 * Deliberately **horizontal**: a 4×2 widget has ~90–110 dp of content height, and
 * a centered icon-over-text stack needs ~135 dp — it would be clipped by the
 * RemoteViews bounds. The row layout fits in ~34 dp at any widget size, and the
 * enclosing Box centers it in whatever height is left.
 *
 * The CTA is a real Glance action, not decoration: it launches [MainActivity]
 * through a PendingIntent.
 */
@Composable
internal fun ColumnScope.WidgetEmptyState(
    title: String,
    message: String,
    cta: String,
    iconRes: Int? = null,
    path: String? = null
) {
    val colors = GlanceTheme.colors
    val openApp = openAppAction(path)

    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .defaultWeight(),
        contentAlignment = Alignment.Center
    ) {
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (iconRes != null) {
                IconBadge(
                    iconRes = iconRes,
                    size = 16.dp,
                    badgeSize = 30.dp,
                    background = colors.primaryContainer,
                    tint = colors.primary
                )
                Spacer(GlanceModifier.width(8.dp))
            }

            Column(modifier = GlanceModifier.defaultWeight()) {
                Text(
                    text = title,
                    style = TextStyle(
                        color = colors.onSurface,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
                Spacer(GlanceModifier.height(1.dp))
                Text(
                    text = message,
                    style = TextStyle(
                        color = colors.onSurfaceVariant,
                        fontSize = 9.5.sp,
                        textAlign = TextAlign.Start
                    ),
                    maxLines = 1
                )
            }

            Spacer(GlanceModifier.width(8.dp))

            Box(
                modifier = GlanceModifier
                    .background(colors.primary)
                    .cornerRadius(12.dp)
                    .padding(horizontal = 10.dp, vertical = 5.dp)
                    .clickable(openApp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = cta,
                    style = TextStyle(
                        color = colors.onPrimary,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    ),
                    maxLines = 1
                )
            }
        }
    }
}
