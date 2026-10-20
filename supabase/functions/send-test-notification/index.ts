// ============================================================
// send-test-notification — إرسال إشعار تجريبي (FCM v1 فقط)
// ------------------------------------------------------------
// ⭐ Phase 29 — The legacy FCM endpoint (fcm.googleapis.com/fcm/send)
//   is DEAD (it answers 404) — so the only supported way is the
//   official HTTP v1 API, through the firebase-admin SDK.
//
// ⭐ The credentials come from:
//   1) the Edge Function secret  FIREBASE_SERVICE_ACCOUNT_JSON
//   2) the Supabase Vault secret  'fcm_service_account'
//
// ⭐ The exact error message from Firebase is returned to the app.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { initializeApp, cert } from 'npm:firebase-admin/app';
import { getMessaging } from 'npm:firebase-admin/messaging';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ─────────────────────────────────────────────
   حساب الخدمة
   ───────────────────────────────────────────── */

async function readVaultSecret(name: string): Promise<string | null> {
  try {
    const { createClient } = await import('jsr:@supabase/supabase-js@2');
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
    return null;
  }
}

async function getServiceAccount(): Promise<any | null> {
  const raw =
    Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ||
    Deno.env.get('FCM_SERVICE_ACCOUNT') ||
    (await readVaultSecret('fcm_service_account'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) return parsed;
  } catch (e) {
    console.error('[test-notification] the service account is not valid JSON:', e);
  }
  return null;
}

/** ⭐ تهيئة firebase-admin (مرة واحدة) */
let messagingApp: any = null;
async function getMessagingClient() {
  if (messagingApp) return getMessaging(messagingApp);
  const sa = await getServiceAccount();
  if (!sa) return null;
  messagingApp = initializeApp({ credential: cert(sa) });
  return getMessaging(messagingApp);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    /* ── 1) من المستدعي؟ ── */
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'missing authorization' }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return json({ error: 'invalid session' }, 401);
    }
    const userId = userData.user.id;

    /* ── 2) التوكن ── */
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('fcm_token, full_name, email')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || !profile.fcm_token) {
      console.warn(
        '[test-notification] no FCM token for user ' + userId +
        ' — the app must register the device first (POST_NOTIFICATIONS + register()).',
      );
      return json({
        error: 'no-device-token',
        message:
          'لا يوجد رمز إشعارات لهذا الجهاز — فعّل الإشعارات من إعدادات التطبيق ثم أعد المحاولة.',
      }, 404);
    }

    /* ── 3) تهيئة FCM v1 ── */
    const messaging = await getMessagingClient();
    if (!messaging) {
      console.error('[test-notification] FCM is not configured (no service account).');
      return json({
        error: 'fcm-not-configured',
        message:
          'FCM غير مُهيّأ — أضف سرّ FIREBASE_SERVICE_ACCOUNT_JSON إلى إعدادات دوالّ Edge: ' +
          'Firebase console ← Project settings ← Service accounts ← Generate new private key ← انسخ JSON.',
      }, 500);
    }

    /* ── 4) الإرسال ── */
    const name = profile.full_name || (profile.email || '').split('@')[0] || 'صديق';
    const message = {
      notification: {
        title: '🔔 إشعار تجريبي',
        body: `مرحباً ${name}! هذا إشعار تجريبي من المنصة الطبية — الإشعارات تعمل بنجاح`,
      },
      data: {
        action: 'tasks',
        source: 'test',
        title: '🔔 إشعار تجريبي',
        body: `مرحباً ${name}! هذا إشعار تجريبي من المنصة الطبية — الإشعارات تعمل بنجاح`,
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'medapp_reminders',
          icon: 'ic_stat_icon',
          color: '#10b981',
          sound: 'default',
        },
      },
    };

    console.info(
      '[test-notification] sending to ' + profile.fcm_token.slice(0, 18) + '… (FCM v1)',
    );

    try {
      const messageId = await messaging.send({
        token: profile.fcm_token,
        ...message,
      });
      console.info('[test-notification] sent ✓ id=' + messageId);
      return json({ ok: true, sent: 1, messageId, mode: 'v1' });
    } catch (sendError: any) {
      // ⭐ نُرجع رسالة Firebase كما هي بالضبط
      const firebaseMessage = (sendError && (sendError.message || sendError.code)) || 'unknown';
      console.error('[test-notification] FCM send failed:', firebaseMessage);
      return json({
        error: 'send-failed',
        message: firebaseMessage,
        firebaseCode: sendError && sendError.code ? sendError.code : null,
        details: sendError && sendError.errorInfo ? sendError.errorInfo : null,
      }, 502);
    }
  } catch (e) {
    console.error('[test-notification]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
