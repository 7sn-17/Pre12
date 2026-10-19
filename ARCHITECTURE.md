# ARCHITECTURE.md

**Medical Platform — architecture & maintenance guide**

- SPA router: `app.js` **v4.7.0**
- Service worker: `sw.js` **v4.7.0**
- Build: `build.js` (Node.js ≥ 18, `acorn` ^8.19.0)
- Visual / behavioural baseline: `tools/_orig/` (read-only reference)
- Last updated: 2026-10-19 (Phase 8 — login polish, isolated top bar, streak pro)

> This document describes the current architecture. It does **not** change any
> code. All commands below are safe to run from the project root
> (`/data/data/com.termux/files/home/Pre12`).

---

## 0. The 10 rules (read this first)

1. **Edit pages in `src/*.html`** and shared fragments in `partials/`.
2. **Run `npm run build` after every edit.** This is the only build command.
3. **Never edit the root `*.html` files or anything inside `dist/`** — both are
   generated and are overwritten on every build.
4. **Serve the project root or `dist/`.** Never serve `src/` or `partials/`
   (they contain `{{tokens}}` and `<!-- @include -->` comments).
5. **Keep page scripts classic and inside `<body>`.** Do not use
   `type="module"` for scripts that must run after an SPA swap.
6. **Make event-handler functions top-level (global).** Do not hide them in an
   IIFE unless you explicitly expose them on `window`.
7. **A new SPA page must be added in three places:** `build.js` (`APP_PAGES`),
   `app.js` (`APP_PAGES`) and `sw.js` (`PRECACHE_URLS`).
8. **Bump `APP_VERSION`** (in `build.js` + `sw.js`) whenever `app.js` changes,
   and bump `CACHE_VERSION` (in `sw.js`) whenever `sw.js` or the precache list
   changes. Keep the three numbers in sync — they are the cache-buster for
   returning visitors.
9. **Need a link to bypass the SPA router?** Add `data-no-router` to the link
   (or any ancestor).
10. **After every change test:** a direct page load, SPA navigation, and
    Back/Forward. A page that only works on one of those is not finished.

---

## 1. Original Version vs. New Version

### 1.1 The Original Version (`tools/_orig/`)

- 19 **standalone** HTML pages. Every page contained its own complete
  `<head>`, fonts, CDN links, inline `<style>`, header/footer markup and
  inline scripts.
- There was **no build step**, **no partials**, **no `dist/`**, and **no SPA
  router**. Every link click caused a full document load (white flash,
  1–2 second delay, everything re-initialised).
- `tools/_orig/` remains the **ground truth** for the design. It is read-only
  and is excluded from `dist/`. Do not edit it.

### 1.2 The New Version

- **Source templates** live in `src/*.html`; shared fragments live in
  `partials/`. The head, header and footer are no longer duplicated.
- **`build.js`** renders every template into **two identical copies**:
  the project **root** (so the root is directly servable) and **`dist/`**
  (used by Vercel).
- **`app.js`** adds an SPA-style shell for 11 pages. Shared libraries,
  Supabase client, auth session, IndexedDB, theme and icons stay alive between
  page swaps.
- **`sw.js`** is now **network-first for HTML** (with cache/index/offline
  fallbacks) and uses versioned caches, so a new deployment is picked up
  immediately.
- **`vercel.json`** builds with `npm run build` and publishes `dist/`.
- The root `*.html` files are now **build output**, not source. The old broken
  state (serving raw `<!-- @include partials/head.html -->` templates) is
  impossible after a build.

### 1.3 What is identical, and what is new

**Identical (verified by static comparison against `tools/_orig/`):**

- Page **CSS preserves the original design**; the only intentional edits are
  light-theme header/shadow/icon-contrast polish plus the shell additions in
  §1.3.
- **Visible body markup is structurally identical** (after stripping HTML
  comments and shell scripts); a few inline colours were changed so icons stay
  visible in light mode.
- **Every original `<head>` meta/link/title is present** (the new head is a
  superset).
- Page **inline scripts are AST-identical**, except for the deliberate
  top-level `const`/`let`/`class` → `var` rewrite on SPA pages and a few inline
  colour strings.
- `<html lang="ar" dir="rtl">`, RTL layout, colours, spacing, icons and text
  are unchanged.

**New / different (all intentional):**

