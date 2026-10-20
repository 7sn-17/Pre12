// ============================================================
// send-update-notification — إعلان التحديث الجديد لكل المستخدمين
// ------------------------------------------------------------
// ⭐ Phase 27 — The Ultimate Master Phase
//
// ⭐ يُستدعى من GitHub Actions بعد نشر إصدار جديد:
//   "🚀 تحديث جديد متاح v3.5.0! اضغط للتحديث." مع data.action='update'
//   → عند الضغط يفتح التطبيق نافذة التحديث (In-App Update).
//
// ⭐ الحماية: مفتاح service_role (من الـ CI) أو سرّ الـ cron.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSender, sendBatch } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    /* ── 1) الحماية ── */
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const cronSecret = req.headers.get('x-cron-secret') || '';

    let authorized = false;
    if (bearer && bearer === serviceKey) {
      authorized = true;                       // مفتاح service_role
    } else if (bearer) {
      const { data } = await admin.auth.getUser(bearer);
      if (data?.user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        if (profile && (profile.role === 'admin' || profile.role === 'moderator')) {
          authorized = true;
        }
      }
    }
    if (!authorized && cronSecret) {
      const { data: secret } = await admin.rpc('vault_read_secret_text', {
        secret_name: 'cron_secret',
      });
      if (secret && secret === cronSecret) authorized = true;
    }

    if (!authorized) return json({ error: 'forbidden' }, 403);

    /* ── 2) المحتوى ── */
    let payload: any = {};
    try {
      payload = await req.json();
    } catch (e) {
      payload = {};
    }

    const version = String(payload.version || '').replace(/^v/i, '');
    const title = payload.title || (version ? `🚀 تحديث جديد متاح v${version}!` : '🚀 تحديث جديد متاح!');
    const body = payload.body || 'اضغط للتحديث.';
    const notes = String(payload.notes || '').slice(0, 800);

    /* ── 3) الأجهزة ── */
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('fcm_token')
      .not('fcm_token', 'is', null);
    if (error) throw error;

    const tokens = (profiles || [])
      .map((p) => p.fcm_token)
      .filter((t) => typeof t === 'string' && t.length > 10);

    if (!tokens.length) {
      return json({ ok: true, sent: 0, failed: 0, message: 'no devices' });
    }

    /* ── 4) الإرسال ── */
    const sender = await createSender();
    if (!sender) {
      console.error('[update-notification] FCM is not configured (no service account).');
      return json({
        error: 'fcm-not-configured',
        message:
          'FCM غير مُهيّأ — أضف سرّ FIREBASE_SERVICE_ACCOUNT_JSON إلى إعدادات دوالّ Edge: ' +
          'Firebase console ← Project settings ← Service accounts ← Generate new private key ← انسخ JSON.',
      }, 500);
    }

    const result = await sendBatch(sender, tokens, {
      title,
      body,
      data: {
        action: 'update',
        version: version,
        notes: notes,
        target: 'index.html',
      },
    });

    /* ── 5) السجلّ ── */
    try {
      await admin.from('notification_log').insert({
        category: 'update',
        title,
        body,
        target: 'all',
        sent: result.sent > 0,
        error: result.failed ? `${result.failed} device(s) failed` : null,
      });
    } catch (e) {
      console.warn('[update-notification] the log could not be written:', e);
    }

    return json({ ok: true, sent: result.sent, failed: result.failed, mode: sender.mode });
  } catch (e) {
    console.error('[update-notification]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
