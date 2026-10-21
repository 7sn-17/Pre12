// ============================================================
// _shared/scenarios.ts — عقلّ المحرّك الذكي (منطق نقي)
// ------------------------------------------------------------
// ⭐⭐ Phase W10 — «The Perfection Strike»
//
// هذا الملف **منطق خالص**: لا Supabase ولا Deno ولا شبكة.
// قصده:
//   1) أن يكون قابلاً للاختبار محلياً (node) قبل النشر؛
//   2) أن تكون «شخصية» المستخدم (UserContext) مبنية من بيانات حقيقية؛
//   3) أن يكون اختيار السيناريو *مفسَّراً*: لكل قرار سبب مكتوب.
//
// ⭐ الفلسفة: لا إشعار بلا سبب. كل رسالة يجب أن تُجيب على سؤال:
//   «ما الذي تغيّر في حياة الطالب حتى الآن justifies هذه الرسالة الآن؟»
// ============================================================

export type ChannelId =
  | 'medapp_tasks'
  | 'medapp_streak'
  | 'medapp_content'
  | 'medapp_updates';

export interface ChannelPrefs {
  tasks: boolean;
  streak: boolean;
  content: boolean;
  updates: boolean;
}

export interface GoalContext {
  title: string;
  percent: number;
  unit: string;
  dueInDays: number | null;
  current: number;
  target: number;
}

export interface FileContext {
  title: string;
  subjectId: string;
  subjectName: string;
  subjectSlug: string;
  createdAt: string;
}

export interface SubjectStat {
  name: string;
  done: number;
  total: number;
}

export interface UserContext {
  userId: string;
  name: string;
  timezone: string;

  /** الساعة والدقيقة المحليتان (من profiles.timezone). */
  localHour: number;
  localMinute: number;
  /** 0 = الأحد … 6 = السبت. */
  weekday: number;
  isWeekend: boolean;

  createdAt: string;
  lastActiveAt: string | null;
  /** تاريخ أوّل إنجاز في حياة المستخدم (لاحتفال «أول إنجاز» في يومه فقط). */
  firstDoneAt: string | null;
  inactiveDays: number;

  streak: number;
  longestStreak: number;
  /** إنجازات الأيام السبعة الماضية (الأقدم → الأحدث). */
  last7Days: number[];
  weeklyRate: number;

  todayTotal: number;
  todayDone: number;
  todayPending: number;
  missedCount: number;
  totalDone: number;
  /** أول مهمة معلّقة اليوم (لزر «تم الإنجاز»). */
  pendingTask: { id: string; date: string; title: string; subject: string } | null;

  subjects: SubjectStat[];
  strongestSubject: string | null;
  weakestSubject: string | null;

  goals: GoalContext[];
  nearGoal: GoalContext | null;
  dueGoal: GoalContext | null;

  newFiles: FileContext[];
  contentForTopSubject: FileContext | null;

  prefs: ChannelPrefs;
  notificationsEnabled: boolean;

  /** الفئات التي أُرسلت مؤخراً (لمنع التكرار). */
  recentCategories: string[];
  /** العناوين التي أُرسلت مؤخراً (لمنع تكرار نفس الجملة). */
  recentTitles: string[];

  sentToday: number;
  sentThisWeek: number;
  /** الساعة التي اعتاد المستخدم أن ينجز فيها (متعلَّمة من سلوكه). */
  typicalActiveHour: number | null;
  quietStart: number | null;
  quietEnd: number | null;
}

export interface ScenarioVarContext {
  ctx: UserContext;
}

export interface Scenario {
  id: string;
  channel: ChannelId;
  /** الأهمّ أولاً. */
  priority: number;
  /** أقلّ فاصل زمني بين رسالتين من هذا السيناريو (ساعات). */
  cooldownHours: number;
  /** أقصى عدد في اليوم. */
  dailyCap: number;
  /** وزن الاختيار العشوائي بين السيناريوهات المتساوية. */
  weight: number;
  /** هل يناسب تفضيلات المستخدم؟ */
  respectsPrefs: boolean;
  /** الشرط الذي يحدّد صلاحية السيناريو. */
  when: (ctx: UserContext) => boolean;
  titles: string[];
  bodies: string[];
  /** متغيّرات إضافية للنصّ. */
  vars?: (ctx: UserContext) => Record<string, string | number>;
  /** الإجراء العميق (pre12://). */
  action: string;
  /** الوجهة (مسار قديم + hash) — للتوافق مع الإصدارات الأقدم. */
  target: (ctx: UserContext) => string;
  /** هل يقبل هذا السيناريو زرّ «تم الإنجاز»؟ */
  allowTaskAction?: boolean;
}

export interface ComposedMessage {
  scenario: string;
  channel: ChannelId;
  title: string;
  body: string;
  action: string;
  url: string;
  target: string;
  data: Record<string, string>;
  reason: string;
}

/* ══════════════════════════════════════════════════════════
   أدوات مساعدة
   ══════════════════════════════════════════════════════════ */

export function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function localHour(date: Date, timezone: string | null): number {
  const tz = String(timezone || '').trim();
  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: tz,
      });
      const parts = formatter.formatToParts(date);
      const hourPart = parts.find((p) => p.type === 'hour');
      if (hourPart) {
        const hour = parseInt(hourPart.value, 10);
        if (!isNaN(hour)) return hour % 24;
      }
    } catch (e) {
      /* منطقة زمنية غير معروفة → UTC */
    }
  }
  return date.getUTCHours();
}

