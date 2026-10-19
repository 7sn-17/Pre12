#!/usr/bin/env node
/**
 * tools/migrate.js — one-off, idempotent-ish migration.
 *
 * Rewrites the root *.html files so that the duplicated <head>, generic header,
 * footer, local <script src> block and Service-Worker registration are replaced
 * by `<!-- @include partials/... -->` placeholders + a `<!--@ ... -->`
 * front-matter block of build variables (see build.js).
 *
 * It does NOT touch the inline <style> blocks or any page-specific markup / JS.
 *
 * Run once:  node tools/migrate.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------------
// Per-page configuration
// ------------------------------------------------------------------
// fm      → front-matter variables (title is always first)
// header  → 'simple' | 'center' | null   (null ⇒ keep the page's own unique header inline)
// footer  → 'about' | 'legal' | null
// scripts → whether a local <script src> run exists (informational)
// sw      → whether a Service-Worker registration exists
// perf    → inject partials/perf.html before </body>
// ------------------------------------------------------------------

const PAGES = {
  'index.html': {
    fm: { title: 'السنة التحضيرية - المنصة الطبية', libs: 'fontawesome-jsdelivr, supabase, lucide', snippets: 'onboardingRedirect', scripts: 'supabase-config, auth, db, files', sw: 'true' },
    header: null
  },
  'subject.html': {
    fm: { title: 'المواد — المنصة الطبية', libs: 'supabase, lucide', scripts: 'supabase-config, auth, db, files', sw: 'true', headerCenter: 'true', titleAttrs: 'id="headerTitle"', headerTitle: 'جاري التحميل...' },
    header: 'center'
  },
  'viewer.html': {
    fm: { title: 'معاينة الملف — المنصة الطبية', themeColor: '#f8fafb', libs: 'pdfjs, supabase, lucide', scripts: 'supabase-config, auth, db, files', sw: 'true' },
    header: null
  },
  'login.html': {
    fm: { title: 'تسجيل الدخول - المنصة الطبية', libs: 'supabase, lucide', scripts: 'supabase-config, auth', sw: 'true' },
    header: null
  },
  'confirm.html': {
    fm: { title: 'تأكيد البريد - المنصة الطبية', libs: 'supabase, lucide', scripts: 'supabase-config, auth', sw: 'true' },
    header: null
  },
  'reset-password.html': {
    fm: { title: 'إعادة تعيين كلمة المرور - المنصة الطبية', libs: 'supabase, lucide', scripts: 'supabase-config', sw: 'true' },
    header: null
  },
  'onboarding.html': {
    fm: { title: 'مرحباً بك - المنصة الطبية', themeColor: '#ffffff', libs: 'fontawesome', themeInit: 'false', pwa: 'none', perf: 'false' },
    header: null, perf: false
  },
  'offline.html': {
    fm: { title: 'غير متصل - المنصة الطبية', libs: 'lucide', pwa: 'none' },
    header: null, perf: false
  },
  'about.html': {
    fm: { title: 'حول التطبيق - المنصة الطبية', libs: 'fontawesome, lucide', scripts: 'supabase-config, files', sw: 'true', backHref: 'index.html', headerTitle: 'حول التطبيق' },
    header: 'simple', footer: 'about'
  },
  'admin.html': {
    fm: { title: 'لوحة التحكم — المنصة الطبية', libs: 'fontawesome, supabase', scripts: 'supabase-config, auth, db, files', sw: 'true' },
    header: null
  },
  'all-files.html': {
    fm: { title: 'جميع الملفات — المنصة الطبية', libs: 'fontawesome, supabase', scripts: 'supabase-config, db, files', sw: 'true', backHref: 'index.html', backIcon: 'fa', headerCenter: 'true', headerTitle: 'جميع الملفات', headerSub: '<div class="header-sub" id="countLabel">جاري التحميل...</div>' },
    header: 'center'
  },
  'goals.html': {
    fm: { title: 'أهدافي - المنصة الطبية', libs: 'supabase, lucide', themeInit: 'false', snippets: 'themeDark', scripts: 'supabase-config, auth', sw: 'true', backHref: 'index.html', headerTitle: 'أهدافي' },
    header: 'simple'
  },
  'gpa.html': {
    fm: { title: 'معدلي - المنصة الطبية', libs: 'fontawesome, html2canvas, jspdf', sw: 'false' },
    header: null
  },
  'my-lectures.html': {
    fm: { title: 'محاضراتي — المنصة الطبية', fontWeights: '400;600;700;800;900', libs: 'supabase, lucide', scripts: 'supabase-config, auth', sw: 'true' },
    header: null
  },
  'notes.html': {
    fm: { title: 'الملاحظات - المنصة الطبية', libs: 'supabase, lucide', themeInit: 'false', snippets: 'themeDark', scripts: 'supabase-config, auth', sw: 'true', backHref: 'index.html', headerTitle: 'الملاحظات' },
    header: 'simple'
  },
  'privacy.html': {
    fm: { title: 'سياسة الخصوصية - المنصة الطبية', libs: 'lucide', sw: 'true', backHref: 'javascript:history.back()', headerTitle: 'سياسة الخصوصية', footerLinkHref: 'terms.html', footerLinkText: 'شروط الخدمة' },
    header: 'simple', footer: 'legal'
  },
  'terms.html': {
    fm: { title: 'شروط الخدمة - المنصة الطبية', libs: 'lucide', sw: 'true', backHref: 'javascript:history.back()', headerTitle: 'شروط الخدمة', footerLinkHref: 'privacy.html', footerLinkText: 'سياسة الخصوصية' },
    header: 'simple', footer: 'legal'
  },
  'tools.html': {
    fm: { title: 'صندوق أدواتي - المنصة الطبية', libs: 'fontawesome', sw: 'false' },
    header: null
  },
  'upload.html': {
    fm: { title: 'إضافة محتوى — المنصة الطبية', libs: 'fontawesome, supabase', scripts: 'supabase-config, auth, files', sw: 'true', backHref: 'index.html', backIcon: 'fa', headerTitle: 'إضافة محتوى' },
    header: 'simple'
  }
};

// ------------------------------------------------------------------
// Front matter
// ------------------------------------------------------------------

function buildFrontMatter(fm) {
  const lines = ['<!--@'];
  Object.keys(fm).forEach((k) => lines.push(`${k}: ${fm[k]}`));
  lines.push('-->');
  return lines.join('\n');
}

// ------------------------------------------------------------------
// Transformations
// ------------------------------------------------------------------

// Replace <head> … up to the first <style> with the head include
function replaceHead(html) {
  return html.replace(/<head>[\s\S]*?(?=<style)/i, '<head>\n<!-- @include partials/head.html -->\n\n');
}

// Replace the page's generic <header> … </header> with the header include
function replaceHeader(html) {
  return html.replace(/[ \t]*<header\b[^>]*>[\s\S]*?<\/header>\n?/i, '<!-- @include partials/header.html -->\n');
}

// Replace the local <script src="supabase-config|auth|db|files.js"> run
function replaceScripts(html) {
  return html.replace(
    /(?:^[ \t]*<script src="(?:supabase-config|auth|db|files)\.js"><\/script>[ \t]*\r?\n)+/gm,
    '<!-- @include partials/scripts.html -->\n'
  );
}

// Indentation-aware extraction of a <div class="footer"> … matching </div>
function replaceFooter(html) {
  const startIdx = html.indexOf('<div class="footer">');
  if (startIdx === -1) return html;
  // indentation of the opening tag
  const lineStart = html.lastIndexOf('\n', startIdx) + 1;
  const indent = html.slice(lineStart, startIdx);
  const re = new RegExp('^' + indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</div>', 'm');
  const after = html.slice(startIdx);
  const m = after.match(re);
  if (!m) return html;
  const endIdx = startIdx + m.index + m[0].length;
  return html.slice(0, lineStart) + indent + '<!-- @include partials/footer.html -->' + html.slice(endIdx);
}

// Remove the Service-Worker registration IIFE (brace-matched) and, when the
// enclosing <script> becomes empty, replace the whole block with the include.
function replaceSw(html) {
  const marker = "if ('serviceWorker' in navigator)";
  const i = html.indexOf(marker);
  if (i === -1) return html;

  let j = html.indexOf('{', i);
  let depth = 0, k = j;
  for (; k < html.length; k++) {
    const c = html[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { k++; break; } }
  }

  const without = html.slice(0, i) + html.slice(k);

  // Find the enclosing <script> block in `without`
  const open = without.lastIndexOf('<script', i);
  const closeStart = without.indexOf('</script>', i);
  if (open === -1 || closeStart === -1) return without;

  const innerStart = without.indexOf('>', open) + 1;
  const inner = without.slice(innerStart, closeStart)
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (inner === '') {
    const closeEnd = closeStart + '</script>'.length;
    const lineStart = without.lastIndexOf('\n', open) + 1;
    const indent = without.slice(lineStart, open);
    return without.slice(0, lineStart)
      + indent + '<!-- @include partials/sw-register.html -->'
      + without.slice(closeEnd);
  }

  // Non-empty script: keep it, append the include after </script>
  const closeEnd = closeStart + '</script>'.length;
  return without.slice(0, closeEnd) + '\n<!-- @include partials/sw-register.html -->' + without.slice(closeEnd);
}

// Inject the perf partial before </body>
function replacePerf(html) {
  return html.replace(/\n?<\/body>/, '\n<!-- @include partials/perf.html -->\n</body>');
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main() {
  const files = Object.keys(PAGES);
  let changed = 0;

  files.forEach((file) => {
    const cfg = PAGES[file];
    const full = path.join(ROOT, file);
    let html = fs.readFileSync(full, 'utf8');

    // Skip files already migrated (front-matter present)
    if (/^\s*<!--@/.test(html)) {
      console.log(`↩︎  ${file} already has front-matter — skipping`);
      return;
    }

    html = replaceHead(html);
    if (cfg.header) html = replaceHeader(html);
    if (cfg.footer) html = replaceFooter(html);
    html = replaceScripts(html);
    if (cfg.fm.sw === 'true') html = replaceSw(html);
    if (cfg.perf !== false) html = replacePerf(html);

    const out = buildFrontMatter(cfg.fm) + '\n' + html;
    fs.writeFileSync(full, out);
    changed++;
    console.log(`✅ migrated ${file}`);
  });

  console.log(`\nDone: ${changed}/${files.length} files migrated.`);
}

main();
