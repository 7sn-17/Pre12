// ============================================================
// tools/test-widget-notes-payload.ts
// ------------------------------------------------------------
// ⭐⭐⭐ Phase W16 — اختبار «خريطة الملاحظات» قبل النشر.
//
//   node tools/test-widget-notes-payload.ts
//
// يغطّي:
//   • العنوان والمحتوى يُقاسان **صراحةً** (لا «العنوان فقط»)
//   • ملاحظة بلا عنوان ⇒ أول ١٥ حرفاً من المحتوى
//   • ملاحظة بلا محتوى ⇒ لا سطر ثانٍ فارغ ولا تكرار
//   • الهدف: سطره الثاني = التقدّم («12 / 50 صفحة»)
//   • القصّDonnell + علامة «…» الحقيقية (RemoteViews لا يقصّ بالنقاط)
//   • الترتيب: الأهداف والملاحظات بالتناوب
// ============================================================

import { readFileSync } from 'node:fs';

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

/* ── بيئة وهمية صغيرة (widgets.js يعمل في المتصفّح) ── */
const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: unknown) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};

const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = storage;
g.document = {
  readyState: 'loading',
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  getElementById: () => null,
  querySelectorAll: () => [],
  body: { classList: { add: () => {}, remove: () => {} } },
};
g.window = g;
// ⭐ navigator قراءة فقط في Node — نكتفي بالوجود الأصلي (لا serviceWorker).

// widgets.js is an IIFE (not a module) → evaluate it in this context.
const source = readFileSync(new URL('../widgets.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
new Function(source).call(g);

const api = (g as unknown as { MedAppWidgets: any }).MedAppWidgets;
if (!api || typeof api.buildNotesPayload !== 'function') {
  console.error('❌ widgets.js did not expose buildNotesPayload');
  process.exit(1);
}

const KEY_GOALS = 'medfav_goals';
const KEY_NOTES = 'medfav_my_notes_v3';

function seed(notes: unknown[], goals: unknown[] = []) {
  store.clear();
  store.set(KEY_NOTES, JSON.stringify(notes));
  store.set(KEY_GOALS, JSON.stringify(goals));
}

console.log('\n▶ Phase W16 — خريطة حمولة الودجت\n');

/* ── 1) العنوان والمحتوى معاً ── */
seed([
  { id: 'n1', title: 'تشريح القلب', content: 'الأortic valve في القلب', created_at: '2026-10-20T10:00:00Z' },
]);
const payload = api.buildNotesPayload();
const note = payload.items.find((i: any) => i.kind === 'note');

check('the payload carries one note', !!note);
check('the note keeps its title', !!note && note.title === 'تشريح القلب', note && note.title);
check('the note keeps its content', !!note && note.text.indexOf('الأortic valve') === 0, note && note.text);
check('the title and the content differ (two lines are drawn)',
  !!note && note.title !== note.text);

/* ── 2) ملاحظة بلا عنوان ⇒ أول ١٥ حرفاً ── */
seed([{ id: 'n2', content: 'ملاحظة طويلة جداً بلا عنوان محدَّد إطلاقاً', created_at: '2026-10-20T10:00:00Z' }]);
const noTitle = api.buildNotesPayload().items[0];
check('a note without a title borrows the first 15 characters',
  !!noTitle && noTitle.title.length <= 15, noTitle && noTitle.title);
const head = 'ملاحظة طويلة جداً بلا عنوان محدَّد إطلاقاً'.slice(0, 14) + '…';
check("the borrowed title is the content's head (14 chars + a real ellipsis)",
  !!noTitle && noTitle.title === head,
  noTitle && noTitle.title);
check('the content line is still the full content',
  !!noTitle && noTitle.text.indexOf('ملاحظة طويلة') === 0, noTitle && noTitle.text);

/* ── 3) ملاحظة بلا محتوى ⇒ لا سطر ثانٍ فارغ ── */
seed([{ id: 'n3', title: 'عنوان فقط', created_at: '2026-10-20T10:00:00Z' }]);
const noBody = api.buildNotesPayload().items[0];
check('a note without a content still has a body (no empty second line)',
  !!noBody && !!noBody.text, noBody && noBody.text);
check('the body equals the title (the widget will not repeat it)',
  !!noBody && noBody.text === noBody.title, noBody && (noBody.text + ' vs ' + noBody.title));

/* ── 4) الهدف: سطره الثاني = التقدّم ── */
seed([], [{ id: 'g1', text: 'مراجعة كتاب التشريح', target_value: 50, current_value: 12, created_at: '2026-10-20T10:00:00Z' }]);
const goal = api.buildNotesPayload().items[0];
check('the goal keeps its title', !!goal && goal.title === 'مراجعة كتاب التشريح', goal && goal.title);
check('the goal\'s second line is its progress', !!goal && goal.text === '12 / 50', goal && goal.text);
check('the goal carries its percentage', !!goal && goal.percent === 24, goal && String(goal.percent));

/* ── 5) القصّ + علامة «…» ── */
seed([{ id: 'n4', title: 'ع'.repeat(120), content: 'ج'.repeat(200), created_at: '2026-10-20T10:00:00Z' }]);
const cut = api.buildNotesPayload().items[0];
check('the title is cut', !!cut && cut.title.length <= 47, cut && String(cut.title.length));
check('the content is cut', !!cut && cut.text.length <= 65, cut && String(cut.text.length));
check('the cut ends with a real ellipsis', !!cut && cut.text.endsWith('…'), cut && cut.text.slice(-6));

/* ── 6) التناوب بين الأهداف والملاحظات ── */
seed(
  [{ id: 'n1', title: 'ملاحظة', content: 'محتوى', created_at: '2026-10-21T10:00:00Z' }],
  [{ id: 'g1', text: 'هدف', created_at: '2026-10-21T10:00:00Z' }]
);
const mixed = api.buildNotesPayload();
check('the goals and the notes are interleaved',
  mixed.items.length >= 2 && mixed.items[0].kind === 'goal' && mixed.items[1].kind === 'note',
  mixed.items.map((i: any) => i.kind).join(','));

/* ── النتيجة ── */
console.log('\n────────────────────────────────────────────────────');
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
