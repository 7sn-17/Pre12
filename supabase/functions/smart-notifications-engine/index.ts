// ============================================================
// smart-notifications-engine — المحرّك الآلي الذكي
// ------------------------------------------------------------
// ⭐ يعمل كل ساعة عبر pg_cron → net.http_post
// ⭐ 6 فئات × قوالب ضخمة × اختيار عشوائي (Math.random)
// ⭐ المتغيّرات الديناميكية: {name} {streak} {missed_count} {subject} {task_count}
//
// ⭐ categorization:
//   1. onboarding   → مستخدم جديد لم يُنجز شيئاً
//   2. agenda       → جدول اليوم (صباحاً / ظهراً / عصراً / مساءً)
//   3. streak       → حماية السلسلة (خطر، قبل أسبوع، انكسرت)
//   4. reengagement → مستخدم خامل (يوم / 3 أيام / أسبوع)
//   5. content      → ملف جديد في مادة
//   6. achievement  → إنجازات
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSender, sendBatch, type FcmMessage } from '../_shared/fcm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ══════════════════════════════════════════════════════════
   1. القوالب الضخمة
   ══════════════════════════════════════════════════════════ */

const TEMPLATES = {
  onboarding: {
    titles: ['أهلاً بك في المنصة الطبية', 'رحلتك تبدأ الآن', 'خطوتك الأولى'],
    bodies: [
      'أهلاً بك يا {name} في المنصة الطبية! رحلتك تبدأ الآن 👨‍⚕️.',
      'خطوتك الأولى نحو التفوق بدأت. لنضع خطة اليوم!',
      'جاهز لبدء أول مهمة لك؟ 5 دقائق فقط تكفي 🚀.',
      'مرحباً {name}! سجّل أول مهمة اليوم وابدأ بناء سلسلتك 💪.',
      'المحتوى كله بانتظارك — ابدأ بمهمة واحدة فقط لتكسر الحاجز.',
      'أول خطوة هي الأصعب، وبعدها يصبح الأمر سهلاً. لنبدأ ✅.'
    ],
  },
  agenda: {
    titles: ['صباح الخير', 'مهام اليوم', 'لنبدأ', 'تذكير سريع', 'وقت الانطلاق', 'جدولك جاهز'],
    bodies: [
      'صباح الخير يا {name} ☀️! لديك {task_count} مهام اليوم. لنبدأ بنشاط!',
      'يوم جديد، فرصة جديدة للتفوق. مهامك بانتظارك 📚.',
      'طالب الطب لا ينام على مهامه! ابدأ يومك الآن 💪.',
      'مر الوقت ولم تبدأ بعد! تذكّر هدفك، ابدأ بمهمة واحدة الآن ⏳.',
      'أنت في منتصف الطريق! أنجزت نصف المهام. واصل التقدم 🚀.',
      'رائع يا {name}! أكملت جميع مهام اليوم. أنت أسطورة 🏆.',
      'مهمة واحدة الآن تكفي لتُكمل يومك بنجاح — خلّينا نبدأ.',
      'جدولك جاهز: {task_count} مهام. أتمم واحدة منهم وابدأ.',
      'قاعدة اليوم: الأهم أولاً، ثم الباقي. ابدأ بالمهمة الأهم 🎯.',
      'بقي {task_count} مهام فقط. عشر دقائق تقرّبك من نهاية اليوم ✨.'
    ],
  },
  streak: {
    titles: ['حافظ على سلسلتك', 'سلسلتك في خطر!', 'يوم واحد يحميك', 'وسام الأسبوع', 'انتبه'],
    bodies: [
      '🔥 انتبه! سلسلتك ({streak} أيام) في خطر. أنجز مهمة سريعة قبل منتصف الليل!',
      'لا تدع تعب اليوم يضيع إنجاز الأمس. مهمة واحدة تنقذ سلسلتك ⏰.',
      'سلسلتك {streak} أيام — لا تكسرها اليوم!',
      'غداً هو اليوم السابع! حافظ على حماسك لتحصل على شارة الأسبوع 🔥.',
      'يوم واحد يحمي سلسلة {streak} أيام. أنجز أي مهمة الآن.',
      'أنجزت {streak} يوماً متتالياً — هل تحطّمها اليوم؟ لا!',
      'السلسلة كنز: احمِ {streak} يوماً بتعبير بسيط اليوم 💎.',
      'اقتربت من الشارة — مهمة الليلة تكفي 🎖️.'
    ],
  },
  reengagement: {
    titles: ['افتقدناك', 'أين أنت؟', 'عد إلينا', 'المكان ينتظرك', 'لنلحق بالركب'],
    bodies: [
      'افتقدناك اليوم يا {name}! لديك مهام تنتظرك 📖.',
      '👋 أين أنت يا {name}؟ زملاؤك يتقدمون، لا تتأخر. لديك {missed_count} مهام فائتة.',
      'هل تواجه صعوبة؟ تذكّر لماذا بدأت. نحن هنا لدعمك 🤝.',
      '🚀 {name}، عودتك ستصنع الفارق! لنعوّض ما فات معاً.',
      'النجاح ليس ألا تسقط، بل أن تنهض بعد السقوط. عد الآن!',
      'مهمة واحدة اليوم تكفي لعودة القاع. لنبدأ من جديد 🌱.',
      'المهمة اليوم أهم من الكمال — عودتك تكفي.',
      'لديك {missed_count} مهام فائتة — لا داعي لإنهائها كلها، ابدأ بواحدة.'
    ],
  },
  content: {
    titles: ['محتوى جديد', 'ملف جديد', 'أُضيف حديثاً', 'مواد جديدة بانتظارك'],
    bodies: [
      '📚 تمت إضافة ملخص/ملف جديد في مادة {subject}. كن أول من يطّلع عليه!',
      '🆕 محتوى جديد بانتظارك في {subject}. لا تفوّته!',
      'ملخص {subject} وصل حديثاً — خمس دقائق تكفي لتعرف الجديد.',
      'أُضيفت مادة إلى {subject}. راجعها قبل أن تتراكم.',
      'في {subject} جديد — تذكّر أن المعلومة التي لا تُراجع تُنسى.',
      'محتوى {subject} الأول وصل — أجّلوه ولا تفوّته!'
    ],
  },
  achievement: {
    titles: ['إنجاز جديد!', 'مبروك!', 'وسام جديد', 'أداء رائع'],
    bodies: [
      'أكملت {count} مهمة 🎉 استمر في هذا الإيقاع!',
      'ممتاز! {count} مهمة منجزة — كل واحدة تقرّبك من هدفك.',
      'رائع! عدد مهامك المنجزة وصل إلى {count}. استمدّ هذا الإنجاز!',
      'أنجزت {count} مهمة — الفارق بين طالب وطالب متفوق هو الاستمرارية.',
      'وسام جديد باسمك 🏅 — استمر، القمة أقرب مما تظن.',
      '{count} مهمة… هذا ليس صدفة، هذا انضباط. احتفل 🎉'
    ],
  },
};