/** 0 = الأحد … 6 = السبت (توقيت المستخدم). */
export function localWeekday(date: Date, timezone: string | null): number {
  const tz = String(timezone || '').trim();
  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: tz,
      });
      const names: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      };
      const part = formatter.formatToParts(date).find((p) => p.type === 'weekday');
      if (part && names[part.value] !== undefined) return names[part.value];
    } catch (e) {
      /* fallback */
    }
  }
  return date.getUTCDay();
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function firstName(fullName: string | null, email: string | null): string {
  if (fullName && fullName.trim()) return fullName.trim().split(' ')[0];
  if (email) return email.split('@')[0];
  return 'بطل';
}

/** عمر الحساب بالأيام (لتمييز المستخدم الجديد فعلاً). */
export function daysSince(iso: string, _inactiveDays: number): number {
  try {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  } catch (e) {
    return 999;
  }
}

export function isWeekend(weekday: number): boolean {
  return weekday === 5 || weekday === 6; // الجمعة والسبت
}

/** اسم الشارة حسب طول السلسلة. */
export function streakBadge(streak: number): string {
  if (streak >= 100) return 'أسطورة الإنجاز';
  if (streak >= 30) return 'بطل الشهر';
  if (streak >= 21) return 'بطل الأسابيع';
  if (streak >= 14) return 'نجم الانتظام';
  if (streak >= 7) return 'فارس الأسبوع';
  if (streak >= 3) return 'صاحب العادة';
  return 'البداية';
}

/* ══════════════════════════════════════════════════════════
   1) سياق المستخدم
   ══════════════════════════════════════════════════════════ */

export interface ProgressRow {
  user_id: string;
  plan_date: string;
  task_id: string;
  subject: string | null;
  task_title: string | null;
  completed: boolean;
  completed_at: string | null;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  fcm_token: string | null;
  notify_enabled: boolean | null;
  last_notification_at: string | null;
  created_at: string;
  timezone: string | null;
  notification_prefs: ChannelPrefs | null;
  quiet_start: number | null;
  quiet_end: number | null;
}

export interface GoalRow {
  user_id: string;
  title: string;
  completed: boolean;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  deadline: string | null;
}

export interface LogRow {
  user_id: string;
  category: string;
  title: string;
  created_at: string;
}

/** يجمع كل بيانات المستخدم في سياق واحد. */
export function buildContext(
  profile: ProfileRow,
  rows: ProgressRow[],
  goals: GoalRow[],
  files: FileContext[],
  logs: LogRow[],
  now: Date,
): UserContext {
  const today = dayKey(now);
  const userRows = rows.filter((r) => r.user_id === profile.id);
  const todayRows = userRows.filter((r) => r.plan_date === today);
  const todayDone = todayRows.filter((r) => r.completed).length;
  const todayTotal = todayRows.length;
  const missedCount = userRows.filter(
    (r) => r.plan_date && r.plan_date < today && !r.completed,
  ).length;
  const totalDone = userRows.filter((r) => r.completed).length;

  const streaks = computeStreaks(userRows, now);
  const last7 = lastSevenDays(userRows, now);

  const lastActive = userRows.reduce<string | null>((acc, r) => {
    if (!r.completed_at) return acc;
    if (!acc || r.completed_at > acc) return r.completed_at;
    return acc;
  }, null);

  const firstDoneAt = userRows.reduce<string | null>((acc, r) => {
    if (!r.completed_at) return acc;
    if (!acc || r.completed_at < acc) return r.completed_at;
    return acc;
  }, null);

  const inactiveDays = lastActive
    ? Math.floor((now.getTime() - new Date(lastActive).getTime()) / 86400000)
    : Math.floor((now.getTime() - new Date(profile.created_at).getTime()) / 86400000);

  /* ── المواد ── */
  const bySubject = new Map<string, { done: number; total: number }>();
  for (const row of userRows) {
    const name = String(row.subject || '').trim() || 'عام';
    const stat = bySubject.get(name) || { done: 0, total: 0 };
    stat.total++;
    if (row.completed) stat.done++;
    bySubject.set(name, stat);
  }
  const subjects: SubjectStat[] = Array.from(bySubject.entries())
    .map(([name, stat]) => ({ name, done: stat.done, total: stat.total }))
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));

  const strongestSubject = subjects.find((s) => s.done > 0)?.name || null;
  const weakestSubject = subjects.length
    ? subjects.slice().sort((a, b) => (a.done / Math.max(1, a.total)) - (b.done / Math.max(1, b.total)))[0].name
    : null;

  /* ── الأهداف ── */
  const goalContexts: GoalContext[] = goals
    .filter((g) => g.user_id === profile.id && !g.completed)
    .map((g) => {
      const target = Number(g.target_value) || 0;
      const current = Number(g.current_value) || 0;
      const percent = target > 0
        ? Math.max(0, Math.min(100, Math.round((current / target) * 100)))
        : 0;
      let dueInDays: number | null = null;
      if (g.deadline) {
        const due = new Date(`${String(g.deadline).slice(0, 10)}T00:00:00Z`).getTime();
        dueInDays = Math.round((due - now.getTime()) / 86400000);
      }
      return {
        title: String(g.title || '').trim(),
        percent,
        unit: String(g.unit || '').trim(),
        dueInDays,
        current,
        target,
      };
    });

  const nearGoal = goalContexts
    .filter((g) => g.percent >= 70 && g.percent < 100)
    .sort((a, b) => b.percent - a.percent)[0] || null;
  const dueGoal = goalContexts
    .filter((g) => g.dueInDays !== null && g.dueInDays <= 2)
    .sort((a, b) => (a.dueInDays ?? 99) - (b.dueInDays ?? 99))[0] || null;

  /* ── المحتوى الجديد ── */
  const contentForTopSubject = strongestSubject
    ? files.find((f) => f.subjectName === strongestSubject) || null
    : null;

  /* ── السجلّ: منع التكرار ── */
  const recent = logs.slice(0, 12);
  const recentCategories = recent.map((l) => l.category);
  const recentTitles = recent.map((l) => l.title);
  // ⭐⭐ W12 — العدّ يحسب **الإشعارات الذكية فقط**: تذكيرات الثامنة صباحاً
  //   والمساء تُجدوَل على الجهاز (ولا تمرّ من هنا)، وإشعارات التحديث
  //   والإدارة ليست «ذكية» أصلاً. فلا تأكل من سقف اليوم.
  const dayStart = now.getTime() - 86400000;
  const weekStart = now.getTime() - 7 * 86400000;
  const isSmart = (l: LogRow) => isSmartCategory(String(l.category || ''));
  const sentToday = logs.filter(
    (l) => isSmart(l) && new Date(l.created_at).getTime() >= dayStart,
  ).length;
  const sentThisWeek = logs.filter(
    (l) => isSmart(l) && new Date(l.created_at).getTime() >= weekStart,
  ).length;

  /* ── الساعة المعتادة ── */
  const hours = userRows
    .filter((r) => r.completed && r.completed_at)
    .map((r) => localHour(new Date(r.completed_at as string), profile.timezone));
  const typicalActiveHour = hours.length
    ? hours.sort((a, b) => a - b)[Math.floor(hours.length / 2)]
    : null;

  const prefs: ChannelPrefs = {
    tasks: true,
    streak: true,
    content: true,
    updates: true,
    ...(profile.notification_prefs || {}),
  } as ChannelPrefs;

  return {
    userId: profile.id,
    name: firstName(profile.full_name, profile.email),
    timezone: String(profile.timezone || 'Asia/Baghdad'),
    localHour: localHour(now, profile.timezone),
    localMinute: now.getUTCMinutes(),
    weekday: localWeekday(now, profile.timezone),
    isWeekend: isWeekend(localWeekday(now, profile.timezone)),
    createdAt: profile.created_at,
    lastActiveAt: lastActive,
    firstDoneAt,
    inactiveDays,
    streak: streaks.current,
    longestStreak: streaks.longest,
    last7Days: last7,
    weeklyRate: last7.length ? last7.filter((n) => n > 0).length / 7 : 0,
    todayTotal,
    todayDone,
    todayPending: Math.max(0, todayTotal - todayDone),
    missedCount,
    totalDone,
    pendingTask: pendingTaskOf(userRows, today),
    subjects,
    strongestSubject,
    weakestSubject,
    goals: goalContexts,
    nearGoal,
    dueGoal,
    newFiles: files,
    contentForTopSubject,
    prefs,
    notificationsEnabled: profile.notify_enabled !== false,
    recentCategories,
    recentTitles,
    sentToday,
    sentThisWeek,
    typicalActiveHour,
    quietStart: profile.quiet_start,
    quietEnd: profile.quiet_end,
  };
}