- `<meta charset="UTF-8">` is the **first** element inside `<head>`.
- Explicit hardened viewport:
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`.
- PWA metas and manifest links are emitted consistently (some pages now have
  them in addition to the original tags).
- A small shell `<style data-shell>` adds View Transitions rules, global
  smooth scrolling, the top navigation loader and light-theme header/shadow
  polish.
- `<script src="app.js?v=4.3.0">` is injected on SPA pages only.
- SPA navigation gets a short (~0.2 s) cross-fade in browsers that support the
  View Transitions API. Full page loads are unchanged. The fixed bottom nav and
  the sticky header are frozen and never move, fade or show a ghost shadow.
- Shared shell scripts (`partials/perf.html`) and, on pages that include it,
  `partials/sw-register.html` appear at the end of `<body>` with
  `data-shell`. They run on the initial load only.
- `Quicklink` and `Speculation Rules` (from an intermediate optimisation
  phase) are **not** used. They were removed to avoid double navigation and
  prerender side effects.

### 1.4 Why the old root templates broke the site

- The root `*.html` previously contained `<!-- @include partials/head.html -->`
  literally. Served as-is, the browser received:
  - no `<meta charset="UTF-8">` → garbled Arabic;
  - no viewport → desktop-width layout on mobile;
  - no Cairo / FontAwesome / Lucide links;
  - no shared scripts → stuck spinners.
- **Fix:** `build.js` expands every include/token and writes the finished page
  to both the root and `dist/`.

---

## 2. Folder structure

```text
Pre12/
├── src/                     # ✅ EDIT PAGE SOURCE HERE (22 templates)
│   ├── index.html
│   ├── subject.html
│   ├── viewer.html
│   ├── notes.html
│   ├── goals.html
│   ├── my-lectures.html
│   ├── all-files.html
│   ├── tools.html
│   ├── gpa.html
│   ├── admin.html
│   ├── admin-user.html
│   ├── progress.html
│   ├── plans.html
│   ├── upload.html
│   ├── login.html
│   ├── confirm.html
│   ├── about.html
│   ├── privacy.html
│   ├── terms.html
│   ├── reset-password.html
│   ├── onboarding.html
│   └── offline.html
├── partials/                # ✅ EDIT SHARED FRAGMENTS HERE
│   ├── head.html            # charset, viewport, Cairo, libs, PWA, shell CSS
│   ├── header.html          # shared top header
│   ├── topbar.html          # ⭐ unified top-bar CSS (the notes.html design)
│   ├── footer.html          # shared footer
│   ├── scripts.html         # emits <script src> tags from front-matter "scripts:"
│   ├── sw-register.html     # service-worker registration (data-shell)
│   └── perf.html            # feature flag for no-VT browsers (data-shell)
├── dist/                    # ⛔ GENERATED deployment output (never edit)
├── *.html                   # ⛔ GENERATED root pages (never edit)
├── app.js                   # ✅ SPA router (shared, loaded once)
├── build.js                 # ✅ build system
├── sw.js                    # ✅ service worker
├── auth.js                  # ✅ shared Supabase auth helpers (+ profile cache)
├── db.js                    # ✅ shared database helpers
├── sync.js                  # ✅ cross-device account sync (tasks/favorites/notes)
├── streak.js                # ⭐ pure streak logic (runs in the browser AND Node)
├── files.js                 # ✅ shared file/PDF helpers (+ offline-first data)
├── supabase-config.js       # ✅ Supabase client (URL + anon key)
├── theme-init.js            # ✅ applies saved theme before paint
├── plans-data.json          # ✅ real study schedule (Today's Card)
├── plans/                   # ✅ plan images (chem.jpg, bio.jpg, phys.jpg, eng.jpg, zero.jpg)
├── manifest.json            # ✅ PWA manifest
├── icon-512.png             # ✅ app icon
├── icons/                   # ✅ small icons (drbaraa, flipclock, forest, notion)
├── *.png                    # ✅ illustrations (copied to dist)
├── package.json             # ✅ scripts + acorn dependency
├── package-lock.json        # ✅ pinned install
├── vercel.json              # ✅ deployment config
├── README.md                # ✅ project readme (excluded from dist)
├── ARCHITECTURE.md          # this file (excluded from dist)
├── prompt*.txt              # task/tooling notes (excluded from dist)
├── tools/_orig/             # 📖 READ-ONLY original pages (excluded from dist)
└── node_modules/            # dependencies (not deployed)
```

### 2.1 Where to edit what

| I want to change… | Edit this |
|---|---|
| Page HTML, text, page-specific CSS or page scripts | `src/<page>.html` |
| Shared `<head>` (meta, fonts, libs, PWA, shell CSS) | `partials/head.html` |
| Shared header / footer | `partials/header.html`, `partials/footer.html` |
| **The top bar (height, padding, colours, icons)** | **`partials/topbar.html`** (include it in the page's `<style>`) |
| Theme bootstrap | `theme-init.js` |
| Supabase URL/key/client | `supabase-config.js` |
| Auth / DB / file helpers | `auth.js`, `db.js`, `files.js` |
| Cross-device account sync | `sync.js` (tasks, favorites, notes) |
| Study-streak rules | `streak.js` (pure logic — also unit-tested) |
| SPA navigation behaviour | `app.js` (+ version bump, see §7) |
| Offline caching | `sw.js` (+ `CACHE_VERSION` bump) |
| Build logic, libs registry, front-matter defaults | `build.js` |
| Deployment / cache headers | `vercel.json` |
| Icons, images, manifest | `icons/`, `icon-512.png`, `*.png`, `manifest.json` |
| Database schema | `supabase/migrations/*.sql` (applied via the Supabase SQL editor) |

### 2.2 Important

- **The root `*.html` files are generated.** Editing them appears to work until
  the next `npm run build`, then your edit is overwritten.
- **`dist/` is deleted and recreated on every build.** Never store anything
  there by hand.
- **`src/` and `partials/` are not servable pages.** Opening `src/index.html`
  in a browser shows raw templates.
- **Serve the root or `dist/`.** For Vercel, only `dist/` is published.

---

## 3. The build system (`build.js`)

### 3.1 Exact commands

First time only (installs the JS parser used by the build):

```bash
npm install
```

**Every time you edit anything:**

```bash
npm run build
# equivalent to:
node build.js
```

There is also:

```bash
npm run dev
```

`npm run dev` runs the same build and prints a hint; it does **not** start a
server. Use any static server (see §8.3).

Requirements: **Node.js ≥ 18**. `acorn` is a production dependency, so
`npm install --omit=dev` also works on Vercel.

### 3.2 What the build does (exact pipeline)

1. Deletes `dist/` and recreates it.
2. Reads every `src/*.html` file (sorted, deterministic).
3. Parses the leading front-matter block `<!--@ ... -->`.
4. Computes variables: libs, scripts, snippets, PWA block, header/footer
   defaults, back icon.
5. Expands `<!-- @include partials/xxx.html -->` recursively (max 25 levels),
   relative to the project root.
6. Expands `{{#if key}}…{{/if}}` and `{{#unless key}}…{{/unless}}`.
7. Replaces `{{token}}` with values (unknown tokens become empty).
8. **On SPA pages only:** injects
   `<script src="app.js?v=4.3.0"></script>` before the first inline body
   script and rewrites top-level `const`/`let`/`class` to `var`.
9. Writes the finished HTML to **`./<page>.html`** and **`dist/<page>.html`**
   (identical copies).
10. Copies assets (everything at the root except sources/tooling) into `dist/`.
    Top-level `*.html` are skipped here because they were rendered in step 9.
11. Validates every page:
    - charset present **and first** in `<head>`;
    - hardened viewport present;
    - no unresolved `@include` or `{{token}}`;
    - `app.js` injected on SPA pages and **not** leaked into full-load pages.
12. Prints a summary. If validation fails, the process exits with code `1`
    and lists the page + reason.

### 3.3 Front-matter reference

Every `src/<page>.html` starts with a block like:

```html
<!--@
title: صفحة جديدة — المنصة الطبية
libs: supabase, lucide
scripts: supabase-config, auth, db, files
sw: true
backHref: index.html
headerTitle: صفحة جديدة
-->
```

| Key | Meaning | Default |
|---|---|---|
| `title` | `<title>` of the page | — |
| `themeColor` | `<meta name="theme-color">` | `#06110d` |
| `fontWeights` | Cairo weights in the Google Fonts URL | `400;500;600;700;800;900` |
| `libs` | Comma-separated keys from the `LIBS` registry in `build.js` | empty |
| `scripts` | Comma-separated base names; emits `<script src="name.js">` | empty |
| `snippets` | `themeDark` and/or `onboardingRedirect` | empty |
| `pwa` | `full` (PWA metas) or `none` | `full` |
| `themeInit` | `true`/`false`: include `theme-init.js` | `true` |
| `backHref` | Header back link | `index.html` |
| `backClass` | Back link CSS class | `nav-btn` |
| `backIcon` | `lucide` or `fa` | `lucide` |
| `headerCenter` | Wrap the title in `.header-center` | — |
| `titleAttrs` | Extra attributes on `.header-title` (e.g. `id="headerTitle"`) | — |
| `headerTitle` | Header title text | — |
| `headerSub` | Extra header sub-markup | — |
| `headerTrailing` | Right-side header markup | empty spacer |
| `footerAbout` | Use the “made with love” + legal footer variant | — |
| `footerLinkHref` / `footerLinkText` | Second footer link | — |
| `sw` | **Informational only** (see note below) | — |

**Available `libs` keys** (defined in `build.js`):

- `fontawesome` — cdnjs Font Awesome 6.5.1
- `fontawesome-jsdelivr` — jsDelivr Font Awesome 6.5.1
- `supabase` — Supabase JS v2
- `lucide` — Lucide icons (`unpkg.com/lucide@latest`)
- `pdfjs` — PDF.js 3.11.174
- `html2canvas` — 1.4.1
- `jspdf` — 2.5.1

> **`sw:` is not read by the build.** It is metadata/legacy. The actual
> service-worker registration is enabled by including
> `<!-- @include partials/sw-register.html -->`. Pages `tools.html` and
> `gpa.html` deliberately do not include it; `offline.html` and
> `onboarding.html` do not either. If a service worker is already active for
> the origin, those pages are still controlled by it — they just do not
> register/update it themselves.

### 3.4 Includes, conditionals and tokens

- `<!-- @include partials/head.html -->` — inserts the partial (relative to
  project root; recursive).
- `{{#if key}} … {{/if}}` — render only when `key` is truthy.
- `{{#unless key}} … {{/unless}}` — render only when `key` is falsy.
- `{{key}}` — value substitution; unknown tokens become empty.
- Falsy values for conditionals: `undefined`, `''`, `'false'`, `'0'`, `'none'`.

### 3.5 The SPA transform (why `const` → `var`)

`build.js` only does this on pages listed in its `APP_PAGES` set:

- It finds the first `<body>`.
- It collects **inline** `<script>` blocks that appear **after** `<body>`,
  excluding:
  - scripts with `src` (external libraries — loaded once, never re-run);
  - scripts with `data-shell` (shell code — initial load only);
  - non-JavaScript data blocks (`application/json`, etc.).
- It inserts `<script src="app.js?v=4.3.0"></script>` before the **first**
  inline body script.
- It rewrites **Program-level only**:
  - `const x = …` → `var x = …`
  - `let x = …` → `var x = …`
  - `class X { … }` → `var X = class X { … };` (the internal class name is
    preserved).
- Block-scoped / loop-scoped `let`/`const` are **left untouched** — each
  execution gets a fresh block scope, so they cannot collide.
- If an inline script cannot be parsed, the build prints a warning and leaves
  it unchanged (re-execution of that script may then throw). Keep scripts
  syntactically valid.

**Why this is needed** — see §4.5.

> **Gotcha:** an SPA page must contain **at least one inline body script**.
> Otherwise the build has nowhere to inject `app.js`, and validation fails
> with `app.js not injected`. Add a small init `<script>` to the page.

### 3.6 Validation

The build fails (exit code `1`) if any page has:

- a missing UTF-8 charset, or the charset is not the first element in `<head>`;
- a missing hardened viewport;
- an unresolved `@include` or `{{token}}`;
- `app.js` missing on an SPA page;
- `app.js` leaked into a full-load page.

Fix the **source** (`src/` or `partials/`), then rebuild. Never patch the
generated output.

### 3.7 Assets copied to `dist/`

Everything at the project root is copied recursively **except** the entries in
`build.js`'s `EXCLUDE_TOP`:

```text
dist, node_modules,          ← build output & dependencies
src, partials,               ← sources (compiled into the pages)
tools,                       ← the visual baseline
build.js, package.json, package-lock.json, vercel.json,
.git, .gitignore,
README.md, ARCHITECTURE.md,  ← documentation
supabase,                    ← database migrations
master.test.js               ← test files
```

- Top-level `*.html` are rendered separately and are not copied.
- Images, `icons/`, `manifest.json`, shared JS and `sw.js` are copied.
- **`prompt*.txt` and `*.test.js` / `*.spec.js` are excluded by a separate
  pattern** (`EXCLUDE_FILE`), so new working notes or test files never need a
  build change.
- **New tooling files are not automatically excluded.** If you add one (e.g.
  `lint.js`), add its name to `EXCLUDE_TOP` in `build.js`.
- If a new asset is missing from `dist/`, check that it is at the root (or in a
  copied directory) and is not listed in `EXCLUDE_TOP`.

### 3.8 Determinism

- Pages are read in sorted order.
- No timestamps or random values are written.
- Running the build twice produces identical files.
- Root and `dist/` are byte-identical copies of the generated HTML.

---

## 4. The SPA router (`app.js`)

### 4.1 What the shell keeps alive

On the initial load, the whole document loads normally (head, fonts, CDN
libraries, Supabase client, auth helpers, IndexedDB, theme). On SPA navigation,
`app.js` only replaces:

- `<body>` contents;
- the page-specific `<style>` blocks (all `<style>` without `data-shell`);
- `<title>`;
- `<meta name="theme-color">`;
- body attributes;
- the scroll position (new page → top; Back → saved position).

It does **not** reload the shared libraries or the Supabase client. That is why
navigation is fast.

### 4.2 How links are intercepted

`app.js` installs one **capture-phase** `click` listener on `document`.

For a click it checks:

- not already `defaultPrevented`;
- primary button (`button === 0`);
- no `Ctrl` / `Meta` / `Shift` / `Alt`;
- the click target is inside an `<a>`.

Then `eligibleLink(a)` must be true. A link is **not** intercepted when:

- it has a `target` (e.g. `_blank`);
- it has `download`;
- it or an ancestor has `data-no-router`;
- `href` is empty or starts with `#`;
- `href` contains any `#` at all (anchor links stay full loads);
- the scheme is `mailto:`, `tel:`, `sms:`, `javascript:`, `blob:` or `data:`;
- it is cross-origin;
- it points to the **same document** (same path + query);
- its basename is not in `APP_PAGES` (see §5).

**Interactive-control guard:** if the click is on a `button`, `input`,
`select`, `textarea`, `label`, `[role="button"]`, `[data-action]`,
`[data-action-sheet]` or `[data-no-router]` **inside** the link, the router
does nothing and the page’s own handler runs. This protects like/save/share
buttons on cards.

When a link is eligible:

1. `e.preventDefault()`;
2. `rememberScroll()` stores the current scroll position in the current
   history entry (`history.replaceState`);
3. `navigate(a.href, true, false)` starts the SPA navigation.

**Prefetch:** `pointerover`, `touchstart` and `focusin` trigger a low-priority
`fetch()` of eligible links to warm the HTTP/SW cache.

> **Capture-phase caveat:** because this listener runs **before** the link’s
> own `onclick`/JS handlers, calling `event.preventDefault()` inside a link’s
> handler will **not** stop the router. If a link must run custom JS instead of
> navigating, add **`data-no-router`** to it (or use a `<button>`).

### 4.3 Navigation pipeline (`navigate`)

1. Resolve the URL.
2. If it is not an SPA page, or it contains a hash → **full page load**
   (`window.location.href`). This is the safety path for auth/legal/anchor
   links.
3. If another navigation is in flight, queue this one (last one wins).
4. Set `navigating = true`, record a navigation token, show the progress
   cursor.
5. `fetchWithTimeout(url, 15s)` using `AbortController`. Any network error,
   HTTP error or timeout → **full page load fallback** (unless a newer
   Back/Forward traversal superseded it).
6. Parse the response with `DOMParser`.
7. `loadMissingAssets(doc)`:
   - adds any missing `<link rel="stylesheet">` to `<head>`;
   - loads any missing `<script src>` **sequentially** (dependency order);
   - **never loads `app.js` again** (prevents a second router);
   - pauses listener recording while loading libraries.
8. `doSwap()` (inside `document.startViewTransition` when available):
   - if the token is stale (the user pressed Back), abort the swap;
   - `syncHead`: title, theme-color, page `<style>` blocks;
   - `syncTheme`: re-apply `data-theme` from `localStorage`;
   - **`history.pushState` before running page scripts** so pages that read
     `location.search` (`subject.html`, `viewer.html`, …) see the new URL;
   - `swapBody`: remove old view listeners, copy body attributes, replace
     `body.innerHTML`;
   - `scrollTo(0, 0)` for a new page;
   - `runViewScripts()`: re-execute the page’s inline scripts;
   - update the “current view” key (in case a page normalised the URL with
     `replaceState`);
   - refresh Lucide icons.
9. If View Transitions are unavailable, swap synchronously (no body animation,
   so the fixed nav cannot move or fade).
10. Reset the navigation lock and, if a Back/Forward navigation was queued,
    run it now.

### 4.4 What happens to scripts on a swap

- Setting `body.innerHTML` **does not execute** `<script>` tags.
- The router then finds every **inline** script in the new body and replaces
  it with a fresh `<script>` element (same attributes + same code). Inserting
  a classic script executes it **synchronously, in document order**.
- It **skips**:
  - scripts with `src` (shared libraries are already loaded once);
  - scripts with `data-shell` (shell-only code; runs on initial load only);
  - scripts with a non-classic `type` — **including `type="module"`**.
- After the scripts run, the router **replays `DOMContentLoaded` handlers**
  that were registered on `window` or `document` during the page script,
  because `DOMContentLoaded` will never fire again on the same document.
- Then it refreshes icons (`lucide.createIcons()` immediately, on the next
  animation frame, and again after 80 ms).

**Consequences for your code:**

- Page scripts must be **classic** (`<script>` or `type="text/javascript"`).
  `type="module"` page scripts will **not** run after a swap.
- Page scripts must be **inside `<body>`**. Scripts in `<head>` are not
  transformed, not re-executed, and not scanned by the router.
- `window.onload = init` will **not** run on a swap. Use one of:
  ```js
  // A) run now (works on full load and on swap)
  init();

  // B) the pattern used by viewer/admin:
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // on a swap the document is already "complete"
  }

  // C) unconditional listener: the router replays it after a swap
  document.addEventListener('DOMContentLoaded', init);
  ```

### 4.5 Why `var` instead of `const` / `let`

Classic scripts share the global lexical environment. If a page script is
executed a second time, any top-level `const`, `let` or `class` declaration
throws:

```text
SyntaxError: Identifier 'state' has already been declared
```

That was the failure mode of the first SPA attempt. The fix is deliberate:

- **`const`/`let`/`class` → `var` only at Program level** (top level) and only
  on SPA pages.
- `var` and `function` declarations are **redeclarable**, so re-execution is
  safe.
- The bindings remain **global**, exactly like the original pages. Inline
  handlers (`onclick="foo()"`) and handlers generated dynamically in template
  strings keep working, because `foo` is a real global.
- **No IIFE, no wrapper, no exposure list.** Nothing is hidden from inline
  handlers or from code in another `<script>` block.
- `class X` becomes `var X = class X { … };` so the class name and body are
  preserved.
- Block/loop-scoped `let`/`const` are untouched: each execution creates a new
  block scope, so there is no redeclaration conflict.

**Caveats:**

- Top-level `const`/`let` become properties of `window`. Avoid names that
  clash with non-configurable window properties (`name`, `length`, `origin`,
  `top`, `parent`, …). The current pages do not.
- Page scripts share the global scope. Prefix page-specific state
  (`notesState`, `goalsState`, `adminState`, …) to avoid collisions.
- `var` is hoisted (initialised `undefined`) before its assignment; `let`
  would be in the temporal dead zone. In these page scripts, code always runs
  top-to-bottom, so this is not observable.
- Full-load pages are **not** transformed. Their top-level `const`/`let` stay
  as in the originals, because they are loaded once per document.

### 4.6 Listener cleanup between views

`app.js` temporarily wraps `EventTarget.prototype.addEventListener` and,
while a page is initialising, records listeners added to **`window` or
`document`** only. At the next swap it removes them.

- Element listeners die with the DOM and are not recorded.
- `navigator.serviceWorker`, `MediaQueryList`, etc. are not recorded.
- A denylist is **never** removed:
  `visibilitychange`, `storage`, `focus`, `blur`, `beforeunload`, `unload`,
  `pagehide`, `pageshow`, `popstate`, `hashchange`.
- **Intervals are not tracked.** If you add a long-lived `setInterval` in a
  page script, clear it yourself (e.g. on `pagehide`) or avoid it. Global
  Supabase token-refresh timers must not be cleared.
- **Non-DOM resources** use the per-view cleanup hook. Register it from the
  page's init function:
  ```js
  MedApp.onViewCleanup(function () {
    // close IndexedDB connections, revoke blob: URLs, stop rAF/interval work…
  });
  ```
  The router calls the hook once, immediately before replacing the view, and
  then clears it. Do not use it for shell/shared-library resources.
- **Do not register denylisted events per page.** They are never
  auto-removed, so they would accumulate on every swap. Register them once in
  a shared file, or remove them manually.

### 4.7 Icons and theme

- **Icons:** the router calls `lucide.createIcons()` after every swap. If you
  inject new markup later, call `lucide.createIcons()` again or
  `MedApp.refreshIcons()`.
- **Theme:** `theme-init.js` sets `data-theme` before paint from
  `localStorage.medfav_theme` (default **light**). `syncTheme()` re-applies it
  on every swap. A theme toggle must update both `localStorage` and
  `document.documentElement.dataset.theme`.
- Pages with `themeInit: false` (`goals`, `notes`, `onboarding`) rely on their
  own theme code.

### 4.8 Back / Forward and scroll

- `history.scrollRestoration = 'manual'`: the router owns scroll restoration
  so the browser cannot reset the new view to the top.
- Link clicks save `window.scrollY` in the current history entry. A debounced
  scroll listener also keeps it current, so leaving via the browser's Back
  button (not just an intercepted link) is covered.
- `popstate`:
  - same path+query (hash-only) → the browser handles it natively;
  - a different SPA page → `navigate(..., push=false, restoreScroll=true)`;
  - a non-SPA page or a hash URL → `navigate()` falls back to a full load.
- The target scroll is read **before** the swap (page scripts such as
  `my-lectures` call `replaceState` during init and would wipe it).
- If the user presses Back while a forward page is still loading, the in-flight
  swap is cancelled (token check) and the Back target is loaded.
- On a successful forward swap the new page jumps to the top. On Back the
  saved position is applied synchronously in the swap (so the View Transition
  snapshot is already correct), then retried for up to 4 s while async content
  (Supabase lists, images, Lucide icons) makes the document taller. A
  `medapp-scroll-jump` class bypasses `scroll-behavior: smooth` for these
  jumps; a user wheel/touch cancels the retries.
- The thin `#medapp-loader` bar is shown as soon as an SPA navigation starts
  and hidden when the swap (and View Transition) finishes.

### 4.9 Public API

```js
MedApp.navigate('subject.html?slug=math'); // SPA if whitelisted, full load otherwise
MedApp.refreshIcons();                     // re-run lucide.createIcons()
MedApp.onViewCleanup(fn);                  // release view-owned non-DOM resources
```

`MedApp._viewListeners` exists for debugging; do not depend on it.

### 4.10 Known constraints (by design)

- **Hash links always full-load.** `href="page.html#section"` is not SPA
  navigated.
- **Head `<link>`/meta changes are not fully synced.** Title, theme-color,
  page `<style>` and body attributes are; arbitrary new head tags only apply
  on a full load. Keep page-specific CSS inline in `<style>`.
- **Page-specific external CSS accumulates.** `loadMissingAssets` adds missing
  `<link>` stylesheets but never removes them. Prefer inline page CSS.
- **Old async callbacks can outlive a swap.** An in-flight Supabase call from
  the previous page may resolve after the new page rendered. Guard async code
  with an element check or a view token, and keep globals page-prefixed.
- **`history.pushState` used later for filters** can make the router’s
  “current view” key stale. Back then triggers a normal SPA refetch (not a
  break), but prefer `replaceState` for in-page state (as `my-lectures` does).

---

## 5. App pages vs. full-load pages

### 5.1 The two sets

| Mode | Pages | Why |
|---|---|---|
| **SPA (fast)** | `index.html`, `subject.html`, `viewer.html`, `notes.html`, `goals.html`, `my-lectures.html`, `all-files.html`, `tools.html`, `gpa.html`, `admin.html`, `plans.html`, `progress.html` | Browsing/reading/tools that benefit from instant navigation and a shared Supabase session. They are safe to re-initialise in a shared shell. |
| **Full load** | `upload.html`, `admin-user.html`, `login.html`, `confirm.html`, `about.html`, `privacy.html`, `terms.html`, `reset-password.html`, `onboarding.html`, `offline.html` | Auth/OAuth/email links, the standalone admin student profile, file-upload forms, first-run redirects, legal pages, and the offline page. A clean document is safer and simpler; these are rare navigation targets. |

- `upload.html` is intentionally a **full load**. Its upload/auth script is
  unchanged and runs normally on every document load.
- `login`, `confirm`, `reset-password` must keep redirects/OAuth/email-link
  handling in a clean document.
- `onboarding` / `offline` must work independently of the app shell.
- `about` / `privacy` / `terms` are static and not worth re-initialising in
  the shell.
- Full-load pages still get the shared head/header/footer and, if they include
  it, the service-worker registration.

### 5.2 The single source of truth

The whitelist exists in **two JavaScript files** and a third list for offline:

| Purpose | File | Structure |
|---|---|---|
| Build: inject `app.js` + transform scripts | `build.js` | `APP_PAGES` **Set** |
| Runtime: intercept links | `app.js` | `APP_PAGES` **object** |
| Offline: precache | `sw.js` | `PRECACHE_URLS` array |

**They must be kept in sync.** If a page is in `app.js` but not in `build.js`,
the router will try to run untransformed scripts (redeclaration errors). If it
is in `build.js` but not `app.js`, it gets `app.js`/the transform but links to
it still full-load. If it is missing from `sw.js`, it works online but may not
work offline.

### 5.3 How to change a page’s mode

- **Full load → SPA:** add the page name to `build.js` `APP_PAGES`, add it to
  `app.js` `APP_PAGES`, add it to `sw.js` `PRECACHE_URLS`, bump the versions
  (§7), rebuild, and test.
- **SPA → full load:** remove it from both `APP_PAGES` sets. (It will no longer
  get `app.js` or the transform.) Optionally keep it in the SW precache.

Make sure the page follows the SPA rules in §4.4 (classic body scripts).

### 5.4 Cross-device account data

Supabase is the source of truth for signed-in accounts:

| Data | Cloud table | Local cache | Sync entry point |
|---|---|---|---|
| Task progress | `task_progress` | `task_<date>_<id>` + queue | `syncTaskProgressFromCloud()` in `db.js` |
| Private/shared notes | `notes` (`is_shared`) | `medfav_my_notes_v3`, `medfav_pending_v3`, `medfav_shared_cache_v3` | `syncNotesFromCloud()` in `sync.js` |
| Favorites | `favorites` | IndexedDB `favorites` store | `syncFavoritesFromCloud()` in `sync.js` |
| Lecture albums/images | `lecture_albums`, `schedule_images` | IndexedDB fallback for offline reads | queried directly by `my-lectures.html` |
| Album image requests | `album_requests` | — | queried directly by `my-lectures.html` |
| **User profile** | `profiles` | **`medapp_profile_cache_v1`** | **`cacheProfile()` in `auth.js`** |

- `auth.js` `signIn()` forces `runFullUserSync()` before redirecting, and
  `getSession()` runs the same deduplicated sync before a page reads its cache.
- Every local cache stores an account owner marker. If a different account
  signs in on the same browser, the old task keys/queue, notes and favorites
  are cleared before the new account is shown.
- Offline writes are queued. Task and favorite queues are keyed by `user_id`;
  notes use client-generated UUIDs so retries are idempotent.
- `favorites` is owner-only via RLS (`auth.uid() = user_id`), and anonymous
  access is revoked. Notes keep the existing own-or-shared SELECT policy.
- The **profile cache** (`medapp_profile_cache_v1`) holds the full name, role
  and avatar of the signed-in account. It is written on every successful sync
  and on sign-in, and it is **read instead of the network when offline**, so
  the UI never falls back to the raw email or an English username.
  `getCachedProfile(userId)` refuses to return another account's profile.

### 5.5 Offline-first data strategy (Phase 5 + Phase 6)

The rule for every data read in the app is: **check `navigator.onLine` first,
then use the local copy, and only then touch the network.**

| Data | Offline source | Helper |
|---|---|---|
| Study plan | `medapp_plans_data_v1` (localStorage) + the SW cache | `fetchPlanData()` in `files.js` |
| Subjects / recent files | `medfav_data_*` (localStorage) | `fetchSubjects()`, `fetchRecentFiles()` in `files.js` |
| File counts per subject | `medapp_subject_file_counts_v1` | `fetchSubjectFileCount()` in `files.js` |
| Profile | `medapp_profile_cache_v1` | `getCachedProfile()` in `auth.js` |
| Task progress | `task_<date>_<id>` keys | `getLocalCompletedTaskKeys()` in `db.js` |
| Favorites / notes | IndexedDB + localStorage queues | `db.js` / `sync.js` |
| **Lecture albums + images** | **IndexedDB `medapp_lecture_albums_v1` (v2)** | **`loadLocalData()` in `my-lectures.html`** |

- `files.js` uses **stale-while-revalidate**: if a cached copy exists it is
  returned *immediately*, and the network refresh happens in the background
  (the `onFresh` callback re-renders the list). The UI never shows a skeleton
  while a network request is pending.
- Every network call is bounded by `withTimeout(promise, 6000)`, so a dead
  connection cannot freeze a page for the browser's default timeout.
- `sw.js` serves local `.json` files with a **cache-first** strategy
  (`handleJSONRequest`), so `plans-data.json` is available instantly.
- `navigator.onLine === false` is treated as authoritative; `isOffline()` in
  `files.js` is the single place that decides.

#### 5.5.1 The IndexedDB mirror (Phase 6 — "My Lectures" offline)

The My Lectures page used to keep an *empty* IndexedDB, so every album
vanished the moment the network went off. The fix is a **mirror**:

```text
online   → loadCloudData()  →  mirrorCloudToLocal()  →  render
offline  → loadLocalData()  →  render          (ZERO network requests)
```

`medapp_lecture_albums_v1` (version **2**) has four stores:

| Store | Content | Written by |
|---|---|---|
| `albums` | album rows + a `scope` (`mine` / `explore`) | `mirrorCloudToLocal()` |
| `images` | image metadata (title, url, path, owner) | `mirrorCloudToLocal()` |
| `blobs` | the image **bytes** (`Blob`) | `cacheImageBlob()` / `localSaveImage()` |
| `meta` | `last_sync`, `owner` | `localSetMeta()` |

- `loadLectureData()` checks `navigator.onLine` **first**: offline it calls
  `loadLocalData()` and never touches Supabase.
- `mirrorCloudToLocal()` runs after every successful cloud load and prunes
  rows that belong to the signed-in account but no longer exist upstream.
- Images are resolved in this order: **IndexedDB blob → Cache API →
  remote URL**. The Cache API lookup uses `caches.match(url)`, which searches
  every cache (including the service worker's `medfav-imgs-*` cache).
- `warmAlbumImages()` pre-downloads the first 40 images in the background so
  the gallery opens offline later.
- `watchLectureConnection()` reloads from the cloud the moment the browser
  comes back online, and switches to the local copy when it goes offline.

---

## 6. How to add a new page or feature

### 6.1 Add a **full-load** page (recommended for auth/legal/forms)

1. Create `src/newpage.html` starting with front matter:

   ```html
   <!--@
   title: صفحة جديدة — المنصة الطبية
   libs: lucide
   scripts: supabase-config, auth, db, files
   sw: true
   backHref: index.html
   headerTitle: صفحة جديدة
   -->
   <!DOCTYPE html>
   <html lang="ar" dir="rtl">
   <head>
   <!-- @include partials/head.html -->
   <style>
     /* page-specific CSS goes here */
   </style>
   </head>
   <body>
   <!-- @include partials/header.html -->
   <main>
     <!-- page content -->
   </main>
   <!-- @include partials/footer.html -->
   <!-- @include partials/scripts.html -->
   <!-- @include partials/sw-register.html -->
   <!-- @include partials/perf.html -->
   </body>
   </html>
   ```

2. Add a link to it (`<a href="newpage.html">…</a>`) from the appropriate page.
3. **Do not** add it to `APP_PAGES` — it will be a normal full load.
4. Optional: add `/newpage.html` to `sw.js` `PRECACHE_URLS` and bump
   `CACHE_VERSION` for offline support.
5. Run `npm run build`.
6. Test a direct load.

### 6.2 Add an **SPA** page

1. Create `src/newpage.html` as in §6.1, but make sure it has at least one
   **inline classic script in `<body>`** (required for `app.js` injection).
   A minimal init:

   ```html
   <script>
     function init() {
       // runs on full load and after every SPA swap
     }

     if (document.readyState === 'loading') {
       document.addEventListener('DOMContentLoaded', init);
     } else {
       init();
     }
   </script>
   ```

2. Add `'newpage.html'` to the **`APP_PAGES` set in `build.js`**.
3. Add `'newpage.html': 1` to the **`APP_PAGES` object in `app.js`**.
4. Add `'/newpage.html'` to **`PRECACHE_URLS` in `sw.js`**.
5. Bump versions (§7): `APP_VERSION` in `build.js`, the
   `'/app.js?v=…'` entry in `sw.js`, and `CACHE_VERSION` in `sw.js`.
6. Add a normal `<a href="newpage.html">` link; it will now be intercepted.
7. Run `npm run build`.
8. Test: direct load, SPA click, Back/Forward, query params, icons, theme.

### 6.3 Add a JavaScript function / feature

- **Page-specific function** (most common):
  - Put it in a **top-level** `<script>` in the page **body**.
  - Use `function myFeature() { … }` (or a top-level `const`, which the build
    converts to `var` on SPA pages).
  - It becomes global, so `onclick="myFeature()"` and dynamically generated
    `onclick="myFeature('${id}')"` both work.
  - Do **not** wrap the whole script in an IIFE, because inline handlers look
    up `window.myFeature`. If you must use an IIFE, expose what you need:
    `window.myFeature = myFeature;`.
- **Shared function** (used by several pages):
  - Add it to `auth.js`, `db.js`, `sync.js` or `files.js` (or a new shared file).
  - Include that file via front matter `scripts:` on every page that needs it.
  - Shared files load **once** and are **not re-run** on SPA swaps. Do not put
    page-specific DOM code in them.
  - Add the file to `sw.js` `PRECACHE_URLS` and bump `CACHE_VERSION`.
- **Initialisation on every visit**:
  - Call `init()` at the end of the page script, or use the
    `readyState/else init()` pattern from §4.4.
  - Do not use `window.onload`.
  - Re-bind any element listeners inside the page render/init code; the old
    DOM is replaced on every swap.
- **Async work**: after an `await`, check that the page is still the active
  view (e.g. the expected element still exists) before touching the DOM.
- **Intervals**: not auto-cleaned. Clear them yourself or avoid long-lived
  timers in SPA pages.
- **Dynamic HTML**: after inserting markup with icons, call
  `lucide.createIcons()` / `MedApp.refreshIcons()`.

### 6.4 Add a shared library or CSS file

- **New CDN library**
  1. Add an entry to the `LIBS` object in `build.js`:
     ```js
     mylib: '<script src="https://cdn.example.com/mylib.js"></script>'
     ```
  2. Add the key to the page’s front matter: `libs: mylib, lucide`.
  3. `npm run build`.
  4. SPA pages: the router detects a missing `<script src>` in the fetched
     page and loads it before the swap. (For your own sanity, include the lib
     on the first page too.)
- **New shared local script**
  1. Create `myshared.js` at the project root.
  2. Add its base name to the front matter: `scripts: myshared`.
  3. Add `/myshared.js` to `sw.js` `PRECACHE_URLS`; bump `CACHE_VERSION`.
  4. `npm run build`.
- **New page CSS**: put it in that page’s `<style>` block. The router swaps
  page `<style>` blocks synchronously. Avoid external per-page `<link>` CSS
  (it is added but not removed on swaps and accumulates).

### 6.5 Add an asset / icon / image

1. Put the file at the project root (or inside `icons/`).
2. Reference it relatively (`icons/foo.png`, `my-image.png`).
3. `npm run build` copies it to `dist/`.
4. If it must work offline, add it to `sw.js` `PRECACHE_URLS` and bump
   `CACHE_VERSION`.
5. For a new top-level tooling file (not an asset), add it to `EXCLUDE_TOP` in
   `build.js` so it is not published.

### 6.6 Add a link that must **not** use the SPA router

- Add `data-no-router` to the `<a>` (or any ancestor):
  ```html
  <a href="index.html" data-no-router>إعادة تحميل الرئيسية</a>
  ```
- Use this when the link’s own JS handler calls `preventDefault()` and should
  run instead of navigating. (The router’s listener is capture-phase and runs
  first.)
- For actions, prefer a `<button>` instead of an `<a>`.

### 6.7 Add a page with query parameters (`?slug=…`, `?id=…`)

- Read `location.search` inside `init()` / the page script, exactly as the
  originals do.
- The router calls `history.pushState` **before** running the page script, so
  the query is already correct on SPA navigation and on Back/Forward.
- Example:
  ```js
  function init() {
    var slug = new URLSearchParams(location.search).get('slug');
    loadSubject(slug);
  }
  ```

### 6.8 Add a form

- Normal `<form>` submissions are **not** intercepted; they behave as full
  page loads. This is the safest choice.
- If you submit via `fetch`, keep the handler in the page script and show your
  own success/error UI.
- For an upload/auth form that needs a completely clean document, keep the
  page out of `APP_PAGES` (like `upload.html`).

### 6.9 Add an icon

- Use `<i data-lucide="icon-name"></i>` for Lucide.
- Use `<i class="fa-solid fa-…"></i>` for Font Awesome.
- After inserting icons dynamically, call `lucide.createIcons()`.
- Lucide is loaded from `https://unpkg.com/lucide@latest`; Font Awesome from
  the URL in the page’s `libs` front matter. Keep those URLs unchanged for
  visual parity.

