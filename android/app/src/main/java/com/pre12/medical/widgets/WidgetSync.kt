package com.pre12.medical.widgets

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * ⭐⭐ Phase W5 — offline-first background sync.
 *
 * The widget can be tapped while the app is **closed and offline**. There is no
 * WebView to talk to Supabase, so the change has to survive on its own:
 *
 *   ToggleTaskAction
 *     ├─ tasks.today      (optimistic UI, committed synchronously)
 *     ├─ pending.tasks    (durable queue — the single record of truth)
 *     └─ WorkManager      (this file, network-constrained)
 *
 * The worker uploads the queue straight to `public.task_progress` with the
 * user's own JWT (forwarded by `widgets.js` on every publish). Rows are keyed by
 * `(user_id, plan_date, task_id)`, so retries and the WebView's own drain are
 * idempotent — a tap can be uploaded twice without changing the result.
 *
 * The queue is **not** cleared here. `widgets.js` still has to write localStorage
 * when the app opens; clearing it would make the widget forget a completion that
 * never reached the WebView. Duplicate uploads are harmless, a lost tap is not.
 */
object WidgetSync {

    private const val TAG = "WidgetSync"
    private const val UNIQUE_WORK = "medapp-widget-task-sync"

    /**
     * Public Supabase project settings — keep in sync with `supabase-config.js`.
     * The anon key is publishable by design; row access is enforced by RLS and
     * the user's JWT.
     */
    private const val SUPABASE_URL = "https://pfjpeqhevegivjmyjvux.supabase.co"
    private const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmanBlcWhldmVnaXZqbXlqdnV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDA5NTUsImV4cCI6MjEwNTgxNjk1NX0.JfmMcjUnoAU8baaaeKbwaXxSGtliAww-b-hNBKwuVFA"


    /**
     * Debounced, unique work: ten rapid taps produce one network round-trip.
     * `REPLACE` also resets the backoff after fresh user intent.
     */
    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<WidgetSyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()

        try {
            WorkManager.getInstance(context)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request)
        } catch (error: Exception) {
            // WorkManager missing (unlikely) must never break the checkbox.
            Log.w(TAG, "could not enqueue the widget sync", error)
        }
    }

    // -----------------------------------------------------------------------
    // HTTP helpers (HttpURLConnection — no extra library, no OkHttp)
    // -----------------------------------------------------------------------

    internal fun post(
        path: String,
        body: String,
        token: String = "",
        prefer: String? = null
    ): Pair<Int, String> {
        var connection: HttpURLConnection? = null
        return try {
            connection = URL("$SUPABASE_URL$path").openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
            // `/auth/v1/token` authenticates with `apikey` only; sending an empty
            // bearer there would be rejected by the gateway.
            if (token.isNotEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer $token")
            }
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            if (prefer != null) connection.setRequestProperty("Prefer", prefer)

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }

            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { input ->
                BufferedReader(InputStreamReader(input, Charsets.UTF_8)).use { it.readText() }
            } ?: ""
            code to text
        } catch (error: Exception) {
            Log.w(TAG, "request failed: $path", error)
            0 to ""
        } finally {
            connection?.disconnect()
        }
    }

    internal fun isoNow(): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date())
}

/**
 * Uploads `pending.tasks` to Supabase. Wiring: network constraint + exponential
 * backoff; a 401 is retried once after refreshing the stored refresh token.
 */
class WidgetSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val context = applicationContext
        val pending = WidgetBridge.readPending(context)
        if (pending.isEmpty()) return@withContext Result.success()

        var session = WidgetBridge.readSession(context) ?: return@withContext Result.success()
        if (session.expiresAt in 1..(System.currentTimeMillis() / 1000 + 60)) {
            session = refresh(session) ?: return@withContext Result.success()
        }

        var code = upload(pending, session.accessToken, session.userId)
        if (code == 401 && session.refreshToken.isNotEmpty()) {
            val renewed = refresh(session)
            if (renewed != null) code = upload(pending, renewed.accessToken, renewed.userId)
        }

        when {
            code in 200..299 -> {
                Log.i(WidgetSync::class.java.simpleName, "synced ${pending.size} widget toggle(s)")
                Result.success()
            }
            // 0 = no route, 5xx = transient: let WorkManager back off and retry.
            code == 0 || code >= 500 || code == 429 -> Result.retry()
            // 4xx (bad JWT, RLS, schema) will not heal by retrying; the WebView
            // still holds the queue and will surface/sync it on the next open.
            else -> Result.success()
        }
    }

    private fun upload(pending: List<PendingToggle>, token: String, userId: String): Int {
        val rows = JSONArray()
        pending.forEach { change ->
            val stamp = change.at.ifBlank { WidgetSync.isoNow() }
            rows.put(
                JSONObject()
                    .put("user_id", userId)
                    .put("plan_date", change.date)
                    .put("task_id", change.id)
                    .put("subject", change.subject.ifBlank { JSONObject.NULL })
                    .put("task_title", change.title.ifBlank { JSONObject.NULL })
                    .put("instructor", JSONObject.NULL)
                    .put("task_type", JSONObject.NULL)
                    .put("completed", change.done)
                    .put("completed_at", if (change.done) stamp else JSONObject.NULL)
                    .put("updated_at", stamp)
            )
        }

        val (code, body) = WidgetSync.post(
            path = "/rest/v1/task_progress?on_conflict=user_id,plan_date,task_id",
            body = rows.toString(),
            token = token,
            prefer = "resolution=merge-duplicates,return=minimal"
        )
        if (code !in 200..299 && body.isNotEmpty()) {
            Log.w(WidgetSync::class.java.simpleName, "upload failed ($code): ${body.take(300)}")
        }
        return code
    }

    /**
     * Refreshes the JWT and persists the new pair, so a long-lived widget keeps
     * working without the user opening the app.
     */
    private fun refresh(session: WidgetSession): WidgetSession? {
        if (session.refreshToken.isEmpty()) return null
        val body = JSONObject().put("refresh_token", session.refreshToken).toString()
        val (code, text) = WidgetSync.post(
            path = "/auth/v1/token?grant_type=refresh_token",
            body = body
        )
        if (code !in 200..299) {
            Log.w(WidgetSync::class.java.simpleName, "token refresh rejected ($code)")
            return null
        }
        return try {
            val root = JSONObject(text)
            val access = root.optString("access_token", "")
            if (access.isEmpty()) return null
            val refresh = root.optString("refresh_token", session.refreshToken)
            val expiresIn = root.optLong("expires_in", 3600L)
            val expiresAt = System.currentTimeMillis() / 1000 + expiresIn
            WidgetBridge.updateSessionTokens(applicationContext, access, refresh, expiresAt)
            WidgetSession(access, refresh, session.userId, expiresAt)
        } catch (_: Exception) {
            null
        }
    }
}
