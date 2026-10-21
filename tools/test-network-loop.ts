// ============================================================
// tools/test-network-loop.ts
// ------------------------------------------------------------
// ⭐⭐⭐ Phase W17.1 — اختبار «حلقة الشبكة».
//
//   node tools/test-network-loop.ts
//
// الجذر الحقيقي: إضافة Capacitor (Network) على أندرويد تُطلق
// `networkStatusChange` عند **كل تغيّر في خصائص الشبكة** (لا عند تغيّر
// الاتصال فقط) ⇒ كان التطبيق يوزّع حدث 'online' كل بضع ثوانٍ، وكل
// مستمع كان يُطلق طلباته (≈٢٠ طلباً إلى Supabase) + نافذة
// «عاد الاتصال — تم تحديث المحاضرات».
//
// يغطّي:
//   • تكرار الحدث نفسه ⇒ **حدث واحد فقط** (لا تدفّق)
//   • تغيّر حقيقي (offline → online) ⇒ حدثان (صحيح)
//   • لا حدث عند البدء (getStatus لا يوزّع)
//   • أداة الخنق medappThrottle
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

/* ── بيئة وهمية: إضافة Capacitor (Network) ── */
const listeners: Record<string, Function[]> = {};
let networkStatusCallback: ((status: any) => void) | null = null;

const fakeNetwork = {
  addListener(type: string, cb: Function) {
    (listeners[type] = listeners[type] || []).push(cb);
    if (type === 'networkStatusChange') networkStatusCallback = cb as any;
  },
  getStatus() {
    return Promise.resolve({ connected: true, connectionType: 'wifi' });
  }
};

const events: string[] = [];

const fakeWindow: any = {
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    Plugins: { Network: fakeNetwork, SplashScreen: {}, StatusBar: {}, App: {} }
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { origin: 'https://app.test', href: '' },
  addEventListener(type: string, cb: Function) {
    (listeners['win:' + type] = listeners['win:' + type] || []).push(cb);
  },
  removeEventListener() {},
  dispatchEvent(event: any) {
    events.push(String(event && event.type));
    (listeners['win:' + event.type] || []).forEach((fn) => fn(event));
    return true;
  },
  document: {
    readyState: 'loading',
    addEventListener(type: string, cb: Function) {
      (listeners['doc:' + type] = listeners['doc:' + type] || []).push(cb);
    },
    removeEventListener() {},
    querySelector: () => null,
    getElementById: () => null,
    querySelectorAll: () => [],
    head: { appendChild() {} },
    body: { classList: { add() {}, remove() {} } }
  },
  navigator: { onLine: true },
  setTimeout: (fn: any, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: any) => clearTimeout(id),
  setInterval: (fn: any, ms: number) => setInterval(fn, ms),
  clearInterval: (id: any) => clearInterval(id)
};
fakeWindow.window = fakeWindow;

// native.js يستخدم `document` عالمياً ⇒ نعرّفه في البيئة العامة أيضاً.
(globalThis as any).document = fakeWindow.document;

const source = readFileSync(new URL('../native.js', import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', source)(fakeWindow);

// ⭐ نُشغّل التهيئة (كما يحدث عند فتح الصفحة).
(listeners['doc:DOMContentLoaded'] || []).forEach((fn) => fn({ type: 'DOMContentLoaded' }));

console.log('\n▶ Phase W17.1 — حلقة الشبكة\n');

/* ⭐ 0) أول حدث = الحالة الحالية ⇒ لا حدث (بلا تحميل مزدوج عند البدء) */
if (networkStatusCallback) {
  (networkStatusCallback as any)({ connected: true, connectionType: 'wifi' });
  check('the first status is recorded without an event',
    events.length === 0, events.join(','));
} else {
  check('the network listener was bound', false);
}

/* ⭐ 1) تكرار الحدث نفسه ⇒ لا تدفّق */
if (networkStatusCallback) {
  for (let i = 0; i < 20; i++) {
    (networkStatusCallback as any)({ connected: true, connectionType: 'wifi' });
  }
  const onlineCount = events.filter((e) => e === 'online').length;
  check('20 identical network events ⇒ NO "online" event',
    onlineCount === 0, 'got ' + onlineCount);
}

/* ⭐ 2) تغيّر حقيقي ⇒ حدث حقيقي */
const before = events.length;
(networkStatusCallback as any)({ connected: false, connectionType: 'none' });
check('going offline is dispatched', events.slice(before).includes('offline'),
  events.slice(before).join(','));

const before2 = events.length;
(networkStatusCallback as any)({ connected: true, connectionType: 'wifi' });
check('coming back online is dispatched', events.slice(before2).includes('online'),
  events.slice(before2).join(','));

/* ⭐ 3) بعد العودة: التكرار لا يمرّ */
const after = events.length;
for (let i = 0; i < 20; i++) {
  (networkStatusCallback as any)({ connected: true, connectionType: 'wifi' });
}
check('20 more identical events ⇒ nothing new',
  events.length === after, (events.length - after) + ' new');

/* ⭐ 4) أداة الخنق */
const throttle = fakeWindow.medappThrottle;
check('the throttle helper is exposed', typeof throttle === 'function');
if (typeof throttle === 'function') {
  check('the first call is allowed', throttle('t', 5000) === true);
  check('the second call is blocked', throttle('t', 5000) === false);
  check('a different key is allowed', throttle('u', 5000) === true);
}

console.log('\n────────────────────────────────────────────────────');
console.log(`النتيجة: ${passed} ناجح · ${failed} فاشل\n`);
process.exit(failed ? 1 : 0);
