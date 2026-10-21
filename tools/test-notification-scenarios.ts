// ============================================================
// tools/test-notification-scenarios.ts
// ------------------------------------------------------------
// ⭐⭐ Phase W10 — اختبار منطق المحرّك الذكي **قبل** النشر.
//
//   node tools/test-notification-scenarios.ts
//
// يغطّي:
//   • اختيار السيناريو الصحيح لكل حالة مستخدم (20 سيناريو)
//   • ساعات الصمت (الثابتة والمُتعلَّمة)
//   • فترات التهدئة (cooldown) والسقوف اليومية
//   • تفضيلات القنوات
//   • تركيب الرسالة (لا متغيّرات فارغة، لا عناوين مكرّرة)
//   • الروابط العميقة لكل سيناريو
// ============================================================

import {
  SCENARIOS,
  buildContext,
  composeMessage,
  isQuietHour,
  selectScenario,
  type LogRow,
  type ProfileRow,
  type ProgressRow,
  type UserContext,
} from '../supabase/functions/_shared/scenarios.ts';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, extra = '') {
  if (condition) {
    passed++;
    console.log('  ✅ ' + label);
  } else {
    failed++;
    console.log('  ❌ ' + label + (extra ? ' → ' + extra : ''));
  }
}

function section(title: string) {
  console.log('\n' + title);
}

const NOW = new Date('2026-10-21T12:00:00Z'); // الأربعاء 15:00 بتوقيت بغداد

/* ─────────────────────────────────────────────
   مصانع بيانات
   ───────────────────────────────────────────── */

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'u1',
    email: 'hasan@example.com',
    full_name: 'حسن الأحمد',
    fcm_token: 'token',
    notify_enabled: true,
    last_notification_at: null,
    created_at: '2026-10-01T00:00:00Z',
    timezone: 'Asia/Baghdad',
    notification_prefs: null,
    quiet_start: null,
    quiet_end: null,
    ...overrides,
  };
}

function row(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    user_id: 'u1',
    plan_date: '2026-10-21',
    task_id: 't1',
    subject: 'الفيزياء',
    task_title: 'مراجعة الفصل الثالث',
    completed: false,
    completed_at: null,
    ...overrides,
  };
}

function ctxOf(
  p: Partial<ProfileRow>,
  rows: ProgressRow[],
  logs: LogRow[] = [],
  goals: any[] = [],
  files: any[] = [],
): UserContext {
  return buildContext(profile(p), rows, goals, files, logs, NOW);
}

/* ─────────────────────────────────────────────
   1) حالات المستخدم
   ───────────────────────────────────────────── */

section('1) اختيار السيناريو لكل حالة مستخدم');

{
  // a brand new account (one hour old) => onboarding
  const fresh = profile({ created_at: new Date(NOW.getTime() - 3600000).toISOString() });
  const ctx = buildContext(fresh, [row({ user_id: 'u1' })], [], [], [], NOW);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('a new account => onboarding', !!sel && sel.scenario.id === 'onboarding', sel?.scenario.id);
}

{
  // an old account that never started => freshStart (no guilt, no late welcome)
  const ctx = ctxOf({}, [row()]);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('never started => freshStart', !!sel && sel.scenario.id === 'freshStart', sel?.scenario.id);
}

{
  // أول إنجاز ⇒ firstWin
  const ctx = ctxOf({}, [row({ completed: true, completed_at: '2026-10-21T10:00:00Z' })]);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('أول إنجاز ⇒ firstWin', !!sel && sel.scenario.id === 'firstWin', sel?.scenario.id);
}

{
  // سلسلة نشطة + لم يُنجز اليوم + مساء ⇒ streakRisk
  const rows: ProgressRow[] = [
    row({ plan_date: '2026-10-20', completed: true, completed_at: '2026-10-20T10:00:00Z' }),
    row({ plan_date: '2026-10-19', completed: true, completed_at: '2026-10-19T10:00:00Z' }),
    row({ plan_date: '2026-10-18', completed: true, completed_at: '2026-10-18T10:00:00Z' }),
    row({ plan_date: '2026-10-21', task_id: 't2' }),
  ];
  const ctx = ctxOf({}, rows);
  // الساعة 15:00 → ليست ≥ 18، فنجبر الساعة manually عبر localHour
  ctx.localHour = 21;
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('سلسلة في خطر (مساء) ⇒ streakRisk', !!sel && sel.scenario.id === 'streakRisk', sel?.scenario.id);
}

