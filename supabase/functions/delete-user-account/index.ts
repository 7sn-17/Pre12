// ============================================================
// delete-user-account — حذف الحساب نهائياً (ذاتي أو بواسطة المشرف)
// ------------------------------------------------------------
// ⭐ Phase 31 — The Ultimate UI Logic & Account Management Fix
//
// ⭐⭐⭐ Phase W16 — «مسار المشرف» (الجذر الحقيقي لعطل لوحة المشرف)
//
// ⭐ السبب الجذري لعطل «حذف المستخدم» في لوحة المشرف:
//   1) الدالة كانت تأخذ المعرّف من الـJWT الخاص بالمستدعي ⇒ حذف الحساب
//      **الذاتي فقط**، فلم تكن القدرة على حذف حساب آخر.
//   2) ولوحة المشرف كانت تحاول الحذف من المتصفّح برمز المستخدم (authenticated)
//      ⇒ جدول `profiles` **لا يملك سياسة DELETE إطلاقاً** ⇒ RLS يرفض الطلب
//      ⇒ «فشل صامت» أو «تعذّر الحذف».
//   3) ولم يكن `auth.users` يُحذف أبداً ⇒ الحساب يبقى قادراً على تسجيل الدخول.
//
// ⭐ الحل (كله هنا، بصلاحية service_role):
//   • body.user_id  → الحساب المطلوب حذفه (للمشرف/المراقب فقط).
//   • بدونه        → حذف الحساب الشخصي (كما كان).
//   • يُحذف: auth.users · profiles · notes · goals · task_progress ·
//     favorites · streak_freezes · notification_log · lecture_albums ·
//     album_requests · schedule_images (+لايكات/حفظات) · files المرفوعة ·
//     مجلّدات Storage (files · schedule-images) · صورة الغلاف إن وُجدت.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** الأدوار التي تملك حق حذف حساب غيرها. */
const STAFF_ROLES = ['admin', 'moderator'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * ⭐ v4.6.1 — يحذف مجلّداً كاملاً من Storage (مع المجلّدات الفرعية).
 * @returns {Promise<number>} عدد الملفات المحذوفة.
 */
async function removeFolder(admin: any, bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  const { data: entries, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !entries || !entries.length) return 0;

  for (const entry of entries) {
    if (!entry || !entry.name) continue;
    const path = prefix + '/' + entry.name;
    if (entry.id) {
      // ملف
      const { error: removeError } = await admin.storage.from(bucket).remove([path]);
      if (!removeError) removed++;
      continue;
    }
    // مجلّد فرعي
    removed += await removeFolder(admin, bucket, path);
  }
  return removed;
}

/** ⭐⭐⭐ W16 — هل هذا المستخدم مشرف/مراقب؟ (يُقرأ بصلاحية service_role). */
async function roleOf(admin: any, userId: string): Promise<string> {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return '';
    return String((data && (data as any).role) || '').toLowerCase();
  } catch (e) {
    return '';
  }
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
    const callerId = userData.user.id;
    const callerEmail = userData.user.email || '';

    /* ── 2) الجسم: الهدف + التأكيد ── */
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

    /* ── 2.1) ⭐⭐⭐ W16 — الهدف: الحساب المطلوب حذفه ── */
    const requestedId = String(body.user_id || '').trim();
    const targetId = requestedId || callerId;
    const isSelf = targetId === callerId;

    // ⭐ المشرف/المراقب فقط يحذف حساباً آخر.
    let callerRole = '';
    if (!isSelf) {
      callerRole = await roleOf(admin, callerId);
      if (!STAFF_ROLES.includes(callerRole)) {
        return json({
          error: 'forbidden',
          message: 'حذف حساب آخر مخصّص للمشرفين والمراقبين فقط.',
        }, 403);
      }
    }

    // ⭐ لا أحد يحذف حسابه من مسار «المشرف» — المسار الآمن هو الحذف الذاتي.
    if (!isSelf && requestedId === callerId) {
      return json({ error: 'forbidden', message: 'لا يمكنك استخدام مسار المشرف لحذف حسابك.' }, 403);
    }

    /* ── 3) بيانات الحساب الهدف (للتقرير) ── */
    let targetEmail = '';
    try {
      const { data: targetUser } = await admin.auth.admin.getUserById(targetId);
      targetEmail = (targetUser && targetUser.user && targetUser.user.email) || '';
    } catch (e) {
      /* الحساب قد يكون محذوفاً أصلاً — نكمل التنظيف */
    }

    const cleaned: Record<string, number> = {};
    let removedFiles = 0;

    /* ── 4) حذف البيانات المرتبطة أولاً (تنظيف مضمون) ── */
    const tables = [
      'task_progress',
      'favorites',
      'notes',
      'goals',
      'streak_freezes',
      'notification_log',
      'lecture_albums',
      'schedule_image_likes',
      'schedule_image_saves',
      'schedule_images',
    ];
    for (const table of tables) {
      try {
        const { error, count } = await admin
          .from(table)
          .delete({ count: 'exact' })
          .eq('user_id', targetId);
        if (error) {
          console.warn('[delete-account] could not clean ' + table + ':', error.message);
        } else {
          cleaned[table] = count ?? 0;
        }
      } catch (e) {
        console.warn('[delete-account] could not clean ' + table + ':', e);
      }
    }

    // ⭐⭐ W16 — طلبات الألبوم: يملكها صاحب الطلب (user_id) أو صاحب الألبوم
    //   (album_owner_id) — ننظّف الاتجاهين حتى لا يبقى طلب معلّق على حساب
    //   محذوف (وهو ما كان يمنع حذف الألبوم لاحقاً).
    try {
      const byRequester = await admin
        .from('album_requests')
        .delete({ count: 'exact' })
        .eq('user_id', targetId);
      const byOwner = await admin
        .from('album_requests')
        .delete({ count: 'exact' })
        .eq('album_owner_id', targetId);
      cleaned['album_requests'] =
        (byRequester.count ?? 0) + (byOwner.count ?? 0);
      if (byRequester.error) console.warn('[delete-account] album_requests:', byRequester.error.message);
      if (byOwner.error) console.warn('[delete-account] album_requests:', byOwner.error.message);
    } catch (e) {
      console.warn('[delete-account] could not clean album_requests:', e);
    }

    // ⭐ الملف الشخصي (له معرّف id لا user_id)
    try {
      const { error, count } = await admin
        .from('profiles')
        .delete({ count: 'exact' })
        .eq('id', targetId);
      if (error) console.warn('[delete-account] could not delete the profile:', error.message);
      else cleaned['profiles'] = count ?? 0;
    } catch (e) {
      console.warn('[delete-account] could not delete the profile:', e);
    }

    /* ── 5) ⭐ v4.6.1 — الملفات التي رفعها المستخدم ──
       ملاحظة: عمود الملكية في جدول files هو uploaded_by (وليس user_id) —
       فكان الحذف يفشل بصمت وتبقى الملفات في القاعدة. */
    let storedFilePaths: string[] = [];
    try {
      const { data: userFiles, error: filesReadError } = await admin
        .from('files')
        .select('id, file_path, source')
        .eq('uploaded_by', targetId);
      if (filesReadError) throw filesReadError;
      storedFilePaths = (userFiles || [])
        .map((f: any) => f.file_path)
        .filter((path: unknown): path is string => typeof path === 'string' && path.length > 0);
    } catch (e) {
      console.warn('[delete-account] could not read the user files:', e);
    }

    try {
      const { error, count } = await admin
        .from('files')
        .delete({ count: 'exact' })
        .eq('uploaded_by', targetId);
      if (error) console.warn('[delete-account] could not delete the files:', error.message);
      else cleaned['files'] = count ?? 0;
    } catch (e) {
      console.warn('[delete-account] could not delete the files:', e);
    }

    /* ── 5.1) ⭐⭐ W16 — تنظيف Storage: لا يبقى ملف على الخادم ──
       • المسارات المسجّلة في جدول files (قديمة أو خارج المجلّد). */
    try {
      if (storedFilePaths.length) {
        const { error: storageError } = await admin.storage.from('files').remove(storedFilePaths);
        if (storageError) {
          console.warn('[delete-account] could not remove the stored files:', storageError.message);
        } else {
          removedFiles += storedFilePaths.length;
        }
      }
    } catch (e) {
      console.warn('[delete-account] could not remove the stored files:', e);
    }

    /* ── 5.2) مجلّد المستخدم داخل bucket «files» (كل ما رفعه) ── */
    try {
      const removed = await removeFolder(admin, 'files', targetId);
      removedFiles += removed;
      if (removed) console.info('[delete-account] removed ' + removed + ' file(s) from the files bucket.');
    } catch (e) {
      console.warn('[delete-account] could not remove the files folder:', e);
    }

    // ⭐ صور الجدول + أغلفة المحاضرات (مجلّد المستخدم داخل bucket schedule-images)
    try {
      const removed = await removeFolder(admin, 'schedule-images', targetId);
      removedFiles += removed;
      if (removed) console.info('[delete-account] removed ' + removed + ' stored image(s) of the user.');
    } catch (e) {
      console.warn('[delete-account] could not remove the stored images:', e);
    }

    /* ── 6) حذف الحساب نفسه من auth.users ── */
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetId);
    if (deleteError) {
      console.error('[delete-account] the account could not be deleted:', deleteError.message);
      return json({
        error: 'delete-failed',
        message: deleteError.message || 'تعذّر حذف الحساب',
        cleaned,
        removedFiles,
      }, 500);
    }

    console.info(
      '[delete-account] deleted ' + targetId +
      (targetEmail ? ' (' + targetEmail + ')' : '') +
      (isSelf ? ' — self' : ' — by ' + callerId + ' [' + callerRole + ']')
    );

    return json({
      ok: true,
      deleted: true,
      userId: targetId,
      self: isSelf,
      email: targetEmail || undefined,
      cleaned,
      removedFiles,
    });
  } catch (e) {
    console.error('[delete-account]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});
