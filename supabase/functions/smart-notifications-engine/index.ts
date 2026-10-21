// ============================================================
// smart-notifications-engine — المحرّك الآلي الذكي (Phase W10)
// ------------------------------------------------------------
// ⭐⭐ يعمل كل 30 دقيقة عبر pg_cron → net.http_post
// ⭐ 21 سيناريو سياقي (لا قوالب عشوائية): كل رسالة لها *سبب* واضح.
// ⭐ يحترم: تفضيلات القنوات · ساعات الصمت (ثابتة ومُتعلَّمة) ·
//   فترات التهدئة لكل سيناريو · سقف 3 إشعارات/اليوم و12/أسبوع.
// ⭐ «لا إشعار بلا سبب»: إن لم يوجد سبب الآن ⇒ صمت.
//
// ⭐⭐ الأوضاع (للتشخيص من داخل التطبيق):
//   • { "mode": "run" }     → التشغيل الكامل (cron)
//   • { "mode": "preview" } → تركيب الرسائل **بدون** إرسال (معاينة)
//   • { "mode": "test", "scenario": "streakRisk" } → إرسال واحد إلى جهازك
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSender, sendBatch, takeInvalidTokens, type FcmMessage } from '../_shared/fcm.ts';
import {
  buildContext,
  composeMessage,
  selectScenario,
  scenarioCatalog,
  type ChannelId,
  type FileContext,
  type GoalRow,
  type LogRow,
  type ProfileRow,
  type ProgressRow,
} from '../_shared/scenarios.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** ⭐ الحدّ اليومي والأسبوعي (ضبط الانضباط). */
const DAILY_CAP = 3;
const WEEKLY_CAP = 12;

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
    /* ── 0) body ── */
    let payload: any = {};
    try {
      payload = await req.json();
    } catch (e) {
      payload = {};
    }
    const mode: string = String(payload.mode || 'run');
    const forcedScenario: string | null = payload.scenario ? String(payload.scenario) : null;

    /* ── 1) الحماية ── */
    const expected = Deno.env.get('CRON_SECRET') || (await readVaultSecret(admin, 'cron_secret'));
    if (!expected) return json({ error: 'CRON_SECRET is not configured' }, 500);

    const provided = req.headers.get('x-cron-secret') || '';
    let authorized = provided === expected;
    let authReason = authorized ? 'cron-secret' : '';

    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

    // ⭐ مشغّل (service role) — للتشخيص الآلي من الخادم.
    if (!authorized && bearer && serviceKey && bearer === serviceKey) {
      authorized = true;
      authReason = 'service-role';
    }

    // ⭐ أدمن/مشرف — لتشغيل المحرّك يدوياً من التطبيق.
    if (!authorized && bearer) {
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

    if (!authorized) return json({ error: 'forbidden' }, 403);
    console.info('[smart-engine] authorized via ' + authReason + ' · mode=' + mode);

    const now = new Date();

    /* ── 2) catalogue (للعميل) ── */
    if (mode === 'catalog') {
      return json({ ok: true, scenarios: scenarioCatalog(), channels: CHANNEL_META });
    }

    /* ── 3) sender ── */
    const sender = await createSender();
    if (!sender && mode !== 'preview') {
      return json({
        error:
          'FCM is not configured — add the FCM_SERVICE_ACCOUNT secret (or FCM_API_KEY) in the Edge Function settings',
      }, 500);
    }

    /* ── 4) data ── */
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select(
        'id, email, full_name, fcm_token, notify_enabled, last_notification_at, created_at, timezone, notification_prefs, quiet_start, quiet_end',
      )
      .not('fcm_token', 'is', null);
    if (profilesError) throw profilesError;

    const { data: progress, error: progressError } = await admin
      .from('task_progress')
      .select('user_id, plan_date, task_id, subject, task_title, completed, completed_at');
    if (progressError) throw progressError;

    const { data: goals, error: goalsError } = await admin
      .from('goals')
      .select('user_id, title, completed, target_value, current_value, unit, deadline');
    if (goalsError) console.warn('[smart-engine] no goals table:', goalsError.message);

    // ⭐ الملفات الجديدة (آخر 48 ساعة) — سيناريو «محتوى» و«محتوى يخصّك».
    const { data: recentFiles, error: filesError } = await admin
      .from('files')
      .select('id, title, subject_id, created_at')
      .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(8);
    if (filesError) console.warn('[smart-engine] no files:', filesError.message);

    const subjectIds = Array.from(
      new Set((recentFiles || []).map((f: any) => f.subject_id).filter(Boolean)),
    ) as string[];
    const subjectById = new Map<string, { id: string; name: string; slug: string }>();
    if (subjectIds.length) {
      const { data: subjects } = await admin
        .from('subjects')
        .select('id, name, slug')
        .in('id', subjectIds);
      for (const subject of subjects || []) subjectById.set(subject.id, subject as any);
    }

    const filesByUser: FileContext[] = [];
    for (const file of recentFiles || []) {
      const subject = subjectById.get(file.subject_id);
      if (!subject) continue;
      filesByUser.push({
        title: String(file.title || ''),
        subjectId: subject.id,
        subjectName: subject.name,
        subjectSlug: subject.slug,
        createdAt: String(file.created_at || ''),
      });
    }

    /* ── 5) سجلّ الإشعارات السابقة (للمنع من التكرار + الكواب) ── */
    const { data: recentLogs } = await admin
      .from('notification_log')
      .select('user_id, category, title, created_at')
      .order('created_at', { ascending: false })
      .limit(400);

    const logsByUser = new Map<string, LogRow[]>();
    for (const log of recentLogs || []) {
      const list = logsByUser.get(log.user_id) || [];
      list.push({
        user_id: log.user_id,
        category: log.category,
        title: log.title,
        created_at: log.created_at,
      } as LogRow);
      logsByUser.set(log.user_id, list);
    }

    /* ── 6) the loop ── */
    const progressByUser = new Map<string, ProgressRow[]>();
    for (const row of (progress || []) as ProgressRow[]) {
      const list = progressByUser.get(row.user_id) || [];
      list.push(row);
      progressByUser.set(row.user_id, list);
    }

    const goalsByUser = new Map<string, GoalRow[]>();
    for (const goal of (goals || []) as GoalRow[]) {
      const list = goalsByUser.get(goal.user_id) || [];
      list.push(goal);
      goalsByUser.set(goal.user_id, list);
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const logRows: any[] = [];
    const previews: any[] = [];

    for (const profile of profiles || []) {
      const p = profile as unknown as ProfileRow;
      const ctx = buildContext(
        p,
        progressByUser.get(p.id) || [],
        goalsByUser.get(p.id) || [],
        filesByUser,
        logsByUser.get(p.id) || [],
        now,
      );
      const userLogs = logsByUser.get(p.id) || [];

      const selection = selectScenario(ctx, {
        now,
        logs: userLogs,
        forceScenario: forcedScenario,
        ignoreLimits: mode === 'preview' || mode === 'test',
      });

      if (!selection) {
        skipped++;
        continue;
      }

      const message = composeMessage(ctx, selection.scenario, selection.reason);

      // ⭐ أزرار الإجراء تُرسل ضمن البيانات (FCM v1 لا يدعمها في الإشعار).
      const actions = selection.scenario.allowTaskAction && ctx.pendingTask
        ? [
            { title: 'تم الإنجاز', action: 'mark_done' },
            { title: 'لاحقاً', action: 'later' },
          ]
        : undefined;

      const fcmMessage: FcmMessage = {
        title: message.title,
        body: message.body,
        data: message.data,
        channelId: message.channel as ChannelId,
        ...(actions ? { actions } : {}),
      };

      if (mode === 'preview') {
        previews.push({
          user: p.email,
          scenario: message.scenario,
          channel: message.channel,
          title: message.title,
          body: message.body,
          action: message.action,
          url: message.url,
          target: message.target,
          reason: message.reason,
          context: {
            streak: ctx.streak,
            todayDone: ctx.todayDone,
            todayTotal: ctx.todayTotal,
            missed: ctx.missedCount,
            inactiveDays: ctx.inactiveDays,
            localHour: ctx.localHour,
            sentToday: ctx.sentToday,
          },
        });
        continue;
      }

      if (mode === 'test') {
        // ⭐ إرسال واحد إلى هذا الجهاز فقط.
        if (!ctx.notificationsEnabled) {
          skipped++;
          continue;
        }
        const targetToken = String(payload.token || p.fcm_token || '');
        if (!targetToken) {
          skipped++;
          continue;
        }
        const ok = await sendOne(sender!, targetToken, fcmMessage);
        if (ok) sent++; else failed++;
        logRows.push({
          user_id: p.id,
          category: message.scenario,
          scenario: message.scenario,
          channel: message.channel,
          title: message.title,
          body: message.body,
          target: message.target,
          payload: message.data,
          reason: message.reason + ' (test)',
          sent: ok,
          error: ok ? null : 'failed',
        });
        if (ok) {
          await admin
            .from('profiles')
            .update({ last_notification_at: new Date().toISOString() })
            .eq('id', p.id);
        }
        continue;
      }

      /* ── 7) الإرسال الحقيقي ── */
      const result = await sendBatch(sender!, [p.fcm_token!], fcmMessage, 1);
      sent += result.sent;
      failed += result.failed;

      // ⭐ رموز لم تُسجَّل anymore → امسحها.
      try {
        const invalid = takeInvalidTokens();
        if (invalid.includes(p.fcm_token!)) {
          await admin.from('profiles').update({ fcm_token: null }).eq('id', p.id);
          console.warn('[smart-engine] cleared a stale FCM token for ' + p.email);
        }
      } catch (e) {
        console.warn('[smart-engine] could not clear the stale token:', e);
      }

      logRows.push({
        user_id: p.id,
        category: message.scenario,
        scenario: message.scenario,
        channel: message.channel,
        title: message.title,
        body: message.body,
        target: message.target,
        payload: message.data,
        reason: message.reason,
        sent: result.sent > 0,
        error: result.failed ? 'failed' : null,
      });

      if (result.sent > 0) {
        try {
          await admin
            .from('profiles')
            .update({ last_notification_at: new Date().toISOString() })
            .eq('id', p.id);
        } catch (e) {
          console.warn('[smart-engine] could not update last_notification_at:', e);
        }
      }
    }

    /* ── 8) السجلّ ── */
    if (logRows.length) {
      try {
        await admin.from('notification_log').insert(logRows);
      } catch (e) {
        console.warn('[smart-engine] could not write the log:', e);
      }
    }

    if (mode === 'preview') {
      return json({
        ok: true,
        mode,
        previews,
        scenarios: scenarioCatalog(),
        channels: CHANNEL_META,
      });
    }

    return json({
      ok: true,
      mode,
      sent,
      failed,
      skipped,
      fcm: sender?.mode,
      caps: { daily: DAILY_CAP, weekly: WEEKLY_CAP },
    });
  } catch (e) {
    console.error('[smart-engine]', e);
    return json({ error: (e as Error).message || 'unexpected error' }, 500);
  }
});

/* ══════════════════════════════════════════════════════════
   helpers
   ══════════════════════════════════════════════════════════ */

const CHANNEL_META: { id: string; name: string; description: string }[] = [
  { id: 'medapp_tasks', name: 'المهام اليومية', description: 'خطة اليوم والمهام الفائتة والتذكيرات' },
  { id: 'medapp_streak', name: 'سلسلة الدراسة', description: 'حماية السلسلة والأوسمة والزخم' },
  { id: 'medapp_content', name: 'محتوى ومركّز', description: 'ملفات جديدة، مراجعة المساء، ملخّص الأسبوع' },
  { id: 'medapp_updates', name: 'تحديثات التطبيق', description: 'إصدارات جديدة وإعلانات مهمة' },
];

async function sendOne(
  sender: { send: (token: string, message: FcmMessage) => Promise<boolean> },
  token: string,
  message: FcmMessage,
): Promise<boolean> {
  try {
    return await sender.send(token, message);
  } catch (e) {
    console.warn('[smart-engine] the test send failed:', e);
    return false;
  }
}

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