### 6.10 Change the shared head / header / footer

- Edit `partials/head.html`, `partials/header.html` or
  `partials/footer.html`.
- Front-matter tokens are documented in §3.3.
- If you add a new token, add it to the page front matter (and, if it needs a
  default, to `DEFAULTS` in `build.js`).
- **Never** move `<meta charset="UTF-8">` out of the first position in the
  head; the build will fail validation.
- After editing, `npm run build`.

### 6.11 Add a service-worker precache entry

1. Add the URL (absolute, e.g. `'/newpage.html'`, `'/newasset.png'`) to
   `PRECACHE_URLS` in `sw.js`.
2. Bump `CACHE_VERSION`.
3. `npm run build` (this copies `sw.js` to `dist/`).
4. Deploy. Existing clients update on their next load/`reg.update()`; the
   one-time `controllerchange` reload applies the new worker.

---

## 7. Versioning & deployment

### 7.1 When to bump what

| You changed… | Bump | Where |
|---|---|---|
| `app.js` (router logic, `APP_PAGES`, etc.) | `APP_VERSION` and the `'/app.js?v=…'` precache entry | `build.js`, `sw.js` |
| `sw.js` logic or `PRECACHE_URLS` | `CACHE_VERSION` | `sw.js` |
| Any HTML/CSS/JS deployment | Recommended: `CACHE_VERSION` | `sw.js` |