{
  // وسام: سلسلة = 7 أيام ⇒ streakMilestone
  const rows: ProgressRow[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    rows.push(row({ plan_date: key, completed: true, completed_at: d.toISOString(), task_id: 't' + i }));
  }
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('سلسلة 7 أيام ⇒ streakMilestone', !!sel && sel.scenario.id === 'streakMilestone', sel?.scenario.id);
}

{
  // نصف الطريق: 1 من 2 ⇒ halfway
  const rows: ProgressRow[] = [
    row({ task_id: 'a', completed: true, completed_at: '2026-10-20T08:00:00Z' }),
    row({ task_id: 'a2', completed: true, completed_at: '2026-10-21T08:00:00Z' }),
    row({ task_id: 'b' }),
    row({ task_id: 'c' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('نصف مهام اليوم ⇒ halfway', !!sel && sel.scenario.id === 'halfway', sel?.scenario.id);
}

{
  // أنهى كل المهام ⇒ achievement
  const rows: ProgressRow[] = [
    row({ task_id: 'a', completed: true, completed_at: '2026-10-21T08:00:00Z' }),
    row({ task_id: 'b', completed: true, completed_at: '2026-10-21T09:00:00Z' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('إنجاز كل المهام ⇒ achievement', !!sel && sel.scenario.id === 'achievement', sel?.scenario.id);
}

{
  // الغياب 4 أيام مع سلسلة سابقة ⇒ comeback
  const rows: ProgressRow[] = [
    row({ plan_date: '2026-10-10', completed: true, completed_at: '2026-10-10T10:00:00Z' }),
    row({ plan_date: '2026-10-11', completed: true, completed_at: '2026-10-11T10:00:00Z' }),
    row({ plan_date: '2026-10-12', completed: true, completed_at: '2026-10-12T10:00:00Z' }),
    row({ plan_date: '2026-10-21', task_id: 't2' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('غياب 4 أيام ⇒ comeback', !!sel && sel.scenario.id === 'comeback', sel?.scenario.id);
}

{
  // هدف 80% ⇒ goalMilestone
  const rows: ProgressRow[] = [
    row({ task_id: 'a', completed: true, completed_at: '2026-10-20T08:00:00Z' }),
    row({ task_id: 'b', completed: true, completed_at: '2026-10-21T08:00:00Z' }),
  ];
  const goals = [{
    user_id: 'u1',
    title: 'مراجعة Pathology',
    completed: false,
    target_value: 100,
    current_value: 80,
    unit: 'صفحة',
    deadline: null,
  }];
  const ctx = ctxOf({}, rows, [], goals);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('هدف 80٪ ⇒ goalMilestone', !!sel && sel.scenario.id === 'goalMilestone', sel?.scenario.id);
}

{
  // موعد بعد يومين ⇒ goalDue
  const rows: ProgressRow[] = [
    row({ task_id: 'a', completed: true, completed_at: '2026-10-20T08:00:00Z' }),
    row({ task_id: 'b', completed: true, completed_at: '2026-10-21T08:00:00Z' }),
  ];
  const goals = [{
    user_id: 'u1',
    title: 'تسليم بحث',
    completed: false,
    target_value: 10,
    current_value: 2,
    unit: 'صفحة',
    deadline: '2026-10-23',
  }];
  const ctx = ctxOf({}, rows, [], goals);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('موعد قريب ⇒ goalDue', !!sel && sel.scenario.id === 'goalDue', sel?.scenario.id);
}

{
  // زخم: نشاط في يومين من آخر ثلاثة ⇒ momentum
  const rows: ProgressRow[] = [
    row({ task_id: 'a', plan_date: '2026-10-20', completed: true, completed_at: '2026-10-20T10:00:00Z' }),
    row({ task_id: 'b', plan_date: '2026-10-19', completed: true, completed_at: '2026-10-19T10:00:00Z' }),
    row({ task_id: 'c', plan_date: '2026-10-21' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('زخم في آخر 3 أيام ⇒ momentum', !!sel && sel.scenario.id === 'momentum', sel?.scenario.id);
}

{
  // مستخدم بلا سبب واضح ⇒ لا إشعار
  // نشاط في الماضي، ولا شيء اليوم ولا معلّق ⇒ لا سبب ⇒ لا إشعار
  const rows: ProgressRow[] = [
    row({ task_id: 'a', plan_date: '2026-10-20', completed: true, completed_at: '2026-10-20T08:00:00Z' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('بلا سبب ⇒ لا إشعار', sel === null, sel?.scenario.id);
}

/* ─────────────────────────────────────────────
   2) ساعات الصمت
   ───────────────────────────────────────────── */

section('2) ساعات الصمت');

{
  const ctx = ctxOf({}, [row()]);
  ctx.localHour = 3;
  check('الساعة 3 فجراً ⇒ صمت', isQuietHour(ctx));
  ctx.localHour = 2;
  ctx.quietStart = 23;
  ctx.quietEnd = 6;
  check('صمت مخصّص (23→6) ⇒ صمت', isQuietHour(ctx));
  ctx.localHour = 12;
  check('الساعة 12 ظهراً ⇒ ليس صمتاً', !isQuietHour(ctx));
}

{
  // صمت متعلَّم: أنجز دائماً في الصباح → الساعة 4 فجراً صمت
  const rows: ProgressRow[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(NOW);
    d.setUTCDate(d.getUTCDate() - i);
    rows.push(row({
      plan_date: d.toISOString().slice(0, 10),
      completed: true,
      completed_at: d.toISOString(),
      task_id: 'x' + i,
    }));
  }
  const ctx = ctxOf({}, rows);
  ctx.localHour = 4;
  check('صمت مُتعلَّم (لا ينجز فجراً) ⇒ صمت', isQuietHour(ctx));
}

/* ─────────────────────────────────────────────
   3) التهدئة والسقوف
   ───────────────────────────────────────────── */

section('3) فترات التهدئة والسقوف اليومية');

{
  const logs: LogRow[] = [{
    user_id: 'u1',
    category: 'agenda',
    title: 'مهام اليوم',
    created_at: new Date(NOW.getTime() - 30 * 60000).toISOString(),
  }];
  const ctx = ctxOf({}, [row()]);
  ctx.localHour = 10;
  const sel = selectScenario(ctx, { now: NOW, logs });
  check('agenda أُرسل قبل 5 ساعات ⇒ لا يُختار', !sel || sel.scenario.id !== 'agenda', sel?.scenario.id);
}

{
  // ⭐ W12 — السقف صار 6 يومياً، والعدّ يحسب **الإشعارات الذكية فقط**.
  const logs: LogRow[] = Array.from({ length: 6 }).map((_, i) => ({
    user_id: 'u1',
    category: i < 5 ? 'agenda' : 'streakRisk',
    title: 't' + i,
    created_at: new Date(NOW.getTime() - i * 3600000).toISOString(),
  }));
  const ctx = ctxOf({}, [row()]);
  ctx.sentToday = 6;
  const sel = selectScenario(ctx, { now: NOW, logs });
  check('6 إشعارات ذكية اليوم ⇒ السقف اليومي (6)', sel === null, sel?.scenario.id);
}

{
  // ⭐ التذكيرات الثابتة (٨ص/٨م) وإشعارات التحديث لا تُحتسب في السقف.
  const logs: LogRow[] = Array.from({ length: 9 }).map((_, i) => ({
    user_id: 'u1',
    category: i % 3 === 0 ? 'reminder_8am' : (i % 3 === 1 ? 'update' : 'admin'),
    title: 't' + i,
    created_at: new Date(NOW.getTime() - i * 3600000).toISOString(),
  }));
  const ctx = ctxOf({}, [row()]);
  const sel = selectScenario(ctx, { now: NOW, logs });
  check('التذكيرات الثابتة لا تستهلك السقف', !!sel, sel?.scenario.id);
}

{
  // ⭐ الحدث هو الأساس: بلا حدث حقيقي ⇒ صفر إشعارات (السقف سقفٌ لا حصة).
  const ctx = ctxOf({}, [
    row({ task_id: 'a', plan_date: '2026-10-20', completed: true, completed_at: '2026-10-20T08:00:00Z' }),
  ]);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('بلا حدث ⇒ لا إشعار (السقف ليس حصة)', sel === null, sel?.scenario.id);
}

{
  const ctx = ctxOf({ notification_prefs: { tasks: false, streak: false, content: false, updates: true } as any }, [row()]);
  const sel = selectScenario(ctx, { now: NOW, logs: [] });
  check('تفضيلات المستخدم تُحترم', !sel || sel.scenario.channel === 'medapp_updates', sel?.scenario.channel);
}

/* ─────────────────────────────────────────────
   4) تركيب الرسالة
   ───────────────────────────────────────────── */

section('4) تركيب الرسالة والروابط العميقة');

{
  const rows: ProgressRow[] = [
    row({ task_id: 'a', completed: true, completed_at: '2026-10-21T08:00:00Z' }),
    row({ task_id: 'b' }),
  ];
  const ctx = ctxOf({}, rows);
  const sel = selectScenario(ctx, { now: NOW, logs: [], forceScenario: 'agenda' });
  const msg = composeMessage(ctx, sel!.scenario, sel!.reason);
  check('العنوان غير فارغ', msg.title.trim().length > 0);
  check('النصّ غير فارغ', msg.body.trim().length > 0);
  check('لا متغيّرات فارغة {}', !msg.title.includes('{') && !msg.body.includes('{'), msg.title + ' | ' + msg.body);
  check('الرابط العميق pre12://', msg.url.startsWith('pre12://'), msg.url);
  check('الوجهة القديمة موجودة', msg.target.includes('.html'), msg.target);
  check('بيانات المهمة مرفقة', msg.data.task_id === 'b', JSON.stringify(msg.data));
  check('المعرّف في البيانات', msg.data.scenario === 'agenda');
}

{
  // منع تكرار نفس العنوان
  const ctx = ctxOf({}, [row()]);
  const scenario = SCENARIOS.find((s) => s.id === 'onboarding')!;
  // عنوان واحد استُخدم مؤخراً ⇒ يجب اختيار عنوان آخر
  ctx.recentTitles = [scenario.titles[0]];
  const msg = composeMessage(ctx, scenario);
  check('لا عنوان مكرّر', msg.title !== scenario.titles[0], msg.title);
}

{
  // كل السيناريوهات تُركّب رسالة سليمة
  let broken = 0;
  for (const scenario of SCENARIOS) {
    const ctx = ctxOf({}, [row()]);
    const msg = composeMessage(ctx, scenario);
    if (!msg.title || !msg.body || msg.title.includes('{') || msg.body.includes('{')) broken++;
    if (!msg.url.startsWith('pre12://')) broken++;
  }
  check('كل السيناريوهات تُنتج رسالة سليمة (' + SCENARIOS.length + ')', broken === 0, broken + ' broken');
}

/* ─────────────────────────────────────────────
   5) فحص شامل: لا سيناريو بلا قناة
   ───────────────────────────────────────────── */

section('5) فحص الكتالوج');

{
  const ids = new Set(SCENARIOS.map((s) => s.id));
  check('لا معرّف مكرّر', ids.size === SCENARIOS.length);
  check('كل السيناريوهات لها عناوين', SCENARIOS.every((s) => s.titles.length > 0));
  check('كل السيناريوهات لها نصوص', SCENARIOS.every((s) => s.bodies.length > 0));
  check('كل السيناريوهات لها قناة', SCENARIOS.every((s) => !!s.channel));
  check('كل السيناريوهات لها إجراء', SCENARIOS.every((s) => !!s.action));
  check('عدد السيناريوهات ≥ 20', SCENARIOS.length >= 20, String(SCENARIOS.length));
  const channels = new Set(SCENARIOS.map((s) => s.channel));
  check('ثلاث قنوات للمحرّك (updates للتحديثات)', channels.size === 3, Array.from(channels).join(','));
  check('كل السيناريوهات لا تستخدم قناة التحديثات', !channels.has('medapp_updates'));
}

/* ─────────────────────────────────────────────
   6) ⭐⭐⭐ Phase W17 — سيناريو «طلب الألبوم» (حدث فوري)
   ───────────────────────────────────────────── */

section('6) طلب الألبوم (Phase W17)');

{
  const album = SCENARIOS.find((s) => s.id === 'albumRequest');
  check('السيناريو موجود', !!album);

  if (album) {
    check('لا يُختار في المسار المجدول (شرطه albumRequest)',
      album.when(ctxOf({}, [row()])) === false);

    const ctx = ctxOf({}, [row()]);
    ctx.albumRequest = {
      requestId: 'r1',
      albumId: 'album-123',
      albumName: 'ألبوس محاضراتي',
      requesterName: 'حسن'
    };

    check('يُختار حين يوجد طلب', album.when(ctx) === true);

    const msg = composeMessage(ctx, album, 'طلب إضافة صورة');
    check('العنوان محدّد', msg.title === '📸 طلب جديد', msg.title);
    check(
      'النصّ كما هو مطلوب حرفياً',
      msg.body === "📸 طلب جديد: يريد حسن إضافة صورة إلى ألبومك 'ألبوس محاضراتي'.",
      msg.body
    );
    check('الوجهة = صفحة الألبوم', msg.target === 'my-lectures.html?album=album-123', msg.target);
    check('الرابط العميق = pre12://lectures', msg.url === 'pre12://lectures', msg.url);
    check('النصّ ثابت (لا عشوائية)',
      composeMessage(ctx, album).body === msg.body);

    // ⭐ لا متغيّرات فارغة
    check('لا متغيّر متبقٍ في النصّ', !msg.body.includes('{') && !msg.title.includes('{'), msg.body);
  }
}

console.log('\n' + '─'.repeat(52));
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل`);
if (failed > 0) process.exit(1);