function pendingTaskOf(
  rows: ProgressRow[],
  today: string,
): { id: string; date: string; title: string; subject: string } | null {
  const pending = rows
    .filter((r) => !r.completed && r.plan_date && r.plan_date <= today)
    .sort((a, b) => String(a.plan_date).localeCompare(String(b.plan_date)));
  const first = pending[0];
  if (!first) return null;
  return {
    id: String(first.task_id || ''),
    date: String(first.plan_date || today),
    title: String(first.task_title || first.subject || 'مهمة'),
    subject: String(first.subject || ''),
  };
}

export function computeStreaks(
  rows: ProgressRow[],
  now: Date,
): { current: number; longest: number } {
  const days = new Set<string>();
  for (const row of rows) {
    if (!row.completed) continue;
    const day = row.completed_at
      ? dayKey(new Date(row.completed_at))
      : row.plan_date
        ? String(row.plan_date).slice(0, 10)
        : null;
    if (day) days.add(day);
  }

  const sorted = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    if (previous) {
      const diff = Math.round(
        (new Date(`${day}T00:00:00Z`).getTime() - new Date(`${previous}T00:00:00Z`).getTime()) /
          86400000,
      );
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    previous = day;
    if (run > longest) longest = run;
  }

  let current = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { current, longest };
}

function lastSevenDays(rows: ProgressRow[], now: Date): number[] {
  const out: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - i);
    const key = dayKey(day);
    out.push(
      rows.filter(
        (r) =>
          r.completed &&
          (r.completed_at ? dayKey(new Date(r.completed_at)) === key : String(r.plan_date).slice(0, 10) === key),
      ).length,
    );
  }
  return out;
}

/* ══════════════════════════════════════════════════════════
   2) كتالوج السيناريوهات
   ══════════════════════════════════════════════════════════ */

const tasksTarget = () => 'index.html#tasks';
const streakTarget = () => 'index.html#streak';

