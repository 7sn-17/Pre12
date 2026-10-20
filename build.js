#!/usr/bin/env node
/**
 * build.js — static site generator for the medical platform.
 *
 * Source of truth:  src/*.html   (+ partials/*.html)
 * Output:           ./*.html     (so the repo root is directly servable)
 *                   dist/*.html  (deployment output — vercel.json points here)
 *
 * The root pages are written as fully-expanded HTML on purpose. Serving the
 * project root must never expose the raw `<!-- @include -->` templates: doing
 * so drops <meta charset>, the viewport, fonts/icons and the shared scripts,
 * which makes Arabic look broken and leaves the pages stuck on loaders.
 *
 * SPA integration (app pages only):
 *   • app.js is injected after the shared libs and before the page script.
 *   • Top-level `const` / `let` / `class` declarations are rewritten to `var`
 *     at build time. Re-executing a classic script after an SPA swap then
 *     cannot throw "Identifier has already been declared", while every
 *     function/variable keeps working for inline handlers exactly as before
 *     (no IIFE, no globals hidden away).
 *
 * Usage: node build.js   (or: npm run build)
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// Bumped whenever app.js changes. The query string is what makes returning
// visitors pick up the new router even though static JS is served immutable.
const APP_VERSION = '4.1.0';
const APP_JS = `app.js?v=${APP_VERSION}`;

// ------------------------------------------------------------------
// Registries (single source of truth for shared markup)
// ------------------------------------------------------------------

const LIBS = {
  'fontawesome':
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">',
  'fontawesome-jsdelivr':
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/css/all.min.css">',
  supabase:
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
  lucide:
    '<script src="https://unpkg.com/lucide@latest"></script>',
  pdfjs:
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>',
  html2canvas:
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>',
  jspdf:
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
};

const PWA = {
  full: [
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="المنصة الطبية">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<link rel="manifest" href="manifest.json">',
    '<link rel="apple-touch-icon" href="icon-512.png">'
  ].join('\n'),
  none: ''
};

const SNIPPETS = {
  // Inline dark-default theme bootstrap (used by pages that predate theme-init.js)
  themeDark: [
    '<script>',
    '  (function() {',
    "    const theme = localStorage.getItem('medfav_theme') || 'dark';",
    "    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');",
    '  })();',
    '</script>'
  ].join('\n'),
  // First-visit onboarding redirect (index.html)
  onboardingRedirect: [
    '<script>',
    '  (function() {',
    '    try {',
    "      if (!localStorage.getItem('medfav_onboarding_done')) {",
    '        var path = window.location.pathname;',
    "        if (!path.endsWith('onboarding.html')) {",
    "          window.location.replace('onboarding.html');",
    '        }',
    '      }',
    '    } catch (e) {',
    "      console.warn('Onboarding check failed:', e);",
    '    }',
    '  })();',
    '</script>'
  ].join('\n')
};

const DEFAULTS = {
  themeColor: '#06110d',
  fontWeights: '400;500;600;700;800;900',
  themeInit: 'true',
  pwa: 'full',
  libs: '',
  scripts: '',
  snippets: '',
  backHref: 'index.html',
  backClass: 'nav-btn',
  backIcon: 'lucide',
  titleAttrs: '',
  headerSub: '',
  headerTrailing: '  <div style="width: 42px;"></div>',
  footerAbout: ''
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const read = (p) => fs.readFileSync(p, 'utf8');
const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

function parseFrontMatter(text) {
  const m = text.match(/^\s*<!--@([\s\S]*?)-->/);
  if (!m) return { vars: {}, body: text };
  const vars = {};
  m[1].split('\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i === -1) return;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) vars[k] = v;
  });
  return { vars, body: text.slice(m[0].length) };
}

function computeVars(raw) {
  const v = Object.assign({}, DEFAULTS, raw);

  v.libs = list(raw.libs)
    .map((k) => LIBS[k] || `<!-- build: unknown lib "${k}" -->`)
    .join('\n');

  v.scripts = list(raw.scripts)
    .map((f) => `<script src="${f}.js"></script>`)
    .join('\n');

  v.snippets = list(raw.snippets)
    .map((k) => SNIPPETS[k] || `<!-- build: unknown snippet "${k}" -->`)
    .join('\n');

  v.pwa = Object.prototype.hasOwnProperty.call(PWA, raw.pwa || 'full')
    ? PWA[raw.pwa || 'full']
    : PWA.full;

  v.backIcon = raw.backIcon === 'fa'
    ? '    <i class="fa-solid fa-arrow-right"></i>'
    : '    <i data-lucide="arrow-right"></i>';

  return v;
}

const truthy = (val) =>
  !(val === undefined || val === '' || val === 'false' || val === '0' || val === 'none');

function resolveIncludes(text) {
  let out = text;
  let guard = 0;
  const re = /<!--\s*@include\s+([^\s>]+?)\s*-->/;
  while (re.test(out) && guard++ < 25) {
    out = out.replace(/<!--\s*@include\s+([^\s>]+?)\s*-->/g, (_, p) => read(path.join(ROOT, p.trim())));
  }
  return out;
}

function expandConditionals(text, vars) {
  text = text.replace(/\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, k, body) => (truthy(vars[k]) ? body : ''));
  text = text.replace(/\{\{#unless\s+([\w-]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_, k, body) => (truthy(vars[k]) ? '' : body));
  return text;
}

function replaceTokens(text, vars) {
  return text.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

// ------------------------------------------------------------------
// SPA integration
// ------------------------------------------------------------------
//
// app.js swaps <body> and re-executes the target page's own inline scripts.
// Classic scripts keep their declarations in the global scope. To make a
// second execution safe we only have to deal with top-level lexical bindings:
// `const`, `let` and `class` cannot be declared twice, while `var` and
// `function` can. So we rewrite those three (Program-level only) to `var`.
//
// Everything else stays byte-for-byte identical, which means:
//   • inline onclick="..." handlers keep seeing the same global functions,
//   • cross-<script> references keep working,
//   • no IIFE, no hidden functions, no exposure list to get wrong.

const APP_PAGES = new Set([
  'index.html', 'subject.html', 'viewer.html', 'notes.html', 'goals.html',
  'my-lectures.html', 'all-files.html', 'gpa.html', 'admin.html',
  'plans.html', 'progress.html'
]);

function collectInlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;         // external lib — never re-run
    const tm = attrs.match(/\btype\s*=\s*["']?([\w/+.-]+)/i);
    if (tm) {
      const t = tm[1].toLowerCase();
      if (t !== 'text/javascript' && t !== 'application/javascript' && t !== 'module') continue; // data blocks
    }
    out.push({ full: m[0], index: m.index, attrs, code: m[2], shell: /data-shell/i.test(attrs) });
  }
  return out;
}

/**
 * Rewrite Program-level `const` / `let` / `class` declarations to `var`.
 * Returns the original code untouched if it cannot be parsed.
 */
