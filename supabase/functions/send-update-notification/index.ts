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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-release-secret',
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
  // ⭐ TASK 6 (v4.1.2): Supabase now issues the legacy JWT service_role key
  //    AND the new `sb_secret_…` secret key. The GitHub secret may hold
  //    either one, so accept whichever matches the runtime environment.
  const acceptedServiceKeys = [
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('SUPABASE_SECRET_KEY'),
    Deno.env.get('SUPABASE_SERVICE_KEY'),
  ].filter((value): value is string => !!value);

  // ⭐ v4.1.2: the runtime may expose the new secret keys as a JSON map
  //    (`SUPABASE_SECRET_KEYS={"default":"sb_secret_…"}`). Accept those too.
  try {
    const rawKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys);
      if (parsed && typeof parsed === 'object') {
        for (const value of Object.values(parsed)) {
          if (typeof value === 'string' && value) acceptedServiceKeys.push(value);
        }
      }
    }
  } catch (e) {
    console.warn('[update-notification] could not parse SUPABASE_SECRET_KEYS');
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    /* ─────────────────────────────────────────────────────────────
       1) الحماية — ثلاث طرق مقبولة:
       ─────────────────────────────────────────────────────────────
       a) Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
          ⭐ أضف هذا السرّ في GitHub:
             Settings → Secrets and variables → Actions → New secret
             → Name: SUPABASE_SERVICE_ROLE_KEY
             → Value: (من Supabase → Project Settings → API)
       b) x-cron-secret: <CRON_SECRET>
          ⭐ أضف هذا السرّ في GitHub (الاسم: CRON_SECRET) وبنفس القيمة
             المخزّنة في Supabase Vault باسم 'cron_secret'.
       c) توكن أدمن/مشرف (للاستخدام اليدوي من داخل التطبيق).
       ───────────────────────────────────────────────────────────── */
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const cronSecret = (req.headers.get('x-cron-secret') || '').trim();

    let authorized = false;
    let reason = '';

    if (bearer && acceptedServiceKeys.indexOf(bearer) > -1) {
      authorized = true;                       // ⭐ مفتاح service_role / secret
      reason = 'service_role';
    } else if (bearer && acceptedServiceKeys.indexOf(bearer) === -1) {
      // ⭐ توكن مستخدم: نقبل الأدمن والمشرف فقط
      const { data } = await admin.auth.getUser(bearer);
      if (data?.user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        if (profile && (profile.role === 'admin' || profile.role === 'moderator')) {
          authorized = true;
          reason = 'admin-role';
        }
      }
    }

    if (!authorized && cronSecret) {
      const { data: secret } = await admin.rpc('vault_read_secret_text', {
        secret_name: 'cron_secret',
      });
      if (secret && secret === cronSecret) {
        authorized = true;
        reason = 'cron-secret';
      }
    }

    // ⭐ v4.1.2: dedicated CI secret (Vault + GitHub) — used when the
    //    project's legacy service_role key differs from the GitHub copy.
    const releaseSecret = (req.headers.get('x-release-secret') || '').trim();
    if (!authorized && releaseSecret) {
      try {
        const { data: secret } = await admin.rpc('vault_read_secret_text', {
          secret_name: 'release_notify_secret',
        });
        if (secret && secret === releaseSecret) {
          authorized = true;
          reason = 'release-secret';
        }
      } catch (e) {
        console.warn('[update-notification] could not read release_notify_secret');
      }
    }

    if (!authorized) {
      console.warn(
        '[update-notification] 403 — the request carried no valid credential. ' +
        'Add SUPABASE_SERVICE_ROLE_KEY (or CRON_SECRET) to the GitHub Actions secrets.',
      );
      return json({
        error: 'forbidden',
        reason: reason || 'no-credential',
        message:
          'مطلوب سرّ صالح: أضف SUPABASE_SERVICE_ROLE_KEY أو CRON_SECRET إلى ' +
          'أسرار GitHub Actions (Settings → Secrets and variables → Actions).',
      }, 403);
    }

    console.info('[update-notification] authorized via ' + reason);

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