/* ══════════════════════════════════════════════════════════
   2. أدوات
   ══════════════════════════════════════════════════════════ */

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function firstName(fullName: string | null, email: string | null): string {
  if (fullName && fullName.trim()) return fullName.trim().split(' ')[0];
  if (email) return email.split('@')[0];
  return 'يا بطل';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/* ══════════════════════════════════════════════════════════
   3. الدالة
   ══════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    /* ── 1) الحماية: سرّ الـ cron أو أدمن/مشرف (للاختبار اليدوي) ── */
    const expected = Deno.env.get('CRON_SECRET') ||
      (await readVaultSecret(admin, 'cron_secret'));
    if (!expected) {
      return json({ error: 'CRON_SECRET is not configured' }, 500);
    }

    const provided = req.headers.get('x-cron-secret') || '';
    let authorized = provided === expected;
    let authReason = authorized ? 'cron-secret' : '';

    // ⭐ v4.3.0 — يسمح لزر الاختبار في التطبيق بتشغيل المحرّك يدوياً
    //   باستخدام JWT الأدمن/المشرف (بدون كشف cron_secret للعميل).
    if (!authorized) {
      const authHeader = req.headers.get('Authorization') || '';
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (bearer) {
        const { data: userData } = await admin.auth.getUser(bearer);
        if (userData?.user) {
          const { data: profile } = await admin
            .from('profiles')
            .select('role')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (profile && (profile.role === 'admin' || profile.role === 'moderator')) {
            authorized = true;
            authReason = 'admin-role';
          }
        }
      }
    }

    if (!authorized) {
      return json({ error: 'forbidden' }, 403);
    }
    console.info('[smart-engine] authorized via ' + authReason);

    const sender = await createSender();
    if (!sender) {
      return json({
        error:
          'FCM is not configured — add the FCM_SERVICE_ACCOUNT secret (or FCM_API_KEY) in the Edge Function settings',
      }, 500);
    }

    /* ── 2) جلب البيانات ── */
    const now = new Date();
    const today = dayKey(now);
    const hour = now.getUTCHours();

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email, full_name, fcm_token, notify_enabled, last_notification_at, created_at')
      .not('fcm_token', 'is', null);
    if (profilesError) throw profilesError;

    const { data: progress, error: progressError } = await admin
      .from('task_progress')
      .select('user_id, plan_date, subject, task_title, completed, completed_at');
    if (progressError) throw progressError;

    const { data: recentFiles } = await admin
      .from('files')
      .select('title, subjects')
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .limit(5);

    /* ── 3) حساب حالة كل مستخدم ── */
    const byUser = new Map<string, any[]>();
    for (const row of progress || []) {
      const list = byUser.get(row.user_id) || [];
      list.push(row);
      byUser.set(row.user_id, list);
    }

    const streaks = computeStreaks(progress || []);

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const logRows: any[] = [];

    for (const profile of profiles || []) {
      if (profile.notify_enabled === false) { skipped++; continue; }

      /* ⭐ خمول: لا نرسل أكثر من إشعار كل 4 ساعات */
      if (profile.last_notification_at) {
        const hoursSince = (Date.now() - new Date(profile.last_notification_at).getTime()) / 3600000;
        if (hoursSince < 4) { skipped++; continue; }
      }

      const rows = byUser.get(profile.id) || [];
      const todayRows = rows.filter((r) => r.plan_date === today);
      const todayDone = todayRows.filter((r) => r.completed).length;
      const todayTotal = todayRows.length;
      const missedCount = rows.filter((r) => r.plan_date && r.plan_date < today && !r.completed).length;
      const totalDone = rows.filter((r) => r.completed).length;
      const streak = streaks.get(profile.id) || 0;
      const lastActive = rows.reduce<string | null>((acc, r) => {
        if (!r.completed_at) return acc;
        if (!acc || r.completed_at > acc) return r.completed_at;
        return acc;
      }, null);

      const inactiveDays = lastActive
        ? Math.floor((now.getTime() - new Date(lastActive).getTime()) / 86400000)
        : Math.floor((now.getTime() - new Date(profile.created_at).getTime()) / 86400000);

      const vars = {
        name: firstName(profile.full_name, profile.email),
        streak,
        missed_count: missedCount,
        task_count: todayTotal,
        count: totalDone,
        subject: '',
      };

      /* ── 4) اختيار الفئة ── */
      let category: keyof typeof TEMPLATES | null = null;
      let subjectName = '';

      if (totalDone === 0 && inactiveDays <= 1) {
        category = 'onboarding';
      } else if (inactiveDays >= 7) {
        category = 'reengagement';
      } else if (inactiveDays >= 3) {
        category = 'reengagement';
      } else if (inactiveDays >= 1 && todayTotal === 0) {
        category = 'reengagement';
      } else if (hour >= 20 && todayDone === 0 && streak > 0) {
        category = 'streak';
      } else if (recentFiles && recentFiles.length) {
        const file = pick(recentFiles);
        subjectName = (file as any).subjects || '';
        if (subjectName) {
          category = 'content';
          vars.subject = subjectName;
        }
      }

      if (!category && todayTotal > 0) {
        category = 'agenda';
        if (todayDone >= todayTotal) {
          category = 'achievement';
        }
      }

      if (!category) {
        if (streak > 0) category = 'streak';
        else if (totalDone >= 3) category = 'achievement';
        else category = 'onboarding';
      }

      const templates = TEMPLATES[category];
      const title = fill(pick(templates.titles), vars);
      const body = fill(pick(templates.bodies), vars);

      const message: FcmMessage = {
        title,
        body,
        data: { category, target: 'index.html', source: 'smart-engine' },
      };

      const result = await sendBatch(sender, [profile.fcm_token], message, 1);
      sent += result.sent;
      failed += result.failed;

      logRows.push({
        user_id: profile.id,
        category,
        title,
        body,
        target: category,
        sent: result.sent > 0,
        error: result.failed ? 'failed' : null,
      });

      if (result.sent > 0) {
        try {
          await admin.from('profiles').update({ last_notification_at: new Date().toISOString() })
            .eq('id', profile.id);
        } catch (e) {
          console.warn('[smart-engine] could not update last_notification_at:', e);
        }
      }
    }

    /* ── 5) السجلّ ── */
    if (logRows.length) {
      try {
        await admin.from('notification_log').insert(logRows);
      } catch (e) {
        console.warn('[smart-engine] could not write the log:', e);
      }
    }

    return json({ ok: true, sent, failed, skipped, mode: sender.mode });
  } catch (e) {
    console.error('[smart-engine]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════
   4. دوال مساعدة
   ══════════════════════════════════════════════════════════ */

/** ⭐ يقرأ سرّاً من Supabase Vault */
async function readVaultSecret(admin: any, name: string): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('vault_read_secret_text', { secret_name: name });
    if (error) return null;
    return (data as string) || null;
  } catch (e) {
    return null;
  }
}

/**
 * ⭐ يحسب السلسلة: عدد الأيام المتتالية التي أنجز فيها المستخدم مهمة
 * (تنتهي اليوم أو أمس).
 */
function computeStreaks(rows: any[]): Map<string, number> {
  const daysByUser = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.completed || !row.user_id) continue;
    const day = row.completed_at
      ? dayKey(new Date(row.completed_at))
      : (row.plan_date ? String(row.plan_date).slice(0, 10) : null);
    if (!day) continue;
    const set = daysByUser.get(row.user_id) || new Set<string>();
    set.add(day);
    daysByUser.set(row.user_id, set);
  }

  const streaks = new Map<string, number>();
  const today = new Date();

  for (const [userId, days] of daysByUser) {
    let streak = 0;
    // ⭐ نبدأ من اليوم، وإن لم يكن نشطاً اليوم نبدأ من أمس.
    const cursor = new Date(today);
    if (!days.has(dayKey(cursor))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      if (!days.has(dayKey(cursor))) {
        streaks.set(userId, 0);
        continue;
      }
    }
    while (days.has(dayKey(cursor))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    streaks.set(userId, streak);
  }

  return streaks;
}
