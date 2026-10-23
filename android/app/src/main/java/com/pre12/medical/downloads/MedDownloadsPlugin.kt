package com.pre12.medical.downloads

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job

/**
 * ⭐ v5.1.2 — جسر JS ↔ [DownloadForegroundService].
 *
 * الواجهة:
 *  • start({ title, progress, max, indeterminate })
 *  • update({ title, progress, max, indeterminate })
 *  • stop()
 *  • cancel()                 — يلغي النقل ثم يزيل الإشعار.
 *  • requestNotificationPermission()
 *  • حدث cancel              — يصل لـ files.js عند ضغط «إلغاء».
 */
@CapacitorPlugin(
    name = "MedDownload",
    permissions = [
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        )
    ]
)
class MedDownloadsPlugin : Plugin() {

    private var cancelReceiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        val filter = IntentFilter(DownloadForegroundService.ACTION_CANCELLED)
        val listener = object : BroadcastReceiver() {
            override fun onReceive(receiverContext: Context?, intent: Intent?) {
                // Cancel natively first: the WebView may be paused while the
                // app is in the background, and the transfer must still stop.
                DownloadForegroundService.markCancelRequested()
                cancelFileTransferJobs()
                notifyListeners("cancel", JSObject().put("cancelled", true))
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(listener, filter)
            }
            cancelReceiver = listener
        } catch (e: Exception) {
            Log.w(TAG, "Could not register the download cancel receiver", e)
        }
    }

    override fun handleOnDestroy() {
        try {
            cancelReceiver?.let { context.unregisterReceiver(it) }
        } catch (_: Exception) {
        }
        cancelReceiver = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val intent = serviceIntent(DownloadForegroundService.ACTION_START, call)
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve(JSObject().put("started", true))
        } catch (e: Exception) {
            call.reject("Could not start the download service", e)
        }
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val intent = serviceIntent(DownloadForegroundService.ACTION_UPDATE, call)
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve(JSObject().put("updated", true))
        } catch (e: Exception) {
            call.reject("Could not update the download service", e)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            context.stopService(Intent(context, DownloadForegroundService::class.java))
            call.resolve(JSObject().put("stopped", true))
        } catch (e: Exception) {
            call.reject("Could not stop the download service", e)
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        // Direct native cancel (works even if the service was already gone).
        DownloadForegroundService.markCancelRequested()
        cancelFileTransferJobs()
        try {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                action = DownloadForegroundService.ACTION_CANCEL
            }
            context.startService(intent)
            call.resolve(JSObject().put("cancelled", true))
        } catch (e: Exception) {
            call.reject("Could not cancel the download", e)
        }
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED
        ) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        try {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
        } catch (e: Exception) {
            // A missing activity must never block the download itself.
            call.resolve(JSObject().put("granted", false))
        }
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        call.resolve(
            JSObject().put(
                "granted",
                getPermissionState("notifications") == PermissionState.GRANTED
            )
        )
    }

    /**
     * Lets files.js distinguish "download was cancelled" from a real network
     * failure even when the native transfer rejects before the JS listener.
     */
    @PluginMethod
    fun consumeCancelled(call: PluginCall) {
        call.resolve(
            JSObject().put(
                "cancelled",
                DownloadForegroundService.consumeCancelRequested()
            )
        )
    }

    private fun serviceIntent(action: String, call: PluginCall): Intent {
        return Intent(context, DownloadForegroundService::class.java).apply {
            this.action = action
            putExtra(
                DownloadForegroundService.EXTRA_TITLE,
                call.getString("title") ?: context.getString(com.pre12.medical.R.string.download_default_title)
            )
            putExtra(
                DownloadForegroundService.EXTRA_PROGRESS,
                call.getInt("progress", 0) ?: 0
            )
            putExtra(
                DownloadForegroundService.EXTRA_MAX,
                call.getInt("max", 100) ?: 100
            )
            putExtra(
                DownloadForegroundService.EXTRA_INDETERMINATE,
                call.getBoolean("indeterminate", false) ?: false
            )
        }
    }

    /**
     * @capacitor/file-transfer has no public cancel API. Its download flow is
     * launched in a private `ioScope`; cancelling that scope's children aborts
     * the HTTP stream while leaving the scope reusable for the next download.
     *
     * This is intentionally best-effort: if the internal field ever changes,
     * the JS race + partial-file cleanup still gives the user a clean cancel.
     */
    private fun cancelFileTransferJobs() {
        try {
            val handle = bridge.getPlugin("FileTransfer") ?: return
            val plugin = handle.instance ?: return

            val field = plugin.javaClass.declaredFields.firstOrNull {
                it.name.startsWith("ioScope")
            }
            val raw = field?.let {
                it.isAccessible = true
                it.get(plugin)
            } ?: plugin.javaClass.declaredMethods.firstOrNull {
                it.name == "getIoScope" && it.parameterTypes.isEmpty()
            }?.let {
                it.isAccessible = true
                it.invoke(plugin)
            }

            val scope = when (raw) {
                is CoroutineScope -> raw
                is Lazy<*> -> raw.value as? CoroutineScope
                else -> null
            } ?: return

            val job = scope.coroutineContext[Job] ?: return
            job.children.forEach { it.cancel() }
        } catch (e: Throwable) {
            Log.w(TAG, "Could not cancel the FileTransfer job", e)
        }
    }

    private companion object {
        const val TAG = "MedDownload"
    }
}
