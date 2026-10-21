package com.pre12.medical.widgets

import androidx.glance.color.ColorProviders
import androidx.glance.color.colorProviders
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W1 — the widget theme.
 *
 * Every colour is a **resource** (`widget_color_*`), not a hard-coded int.
 * That single choice gives us all three behaviours for free:
 *
 *  • `values/`               → brand emerald, light
 *  • `values-night/`         → brand emerald, dark
 *  • `values-v31/`           → Material You dynamic colour, light
 *  • `values-night-v31/`     → Material You dynamic colour, dark
 *
 * Android resolves the most specific qualifier per device, so the same Kotlin
 * code renders a wallpaper-tinted widget on Android 12+ and a branded one on
 * older phones — with correct contrast in both light and dark mode.
 */
internal object WidgetPalette {

    val colors: ColorProviders = colorProviders(
        primary = ColorProvider(R.color.widget_color_primary),
        onPrimary = ColorProvider(R.color.widget_color_on_primary),
        primaryContainer = ColorProvider(R.color.widget_color_primary_container),
        onPrimaryContainer = ColorProvider(R.color.widget_color_on_primary_container),

        secondary = ColorProvider(R.color.widget_color_secondary),
        onSecondary = ColorProvider(R.color.widget_color_on_secondary),
        secondaryContainer = ColorProvider(R.color.widget_color_secondary_container),
        onSecondaryContainer = ColorProvider(R.color.widget_color_on_secondary_container),

        tertiary = ColorProvider(R.color.widget_color_tertiary),
        onTertiary = ColorProvider(R.color.widget_color_on_tertiary),
        tertiaryContainer = ColorProvider(R.color.widget_color_tertiary_container),
        onTertiaryContainer = ColorProvider(R.color.widget_color_on_tertiary_container),

        error = ColorProvider(R.color.widget_color_error),
        errorContainer = ColorProvider(R.color.widget_color_error_container),
        onError = ColorProvider(R.color.widget_color_on_error),
        onErrorContainer = ColorProvider(R.color.widget_color_on_error_container),

        background = ColorProvider(R.color.widget_color_background),
        onBackground = ColorProvider(R.color.widget_color_on_background),
        surface = ColorProvider(R.color.widget_color_surface),
        onSurface = ColorProvider(R.color.widget_color_on_surface),
        surfaceVariant = ColorProvider(R.color.widget_color_surface_variant),
        onSurfaceVariant = ColorProvider(R.color.widget_color_on_surface_variant),
        outline = ColorProvider(R.color.widget_color_outline),

        inverseOnSurface = ColorProvider(R.color.widget_color_inverse_on_surface),
        inverseSurface = ColorProvider(R.color.widget_color_inverse_surface),
        inversePrimary = ColorProvider(R.color.widget_color_inverse_primary),

        widgetBackground = ColorProvider(R.color.widget_color_widget_background)
    )
}