export const SCENARIOS: Scenario[] = [
  /* ───────────── 1) الترحيب ───────────── */
  {
    id: 'onboarding',
    channel: 'medapp_tasks',
    priority: 50,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 1,
    respectsPrefs: true,
    // ⭐ الترحيب للحساب الجديد فقط (أول يومين) — لا «ترحيب» بعد أسبوعين.
    when: (ctx) => ctx.totalDone === 0 && ctx.inactiveDays <= 1,
    titles: ['أهلاً بك في المنصة الطبية', 'رحلتك تبدأ الآن', 'خطوتك الأولى'],
    bodies: [
      'أهلاً بك يا {name} في المنصة الطبية! خطوتك الأولى اليوم 💪',
      'جاهز لأول مهمة؟ خمس دقائق فقط تكفي لتبدأ رحلتك 🚀',
      'كل طالب طب بدأ بمهمة واحدة. كن أنت ذلك الطالب ✅',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 1b) بداية جديدة (لم يبدأ بعد) ───────────── */
  {
    id: 'freshStart',
    channel: 'medapp_tasks',
    priority: 76,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    // ⭐ لا لوم، لا تذكير بالغياب: دعوة هادئة لبدء مهمة واحدة.
    when: (ctx) => ctx.totalDone === 0 && ctx.inactiveDays > 1,
    titles: ['ابدأ من الصفر — لا بأس', 'مهمة واحدة تكفي للبداية', 'ابدأ اليوم، ولو صغيرة'],
    bodies: [
      'لم تبدأ بعد؟ لا مشكلة — أنجز مهمة واحدة صغيرة اليوم فقط، والباقي غداً 🌱',
      'أصعب خطوة هي الأولى. خُذها بهدوء: خمس دقائق تكفي لتبدأ 📖',
      'لا خطة مثالية مطلوبة — بل مهمة واحدة اليوم. نبدأ؟ ⚡',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 2) أول إنجاز ───────────── */
  {
    id: 'firstWin',
    channel: 'medapp_streak',
    priority: 85,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    // ⭐ celebrates the first win *on the day it happens* — not weeks later.
    when: (ctx) =>
      ctx.totalDone === 1 &&
      !!ctx.firstDoneAt &&
      dayKey(new Date(ctx.firstDoneAt)) === dayKey(new Date()),
    titles: ['أول إنجاز! 🎉', 'أحسنت — خطوة واحدة تفعل الفرق', 'بداية حقيقية'],
    bodies: [
      'أنجزت أول مهمة لك يا {name}! هذه البداية التي يصنع منها عادة 🌱',
      'مهمة واحدة اليوم — لكن الأثر يتراكم. استمر 💪',
      'أول إنجاز محفوظ في سلسلتك. الغد أقوى 💎',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'streak',
    target: streakTarget,
  },

  /* ───────────── 3) خطر السلسلة ───────────── */
  {
    id: 'streakRisk',
    channel: 'medapp_streak',
    priority: 92,
    cooldownHours: 5,
    dailyCap: 2,
    weight: 4,
    respectsPrefs: true,
    when: (ctx) =>
      ctx.streak > 0 && ctx.todayDone === 0 && ctx.todayTotal > 0 && ctx.localHour >= 18,
    titles: ['حافظ على سلسلتك', 'سلسلتك في خطر!', 'يوم واحد يحميك'],
    bodies: [
      '🔥 سلسلتك ({streak} أيام) في خطر. أنجز مهمة سريعة قبل منتصف الليل!',
      'لا تدع تعب اليوم يضيع إنجاز الأمس — مهمة واحدة تنقذ سلسلتك ⏰',
      'سلسلتك {streak} أيام… لا تكسرها اليوم! يوم واحد يحميها 💎',
      'سلسلة {streak} يوماً من الانتظام تستحق الحماية — مهمة الليلة تكفي 🛡️',
    ],
    vars: (ctx) => ({ streak: ctx.streak, name: ctx.name }),
    action: 'streak',
    target: streakTarget,
    allowTaskAction: true,
  },

  /* ───────────── 4) وسام السلسلة ───────────── */
  {
    id: 'streakMilestone',
    channel: 'medapp_streak',
    priority: 88,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) =>
      [7, 14, 21, 30, 50, 100].includes(ctx.streak),
    titles: ['🏅 وسام جديد: {badge}', 'شارة تُستحق', 'إنجاز يُحتفل به'],
    bodies: [
      'وصلت إلى {streak} يوماً متتالياً — أنت {badge}! 🎖️',
      '{streak} أيام من الانتظام: {badge}. هذه ليست صدفة، بل عادة 📅',
      'وسام {badge} في جيبك — {streak} يوماً متتالياً. احتفل 🎉',
    ],
    vars: (ctx) => ({ streak: ctx.streak, badge: streakBadge(ctx.streak) }),
    action: 'streak',
    target: streakTarget,
  },

  /* ───────────── 5) الزخم ───────────── */
  {
    id: 'momentum',
    channel: 'medapp_streak',
    priority: 70,
    cooldownHours: 20,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) => {
      const last3 = ctx.last7Days.slice(-3);
      const activeDays = last3.filter((n) => n > 0).length;
      return activeDays >= 2 && ctx.todayPending > 0;
    },
    titles: ['أنت على موجة 🔥', 'الزخم في صالحك', 'استمر — أنت قريب'],
    bodies: [
      'أنجزت مهمة في {active_days} من آخر 3 أيام — الزخم معك الآن. أكمل موجتك 🚀',
      'ثلاثة أيام متتالية من العمل… ومهمتك اليوم هي الخطوة المتبقية الوحيدة. واصل 🌊',
      'موجتك مستمرة يا {name}! مهمة واحدة اليوم تُكملها 💨',
    ],
    vars: (ctx) => ({
      name: ctx.name,
      active_days: ctx.last7Days.slice(-3).filter((n) => n > 0).length,
    }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 6) في منتصف الطريق ───────────── */
  {
    id: 'halfway',
    channel: 'medapp_tasks',
    priority: 72,
    cooldownHours: 6,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) =>
      ctx.todayTotal >= 2 &&
      ctx.todayDone > 0 &&
      ctx.todayDone === Math.floor(ctx.todayTotal / 2),
    titles: ['أنت في منتصف الطريق!', 'نصف الطريق… واصل!', 'وصلت إلى المنتصف'],
    bodies: [
      'أنجزت نصف مهام اليوم ({completed_count} من {total_count}). الباقي أسهل! 💪',
      'نصف مهام اليوم منجزة — أنهيتَ الأصعب، يكفيك إكمال ما تبقّى 🔥',
      'المنتصف خلفك: {completed_count} من {total_count}. خطوة أخيرة وتُكمل ✨',
    ],
    vars: (ctx) => ({ completed_count: ctx.todayDone, total_count: ctx.todayTotal }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 7) مهام فائتة ───────────── */
  {
    id: 'missed',
    channel: 'medapp_tasks',
    priority: 64,
    cooldownHours: 8,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) => ctx.missedCount > 0 && ctx.todayPending > 0,
    titles: ['مهام فائتة', 'لديك مهام مؤجّلة', 'لا تتراكم المؤجّل'],
    bodies: [
      'لديك {missed_count} مهمة فائتة — خمس دقائق تكفي لتبدأ 📌',
      'مهامك المؤجّلة ({missed_count}) تنتظرك. ابدأ بالأهم منها الآن.',
      '{missed_count} مهمة متراكمة — امسح واحدة منها وستشعر براحة كبيرة ✨',
    ],
    vars: (ctx) => ({ missed_count: ctx.missedCount }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 8) أنهى كل مهام اليوم ───────────── */
  {
    id: 'achievement',
    channel: 'medapp_tasks',
    priority: 68,
    cooldownHours: 6,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) => ctx.todayTotal > 0 && ctx.todayDone >= ctx.todayTotal,
    titles: ['أنجزت كل مهام اليوم! 🎉', 'يوم مكتمل', 'بطلة اليوم'],
    bodies: [
      'أكملت {count} مهمة اليوم — أنت أسطورة 🏆',
      'ممتاز! {count} مهمة منجزة، كل واحدة تقرّبك من هدفك.',
      'يوم كامل منجَز يا {name} — تستحق أن تستريح الآن 🌿',
    ],
    vars: (ctx) => ({ count: ctx.todayTotal, name: ctx.name }),
    action: 'streak',
    target: streakTarget,
  },

  /* ───────────── 9) خطة الصباح ───────────── */
  {
    id: 'morningPlan',
    channel: 'medapp_tasks',
    priority: 72,
    cooldownHours: 8,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) =>
      ctx.localHour >= 5 && ctx.localHour < 10 && ctx.todayDone === 0 && ctx.todayTotal > 0,
    titles: ['صباح الخير', 'خطتك جاهزة', 'ابدأ اليوم بقاعدة واحدة'],
    bodies: [
      'صباح الخير يا {name} ☀️! لديك {task_count} مهام اليوم. ابدأ بالأهم.',
      'يوم جديد في الطب — {task_count} مهام بانتظارك. الأهمّ أولاً 🎯',
      'خمس دقائق من المراجعة الآن توفّر ساعة مساءً 📚',
    ],
    vars: (ctx) => ({ name: ctx.name, task_count: ctx.todayTotal }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 10) السهر (عناية بالنوم) ───────────── */
  {
    id: 'nightOwl',
    channel: 'medapp_tasks',
    priority: 60,
    cooldownHours: 10,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) =>
      (ctx.localHour >= 23 || ctx.localHour < 2) && ctx.todayPending > 0,
    titles: ['الساعة متأخرة', 'نومك جزء من أدائك', 'غداً يحتاج ذهناً مرتاحاً'],
    bodies: [
      'المهمة واحدة وتستحق نوماً — نومك القصير يخفض استيعابك غداً 🧠',
      'أنت على مقعد الدراسة وأنا أعرف أنك متعب. أنهِ مهمة واحدة فقط ثم نم 🌙',
      'ذاكرة الطالب تتّسع في النوم لا في السهر — احمِ سلسلتك بنوم جيد 💤',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 11) العودة القوية ───────────── */
  {
    id: 'comeback',
    channel: 'medapp_streak',
    priority: 86,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 4,
    respectsPrefs: true,
    when: (ctx) => ctx.totalDone > 0 && ctx.inactiveDays >= 3 && ctx.longestStreak >= 3,
    titles: ['سلسلتك ما زالت محفوظة', 'عدنا من جديد', 'العودة تبدأ بمهمة'],
    bodies: [
      'غيبت {days} أيام يا {name} — لا بأس. سلسلتك ({streak}) محفوظة، وعادة واحدة تكفي لعودتك 🌱',
      'العودة لا تحتاج خطة كاملة: مهمة واحدة اليوم تكفي. سلسلتك تنتظرك 💚',
      'بعد {days} يوماً من الغياب… أجمل ما في الطب أنه لا نهاية له. ابدأ من جديد 🌿',
    ],
    vars: (ctx) => ({ name: ctx.name, days: ctx.inactiveDays, streak: ctx.streak }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 12) إعادة التفعيل ───────────── */
  {
    id: 'reengagement',
    channel: 'medapp_tasks',
    priority: 74,
    cooldownHours: 12,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    // ⭐ «افتقدناك» لمن كان نشطاً ثم توقّف — لا لمن لم يبدأ أصلاً.
    when: (ctx) => ctx.totalDone > 0 && ctx.inactiveDays >= 2,
    titles: ['افتقدناك', 'أين أنت؟', 'المكان ينتظرك'],
    bodies: [
      'افتقدناك يا {name}! طلاب الطب لا يستسلمون — عد لمهامك الآن 📖',
      'مهمة واحدة اليوم تكفي. لا تطلّب الكمال، اطلب البداية 🤝',
      'خمس دقائق تكفي لتشعل سلسلتك من جديد ⚡',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },

  /* ───────────── 13) ملخّص الأسبوع ───────────── */
  {
    id: 'weeklyDigest',
    channel: 'medapp_content',
    priority: 58,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) =>
      (ctx.isWeekend || ctx.localHour >= 18) && ctx.totalDone >= 3,
    titles: ['ملخّص أسبوعك', 'كيف كان أسبوعك؟', 'حصيلة الأسبوع'],
    bodies: [
      'أسبوعك: {week_done} من 7 أيام نشِط، و{total_done} مهمة منجزة. {subject_note} 📊',
      'أنهيت {total_done} مهمة هذا الأسبوع — {subject_note}. استمر 💪',
      'حصيلة الأسبوع أمامك: {week_done}/7 أيام. المادة الأكثر إنجازاً: {subject_note} 🏅',
    ],
    vars: (ctx) => ({
      week_done: ctx.last7Days.filter((n) => n > 0).length,
      total_done: ctx.totalDone,
      subject_note: ctx.strongestSubject ? `الأكثر إنجازاً: ${ctx.strongestSubject}` : 'بدون مواد بعد',
    }),
    action: 'streak',
    target: streakTarget,
  },

  /* ───────────── 14) التركيز على مادة ضعيفة ───────────── */
  {
    id: 'subjectFocus',
    channel: 'medapp_content',
    priority: 56,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) =>
      !!ctx.weakestSubject && ctx.todayPending > 0 && ctx.weeklyRate > 0 && ctx.weeklyRate < 0.85,
    titles: ['تركيز اليوم: {subject}', 'مادة تحتاج انتباهك', 'ركّز حيث تتعثّر'],
    bodies: [
      '{subject} هي الأقل إنجازاً عندك هذا الأسبوع. خمس دقائق مراجعة تُنهيها 📖',
      'لا تترك أضعف مادة تأجّل: مراجعة قصيرة لـ{subject} اليوم أنفع من ساعتين غداً 🎯',
      'خطوة واحدة في {subject} تغيّر مذاكرك كلياً 💡',
    ],
    vars: (ctx) => ({ subject: ctx.weakestSubject || '' }),
    action: 'content',
    target: (ctx) => (ctx.weakestSubject ? 'index.html#tasks' : 'index.html'),
  },

  /* ───────────── 15) هدف على وشك الإنجاز ───────────── */
  {
    id: 'goalMilestone',
    channel: 'medapp_content',
    priority: 80,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) => !!ctx.nearGoal,
    titles: ['اقتربت من هدفك!', '{goal_title} — {goal_percent}٪', 'خطوة تفصلك عن الهدف'],
    bodies: [
      '«{goal_title}» وصل إلى {goal_percent}٪ — دفعة أخيرة تكفي 🎯',
      'بقي {goal_percent}٪ فقط من «{goal_title}». أنت أقرب مما تظن 💎',
      '{goal_percent}٪ من «{goal_title}»… أنهِ الباقي اليوم وستحتفل 🎉',
    ],
    vars: (ctx) => ({
      goal_title: ctx.nearGoal?.title || '',
      goal_percent: ctx.nearGoal?.percent || 0,
    }),
    action: 'goals',
    target: () => 'goals.html',
  },

  /* ───────────── 16) هدف على وشك الموعد ───────────── */
  {
    id: 'goalDue',
    channel: 'medapp_content',
    priority: 82,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) => !!ctx.dueGoal,
    titles: ['موعد «{goal_title}» يقترب', 'آخر فرصة لـ«{goal_title}»', 'بقي يومان على موعدك'],
    bodies: [
      'موعد «{goal_title}» بعد {due_days} يوم — часّه اليوم قبل أن يهرب ⏳',
      '{due_days} يوم على موعد «{goal_title}». عشرون دقيقة تكفي للعودة للمسار 🎯',
      'الموعد يقترب و«{goal_title}» ما زال ناقصاً — ابدأ الآن وليس غداً 📌',
    ],
    vars: (ctx) => ({
      goal_title: ctx.dueGoal?.title || '',
      due_days: ctx.dueGoal?.dueInDays ?? 0,
    }),
    action: 'goals',
    target: () => 'goals.html',
  },

  /* ───────────── 17) محتوى جديد ───────────── */
  {
    id: 'contentNew',
    channel: 'medapp_content',
    priority: 54,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) => ctx.newFiles.length > 0,
    titles: ['محتوى جديد', 'ملف جديد', 'أُضيف حديثاً'],
    bodies: [
      '📚 ملف جديد في {subject}. كن أول من يطّلع عليه!',
      'محتوى جديد في {subject} — خمس دقائق تكفي لتعرف الجديد.',
      'في {subject} جديد — تذكّر أن المعلومة التي لا تُراجع تُنسى 🧠',
    ],
    vars: (ctx) => ({ subject: ctx.newFiles[0]?.subjectName || '' }),
    action: 'content',
    target: (ctx) =>
      ctx.newFiles[0]
        ? `subject.html?subject=${encodeURIComponent(ctx.newFiles[0].subjectSlug)}`
        : 'all-files.html',
  },

  /* ───────────── 18) محتوى يخصّك ───────────── */
  {
    id: 'contentForYou',
    channel: 'medapp_content',
    priority: 60,
    cooldownHours: 24,
    dailyCap: 1,
    weight: 3,
    respectsPrefs: true,
    when: (ctx) => !!ctx.contentForTopSubject,
    titles: ['محتوى في مادتك المفضّلة', 'اخترنا لك', 'لأنك تتقن {subject}'],
    bodies: [
      'مادة جديدة في {subject} — المادة التي تتقنها، فستستفيد منها أكثر 🎯',
      'ملف جديد في {subject}. والمراجعة في المادة التي تتقنها تكون أسرع 🧠',
      'محتوى {subject} الجديد بانتظارك — عشر دقائق تكفي 📚',
    ],
    vars: (ctx) => ({ subject: ctx.contentForTopSubject?.subjectName || '' }),
    action: 'content',
    target: (ctx) =>
      ctx.contentForTopSubject
        ? `subject.html?subject=${encodeURIComponent(ctx.contentForTopSubject.subjectSlug)}`
        : 'all-files.html',
  },

  /* ───────────── 19) مراجعة المساء ───────────── */
  {
    id: 'eveningReview',
    channel: 'medapp_content',
    priority: 52,
    cooldownHours: 20,
    dailyCap: 1,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) =>
      ctx.localHour >= 19 && ctx.localHour < 23 && ctx.todayTotal > 0 && ctx.todayDone >= ctx.todayTotal,
    titles: ['راجع يومك بدقائق', 'مراجعة المساء', 'خمس دقائق قبل النوم'],
    bodies: [
      'أنهيت مهام اليوم — خمس دقائق مراجعة وستنام وأنت مطمئن 🌙',
      'راجع ملخصات اليوم الآن: الذاكرة تُثبَّت أثناء النوم 🧠',
      'بقي ٥ دقائق: خلّص مراجعة اليوم واصنع الفرق غداً ✨',
    ],
    vars: (ctx) => ({ name: ctx.name }),
    action: 'content',
    target: () => 'all-files.html',
  },

  /* ───────────── 20) تذكير نهاري ───────────── */
  {
    id: 'agenda',
    channel: 'medapp_tasks',
    priority: 40,
    cooldownHours: 5,
    dailyCap: 2,
    weight: 2,
    respectsPrefs: true,
    when: (ctx) =>
      ctx.localHour >= 9 && ctx.localHour < 20 && ctx.todayTotal > 0 && ctx.todayPending > 0,
    titles: ['مهام اليوم', 'تذكير سريع', 'وقت الانطلاق', 'جدولك جاهز'],
    bodies: [
      'لديك {task_count} مهام اليوم — ابدأ بنشاط 💪',
      '{task_count} مهام بانتظارك. ابدأ بالمهمة الأهم 🎯',
      'قاعدة اليوم: الأهم أولاً، ثم الباقي. عشر دقائق تكفي ⏳',
      'بقي {task_count} مهام — مهمة واحدة تقرّبك من نهاية اليوم ✨',
    ],
    vars: (ctx) => ({ task_count: ctx.todayPending, name: ctx.name }),
    action: 'tasks',
    target: tasksTarget,
    allowTaskAction: true,
  },
];

