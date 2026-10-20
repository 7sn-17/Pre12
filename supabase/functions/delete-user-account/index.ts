// ============================================================
// delete-user-account — حذف الحساب نهائياً
// ------------------------------------------------------------
// ⭐ Phase 31 — The Ultimate UI Logic & Account Management Fix
//
// ⭐ The caller is authenticated (verify_jwt) → we take the user id
//   from their own JWT and delete THAT account only (service_role).
//
// ⭐ The cascade removes everything that references auth.users:
//   profiles · task_progress · favorites · notes · albums · files
//   authored by the user · streak_freezes · notification_log …
//
// ⭐ The client signs out and returns to index.html afterwards.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    const email = userData.user.email || '';

    /* ── 2) تأكيد إضافي: كلمة المرور (اختياري لكن آمن) ── */
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    // ⭐ نطلب تأكيداً صريحاً حتى لا يُحذف الحساب خطأً
    if (body.confirm !== 'DELETE' && body.confirm !== 'حذف') {
      return json({
        error: 'confirmation-required',
        message: 'أرسل { "confirm": "DELETE" } لتأكيد الحذف.',
      }, 400);
    }

    /* ── 3) حذف البيانات المرتبطة أولاً (تنظيف مضمون) ── */
    const tables = ['task_progress', 'favorites', 'notes', 'streak_freezes', 'notification_log', 'lecture_albums', 'schedule_image_likes', 'schedule_image_saves'];
    for (const table of tables) {
      try {
        const { error } = await admin.from(table).delete().eq('user_id', userId);
        if (error) console.warn('[delete-account] could not clean ' + table + ':', error.message);
      } catch (e) {
        console.warn('[delete-account] could not clean ' + table + ':', e);
      }
    }

    // ⭐ الملف الشخصي (له معرّف id لا user_id)
    try {
      const { error } = await admin.from('profiles').delete().eq('id', userId);
      if (error) console.warn('[delete-account] could not delete the profile:', error.message);
    } catch (e) {
      console.warn('[delete-account] could not delete the profile:', e);
    }

    // ⭐ الملفات التي رفعها المستخدم
    try {
      const { error } = await admin.from('files').delete().eq('user_id', userId);
      if (error) console.warn('[delete-account] could not delete the files:', error.message);
    } catch (e) {
      console.warn('[delete-account] could not delete the files:', e);
    }

    /* ── 4) حذف الحساب نفسه ── */
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('[delete-account] the account could not be deleted:', deleteError.message);
      return json({
        error: 'delete-failed',
        message: deleteError.message || 'تعذّر حذف الحساب',
      }, 500);
    }

    console.info('[delete-account] the account was deleted: ' + userId + (email ? ' (' + email + ')' : ''));
    return json({ ok: true, deleted: true, userId });
  } catch (e) {
    console.error('[delete-account]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
