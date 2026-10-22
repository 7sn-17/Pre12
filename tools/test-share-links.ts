// ============================================================
// tools/test-share-links.ts
// ------------------------------------------------------------
// ⭐⭐⭐ Phase W18 — اختبار «الرابط مرّة واحدة» في المشاركة.
//
//   node tools/test-share-links.ts
//
// 1) «مشاركة السلسلة»: الرابط كان في **النصّ** وفي حقل `url` ⇒
//    أندرويد يدمجهما ⇒ رابط التنزيل يظهر **مرّتين**.
//    الآن: النصّ بلا رابط، والرابط في حقل `url` وحده،
//    وم fallback النسخ يضيفه (ل��ا يوجد حقل url هناك).
// 2) «مشاركة الخطة»: زرّ المشاركة **داخل المعرض فقط** —
//    لا زرّ في قائمة الخطط (تبقى القائمة نظيفة).
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

const index = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const plans = readFileSync(new URL('../dist/plans.html', import.meta.url), 'utf8');

console.log('\n▶ Phase W18 — روابط المشاركة\n');

/* ── 1) مشاركة السلسلة ── */
const shareFn = index.slice(
  index.indexOf('function streakShareText()'),
  index.indexOf('function copyStreakText(')
);

check('the share text function exists', shareFn.length > 0);
const textFn = shareFn.slice(0, shareFn.indexOf('function streakShareTextWithUrl()'));
check('the shared TEXT carries no download URL',
  !textFn.includes('APP_DOWNLOAD_URL'), textFn.slice(0, 400));

// the native share call: text = the clean text, url = the download URL
const nativeShare = shareFn.slice(shareFn.indexOf('await Share.share({'));
check('the native share sends the URL in the "url" field',
  nativeShare.includes('url: APP_DOWNLOAD_URL'), nativeShare.slice(0, 220));
check('the native share does NOT repeat the URL inside the text',
  /text:\s*text\s*,/.test(nativeShare) && !/text:[^,]*APP_DOWNLOAD_URL/.test(nativeShare),
  nativeShare.slice(0, 220));

// the web share: the same rule
const webShare = shareFn.slice(shareFn.indexOf('await navigator.share({'));
check('the web share sends the URL in the "url" field',
  webShare.includes('url: APP_DOWNLOAD_URL'));
check('the web share does NOT repeat the URL inside the text',
  /text:\s*text\s*,/.test(webShare) && !/text:[^,]*APP_DOWNLOAD_URL/.test(webShare));

// the copy fallback must still contain the link
const copies = shareFn.match(/copyStreakText\(([^)]*)\)/g) || [];
check('every copy fallback adds the link back',
  copies.length > 0 && copies.every((c) => c.includes('streakShareTextWithUrl()')),
  copies.join(' | '));
check('the helper that adds the link exists',
  index.includes('function streakShareTextWithUrl()') &&
  index.includes("streakShareText() + '\\n\\nلتحميل التطبيق:\\n' + APP_DOWNLOAD_URL"));

/* ── 2) مشاركة الخطة: في المعرض فقط ── */
check('the plans lightbox has a share button', plans.includes('id="planShareBtn"'));
check('the share button lives inside the lightbox bar',
  plans.indexOf('id="planShareBtn"') > plans.indexOf('class="plan-lightbox-bar"') &&
  plans.indexOf('id="planShareBtn"') < plans.indexOf('class="plan-lightbox-stage"'));
check('the share function exists', plans.includes('async function sharePlanImage()'));
check('the share uses the Capacitor Share plugin', plans.includes('Plugins.Share'));
check('the share caches the file like my-lectures does',
  plans.includes('Filesystem.writeFile') && plans.includes('directory: \'CACHE\''));
check('the share passes the file URI (or the image URL) as the url',
  plans.includes('url: fileUri || imageUrl'));
check('the share button is NOT in the plans list',
  !/plan-card[\s\S]{0,400}planShareBtn/.test(plans));

console.log('\n────────────────────────────────────────────────────');
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