/* ══════════════════════════════════════════════════════════
   3) التQuiet hours + الكواب
   ══════════════════════════════════════════════════════════ */

/**
 * ⭐ ساعات الصمت:
 *   1) صمت ثابت بين 00:00 و 07:00 (ولا يُكلَّم الطالب في نومه)؛
 *   2) صمت مُتعلَّم: إن كان الطالب لم يُنجز شيئاً في هذه الساعة أبداً
 *      خلال آخر أسبوعين، فهذه ساعة صمت له أيضاً.
 */
/**
 * ⭐ معرّفات السيناريوهات الذكية — كل ما عداها لا يُحتسب في السقف
 *   (تذكيرات الثامنة صباحاً/المساء، إشعارات التحديث والإدارة).
 */
export function isQuietHour(ctx: UserContext): boolean {
  const hour = ctx.localHour;

  if (ctx.quietStart !== null && ctx.quietEnd !== null) {
    if (ctx.quietStart <= ctx.quietEnd) {
      if (hour >= ctx.quietStart && hour < ctx.quietEnd) return true;
    } else if (hour >= ctx.quietStart || hour < ctx.quietEnd) {
      return true;
    }
  }

  if (hour >= 0 && hour < 7) return true;

  // ⭐ الساعة التي لا ينجز فيها المستخدم شيئاً عادةً.
  if (
    ctx.typicalActiveHour !== null &&
    ctx.totalDone >= 3 &&
    Math.abs(hour - ctx.typicalActiveHour) > 6 &&
    (hour >= 1 && hour < 6)
  ) {
    return true;
  }

  return false;
}