function makeReExecutable(code) {
  if (!code.trim()) return code;

  let ast;
  try {
    ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowReturnOutsideFunction: true,
      allowHashBang: true
    });
  } catch (e) {
    console.warn('⚠️  Could not parse an inline script; leaving it unchanged:', e.message);
    return code;
  }

  const edits = [];
  for (const node of ast.body) {
    if (node.type === 'VariableDeclaration' && (node.kind === 'const' || node.kind === 'let')) {
      edits.push({ start: node.start, end: node.start + node.kind.length, text: 'var' });
    } else if (node.type === 'ClassDeclaration' && node.id) {
      const name = node.id.name;
      edits.push({
        start: node.start,
        end: node.id.end,
        text: `var ${name} = class ${name}`
      });
      edits.push({ start: node.end, end: node.end, text: ';' });
    }
  }

  if (!edits.length) return code;

  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = code;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function transformAppPage(html) {
  const bodyStart = html.search(/<body\b/i);
  // Only body scripts are view scripts: head scripts (bootstrap snippets,
  // speculation rules) belong to the shell and run on the initial load only.
  const blocks = collectInlineScripts(html)
    .filter((b) => !b.shell && b.index > bodyStart);
  if (!blocks.length) return html;

  let out = '';
  let last = 0;
  blocks.forEach((b, idx) => {
    out += html.slice(last, b.index);
    if (idx === 0) out += `<script src="${APP_JS}"></script>\n`;
    out += `<script${b.attrs}>\n${makeReExecutable(b.code)}\n</script>`;
    last = b.index + b.full.length;
  });
  out += html.slice(last);
  return out;
}

function renderPage(file) {
  const src = read(file);
  const { vars: raw, body } = parseFrontMatter(src);
  const vars = Object.assign({}, computeVars(raw), { appVersion: APP_VERSION });
  let out = resolveIncludes(body.replace(/^\s+/, ''));
  out = expandConditionals(out, vars);
  out = replaceTokens(out, vars);
  if (APP_PAGES.has(path.basename(file))) out = transformAppPage(out);
  return out;
}

// ------------------------------------------------------------------
// Asset copy (everything except sources / tooling)
// ------------------------------------------------------------------
// Only production assets may reach dist/. Everything below is a
// development or deployment-internal artefact and must never be
// published to the web.

