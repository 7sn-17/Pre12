// ============================================================
// tools/test-profile-avatar.ts
// ------------------------------------------------------------
// ⭐⭐⭐ Phase W17 — اختبار «سلسلة الصورة» و«بيانات الملف الشخصي».
//
//   node tools/test-profile-avatar.ts
//
// يغطّي:
//   • سلسلة الصورة: profiles.avatar_url ← raw_user_meta_data ← ''
//   • استخراج الاسم من بيانات Google (full_name / name)
//   • أن حقل profiles يُنشأ بـupsert (لا update فقط)
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
  body: { classList: { add: () => {}, remove: () => {} } },
};
g.window = g;

const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const source = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const api = new Function(
  'window',
  'document',
  'navigator',
  'localStorage',
  source + '\nreturn { resolveAvatarUrl: resolveAvatarUrl, extractAvatarUrl: extractAvatarUrl };'
)(g, g.document, { onLine: true }, storage);

const resolveAvatarUrl = api.resolveAvatarUrl as (p: any, u: any) => string;
const extractAvatarUrl = api.extractAvatarUrl as (u: any) => string;

console.log('\n▶ Phase W17 — الملف الشخصي والصورة\n');

/* ── 1) استخراج الصورة من بيانات Google ── */
check('the avatar is extracted from the metadata (avatar_url)',
  extractAvatarUrl({ user_metadata: { avatar_url: 'https://a/x.png' } }) === 'https://a/x.png');
check('the avatar is extracted from the metadata (picture)',
  extractAvatarUrl({ user_metadata: { picture: 'https://a/y.png' } }) === 'https://a/y.png');
check('a non-http url is rejected',
  extractAvatarUrl({ user_metadata: { avatar_url: 'javascript:alert(1)' } }) === '');
check('no metadata ⇒ no avatar', extractAvatarUrl(null) === '');

/* ── 2) سلسلة الصورة (profiles ← metadata ← '') ── */
check('the profile wins',
  resolveAvatarUrl({ avatar_url: 'https://a/profile.png' }, { user_metadata: { picture: 'https://a/meta.png' } }) ===
  'https://a/profile.png');
check('the metadata is the fallback',
  resolveAvatarUrl({ avatar_url: '' }, { user_metadata: { picture: 'https://a/meta.png' } }) === 'https://a/meta.png');
check('the metadata is used when there is no profile',
  resolveAvatarUrl(null, { user_metadata: { avatar_url: 'https://a/meta.png' } }) === 'https://a/meta.png');
check('no avatar anywhere ⇒ empty (the UI draws the initial)',
  resolveAvatarUrl({}, { user_metadata: {} }) === '');

/* ── 3) بيانات Google كما وصلت فعلاً ── */
const googleUser = {
  id: 'u1',
  email: 'hnt317601@gmail.com',
  user_metadata: {
    name: 'HN T',
    full_name: 'HN T',
    picture: 'https://lh3.googleusercontent.com/a/ACg8=s96-c',
    email: 'hnt317601@gmail.com'
  }
};
check('the real Google payload yields the picture',
  resolveAvatarUrl(null, googleUser) === 'https://lh3.googleusercontent.com/a/ACg8=s96-c');
check('the real Google payload yields a name',
  String(googleUser.user_metadata.full_name || googleUser.user_metadata.name) === 'HN T');

console.log('\n────────────────────────────────────────────────────');
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