/* ══════════════════════════════════════════════════════════
   4) اختيار السيناريو
   ══════════════════════════════════════════════════════════ */

/**
 * ⭐⭐ Phase W12 — the pacing ceilings.
 *
 * ⭐ IMPORTANT: a cap is a **ceiling, not a quota**. The engine only speaks
 * when a *real event* happens (a streak at risk, missed tasks, new content, a
 * goal near its deadline, a first win…). If nothing happened, it sends
 * **zero** notifications — the daily cap is never a target to fill.
 */
export const DAILY_CAP = 6;
export const WEEKLY_CAP = 30;

export interface SelectionOptions {
  now: Date;
  /** سجلّ الإشعارات السابقة (الأحدث أولاً) لتطبيق فترات التهدئة. */
  logs: LogRow[];
  /** تجاوز كل الفحوص (للاختبار اليدوي من لوحة التشخيص). */
  forceScenario?: string | null;
  /** تجاهل ساعات الصمت والكواب (معاينة). */
  ignoreLimits?: boolean;
}

export interface Selection {
  scenario: Scenario;
  reason: string;
}

/** هل أُرسل هذا السيناريو مؤخراً أكثر من اللازم؟ */
function cooldownBlocked(
  scenario: Scenario,
  logs: LogRow[],
  now: Date,
): boolean {
  const last = logs.find((l) => l.category === scenario.id);
  if (!last) return false;
  const hours = (now.getTime() - new Date(last.created_at).getTime()) / 3600000;
  return hours < scenario.cooldownHours;
}

