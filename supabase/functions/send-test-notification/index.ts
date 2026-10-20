// ============================================================
// send-test-notification — إرسال إشعار تجريبي
// ------------------------------------------------------------
// ⭐ Phase 27 — The Ultimate Master Phase
//
// ⭐ يرسل إشعاراً تجريبياً إلى جهاز المستخدم الذي يستدعي الدالة
//   (المستخدم مسجّل الدخول ⇒ نأخذ fcm_token من ملفه الشخصي).
//
// ⭐ المصادقة: يجب أن يكون هناك مستخدم حقيقي (JWT) — والدالة
//   محميّة بـ verify_jwt.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSender } from '../_shared/fcm.ts';

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
      return json({
        error: 'no-device-token',
        message: 'لا يوجد رمز إشعارات لهذا الجهاز — فعّل الإشعارات من إعدادات التطبيق أولاً.',
      }, 404);
    }

    /* ── 3) الإرسال ── */
    const sender = await createSender();
    if (!sender) {
      return json({
        error: 'fcm-not-configured',
        message:
          'FCM غير مُهيّأ — أضف سرّ FIREBASE_SERVICE_ACCOUNT_JSON إلى إعدادات دوالّ Edge.',
      }, 500);
    }

    const name = profile.full_name || (profile.email || '').split('@')[0] || 'صديق';
    const message = {
      title: '🔔 إشعار تجريبي',
      body: `مرحباً ${name}! هذا إشعار تجريبي من المنصة الطبية — الإشعارات تعمل بنجاح ✅`,
      data: { action: 'tasks', source: 'test' },
    };

    const ok = await sender.send(profile.fcm_token, message);
    if (!ok) {
      return json({ error: 'send-failed', message: 'تعذّر إرسال الإشعار' }, 502);
    }

    return json({ ok: true, sent: 1, mode: sender.mode });
  } catch (e) {
    console.error('[test-notification]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