**Version bump checklist (current: 4.7.0):**

1. `build.js`: `const APP_VERSION = '4.7.0';`
2. `sw.js`: `const CACHE_VERSION = 'v4.7.0';`
3. `sw.js`: `'/app.js?v=4.7.0',` in `PRECACHE_URLS`
4. `sw.js`: update the version comments/logs (optional but useful)
5. `npm run build`

**Why:** `app.js` is served with a long-lived immutable cache. The query string
is what forces returning visitors to fetch the new router. HTML is
network-first, so the new HTML references the new `?v=` automatically.

### 7.2 Vercel

`vercel.json`:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- `dist/` is generated during the Vercel build.
- Cache headers:
  - static assets (css/js/images/fonts): `public, max-age=31536000, immutable`;
  - HTML: `public, max-age=0, must-revalidate`;
  - `sw.js` and mutable local JS: `must-revalidate`.

`package.json` keeps `acorn` in `dependencies`, so the build works even with
production-only installs.

### 7.3 Local serving

Use any static file server, from the **root** or from **dist/**:

```bash
# root (generated pages + assets)
python3 -m http.server 8000

# or a Node static server
npx serve .
```

Then open `http://localhost:8000/`.

Do **not** use `file://` if you need the SPA or the service worker: `fetch()`
and service workers require HTTP(S). Full page loads and rendering still work
from `file://`, but SPA navigation falls back to full loads.

### 7.4 After deploying / stale UI

- HTML is **network-first**, so a new deploy is visible immediately when
  online.
- If an old service worker is still controlling the page, the new worker
  activates and the registration script reloads the page **once**
  (`controllerchange`).
- If you still see stale UI:
  1. Hard refresh once.
  2. DevTools → Application → Service Workers → **Unregister**.
  3. Application → Storage → **Clear site data** (last resort).
- If only `app.js` seems stale, check that `APP_VERSION`, the `?v=` in the
  HTML, and the `sw.js` precache entry all match, then redeploy.

---

## 8. Testing checklist

### 8.1 Build

- [ ] `npm run build` exits 0.
- [ ] Output says `Built 22 HTML pages (root + dist)` and
      `Head/meta validation passed`.
- [ ] Root and `dist/` are identical for HTML/JS.
- [ ] `dist/` contains **only** production files — no prompts, no tests,
      no `src/`, `partials/`, `tools/`, `supabase/` or docs.

### 8.2 Direct load (full document)

- [ ] Open each page by URL (not just by clicking).
- [ ] Arabic renders correctly (charset first).
- [ ] Mobile layout is correct (viewport).
- [ ] Fonts/icons load.
- [ ] No console errors.

### 8.3 SPA navigation

- [ ] Click through all 10 SPA pages.
- [ ] URL, title and content update; no white flash.
- [ ] Page scripts run: data loads, spinners disappear.
- [ ] Icons render; theme is correct.
- [ ] Back/Forward restore the right page and scroll.
- [ ] Open an SPA link in a new tab → full document load works.
- [ ] Press Back while a page is loading → the Back target wins.

### 8.4 Full-load paths

- [ ] `login` → submit → redirect.
- [ ] `confirm` / `reset-password` links.
- [ ] `upload` → spinner clears → upload works.
- [ ] `onboarding` first-run redirect.
- [ ] `offline` page.
- [ ] `about` / `privacy` / `terms`.
- [ ] `mailto:` / `tel:` / external / `download` / `target="_blank"` /
      `#anchor` links.

### 8.5 Offline / PWA

- [ ] DevTools → offline → reload a cached page.
- [ ] Offline fallback (`offline.html`) works.
- [ ] After a deploy, the new version appears (network-first HTML).
- [ ] **The home page is usable offline**: the profile name/role are correct
      (not the raw email), the streak counter shows the right number, and
      "مهام اليوم" and "موادي" render **without any skeleton wait**.
- [ ] "مهام اليوم" appears instantly offline (the plan comes from
      `medapp_plans_data_v1` / the SW cache).
- [ ] The streak sheet opens offline and shows the last 7 days.
- [ ] `progress.html` opens offline and the subject modal lists the tasks.

### 8.6 Console

- [ ] No `Identifier '…' has already been declared`.
- [ ] No `app.js` double-loading.
- [ ] No missing asset errors.

### 8.7 Phase 5 surfaces

- [ ] The top bar of `notes` / `my-lectures` / `progress` / `admin` /
      `admin-user` is identical in height, padding and icon size.
- [ ] The home header shows the streak counter (no profile icon).
- [ ] Clicking the streak counter opens the bottom sheet with the 7-day
      calendar, "السلسلة الحالية" and "أطول سلسلة".
- [ ] `progress.html` has no "كل المهام" section; each subject card opens a
      modal with its tasks (all / pending / completed filters).
- [ ] In `my-lectures`, tapping an image opens the full-screen gallery:
      swipe between images, pinch/double-tap to zoom, pan while zoomed.
- [ ] The rename button in the gallery renames the image everywhere.
- [ ] The rotate button turns the image and "save" writes it back.
- [ ] The upload bar shows **real** progress (bytes), not a fake animation.
- [ ] The "الطلبات" tab lists requests; the owner can accept/reject one.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Arabic text garbled / desktop layout on mobile | Serving `src/` or `partials/`, or an unbuilt root | Run `npm run build`; serve the root or `dist/`; verify charset/viewport |
| Stuck spinner on an SPA page | Page init not running: script in `<head>`, `type="module"`, `data-shell`, or a runtime error | Move the script to `<body>`, use a classic script, check the console, ensure `init()` runs on swap |
| Stuck spinner on `upload.html` | It is a full load by design; its libs/scripts are missing or an error occurred | Verify `libs`/`scripts` front matter; check console; do not add it to `APP_PAGES` |
| `Identifier 'x' has already been declared` | Top-level `const`/`let` in a body script that was not transformed | Ensure the page is in **both** `APP_PAGES` sets; keep the script classic and parseable; rebuild |
| Page scripts do not run after a click | Script has `src`, `data-shell`, `type="module"`, or is in `<head>` | Move it to the body as a classic inline script |
| Icons missing after dynamic render | Lucide was not re-run | Call `lucide.createIcons()` or `MedApp.refreshIcons()` |
| Theme resets after navigation | Theme not persisted or applied | Set `localStorage.medfav_theme` and `data-theme`; the router calls `syncTheme()` |
| Link runs custom JS but still navigates | Router capture listener runs first | Add `data-no-router` to the link (or use a `<button>`) |
| New page full-loads even though it is in `app.js` | Not added to `build.js` `APP_PAGES` (so no app.js/transform) | Add it to both lists; bump versions; rebuild |
| New SPA page has no `app.js` | No inline body script for the injection point | Add a top-level init `<script>` in the body |
| New asset is missing from `dist/` | File is in `EXCLUDE_TOP` or not at the root | Move it / remove it from `EXCLUDE_TOP`; rebuild |
| New tooling file appears in `dist/` | `EXCLUDE_TOP` / `EXCLUDE_FILE` not updated | Add its name to `EXCLUDE_TOP` in `build.js` |
| Build validation fails | Missing charset/viewport, unresolved token/include, app.js misplaced | Fix the source; never edit generated output |
| Stale UI after deploy | Old service worker / immutable cache | Bump `APP_VERSION`/`CACHE_VERSION`; hard refresh; unregister SW |
| The name shows as the raw email while offline | The profile cache is empty or was cleared | Sign in once online; `runFullUserSync()` writes `medapp_profile_cache_v1` |
| The page shows skeletons while offline | A fetch bypassed the offline check | Use `fetchPlanData()` / `fetchSubjects()` / `fetchSubjectFileCount()` instead of a raw `fetch` |
| "مهام اليوم" is slow offline | The plan is fetched with `no-cache` and misses the SW cache | Use `fetchPlanData()` (localStorage first) and keep the SW JSON handler cache-first |
| The streak counter is 0 | No `task_<date>_<id>` key exists yet | Complete one task; the counter refreshes on every toggle |
| The albums disappear offline | The IndexedDB mirror is empty | Open the page **once while online** so `mirrorCloudToLocal()` can copy the data locally |
| An "empty album" box shows on top of the images | The `hidden` attribute was overridden by a `display` rule | `[hidden] { display: none !important; }` must stay in `partials/head.html` |
| A Font Awesome icon is invisible | The icon does not exist in FA 6.5.1 | Check the class against the 6.5.1 list (e.g. `fa-folder-arrow-up` does not exist) |
| The tool icons do not show | The file name did not match the real format, or it is not precached | `icons/*.jpg` are real JPEGs and are listed in `sw.js` `PRECACHE_URLS` |
| The streak lights up days the user did nothing | The active day was taken from the task's *plan* date | Use the completion day — `completed_at` (cloud) / `task_at_*` (local). See §5.7 |
| The streak days are cut off | The sheet content was taller than the viewport | `.streak-panels` scrolls and the day cells have no fixed aspect ratio. See §5.8 |
| The My Lectures back button only answers in one spot | A shared `header` rule overlapped the button | Use the isolated `.ml-topbar` / `.ml-back` (never the shared partial). See §5.9 |
| "المتابعة باستخدام Google" does not log in | The redirect URL is not in Supabase's allow-list | Add `https://<domain>/index.html` to *Authentication → URL Configuration → Redirect URLs* |
| The Google button spins forever | `signInWithOAuth` succeeded but the browser was not redirected | Check the console; make sure the button calls `signInWithGoogle()` from `auth.js` |
| SPA works but direct page load is broken | Page relies on the shell (app.js) for something it should do itself | Initialise standalone in the page script; test by URL |
| Back returns to the wrong page | A page called `history.pushState` later and the router’s view key is stale | Prefer `replaceState` for in-page state; otherwise Back will refetch (not break) |

---

## 10. Phase 5 feature map

Where each Phase 5 feature lives:

| Feature | Where | Notes |
|---|---|---|
| Unified top bar | `partials/topbar.html` | Included in the `<style>` of `notes`, `my-lectures`, `progress`, `admin`, `admin-user` |
| Streak counter + sheet | `src/index.html` | Button `streakBtn`, sheet `streakSheetOverlay` (heat map + weekly milestone bar) |
| Streak rules | `streak.js` | Pure functions (no DOM, no network) |
| Streak data | `sync.js` | `collectActiveTaskDates()`, `getStudyStreak()` |
| Progress subject modal | `src/progress.html` | `openSubjectModal()`, `subjectTasksMarkup()`, `filterSubjectTasks()` |
| Image gallery | `src/my-lectures.html` | `galleryState`, pointer handlers, pinch/wheel zoom, pan, swipe |
| Rename / rotate | `src/my-lectures.html` | `openRenameImage()`, `rotateGalleryImage()`, `saveGalleryRotation()` |
| Real upload progress | `src/my-lectures.html` | `storageUploadWithProgress()` — XHR against the Storage REST API |
| Album requests | `src/my-lectures.html` + `supabase/migrations/20261019_phase5_polish.sql` | Table `album_requests` — **migration applied** (4 RLS policies, `updated_at` trigger, `anon` revoked) |
| **Offline mirror** | `src/my-lectures.html` | `mirrorCloudToLocal()` / `loadLocalData()` — see §5.5.1 |
| **Google OAuth** | `auth.js` + `src/login.html` | `signInWithGoogle()` — see §5.6 |
| **Crop tool** | `src/my-lectures.html` | `openCropTool()` / `applyCrop()` / `setCropAspect()` |
| **Streak completion day** | `db.js` + `sync.js` | `setLocalTaskCompletion()` / `getLocalActiveDates()` — see §5.7 |
| **Streak pro sheet** | `src/index.html` | Tabs: week / month / all-time · `shareStreak()` — see §5.8 |
| **Isolated top bar** | `src/my-lectures.html` | `.ml-topbar` / `.ml-back` — see §5.9 |
| **Link vs file** | `files.js` + `src/index.html` | `isExternalLinkFile()` → copy-link, else download |
| Empty states | `src/index.html`, `src/my-lectures.html` | `.empty-state-v2` component |
| Theme transition | `partials/head.html` + `app.js` | `html.theme-transition` + `MedApp.withThemeTransition()` |
| Offline-first data | `files.js`, `auth.js`, `sync.js`, `sw.js` | See §5.5 |
| Profile cache | `auth.js` | `medapp_profile_cache_v1` |

### 5.6 Google OAuth (Phase 7)

`auth.js` owns the flow; the pages only render a button.

```js
// auth.js
async function signInWithOAuth → supabaseClient.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin + '/index.html' }
})
```

- The helper is `signInWithGoogle(options)` in `auth.js` (shared by every page).
- `src/login.html` renders the pill button **twice** — once under the login
  form and once under the register form — with the official Google SVG
  (`#EA4335`, `#4285F4`, `#FBBC05`, `#34A853`) and the label
  "المتابعة باستخدام Google", separated by an "أو" divider.
- `src/confirm.html` only confirms an e-mail; it has no signup form, so it
  does **not** need the button.
- The button shows a spinner while the redirect is prepared, and shows an
  Arabic toast on failure.
- `index.html` calls `handleOAuthReturn()` on start-up: it reads
  `error_code` / `error_description` from the URL hash, shows a toast and
  cleans the URL.

> ⚠️ **Supabase configuration:** the redirect target must be listed in
> *Authentication → URL Configuration → Redirect URLs*:
> `https://<your-domain>/index.html` (or a `https://<your-domain>/**`
> pattern). Without it Google returns to the Site URL and the session is
> lost.

### 5.7 The study streak — the active day (Phase 7 fix)

> ⭐ **The rule:** a day is *active* only when the user finished a task
> **on that very day**. Never on the day the task was *planned* for.

The bug it fixes: a task planned for Oct 16 but finished on Oct 19 used to
light up **Oct 16** (a day the user did nothing) and leave **Oct 19** grey.

Two local keys per task now carry both facts:

| Key | Meaning |
|---|---|
| `task_<plan_date>_<id>` = `'1'` | the task is done |
| `task_at_<plan_date>_<id>` = ISO | **when** it was actually done |

- `db.js` `setLocalTaskCompletion(planDate, taskId, completed)` writes both
  (and removes both when the task is reopened).
- `db.js` `getLocalActiveDates()` returns the **active days**:
  1. the exact day from every `task_at_*` stamp,
  2. the exact day from queued rows (`completed_at`),
  3. a legacy fallback to the plan day for old keys that have no stamp —
     but only when no exact stamp exists for that task.
- `db.js` `syncTaskProgressFromCloud()` re-creates the `task_at_*` stamps
  from the cloud column `completed_at`, so a signed-in account is exact on
  every device.
- `sync.js` `collectActiveTaskDates()` reads `completed_at` from
  `task_progress` and converts it to the **user's local** day.
- `index.html` `streakLocalData()` paints the counter from
  `getLocalActiveDates()` — no network, no plan-day carry-over.

### 5.8 The streak sheet — "Duolingo Pro" (Phase 8)

The bottom sheet has **three tabs** and never cuts its content off.

| Tab | id | Content |
|---|---|---|
| هذا الأسبوع | `streakPanelWeek` | the 7-day heat map + the weekly milestone bar |
| عرض الشهر | `streakPanelMonth` | a full month calendar with month navigation |
| الإحصائيات | `streakPanelStats` | total tasks, current streak, longest streak, active days + **Share Streak** |

- `setStreakTab(tab)` switches the panels; `shiftStreakMonth(delta)` moves the
  month view; `shareStreak()` copies a shareable sentence to the clipboard.
- The **cut-off bug** is fixed by the layout, not by a scrollbar:
  - `.streak-sheet` is a flex column with `max-height: 92vh`;
  - `.streak-panels` is the only scrolling area (`overflow-y: auto`,
    `min-height: 0`);
  - `.streak-week` is a `grid-auto-flow: column` strip with
    `overflow-x: auto`, so the days scroll sideways when they do not fit;
  - the fixed `aspect-ratio` on the day cells (the real cause of the
    cut-off) was removed.
- The freeze concept is a **visual** snowflake button
  (`.streak-freeze`) that explains the feature — there is no freeze
  backend yet.
- `sync.js` `collectStreakData()` also returns `tasksCompleted` (the number
  of finished tasks) so the stats tab can show it.

### 5.9 The My Lectures top bar (Phase 8)

`my-lectures.html` does **not** use `partials/header.html` any more. It has
its own isolated bar so that no shared `header {}` rule (for example
`view-transition-name` in `partials/head.html`) can overlap the button.

```html
<div class="ml-topbar">
  <a href="index.html" class="ml-back"><i class="fa-solid fa-arrow-right"></i></a>
  <div class="ml-topbar-title">محاضراتي</div>
  <div class="ml-topbar-spacer"></div>
</div>
```

- `.ml-topbar` — `position: sticky`, `z-index: 9999`, `isolation: isolate`
  (its own stacking context) and `view-transition-name: medapp-header`
  so it stays frozen during SPA transitions.
- `.ml-back` — a real 48×48 flex box (`align-items/justify-content:
  center`) plus an `::after { inset: -8px }` hit area, so **every** click
  around the button works.

### Global CSS rules that must not be lostTwo rules in `partials/head.html` fix real bugs — keep them:

```css
/* Author rules beat the UA [hidden] rule, so empty states used to stay
   visible on top of real content. */