function dailyCapReached(scenario: Scenario, logs: LogRow[], now: Date): boolean {
  const dayStart = now.getTime() - 86400000;
  const count = logs.filter(
    (l) => l.category === scenario.id && new Date(l.created_at).getTime() >= dayStart,
  ).length;
  return count >= scenario.dailyCap;
}

/**
 * يختار أفضل سيناريو لهذا المستخدم الآن.
 *
 * ⭐ القاعدة الذهبية: **لا إشعار بلا سبب**. إن لم ينجح أي سيناريو —
 *   لا نرسل شيئاً (أرسلنا 25 إشعاراً «افتقدناك» بلا داعٍ — تعلّمنا).
 */
export function selectScenario(
  ctx: UserContext,
  options: SelectionOptions,
): Selection | null {
  const { now, logs } = options;

  if (!ctx.notificationsEnabled) return null;

  if (!options.ignoreLimits) {
    if (isQuietHour(ctx)) return null;
    if (ctx.sentToday >= DAILY_CAP) return null;
    if (ctx.sentThisWeek >= WEEKLY_CAP) return null;
  }

  // ⭐ الاختبار اليدوي يتجاوز شرط الظهور: نريد معاينة أي سيناريو.
  if (options.forceScenario) {
    const forced = SCENARIOS.find((s) => s.id === options.forceScenario);
    if (!forced) return null;
    return { scenario: forced, reason: 'معاينة/اختبار يدوي' };
  }

  const candidates = SCENARIOS.filter((scenario) => {
    if (scenario.respectsPrefs && !prefsAllow(scenario.channel, ctx.prefs)) return false;
    if (!options.ignoreLimits) {
      if (cooldownBlocked(scenario, logs, now)) return false;
      if (dailyCapReached(scenario, logs, now)) return false;
    }
    try {
      return scenario.when(ctx);
    } catch (e) {
      return false;
    }
  });

  if (!candidates.length) return null;

  // ⭐ الأهمّ أولاً، ثم وزن عشوائي بين المتساوين.
  const topPriority = Math.max(...candidates.map((c) => c.priority));
  const top = candidates.filter((c) => c.priority === topPriority);
  const totalWeight = top.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosen = top[0];
  for (const candidate of top) {
    roll -= candidate.weight;
    if (roll <= 0) {
      chosen = candidate;
      break;
    }
  }

  return { scenario: chosen, reason: `أعلى أولوية (${topPriority})` };
}

