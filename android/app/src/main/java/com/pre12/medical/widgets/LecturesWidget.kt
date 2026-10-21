package com.pre12.medical.widgets

import android.content.Context
import androidx.compose.runtime.Composable
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
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import com.pre12.medical.R

/**
 * ⭐⭐ Phase W6 — «المحاضرة القادمة» (new 2×2 widget).
 *
 * Full-bleed marine/teal art with a cyan bloom and a bottom scrim: the title sits
 * on the dark end so contrast never depends on the wallpaper. The scrim is drawn
 * inside [R.drawable.widget_bg_lecture], which is also what keeps the 24 dp
 * rounded edge intact.
 *
 * ⚠️ The "image" is a bundled art layer, not a per-lecture photo: a RemoteViews
 * widget has no network image pipeline, and a stale cached photo of the wrong
 * lecture would be worse than an honest, on-brand backdrop. The subject line
 * carries the identity instead.
 *
 * Data comes from `widgets.js → lectures.next` (today's plan, else the next day
 * that has one). Any tap opens `pre12://lectures`.
 */
class LecturesWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val lecture = WidgetBridge.readLecture(context)
        provideContent { LectureCard(lecture) }
    }
}

class LecturesWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = LecturesWidget()
}

@Composable
private fun LectureCard(lecture: NextLecture) {
    val height = LocalSize.current.height
    val compact = height < 130.dp

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg_lecture))
            .padding(if (compact) 12.dp else 14.dp)
            .clickable(openAppAction("lectures"))
    ) {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Badge(
                    text = "المحاضرة القادمة",
                    background = androidx.compose.ui.graphics.Color(0x33000000),
                    foreground = WidgetSkin.White,
                    horizontal = 7.dp,
                    vertical = 2.dp,
                    corner = 6.dp,
                    fontSize = 8.sp
                )
            }

            androidx.glance.layout.Spacer(GlanceModifier.defaultWeight())

            if (lecture.isEmpty) {
                Text(
                    text = "لا محاضرات قادمة",
                    style = wText(WidgetSkin.White, if (compact) 12.sp else 13.5.sp, FontWeight.Bold),
                    maxLines = 1
                )
                Gap(2.dp)
                Text(
                    text = "افتح الجدول لإضافة محاضرتك",
                    style = wText(WidgetSkin.Slate300, 8.5.sp),
                    maxLines = 1
                )
            } else {
                Text(
                    text = lecture.title,
                    style = wText(WidgetSkin.White, if (compact) 12.sp else 13.5.sp, FontWeight.Bold),
                    maxLines = 2
                )
                Gap(3.dp)
                Text(
                    text = meta(lecture),
                    style = wText(WidgetSkin.Slate300, 8.5.sp, FontWeight.Medium),
                    maxLines = 1
                )
            }
        }
    }
}

private fun meta(lecture: NextLecture): String {
    val parts = ArrayList<String>(3)
    if (lecture.whenText.isNotBlank()) parts += lecture.whenText
    if (lecture.subject.isNotBlank()) parts += lecture.subject
    if (lecture.instructor.isNotBlank()) parts += lecture.instructor
    return parts.joinToString(" · ")
}
