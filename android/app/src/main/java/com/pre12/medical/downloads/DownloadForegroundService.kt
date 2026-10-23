package com.pre12.medical.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.pre12.medical.R

/**
 * ⭐ v5.1.2 — تنزيلات في الخلفية عبر Foreground Service حقيقي.
 *
 * لماذا Service وليس إشعاراً محلياً؟
 *  • الخدمة الأمامية ترفع أولوية العملية وتمنع أندرويد من تجميد/قتل الـWebView
 *    عند تصغير التطبيق، فيستمر FileTransfer في التنزيل.
 *  • إشعار واحد ثابت (ID = 90210) يُحدَّث في مكانه، بدل إشعار جديد لكل نسبة.
 *  • قناة منخفضة الأهمية + صوت null ⇒ تحديثات صامتة 100%.
 *
 * ملاحظة معمارية: النقل نفسه يبقى في @capacitor/file-transfer داخل عملية
 * التطبيق. هذه الخدمة تحافظ على حياة العملية وتدير الإشعار/الإلغاء.
 * زر «إلغاء» يرسل بثاً داخلياً يلغي مهمة FileTransfer ثم يوقف الخدمة.
 */
class DownloadForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "medapp_downloads"
        const val NOTIFICATION_ID = 90210

        const val ACTION_START = "com.pre12.medical.downloads.action.START"
        const val ACTION_UPDATE = "com.pre12.medical.downloads.action.UPDATE"
        const val ACTION_CANCEL = "com.pre12.medical.downloads.action.CANCEL"
        const val ACTION_STOP = "com.pre12.medical.downloads.action.STOP"

        /** Internal, package-scoped broadcast consumed by [MedDownloadsPlugin]. */
        const val ACTION_CANCELLED = "com.pre12.medical.downloads.action.CANCELLED"

        const val EXTRA_TITLE = "title"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_MAX = "max"
        const val EXTRA_INDETERMINATE = "indeterminate"

        private const val CANCEL_REQUEST_CODE = 90211
        private const val OPEN_REQUEST_CODE = 90212
        private const val WAKE_LOCK_TIMEOUT_MS = 2 * 60 * 60 * 1000L

        /**
         * Set synchronously by the notification's cancel action, before the
         * broadcast reaches JS. This closes the race where FileTransfer's
         * promise rejects before the `cancel` listener runs, which would
         * otherwise make files.js fall back to a second (network) download.
         */
        @Volatile
        var cancelRequested = false
            private set

        fun markCancelRequested() {
            cancelRequested = true
        }

        fun consumeCancelRequested(): Boolean {
            val value = cancelRequested
            cancelRequested = false
            return value
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createSilentChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            finishService()
            return START_NOT_STICKY
        }
        when (intent.action) {
            ACTION_START, ACTION_UPDATE -> {
                if (intent.action == ACTION_START) cancelRequested = false
                val title = intent.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }
                    ?: getString(R.string.download_default_title)
                val max = intent.getIntExtra(EXTRA_MAX, 100).coerceAtLeast(1)
                val progress = intent.getIntExtra(EXTRA_PROGRESS, 0).coerceIn(0, max)
                val indeterminate = intent.getBooleanExtra(EXTRA_INDETERMINATE, false)

                val notification = buildNotification(title, progress, max, indeterminate)
                startForegroundCompat(notification)
                acquireWakeLock()

                if (intent.action == ACTION_UPDATE) {
                    // Same ID = update in place; no second notification is born.
                    NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
                }
            }

            ACTION_CANCEL -> {
                // Mark BEFORE the broadcast: JS may receive FileTransfer's
                // rejection before the plugin's cancel listener runs.
                cancelRequested = true
                // The receiver in the plugin cancels FileTransfer's coroutine
                // even when the WebView is paused, so bandwidth stops at once.
                sendBroadcast(
                    Intent(ACTION_CANCELLED).setPackage(packageName)
                )
                finishService()
            }

            ACTION_STOP -> finishService()

            else -> finishService()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        releaseWakeLock()
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
        super.onDestroy()
    }

    private fun startForegroundCompat(notification: Notification) {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun finishService() {
        releaseWakeLock()
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        NotificationManagerCompat.from(this).cancel(NOTIFICATION_ID)
        stopSelf()
    }

    private fun buildNotification(
        title: String,
        progress: Int,
        max: Int,
        indeterminate: Boolean
    ): Notification {
        val cancelIntent = Intent(this, DownloadForegroundService::class.java).apply {
            action = ACTION_CANCEL
        }
        val cancelPending = PendingIntent.getService(
            this,
            CANCEL_REQUEST_CODE,
            cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(ContextCompat.getColor(this, R.color.notification_color))
            .setContentTitle(title)
            .setContentText(
                if (indeterminate) getString(R.string.download_preparing)
                else "$progress%"
            )
            .setProgress(max, progress, indeterminate)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setDefaults(0)
            .setSound(null)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(
                R.drawable.ic_download_cancel,
                getString(R.string.download_cancel),
                cancelPending
            )

        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val openPending = PendingIntent.getActivity(
                this,
                OPEN_REQUEST_CODE,
                launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.setContentIntent(openPending)
        }

        return builder.build()
    }

    private fun createSilentChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.download_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.download_channel_description)
            setSound(null, null)
            enableVibration(false)
            enableLights(false)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        try {
            val power = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = power.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "Pre12:download"
            ).apply {
                setReferenceCounted(false)
                acquire(WAKE_LOCK_TIMEOUT_MS)
            }
        } catch (_: Exception) {
            wakeLock = null
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
    }
}
