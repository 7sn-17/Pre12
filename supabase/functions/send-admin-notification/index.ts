// ============================================================
// send-admin-notification — إرسال إشعار يدوي من لوحة التحكم
// ------------------------------------------------------------
// ⭐ يستقبل: { title, body, target: { type, subjectId, email }, url }
// ⭐ يُرسل عبر FCM إلى الأجهزة المسجّلة في profiles.fcm_token
// ⭐ محمي: يجب أن يكون المستخدم أدمن (role = 'admin')
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSender, sendBatch, takeInvalidTokens } from '../_shared/fcm.ts';

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  try {
    /* ── 1) المصادقة ── */
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: 'missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return json({ error: 'invalid session' }, 401);
    }
    const userId = userData.user.id;

    /* ── 2) الصلاحية ── */
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!profile || profile.role !== 'admin') {
      return json({ error: 'admin only' }, 403);
    }

    /* ── 3) المدخلات ── */
    const payload = await req.json();
    const title = String(payload?.title || '').trim();
    const body = String(payload?.body || '').trim();
    const url = String(payload?.url || '').trim();
    const target = payload?.target || {};
    const type = String(payload?.target_type || target.type || 'all').toLowerCase();
    const email = String(payload?.email || target.email || '').trim().toLowerCase();
    const subjectId = String(payload?.subject_id || target.subjectId || '').trim();

    if (!title || !body) {
      return json({ error: 'title and body are required' }, 400);
    }

    /* ── 4) تحديد الجمهور ── */
    let tokens: string[] = [];
    let subjectName = '';
    let subjectSlug = '';

    if (type === 'user' || type === 'email') {
      if (!email) return json({ error: 'the email is required' }, 400);
      const { data, error } = await admin
        .from('profiles')
        .select('fcm_token')
        .ilike('email', email)
        .not('fcm_token', 'is', null);
      if (error) throw error;
      tokens = (data || []).map((r) => r.fcm_token).filter(Boolean);
    } else if (type === 'subject') {
      if (!subjectId) return json({ error: 'the subject is required' }, 400);

      const { data: subject, error: subjectError } = await admin
        .from('subjects')
        .select('id, name, slug')
        .eq('id', subjectId)
        .maybeSingle();
      if (subjectError) throw subjectError;
      if (!subject) return json({ error: 'the subject was not found' }, 404);

      subjectName = String(subject.name || '');
      subjectSlug = String(subject.slug || '');

      const userIds = new Set<string>();

      // ⭐ من لديه مهام في هذه المادة
      const { data: taskRows, error: taskError } = await admin
        .from('task_progress')
        .select('user_id')
        .eq('subject', subjectName);
      if (taskError) throw taskError;
      for (const row of taskRows || []) {
        if (row.user_id) userIds.add(row.user_id);
      }

      // ⭐ ومن حفظ ملفاً من ملفات المادة في المفضلة
      const { data: subjectFiles, error: filesError } = await admin
        .from('files')
        .select('id')
        .eq('subject_id', subjectId);
      if (filesError) throw filesError;

      const fileIds = (subjectFiles || []).map((f) => f.id).filter(Boolean);
      if (fileIds.length) {
        const { data: favRows, error: favError } = await admin
          .from('favorites')
          .select('user_id')
          .in('file_id', fileIds);
        if (favError) throw favError;
        for (const row of favRows || []) {
          if (row.user_id) userIds.add(row.user_id);
        }
      }

      if (userIds.size) {
        const { data: profiles, error: pError } = await admin
          .from('profiles')
          .select('fcm_token')
          .in('id', Array.from(userIds))
          .not('fcm_token', 'is', null);
        if (pError) throw pError;
        tokens = (profiles || []).map((r) => r.fcm_token).filter(Boolean);
      }
    } else {
      const { data, error } = await admin
        .from('profiles')
        .select('fcm_token')
        .not('fcm_token', 'is', null);
      if (error) throw error;
      tokens = (data || []).map((r) => r.fcm_token).filter(Boolean);
    }

    if (!tokens.length) {
      return json({ sent: 0, failed: 0, message: 'no devices found for this target' });
    }

    /* ── 5) الإرسال ── */
    const sender = await createSender();
    if (!sender) {
      return json({
        error:
          'FCM is not configured — add the FCM_SERVICE_ACCOUNT secret (or FCM_API_KEY) in the Edge Function settings',
      }, 500);
    }

    const channelId = type === 'subject' ? 'medapp_content' : 'medapp_updates';
    const action = (type === 'subject' || !!url) ? 'content' : 'tasks';
    const targetUrl = url || (subjectSlug
      ? `subject.html?subject=${encodeURIComponent(subjectSlug)}`
      : 'index.html');

    const data: Record<string, string> = {
      action,
      target: targetUrl,
      url: targetUrl,
      source: 'admin',
      channel: channelId,
    };
    if (subjectId) {
      data.subject_id = subjectId;
      data.subject_name = subjectName;
      data.subject_slug = subjectSlug;
    }

    const result = await sendBatch(sender, tokens, {
      title,
      body,
      data,
      channelId,
    });

    // ⭐ v4.5.2 — رموز لم تُسجَّل anymore → امسحها من profiles.
    try {
      const invalid = takeInvalidTokens();
      if (invalid.length) {
        await admin.from('profiles').update({ fcm_token: null }).in('fcm_token', invalid);
        console.warn('[admin-notify] cleared ' + invalid.length + ' stale FCM token(s)');
      }
    } catch (e) {
      console.warn('[admin-notify] could not clear the stale tokens:', e);
    }

    /* ── 6) السجلّ ── */
    try {
      await admin.from('notification_log').insert({
        user_id: null,
        category: 'admin',
        title,
        body,
        target: type,
        sent: result.sent > 0,
        error: result.failed ? `${result.failed} device(s) failed` : null,
      });
    } catch (e) {
      console.warn('[admin-notify] could not write the log:', e);
    }

    return json({ sent: result.sent, failed: result.failed, mode: sender.mode });
  } catch (e) {
    console.error('[admin-notify]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