[hidden] { display: none !important; }

/* 44px tap targets, no double-tap zoom, no grey tap flash. */
button, a[role="button"], [role="button"] {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
```

### Asset rules

- `icons/*.jpg` are **JPEG files**. They were previously named `.png`, which
  made the server send `Content-Type: image/png` for JPEG data. The names
  must match the real format, and they are precached by `sw.js`.
- Font Awesome icons must exist in **6.5.1**. `fa-folder-arrow-up` and
  `fa-arrow-up-left-from-square` do **not** exist there (they render as
  nothing). Use `fa-arrow-right-arrow-left` and `fa-up-right-from-square`.

### Storage REST upload (real progress)

`supabaseClient.storage.upload()` uses `fetch`, which reports no progress.
`storageUploadWithProgress()` in `my-lectures.html` therefore calls the
Storage REST API directly with `XMLHttpRequest`:

```text
POST {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
Authorization: Bearer <access_token>
apikey: {SUPABASE_ANON_KEY}
Content-Type: <file type>
x-upsert: true
```

`xhr.upload.onprogress` then gives a real percentage, and the total progress
bar mixes the per-file progress with the batch progress.

---

## 11. Cheatsheet

### Commands

```bash
npm install        # once
npm run build      # after every edit  (== node build.js)
npm run dev        # build + hint (no server)

# serve locally (root or dist)
python3 -m http.server 8000
# or
npx serve .
```

### Files you normally edit

```text
src/<page>.html          page HTML/CSS/scripts
partials/head.html       shared head (meta, fonts, libs, PWA, shell CSS)
partials/header.html     shared header
partials/topbar.html     unified top-bar CSS (the notes.html design)
partials/footer.html     shared footer
partials/scripts.html    emits shared <script src> tags
partials/sw-register.html  SW registration
app.js                   SPA router
sw.js                    service worker / caching
build.js                 build + libs registry + APP_PAGES
shared JS                auth.js / db.js / sync.js / files.js / streak.js / supabase-config.js / theme-init.js
```

### Files you never edit

```text
./*.html                 generated (overwritten by build)
dist/**                  generated (deleted and recreated by build)
tools/_orig/**           read-only visual baseline
src/** or partials/**    never serve directly
```

### Adding an SPA page — checklist

- [ ] `src/newpage.html` exists (classic body script, `partials/head.html`)
- [ ] `build.js` → `APP_PAGES.add('newpage.html')`
- [ ] `app.js` → `APP_PAGES['newpage.html'] = 1`
- [ ] `sw.js` → `PRECACHE_URLS` includes `'/newpage.html'`
- [ ] `APP_VERSION` + `'/app.js?v=…'` + `CACHE_VERSION` bumped
- [ ] nav link added
- [ ] `npm run build`
- [ ] direct load + SPA + Back/Forward tested

### Adding a full-load page — checklist

- [ ] `src/newpage.html` exists with front matter + head/body
- [ ] link added
- [ ] **not** in `APP_PAGES`
- [ ] optional: `sw.js` precache + `CACHE_VERSION`
- [ ] `npm run build`
- [ ] direct load tested

### SPA safety rules

- Page scripts: **classic**, **in `<body>`**, **top-level functions**.
- Do not use `window.onload`.
- Do not wrap the whole page script in an IIFE (or expose handlers on
  `window`).
- Re-bind element listeners on every init; remove your own intervals.
- Avoid denylisted events (`popstate`, `visibilitychange`, …) in page scripts
  (they are never auto-removed).
- Dynamic icons → `lucide.createIcons()`.
- Custom link action → `data-no-router` (or a `<button>`).
- Async callbacks → guard against a stale view.
- New SPA page → both `APP_PAGES` sets + SW precache + version bumps.

### Offline-first safety rules

- **Never** call `supabaseClient` / `fetch` without an `isOffline()` guard or
  a `withTimeout()` bound in a page that must work offline.
- Read the local copy **first** and revalidate in the background
  (`onFresh`), so the UI never waits for the network.
- A cached copy must be scoped to the signed-in account, or it must be
  cleared on sign-out (see `clearCloudLocalCaches()`).
- New shared scripts must be added to the front matter `scripts:` of every
  page that uses them **and** to `sw.js` `PRECACHE_URLS`.

---

*End of guide.*