const EXCLUDE_TOP = new Set([
  // Build output & dependencies
  'dist', 'node_modules',
  // Sources (they are compiled into the root pages)
  'src', 'partials',
  // ⭐ The native Android project — it must NEVER be copied into dist/,
  //    otherwise it lands inside the APK (and inside itself, recursively).
  'android',
  // Icon/splash sources for the native build
  'assets',
  // Tooling / deployment config
  'build.js', 'package.json', 'package-lock.json', 'vercel.json',
  // ⭐ إعداد Firebase — نسخة المشروع الأصلية (لا يُنشر على الويب)
  'google-services.json',
  // ⭐ ملفات أدوات Firebase المحلية
  'opencode.json',
  'firebase.json',
  '.git', '.gitignore',
  // Documentation (kept in the repo, not shipped to users)
  'README.md', 'ARCHITECTURE.md',
  // Database migrations — applied from the Supabase SQL editor
  'supabase',
  // The visual baseline used during development
  'tools',
  // Test files
  'master.test.js'
]);

// Internal working notes (prompt*.txt) and any stray test file must never
// be published either.
const EXCLUDE_FILE = /^(prompt.*\.txt|.*\.(test|spec)\.js)$/i;

function copyAssets() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });
  let copied = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (EXCLUDE_TOP.has(name) || EXCLUDE_FILE.test(name)) continue;
    if (entry.isFile() && name.endsWith('.html')) continue; // rendered separately
    const from = path.join(ROOT, name);
    const to = path.join(DIST, name);
    fs.cpSync(from, to, { recursive: true });
    copied++;
  }
  return copied;
}


/**
 * ⭐⭐ فحص بنية الوسوم — يمنع تكرار خطأ "وسم غير مغلق" الذي كسر
 *    تخطيط صفحات كاملة (.login وindex).
 *    نتجاهل محتوى السكربتات (سلاسل HTML داخل JavaScript).
 */
function verifyMarkupBalance(pageName, html) {
  const body = html.slice(html.indexOf('<body'));
  const markup = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const openDiv = (markup.match(/<div\b/g) || []).length;
  const closeDiv = (markup.match(/<\/div>/g) || []).length;
  const openBtn = (markup.match(/<button\b/g) || []).length;
  const closeBtn = (markup.match(/<\/button>/g) || []).length;

  const errors = [];
  if (openDiv !== closeDiv) {
    errors.push(`unbalanced <div> (${openDiv} open / ${closeDiv} close)`);
  }
  if (openBtn !== closeBtn) {
    errors.push(`unbalanced <button> (${openBtn} open / ${closeBtn} close)`);
  }
  return errors;
}

// ------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------

const CHARSET = '<meta charset="UTF-8">';
const VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

function validatePage(name, html, isApp) {
  const errors = [];
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd + 7);

  if (!head.includes(CHARSET)) errors.push('missing UTF-8 charset');

  const headOpen = html.match(/<head[^>]*>/i);
  if (!headOpen) {
    errors.push('missing <head>');
  } else {
    const afterHead = html.slice(headOpen.index + headOpen[0].length);
    if (!/^\s*<meta charset="UTF-8">/i.test(afterHead)) {
      errors.push('charset is not the first element in <head>');
    }
  }

  if (!head.includes(VIEWPORT)) errors.push('missing hardened viewport meta');
  if (/@include\s+[^\s>]+/.test(html)) errors.push('unresolved @include');
  if (/\{\{\s*[\w-]+\s*\}\}/.test(html)) errors.push('unresolved {{token}}');
  if (isApp && !html.includes(`<script src="${APP_JS}"></script>`)) errors.push('app.js not injected');
  if (!isApp && /src="app\.js/.test(html)) errors.push('app.js leaked into a non-app page');

  return errors;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main() {
  const t0 = Date.now();

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const pages = fs.readdirSync(SRC)
    .filter((f) => f.endsWith('.html') && fs.statSync(path.join(SRC, f)).isFile())
    .sort();

  const problems = [];

  pages.forEach((page) => {
    const out = renderPage(path.join(SRC, page));
    const isApp = APP_PAGES.has(page);

    fs.writeFileSync(path.join(ROOT, page), out, 'utf8');
    fs.writeFileSync(path.join(DIST, page), out, 'utf8');

    const errs = validatePage(page, out, isApp);
    const markupErrors = verifyMarkupBalance(page, out);
    if (markupErrors.length) errs.push(...markupErrors);
    if (errs.length) problems.push(`${page}: ${errs.join(', ')}`);
  });

  const assets = copyAssets();

  // Determinism / sanity: every source page must have been written.
  pages.forEach((p) => {
    if (!fs.existsSync(path.join(DIST, p))) problems.push(`${p}: not written to dist/`);
    if (!fs.existsSync(path.join(ROOT, p))) problems.push(`${p}: not written to root`);
  });

  console.log(`✅ Built ${pages.length} HTML pages (root + dist) + copied ${assets} asset entries (${Date.now() - t0}ms)`);
  if (problems.length) {
    console.error('❌ Validation failed:');
    problems.forEach((p) => console.error('   - ' + p));
    process.exitCode = 1;
  } else {
    console.log('✅ Head/meta validation passed (charset first, hardened viewport, no leftovers).');
  }
}

main();
