// ============================================================
// tools/test-arabic-search.ts
// ------------------------------------------------------------
// ⭐⭐⭐ Phase W16 — اختبار «البحث بالعربي» قبل النشر.
//
//   node tools/test-arabic-search.ts
//
// يغطّي:
//   • التطبيع العربي: «احمد» تطابق «أحمد» و«الاوراق» تطابق «الأوراق»
//   • ثبات المواضع في foldArabic (لبحث الـPDF)
//   • ⭐ الـIME العربي:During التكوين تكون القيمة = ما قبل التكوين +
//     المُركَّب الآن (حتى لو كان الـDOM متأخّراً — وهو سبب «العربي لا
//     يعمل والإنجليزي يعمل»).
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

/* ── بيئة وهمية ── */
const g = globalThis as unknown as Record<string, unknown>;
g.document = {
  readyState: 'loading',
  addEventListener: () => {},
  removeEventListener: () => {},
  querySelector: () => null,
  getElementById: () => null,
  querySelectorAll: () => [],
};
g.window = g;

const source = readFileSync(new URL('../search.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const api = new Function('window', 'document', source + '\nreturn window.MedAppSearch;')(g, g.document);

console.log('\n▶ Phase W16 — البحث العربي\n');

/* ── 1) التطبيع ── */
check('«أحمد» تُطابق «احمد»', api.matchesText({ title: 'عينة أحمد' }, 'احمد'));
check('«الأوراق» تطابق «الاوراق»', api.matchesText({ title: 'الأوراق الطبية' }, 'الاوراق'));
check('«مستشفى» تطابق «مستشفي»', api.matchesText({ title: 'مستشفى Children' }, 'مستشفي'));
check('«الإنجليزية» تطابق «انجليزيه»', api.matchesText({ title: 'اللغة الإنجليزية 1' }, 'انجليزيه'));
check('التشكيل يُتجاهل', api.matchesText({ title: 'عينة تُاريخ الطب' }, 'تاريخ'));
check('الإنجليزي ما زال يعمل', api.matchesText({ title: 'Anatomy notes' }, 'anato'));
check('لا مطابقة لكلمة غير موجودة', !api.matchesText({ title: 'عينة تاريخ الطب' }, 'رياضيات'));
check('foldArabic يحافظ على الطول',
  api.foldArabic('أحَمَد').length === 'أحَمَد'.length, api.foldArabic('أحَمَد'));
check('foldArabic يوحّد الألف',
  api.foldArabic('الأوراق') === api.foldArabic('الاوراق'));

/* ── 2) الـIME العربي ── */
/** حقل وهمي يحاكي سلوك WebView: القيمة قد تتأخّر عن مخزن الـIME. */
function fakeInput(initial = '') {
  const listeners: Record<string, Function[]> = {};
  const input = {
    value: initial,
    selectionStart: initial.length,
    addEventListener(type: string, fn: Function) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    fire(type: string, event: any = {}) {
      (listeners[type] || []).forEach((fn) => fn(event));
    },
  };
  return input;
}

const input = fakeInput();
const seen: string[] = [];
api.bindSearchInput(input as any, (value: string) => { seen.push(value); });

// ⭐ السيناريو الحقيقي: التكوين العربي، والـDOM **متأخّر** (لا قيمة جديدة).
input.fire('compositionstart', { data: '' });
input.fire('compositionupdate', { data: 'م' });
input.fire('compositionupdate', { data: 'مح' });
input.fire('compositionend', { data: 'مح', target: { value: '' } });

check('the Arabic composition is captured letter by letter',
  seen.length >= 3 && seen[0] === 'م' && seen[1] === 'مح',
  JSON.stringify(seen));
check('the composition end reports the whole word',
  seen[seen.length - 1] === 'مح', JSON.stringify(seen));

// ⭐ النصّ قبل التكوين يبقى.
const input2 = fakeInput('ملاحظات ');
const seen2: string[] = [];
api.bindSearchInput(input2 as any, (value: string) => { seen2.push(value); });
input2.fire('compositionstart', { data: '' });
input2.fire('compositionupdate', { data: 'ق' });
check('the text before the composition is kept',
  seen2[0] === 'ملاحظات ق', JSON.stringify(seen2));

// ⭐ الحذف (input عادي) يعمل كما هو.
const input3 = fakeInput('تاريخ');
const seen3: string[] = [];
api.bindSearchInput(input3 as any, (value: string) => { seen3.push(value); });
input3.value = 'تاري';
input3.fire('input', { target: { value: 'تاري' }, data: null });
check('a plain input event reports the field value',
  seen3[0] === 'تاري', JSON.stringify(seen3));

// ⭐ الإنجليزي: بلا تكوين ⇒ القيمة من الـDOM مباشرة.
const input4 = fakeInput('');
const seen4: string[] = [];
api.bindSearchInput(input4 as any, (value: string) => { seen4.push(value); });
input4.value = 'an';
input4.fire('input', { target: { value: 'an' } });
check('the English input is immediate',
  seen4[0] === 'an', JSON.stringify(seen4));

/* ── النتيجة ── */
console.log('\n────────────────────────────────────────────────────');
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
