// ============================================================
// send-test-notification — إشعار تجريبي (FCM HTTP v1)
// ------------------------------------------------------------
// ⭐ v4.4.0:
//   • CORS comes from the official SDK (`@supabase/supabase-js/cors`)
//     so preflight and error responses always carry the right headers.
//   • No more 502 on an invalid/legacy token: expected FCM failures are
//     returned as 200 { ok:false, error:"FCM send failed: ..." }.
//   • The token is validated as a string before sending; "[object Object]"
//     and malformed values are rejected and cleared from the profile.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors';
import { initializeApp, cert } from 'npm:firebase-admin/app';
import { getMessaging } from 'npm:firebase-admin/messaging';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ─────────────────────────────────────────────
   أدوات الرمز
   ───────────────────────────────────────────── */

function extractFcmToken(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value !== 'object') return '';

  const obj = value as Record<string, unknown>;
  for (const key of ['token', 'value', 'registrationId', 'registrationToken', 'id']) {
    const nested = obj[key];
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    if (nested && typeof nested === 'object') {
      const deeper = extractFcmToken(nested);
      if (deeper) return deeper;
    }
  }
  return '';
}

function isUsableFcmToken(token: string): boolean {
  return (
    token.length >= 20 &&
    token.length <= 4096 &&
    token.indexOf('[object') === -1 &&
    !/\s/.test(token)
  );
}

/* ─────────────────────────────────────────────
   حساب خدمة Firebase (Vault أو متغيّر بيئة)
   ───────────────────────────────────────────── */

async function readVaultSecret(name: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return null;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc('vault_read_secret_text', { secret_name: name });
    if (error) return null;
    return (data as string) || null;
  } catch (e) {
    console.warn('[test-notification] the Vault secret could not be read:', e);
    return null;
  }
}

async function getServiceAccount(): Promise<Record<string, string> | null> {
  const raw =
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ||
    Deno.env.get('FCM_SERVICE_ACCOUNT') ||
    (await readVaultSecret('fcm_service_account'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
      return parsed;
    }
  } catch (e) {
    console.error('[test-notification] the service account is not valid JSON:', e);
  }
  return null;
}

let messagingApp: unknown = null;

async function getMessagingClient() {
  if (messagingApp) return getMessaging(messagingApp as never);
  const serviceAccount = await getServiceAccount();
  if (!serviceAccount) return null;
  messagingApp = initializeApp({ credential: cert(serviceAccount as never) });
  return getMessaging(messagingApp as never);
}

/* ─────────────────────────────────────────────
   الدالة
   ───────────────────────────────────────────── */

Deno.serve(async (req) => {
  // ⭐ CORS preflight — always first and always 200.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method-not-allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json(
        { ok: false, error: 'server-misconfigured', message: 'Supabase environment is missing.' },
        500
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    /* 1) المستدعي */
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      return json({ ok: false, error: 'missing-authorization', message: 'سجّل الدخول أولاً.' }, 401);
    }

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return json({ ok: false, error: 'invalid-session', message: 'انتهت الجلسة — سجّل الدخول مجدداً.' }, 401);
    }
    const userId = userData.user.id;

    /* 2) الملف والرمز */
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('fcm_token, full_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const token = extractFcmToken(profile?.fcm_token);
    if (!token || !isUsableFcmToken(token)) {
      // ⭐ نظّف أي قيمة قديمة مثل "[object Object]" حتى لا تتكرر.
      if (profile?.fcm_token) {
        await admin.from('profiles').update({ fcm_token: null }).eq('id', userId);
      }
      console.warn('[test-notification] no usable FCM token for user ' + userId);
      return json(
        {
          ok: false,
          error: 'no-device-token',
          message:
            'لا يوجد رمز إشعارات صالح لهذا الجهاز — فعّل الإشعارات من إعدادات التطبيق ثم أعد المحاولة.',
        },
        200
      );
    }

    /* 3) FCM */
    const messaging = await getMessagingClient();
    if (!messaging) {
      console.error('[test-notification] FCM is not configured (no service account).');
      return json(
        {
          ok: false,
          error: 'fcm-not-configured',
          message: 'FCM غير مُهيّأ على الخادم — تحقّق من سرّ حساب الخدمة.',
        },
        200
      );
    }

    const name = profile?.full_name || (profile?.email || '').split('@')[0] || 'صديق';
    const title = '🔔 إشعار تجريبي';
    const body = 'مرحباً ' + name + '! هذا إشعار تجريبي من المنصة الطبية — الإشعارات تعمل بنجاح';

    const message = {
      notification: { title, body },
      data: {
        action: 'tasks',
        source: 'test',
        channel: 'medapp_tasks',
        title,
        body,
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'medapp_tasks',
          icon: 'ic_stat_icon',
          color: '#10b981',
          sound: 'default',
        },
      },
    };

    console.info('[test-notification] sending to ' + token.slice(0, 18) + '… (FCM v1)');

    try {
      const messageId = await messaging.send({ token, ...message });
      console.info('[test-notification] sent ✓ id=' + messageId);
      return json({ ok: true, sent: 1, messageId, mode: 'v1' }, 200);
    } catch (sendError: unknown) {
      const error = sendError as { message?: string; code?: string; errorInfo?: unknown };
      const firebaseMessage = error?.message || error?.code || 'unknown error';
      const firebaseCode = error?.code || '';
      console.error('[test-notification] FCM send failed:', firebaseMessage);

      // ⭐ رمز قديم/محذوف → امسحه من الملف حتى يسجّل التطبيق رمزاً جديداً.
      if (
        /registration-token-not-registered|not a valid FCM registration token|Requested entity was not found/i.test(
          firebaseMessage
        )
      ) {
        await admin.from('profiles').update({ fcm_token: null }).eq('id', userId);
      }

      // ⭐ 200 مع خطأ واضح: لا مزيد من 502 / CORS في الواجهة.
      return json(
        {
          ok: false,
          error: 'FCM send failed: ' + firebaseMessage,
          message: 'FCM send failed: ' + firebaseMessage,
          firebaseCode: firebaseCode || null,
        },
        200
      );
    }
  } catch (e) {
    const error = e as { message?: string };
    console.error('[test-notification] unhandled error:', e);
    return json(
      {
        ok: false,
        error: 'internal-error',
        message: 'FCM send failed: ' + (error?.message || 'unexpected error'),
      },
      500
    );
  }
});
