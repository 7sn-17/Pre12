package com.pre12.medical.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ContentScale
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.unit.ColorProvider
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W7 — «المحاضرة القادمة / الألبوم» is now a **1×1 album tile**.
 *
 * Reference (`widget_reference_final.html`):
 *   `.widget-lecture-1x1 { background-size: cover; border-radius: 24px; }`
 *
 * The cover is the bundled subject image the web app already ships
 * (`plans/phys.jpg`, `plans/chem.jpg`, …), loaded straight from the WebView
 * assets as a down-sampled [Bitmap] — no network, no cached photo of the wrong
 * lecture, and it survives offline. If the payload has no cover (empty plan, or
 * an unknown subject) the branded gradient art takes over and a tiny caption
 * says what the tile is.
 *
 * `widgets.js → lectures.next.cover` carries the asset path. A tap opens the
 * album screen (`pre12://lectures` → `my-lectures.html`).
 */
class LecturesWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val lecture = WidgetBridge.readLecture(context)
        val cover = loadCover(context, lecture.cover)
        provideContent { LectureCard(lecture, cover) }
    }
}

class LecturesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = LecturesWidget()
}

/** Asset path guard: no traversal, only the image formats the web build ships. */
private val COVER_PATTERN = Regex("^[A-Za-z0-9/_.-]+\\.(jpg|jpeg|png|webp)$")

/** A 1×1 tile is ~210 px @xxhdpi; 270–540 px is plenty and keeps the IPC small. */
private const val COVER_MAX_WIDTH = 420

/** Decoded covers are reused across updates instead of re-reading the APK. */
private val coverCache = LruCache<String, Bitmap>(4)

private fun loadCover(context: Context, path: String?): Bitmap? {
    if (path.isNullOrBlank() || !COVER_PATTERN.matches(path)) return null
    coverCache.get(path)?.let { return it }

    return try {
        val asset = "public/" + path.trim().removePrefix("/").removePrefix("public/")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.assets.open(asset).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0) return null

        var sample = 1
        while (bounds.outWidth / sample > COVER_MAX_WIDTH) sample *= 2

        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bitmap = context.assets.open(asset).use {
            BitmapFactory.decodeStream(it, null, options)
        }
        if (bitmap != null) coverCache.put(path, bitmap)
        bitmap
    } catch (_: Throwable) {
        // A missing asset is a design state, not an error: gradient art covers it.
        null
    }
}

@Composable
private fun LectureCard(lecture: NextLecture, cover: Bitmap?) {
    val hasCover = cover != null

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(
                if (hasCover) ImageProvider(cover!!) else ImageProvider(R.drawable.widget_bg_lecture),
                contentScale = ContentScale.Crop
            )
            .cornerRadius(24.dp)
            .clickable(openAppAction("lectures"))
    ) {
        if (!hasCover) {
            Column(
                modifier = GlanceModifier.fillMaxSize().padding(7.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                Box(
                    modifier = GlanceModifier
                        .background(ColorProvider(WidgetSkin.Overlay))
                        .cornerRadius(7.dp)
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = if (lecture.isEmpty) "لا محاضرات" else lecture.subject.ifBlank { "المحاضرات" },
                        style = wText(WidgetSkin.White, 9.sp, FontWeight.Bold),
                        maxLines = 1
                    )
                }
            }
        }
    }
}