function prefsAllow(channel: ChannelId, prefs: ChannelPrefs): boolean {
  switch (channel) {
    case 'medapp_tasks':
      return prefs.tasks !== false;
    case 'medapp_streak':
      return prefs.streak !== false;
    case 'medapp_content':
      return prefs.content !== false;
    case 'medapp_updates':
      return prefs.updates !== false;
    default:
      return true;
  }
}

/* ══════════════════════════════════════════════════════════
   5) تركيب الرسالة
   ══════════════════════════════════════════════════════════ */

export function composeMessage(
  ctx: UserContext,
  scenario: Scenario,
  reason = '',
): ComposedMessage {
  const vars: Record<string, string | number> = {
    name: ctx.name,
    streak: ctx.streak,
    task_count: ctx.todayPending,
    total_count: ctx.todayTotal,
    completed_count: ctx.todayDone,
    missed_count: ctx.missedCount,
    count: ctx.totalDone,
  };
  if (scenario.vars) Object.assign(vars, scenario.vars(ctx));

  // ⭐ novelty: لا نكرّر جملة استُخدمت مؤخراً — نقارن **النصّ النهائي**
  //   (وهو ما خُزّن في السجلّ) لا القالب الخام.
  const title = pickNovel(scenario.titles, vars, ctx.recentTitles);
  const body = pickNovel(scenario.bodies, vars, ctx.recentTitles);

  const target = scenario.target(ctx);
  const url = `pre12://${scenario.action}`;

  const data: Record<string, string> = {
    scenario: scenario.id,
    category: scenario.id,
    action: scenario.action,
    channel: scenario.channel,
    url,
    target,
    source: 'smart-engine',
    reason,
  };

  if (scenario.allowTaskAction && ctx.pendingTask) {
    data.task_id = ctx.pendingTask.id;
    data.plan_date = ctx.pendingTask.date;
    data.task_title = ctx.pendingTask.title;
    if (ctx.pendingTask.subject) data.subject = ctx.pendingTask.subject;
  }

  return {
    scenario: scenario.id,
    channel: scenario.channel,
    title: fill(title, vars),
    body: fill(body, vars),
    action: scenario.action,
    url,
    target,
    data,
    reason,
  };
}

function pickNovel(
  list: string[],
  vars: Record<string, string | number>,
  recent: string[],
): string {
  if (!list.length) return '';
  const filled = list.map((template) => fill(template, vars));
  const fresh = filled.filter((item) => !recent.includes(item));
  const pool = fresh.length ? fresh : filled;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** كل السيناريوهات (لواجهة المعاينة في التطبيق). */
export function scenarioCatalog(): {
  id: string;
  channel: ChannelId;
  titleCount: number;
  bodyCount: number;
}[] {
  return SCENARIOS.map((s) => ({
    id: s.id,
    channel: s.channel,
    titleCount: s.titles.length,
    bodyCount: s.bodies.length,
  }));
}
