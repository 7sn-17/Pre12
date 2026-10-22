# PROJECT_STATE.md — Medical Platform Pre12

> **Purpose.** This file is the single source of truth for any AI agent (or
> human) joining the project. It is written in English on purpose: English
> parses more reliably than Arabic in most toolchains. The product itself is
> **Arabic-first RTL** — never let that slip.
>
> **Last updated:** 2026-10-22 · **App version:** 5.1.2 (versionCode 51)
> **Branch:** `main` · **Latest release:** `v5.1.2` (GitHub Latest)
> **Scope:** **Android APK only** — there is no web hosting; `dist/` is the
> WebView bundle that `npx cap sync` injects into the app.
> **Read order:** §3 Golden Rules → §7 Widget Vision → the section you need.

---

## Table of contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Golden Rules (non-negotiable)](#3-golden-rules-non-negotiable)
4. [Repository Map](#4-repository-map)
5. [Completed Features](#5-completed-features)
6. [Database Schema Overview](#6-database-schema-overview)
7. [Edge Functions & Scheduled Jobs](#7-edge-functions--scheduled-jobs)
8. [Build, Versioning & Release Pipeline](#8-build-versioning--release-pipeline)
9. [Known Constraints & Gotchas](#9-known-constraints--gotchas)
10. [**The Next Big Thing: Professional Home Screen Widgets**](#10-the-next-big-thing-professional-home-screen-widgets)
11. [Phase 0 Completion Log](#11-phase-0-completion-log)

---

## 1. Project Overview

**Medical Platform Pre12** (Arabic: *المنصة الطبية — السنة التحضيرية*) is a free
study platform for first-year (pre-medical) students. It combines a document
library, a PDF reader, task/progress tracking, a day streak, notes, goals,
lecture albums, and a study-plan gallery.

It ships as **one surface from one codebase** — a signed Android APK — plus
launcher widgets:

| Surface | What it is | Where it runs |
|---|---|---|
| **Android APK** | The full product (service-worker cached, offline-first) inside a Capacitor 8 WebView + native plugins | GitHub Releases / Supabase Storage → installed on the phone |
| **Home screen widgets** | Native Android widgets (Jetpack Glance) fed by the app | Android launcher |

> `dist/` is **not** a deployment target: it is the web bundle that
> `npx cap sync android` copies into `android/app/src/main/assets/public/`.

**Product identity**

- Arabic (RTL) UI, Cairo typeface, emerald/green academic palette.
- Free, no ads, no paywall; login only for personal data.
- Offline-first: library metadata + cached documents + local progress.
- One user account (`profiles`) drives app, notifications and (future) widgets.

**Audience:** students on low-to-mid-range Android phones, often on weak
networks, often in dark mode at night. **Design must therefore be legible,
fast, and battery-cheap before it is decorative.**

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Environment | **Termux on Android** (no desktop, no Mac) | Bash + Node 22 + JDK 21 + Gradle |
| Agent harness | **OpenCode** | Tool-driven edits, CI via `gh` CLI |
| Web | Vanilla HTML/CSS/JS, no framework | SPA router in `app.js`, static generator in `build.js` |
| Build | `node build.js` (acorn-based SSG) | `src/*.html` + `partials/` → root `*.html` + `dist/*.html` |
| Mobile shell | **Capacitor 8.5.3** (`@capacitor/android`, `@capacitor/cli`) | `npx cap sync android` |
| Backend | **Supabase** (Postgres, Auth, Storage, Edge Functions) | Project ref `pfjpeqhevegivjmyjvux` |
| Push | **Firebase Cloud Messaging HTTP v1** | Token-based; APNs not used (Android only) |
| Native libs | Capacitor plugins: app, status-bar, push-notifications, local-notifications, filesystem, share, etc. | See `package.json` |
| Widgets (new) | **`capacitor-widget-bridge` 8.1.0** + **Jetpack Glance** | Decision + rationale in §10.5 |
| CI/CD | **GitHub Actions** (`.github/workflows/build-apk.yml`) | Node 22, JDK 21, signed release APK |
| Releases | Supabase Storage bucket `releases` + GitHub Releases | Fixed filenames, in-app updater reads `version.json` |
| PWA | `sw.js` (`CACHE_VERSION`), `manifest.json` | Cache-busting is mandatory per release |

**Supabase storage buckets:** `files` (public, 50 MB limit), `schedule-images`
(public), `releases` (public, 100 MB limit — APK + `version.json`).

**Postgres extensions in use:** `pg_cron`, `pg_net`, `pgcrypto`,
`supabase_vault`, `uuid-ossp`, `pg_stat_statements`.

---

## 3. Golden Rules (non-negotiable)

These rules exist because each one has already caused a real outage.

### 3.1 Edit sources, never outputs

1. **HTML** → edit `src/*.html` (or `partials/*.html`). Root `*.html` and
   `dist/*.html` are **generated**; hand edits are destroyed on the next build.
2. **Shared JS** (`app.js`, `search.js`, `auth.js`, `db.js`, `sync.js`,
   `files.js`, `notifications.js`, `native.js`, `ui.js`, `streak.js`, `sw.js`)
   lives at the **repo root** and is copied into `dist/` and into
   `android/app/src/main/assets/public/` by the build/sync. Edit the root file.
3. **PDF viewer JS is inline in `src/viewer.html`.** There is no `viewer.js`.
4. **`android/` native code** is committed; `android/app/src/main/assets/public/`
   is generated by `npx cap sync` — do not edit it by hand.

### 3.2 Version bump — all files or none

Every release must update **all** of:

| File | Field |
|---|---|
| `package.json` | `"version"` |
| `package-lock.json` | `"version"` (×2 occurrences) |
| `build.js` | `APP_VERSION` |
| `sw.js` | `CACHE_VERSION` + `app.js?v=` |
| `android/app/build.gradle` | `versionCode` (**+1**) and `versionName` |
| `CHANGELOG.md` | new `## ✨ vX.Y.Z — …` section at the top + `[تحميل vX.Y.Z]` link |
| `ARCHITECTURE.md` | `app.js?v=` reference (if present) |

`versionCode` must increase by exactly 1 per release (4.6.7 → 37, 4.6.8 → 38).
Never reuse a version tag: CI creates `vX.Y.Z` from `package.json`.

### 3.3 Build sequence

```bash
npm run build        # regenerates dist/ (only) + version.json
npx cap sync android # copies dist/ + plugins into the native project
git add .            # source + docs; dist/ and the root HTML are git-ignored
```

> ⭐ **v5.1.1 — dist-only build.** `build.js` writes every page to `dist/`
> only. The root has **no generated `*.html`** and they are untracked
> (`.gitignore` → `/*.html`), so a local build can never conflict with git.
> **To test locally:** `npm run build` then `npx serve dist`.

CI does the same on a clean checkout, so **anything not committed does not
ship**.

### 3.4 Scope discipline

- A task prompt names its allowed files. **Touch nothing else.** No drive-by
  refactors, no formatting sweeps, no unrelated "improvements".
- Run `git diff` before pushing; confirm only intended lines changed.
- Never modify auth, notifications, database schema, account deletion, or
  signing config unless the task explicitly says so.

### 3.5 Ship checklist

1. Tests/assertions green (see §9.6).
2. Read `git diff` (sources only, ignore regenerated HTML noise).
3. `npm run build` + `npx cap sync android`.
4. Commit with the **exact** message given in the task, push, then **watch the
   CI run to `success`** and verify the published APK.

### 3.6 Page-scope globals

`global` is **not** defined in page scope. Use `window.MedAppSearch`,
`window.MedAppStreakCore`, etc. Node-only tests may provide `global`.

### 3.7 Secrets

Never commit the release keystore, FCM service-account JSON beyond the
committed `google-services.json` (client config, safe), cron secret, or service
role key. Edge-function secrets live in Supabase Vault / project secrets.

---

## 4. Repository Map

```
Pre12/
├── src/                      # ⭐ source HTML (source of truth)
│   ├── index.html            # home: library, global search modal, streak, update banner
│   ├── viewer.html           # ⭐ entire PDF reader (CSS + markup + inline JS)
│   ├── subject.html          # per-subject file listing
│   ├── all-files.html my-lectures.html notes.html goals.html progress.html gpa.html
│   ├── upload.html admin.html admin-user.html plans.html offline.html
│   ├── login.html onboarding.html confirm.html reset-password.html
│   ├── privacy.html terms.html about.html
│   └── widgets/              # ⭐ NEW — widget JS layer (Phase 1)
│       └── .gitkeep
├── partials/                 # shared markup includes (@include)
├── build.js                  # SSG + asset copy + version.json
├── app.js                    # SPA router, nav, theme, wake-lock, update banner
├── search.js                 # ⭐ canonical search engine + bindSearchInput
├── auth.js db.js sync.js files.js notifications.js native.js ui.js streak.js
├── sw.js                     # service worker (CACHE_VERSION)
├── dist/                     # ⚠️ the ONLY build output (pages + assets; injected by cap sync)
├── widget_reference_final.html  # ✅ widget design reference (not generated)
├── android/                  # Capacitor native project (committed)
│   └── app/src/main/
│       ├── java/com/pre12/medical/MainActivity.java
│       ├── res/              # icons, notification icons, beep.wav
│       └── assets/public/    # ⚠️ generated by cap sync
├── supabase/functions/       # edge functions (Deno/TypeScript)
├── .github/workflows/build-apk.yml
├── CHANGELOG.md              # in-app "what's new" source
├── ARCHITECTURE.md           # deep technical reference (2581 lines)
└── PROJECT_STATE.md          # ⭐ this file
```

**Android coordinates:** namespace/applicationId `com.pre12.medical`,
`MainActivity.java` (Java, no Kotlin plugin yet).

---

## 5. Completed Features

### 5.1 Authentication & accounts
- Supabase email/password auth: `login.html`, `confirm.html`,
  `reset-password.html`, first-run `onboarding.html`.
- Trigger `handle_new_user()` creates the `profiles` row.
- Session persists across SPA navigations; `auth.js` exposes the current user.
- **Account deletion:** one confirmation modal → edge function
  `delete-user-account` removes user rows **and** Storage objects
  (`files.uploaded_by`, album images) before deleting the auth user.
- Roles: `profiles.role` (`student` / `admin` / `staff`); `is_staff()` RPC
  guards admin pages.

### 5.2 Notifications (smart engine)
- **Two-phase daily reminders** (fixed 8 AM / 8 PM local) plus **scenario**
  notifications (streak recovery ≥ 20:00, agenda 09:00–20:00).
- **Quiet Hours:** nothing scheduled between **00:00 and 08:00 local**;
  fixed 8 AM / 8 PM reminders are exempt by design (they are the anchor).
- Local hour derived from `profiles.timezone` (IANA, e.g. `Asia/Baghdad`) via
  `Intl.DateTimeFormat`; falls back to UTC if missing/invalid.
- Rate limits: 120-minute minimum between pro notifications; per-category
  dedup via `notification_log`.
- `notifications.js` on-device: channel `medapp_reminders`, `sound: 'default'`
  for local notifications, deep links into the app.
- Update announcements: `send-update-notification` logs **only when
  `sent > 0`**, so a failed send can be retried on the next run.
- FCM v1 (service account JWT), tokens stored in `profiles.fcm_token`;
  purged/`UNREGISTERED` tokens must be re-registered by opening the app.

### 5.3 Streak (سلسلة الأيام)
- Pure logic in `streak.js` (`MedAppStreakCore`): `compute(dateKeys, todayKey)`,
  `week(todayKey, 7)`, `isValidDateKey`, Arabic weekday labels.
- Server truth: `task_progress` (one row per user/day/task) +
  `streak_freezes` (❄️ days that preserve the chain).
- `profiles.notification_streak` mirrors the current streak for the engine.
- Streak milestones unlock heavier scenario messaging.

### 5.4 Tasks & progress
- `task_progress` rows keyed by `(user_id, plan_date, task_id)` with
  `subject`, `task_title`, `instructor`, `task_type`, `completed`,
  `completed_at`.
- `progress.html` renders today's plan, per-subject completion and GPA inputs;
  `gpa.html` computes the semester average client-side.
- RPC `get_student_progress_counts(p_task_keys text[])` aggregates counts
  server-side.

### 5.5 Library, files & albums
- `files` table + public Storage bucket `files`; download/view counters via
  `increment_downloads(file_uuid)` / `increment_views(file_uuid)`.
- Categories, subjects (`subjects` with color/icon/slug), search, filters.
- `my-lectures.html`: personal lecture albums (`lecture_albums`), public
  schedule gallery (`schedule_images`), likes/saves
  (`schedule_image_likes`, `schedule_image_saves`) with triggers keeping
  counters in sync; `album_requests` for contributions.
- **⭐ v5.1.2 — مشاركة وفتح الملفات المحمّلة**: كل بطاقة في «الملفات
  المحمّلة» (`src/index.html`) فيها زرّا `share-2` و`external-link`.
  الملف محفوظ كـ Blob في IndexedDB، و`files.js` يكتب نسخة مؤقتة في
  `Directory.Cache` ثم:
  - `shareDownloadedFile(fileId)` → `Share.share({ url: fileUri })`
    (واتساب/تلغرام/أي تطبيق)؛ على الويب مشاركة الرابط أو نسخه.
  - `openDownloadedFileExternally(fileId)` →
    `FileOpener.open({ filePath, contentType })` عبر
    `@capacitor-community/file-opener` (قارئ PDF خارجي…).

### 5.6 Live search (v4.6.7 — Phase 37)
- **One canonical binder:** `MedAppSearch.bindSearchInput(input, handler)`.
  It first **destroys** any prior listeners on the field, then binds **one**
  handler to **four** events:
  `input`, `compositionupdate`, `compositionend`, `keyup`.
- **No `isComposing`, no `inputType`, no debounce** in the binding: the raw
  `e.target.value` (fallback `e.data`) is read and searched **immediately**, so
  Arabic IME composition updates results **letter by letter**.
- Engine internals: local `toLowerCase().includes()` pass is synchronous
  (instant paint), cloud merge is internally debounced (250 ms), results capped
  at **50**, query normalised inside `matchesText`.
- Clicking a result **closes the modal first**, then navigates/deep-links.
- Escape closes any search modal via a **document-level** listener.
- The viewer has its own index-based search (300 match cap, 50 results).

### 5.7 PDF viewer (`src/viewer.html`)
- **Virtualized rendering:** only pages near the viewport are painted; a
  skeleton + slim progress bar covers the first paint; progressive loading.
- **Own searchable text layer** (absolute spans, `data-idx` per item) → deep
  search, exact-jump and highlight.
- **Jump is virtualization-safe:** close modal → force page → render → poll
  with `requestAnimationFrame` (`waitForTextElement`, 3 s cap) until the span
  exists → scroll with `-100 px` offset (`els.viewer.scrollTo({behavior:'smooth'})`
  + `window.scrollTo` fallback).
- **Highlight:** bright yellow `rgba(255,235,59,0.8)`, `z-index: 999`, drawn
  **inside** the page container (canvas `z-index:1`, text layer `5`,
  highlight `999`), auto-removed after ~3.2 s.
- **Zoom:** CSS transform on `#pdfStage` (`translate3d(...) scale(k)`, origin
  `0 0`); pinch + buttons share one `setZoom()`; anchor math keeps the focal
  point under the fingers; quality re-render 320 ms after settle (dpr ≤ ~2.2).
- **Touch model:** `touch-action: pan-y` at fit zoom, `none` when zoomed
  (`.pdf-stage.zoomed`) so one-finger pan works.
- **Floating action bar (FAB):** long-press (350 ms) or 8 px drag moves it to
  any corner; clamped on-screen; position persisted in
  `localStorage['medapp_fab_position']`; click suppressed after a drag.
- **Copy:** selecting text shows a floating «نسخ» pill
  (`selectionchange` + `mouseup`/`touchend`), copies via
  `navigator.clipboard.writeText` (`execCommand` fallback), toast «تم النسخ».
- Notch-safe: top bar is flex, no overlap, no "preparing file" pill.

### 5.8 PWA / offline
- `sw.js` precaches shell + shared JS with `CACHE_VERSION`; stale-while-
  revalidate for assets; `manifest.json` with maskable icon.
- Offline page (`offline.html`), cached library metadata, in-app update banner
  driven by `version.json` (`latest_version`, `apk_url`, notes).
- **⭐ v5.1.2 — «ما الجديد» بلغة المستخدم**: `build.js` يحوّل أول قسم في
  `CHANGELOG.md` إلى 3–4 نقاط نظيفة داخل `version.json`، و`app-update.js`
  يعرضها كما هي (بلا Markdown). لذلك تُكتب ملاحظات الإصدار بلغة بسيطة
  بلا مصطلحات تقنية.

### 5.9 Design system (app)
- Light: `--bg-main #f8fafb`, card `#ffffff`, accent `#059669` /
  `#10b981`, text `#0f172a`.
- Dark: `--bg-main #06110d`, card `rgba(16,34,27,.7)`, accent `#10b981` /
  `#34d399`, text `#f0fdf4`.
- Font: **Cairo**; radii 12–24 px; glass overlays with `backdrop-filter`.
- Motion: `0.2s cubic-bezier(.4,0,.2,1)`.

---

## 6. Database Schema Overview

13 tables in `public`. RLS is enabled on all user-facing tables; policies scope
rows to `auth.uid()` (staff policies use `is_staff()`).

| Table | Key columns | Purpose |
|---|---|---|
| **profiles** | `id` (auth FK), `email`, `full_name`, `avatar_url`, `role`, `fcm_token`, `notify_enabled`, `last_notification_at`, `notification_streak`, `timezone` | One row per user; notification state; **timezone drives Quiet Hours and will drive widget day boundaries** |
| **task_progress** | `user_id`, `plan_date`, `task_id`, `subject`, `task_title`, `instructor`, `task_type`, `completed`, `completed_at` | Daily study plan + completion; **source of truth for the Tasks widget and streak** |
| **streak_freezes** | `user_id`, `day_key`, `month_key` | ❄️ freeze days that keep a streak alive |
| **subjects** | `id`, `name`, `slug`, `icon`, `color`, `description`, `sort_order` | Catalog of subjects (color/icon used across UI) |
| **files** | `id`, `uploaded_by`, `subject_id`, `title`, `description`, `file_url`, `file_path`, `file_size`, `mime_type`, `category`, `downloads`, `views`, `is_published`, `source`, `external_url` | Library documents |
| **favorites** | `user_id`, `file_id` | Bookmarked files |
| **notes** | `user_id`, `author_name`, `title`, `content`, `subject_id`, `is_shared` | Notes; **pinned notes feed the Notes & Goals widget** |
| **lecture_albums** | `user_id`, `name`, `visibility`, `author_name`, `cover_url` | Personal lecture albums |
| **schedule_images** | `user_id`, `title`, `description`, `image_url`, `image_path`, `subject_key`, `is_public`, `likes_count`, `saves_count`, `university`, `year`, `album_id` | Study-plan gallery |
| **schedule_image_likes / _saves** | `user_id`, `image_id` | Per-user reactions |
| **album_requests** | `album_id`, `user_id`, `title`, `image_url`, `image_path`, `author_name`, `status`, `album_owner_id` | Contribution requests to albums |
| **notification_log** | `user_id`, `category`, `title`, `body`, `target`, `sent`, `error` | Delivery + dedup + rate-limit ledger |

**RPCs / functions**

| Function | Args | Purpose |
|---|---|---|
| `get_student_progress_counts` | `p_task_keys text[]` | Batched completion counts |
| `increment_downloads` / `increment_views` | `file_uuid uuid` | Atomic counters |
| `increment_applies_count` | `p_schedule_id uuid` | Album request count |
| `is_staff()` | — | Admin guard |
| `handle_new_user()` | — | Creates profile on signup |
| `update_*_count` / `update_*_timestamp` | — | Triggers (likes, saves, `updated_at`) |
| `vault_read_secret_text` | `secret_name text` | Vault access for cron |

**Important:** local-only state (not in Postgres): goals (`medfav_goals`),
FAB position (`medapp_fab_position`), theme, dismissed banners.

---

## 7. Edge Functions & Scheduled Jobs

All live in `supabase/functions/<name>/index.ts` (Deno). Deployed to project
`pfjpeqhevegivjmyjvux`. Auth: `x-cron-secret` (Vault) or service role.

| Function | Trigger | Purpose |
|---|---|---|
| **smart-notifications-engine** | `pg_cron` hourly at **:05** (`5 * * * *`) via `net.http_post` | Scenario engine **v24**: quiet hours, two-phase daily reminders, streak/agenda scenarios, rate limits, dedup, FCM v1 send |
| **send-update-notification** | CI after release | Announces a new version; duplicate guard + logs only when `sent > 0` |
| **send-admin-notification** | Admin UI | Broadcast/segment message from admin panel |
| **send-test-notification** | Admin UI | Single-device test send |
| **delete-user-account** | In-app confirmation | Deletes rows + Storage objects + auth user |
| `_shared/` | — | Shared FCM client, CORS, auth helpers |

**Cron job #1:** `5 * * * *` → `smart-notifications-engine` with
`x-cron-secret` from `vault.decrypted_secrets('cron_secret')`.

---

## 8. Build, Versioning & Release Pipeline

### 8.1 Local build
```bash
npm install            # only when deps change
npm run build          # build.js → dist/ ONLY + version.json
npx cap sync android   # dist/ + plugin registration into android/
```

**To test locally:** `npm run build` then `npx serve dist` (never serve the
project root — it has no generated pages any more).

`build.js` also: injects `app.js?v=APP_VERSION`, rewrites top-level
`const/let/class` → `var` in app pages (SPA re-execution safety), validates
`<meta charset>` first + hardened viewport, copies assets, writes
`version.json` from `CHANGELOG.md`.

### 8.2 Release (CI, `.github/workflows/build-apk.yml`)
1. Checkout → Node 22 → JDK 21 → `npm install` → `npm run build` →
   `npx cap sync android`.
2. Verify web assets; read version from `package.json`.
3. Decode + verify release keystore (secrets), self-heal a bad base64 secret.
4. `./gradlew assembleRelease`, verify signature, inspect APK structure.
5. Rename APK → `Medical_Platform_vX.Y.Z.apk`, publish SHA-256.
6. Upload **fixed-name** assets to Storage `releases`:
   `Medical_Platform_Latest.apk` + `version.json`; verify public URLs.
7. GitHub Release `vX.Y.Z` with notes.
8. `send-update-notification` (best effort; no-token warns, never fails CI).
9. Re-download the published APK and verify its hash ("the published APK is intact").

**Public endpoints**
- APK: `https://pfjpeqhevegivjmyjvux.supabase.co/storage/v1/object/public/releases/Medical_Platform_Latest.apk`
- Metadata: `.../releases/version.json`

### 8.3 Current release
`v5.1.2` · versionCode 51 · *external share/open + friendly changelog* ·
APK **15,044,276 B** ·
SHA-256 `5de0855f0e2b24415678b52f2362d80cd9c9d18fac6a99d68347a26a76c465e1` ·
GitHub release **v5.1.2 = Latest** · production `version.json` = `5.1.2`
(4 friendly bullets) · CI runs `39845496583` (main) and `39845502862` (tag)
→ success · update notification sent (`notification_log`: `update` ·
`sent = true`).

**Previous:** `v5.1.1` · versionCode 50 · APK 15,041,211 B ·
SHA-256 `0491dc17df29eb9c91fdf324c690921c17cf58ac7c599a56a814e7e8f1c9494e`.

> ℹ️ The main-push and tag-push workflows each build a separately-signed APK.
> If their bytes differ, the GitHub asset is re-pointed to the **exact
> production binary** so the published SHA-256 always matches Storage.

**Previous:** `v5.1.0` · versionCode 49 · APK 15,095,903 B ·
SHA-256 `e7e0ea088f099361603826f12605f3f969944c61318c2b1e3e327229008d0b53`.

---

## 9. Known Constraints & Gotchas

### 9.1 Arabic IME in Android WebView
Chromium WebView can **withhold `input`** while an Arabic keyboard is
composing. Therefore the binder listens to `compositionupdate`/`compositionend`
/`keyup` as well, and **never** filters on `isComposing`/`inputType`.
`bindSearchInput` must remain the **only** definition in `search.js` — a
second declaration silently overrides the first (this exact bug shipped once).

### 9.2 Generated files
`dist/*`, `android/app/src/main/assets/public/*` and `version.json` are
outputs. Since **v5.1.1** the root has **no generated `*.html`**: `dist/` is
the only build output and it is git-ignored (`dist/`). `version.json` stays
tracked because the CI uploads it to Supabase Storage.

### 9.3 Notifications
Android notification **channels are immutable** after creation. `res/raw/beep.wav`
ships but is unreferenced (Capacitor needs a `res/raw` name for custom sound).
FCM tokens can be purged (`UNREGISTERED`) — push resumes only after the user
opens the app again.

### 9.4 Network
The Termux device intermittently loses DNS for `*.supabase.co` and
`release-assets.githubusercontent.com`. Verify via Supabase MCP / GitHub
release assets instead of the device when that happens.

### 9.5 No desktop
No Android Studio, no emulator. Native code is written and reviewed by reading
Gradle/manifest files; **CI is the compiler**. Device-level visual verification
must be done by the user.

### 9.6 Tests
Assertions are plain Node scripts (VM-based) run outside the repo (e.g.
`$PREFIX/tmp/opencode/test_*.js`). They cover: engine result cap/debounce,
IME event sequences, quiet hours, viewer jump/highlight, gestures/FAB, and
asset-presence checks against the published APK. Re-run the relevant suite
after any change to `search.js`, `src/viewer.html`, or the engine.

### 9.7 Page scope
`global` is undefined in pages — always `window.X`.

---

## 10. The Next Big Thing: Professional Home Screen Widgets

> **Status:** Phase 0 complete (backup, this document, plugin installed).
> Implementation starts Phase 1. **Design quality is the top priority** — a
> widget that looks "basic" is a failed widget, regardless of correctness.

### 10.1 North star

When a student unlocks their phone, the home screen should already answer:
*“What do I study today, and am I keeping my streak?”* — with **one tap** to
act, without opening the app. The widgets are the product's daily surface, not
a shortcut list.

**Quality bar (all must hold):**

1. Looks native to Android 12+ (Material You), not like a web page in a box.
2. RTL-correct Arabic with proper shaping and no clipped diacritics.
3. Legible at 1.0 and 1.3 font scale; no ellipsis where a number matters.
4. Correct in light, dark, and dynamic-color (wallpaper) modes.
5. Interactive: checkbox toggles from the launcher, with visible feedback
   **< 100 ms** and eventual consistency with the server.
6. Battery-cheap: no polling faster than 15 min; updates are event-driven.
7. Every widget has a real **empty**, **offline**, and **error** state.

### 10.2 Design language

**Foundations**

| Token | Value | Rationale |
|---|---|---|
| Outer radius | system-provided (≈28 dp on A12+) | Never draw your own outer frame; respect launcher mask |
| Inner card radius | 20 dp | Softer than outer, reads as "content inside" |
| Grid | 4 dp baseline; 16 dp screen padding; 12 dp gutters | Rhythm without cramping |
| Type scale | 11 sp label / 13 sp body / 15 sp title / 22–28 sp metric | Arabic needs +1 sp vs Latin at small sizes |
| Font | **Cairo** (bundled in `res/font/`, weights 400/600/800) | Brand continuity with the app |
| Accent | Emerald `#10B981` (light `#059669`) | Existing product color |
| Success / warn / danger | `#10B981` / `#F59E0B` / `#EF4444` | Streak flame, freeze, overdue |
| Motion | 180 ms `FastOutSlowIn`, 280 ms for layout | Perceived instant, still smooth |

**Material You (dynamic color)**

- Use `GlanceTheme.colors.*` (`surface`, `onSurface`, `primary`, …) so the
  widget re-tints with the wallpaper on Android 12+.
- Brand emerald is the **fallback** on API < 31 and the seed for accents that
  must stay semantic (flame = streak, never re-tinted to pink).
- Never hardcode white/black text: always `onSurface` / `onPrimaryContainer`.
- Verify contrast ≥ 4.5:1 against the *resolved* tonal surface, in both modes.

**Glassmorphism — honest implementation**

Android widgets render through **RemoteViews**; live backdrop blur is
impossible. We approximate glass with:

1. Base: tonal surface at 88–94 % opacity (so wallpaper barely influences it).
2. A 1 dp inner highlight border: `#FFFFFF` at 14 % (dark) / `#0F172A` at 8 %
   (light).
3. A soft vertical gradient (top +4 % lightness → bottom −2 %) instead of a
   flat fill; this is what reads as "glass" at a glance.
4. Optional layered translucent "chip" surfaces at 6–10 % accent.
5. **Never** stack more than two translucent layers — Arabic glyphs lose
   contrast fast.

**Depth & rhythm**

- Two levels only: card (surface) → chip (accent-tinted 8–12 %).
- Shadows are simulated with a 1 dp border + slightly darker footer band, not
  elevation APIs.
- Numbers are the hero: large, tabular, right-aligned in RTL.

### 10.3 Animations & interactions ("gizmos")

Widgets are **interactive**, not screenshots. Constraints: no arbitrary
animation engines inside RemoteViews, so every transition must be expressible
as a **state swap** that Glance can cross-fade.

| Interaction | Behavior | Implementation |
|---|---|---|
| **Tap a task checkbox** | Instant optimistic toggle: box fills, text gains strikethrough + 55 % opacity, progress ring advances | `actionRunCallback<ToggleTaskAction>` → write prefs → `GlanceAppWidget.update()`; use `Crossfade`/`AnimatedVisibility` + `animateContentSize` |
| **Tap a task row** | Deep-link into the app at that task | `actionStartActivity(Intent(ACTION_VIEW, "pre12://tasks?focus=<id>"))` |
| **Long-press widget** | Launcher resize/config (system) | Standard `appwidget-provider` with `resizeMode="horizontal|vertical"` |
| **Tap streak flame** | Opens streak detail | Deep link `pre12://progress#streak` |
| **Tap a day cell** (7-day map) | Shows that day's completion as a chip row (or opens the app) | `actionRunCallback<SelectDayAction>` |
| **Pull-to-refresh** | Not available in widgets → provide a small refresh affordance in the header/footer | `actionRunCallback<RefreshAction>` (re-reads prefs + `requestUpdate`) |
| **Completion celebration** | When the last task is checked: ring turns emerald + "أحسنت" label for one refresh cycle | State flag `celebrate=true` consumed on next update |
| **Haptics** | Short 10 ms tick on toggle | `Vibrator` one-shot inside the action callback (guard permission-free `VIBRATE` is granted by the system for widgets? No — declare `android.permission.VIBRATE`) |

**Consistency rule:** the widget never owns truth. It writes an **intent
queue** (`pending.tasks`) that the app drains and pushes to Supabase when it
next runs; the widget's own state is optimistic and gets reconciled on the next
push/refresh. Never attempt network calls from the widget.

### 10.4 The four widgets

All four share a header pattern: **title (right, RTL) · status dot · refresh
chip**, and a footer only when it carries meaning.

---

#### Widget 1 — «مهام اليوم» · Today's Tasks
`kind: TasksWidget` · **4×2** default (min 250×110 dp), resizable vertical to 4×4

```
┌──────────────────────────────────────────┐
│ مهام اليوم            ● 3/8        ↻     │   header: title, progress dot, refresh
│ ──────────────────────────────────────── │   1 dp hairline (border @ 10%)
│ ◉  مراجعة التشريح — محاضرة 4             │   done: filled emerald, strikethrough
│ ○  تمارين الفسيولوجيا                    │   open: outline ring
│ ○  قراءة ملخص الكيمياء        +5 أكثر    │   overflow hint (tap → app)
│ ▰▰▰▰▰▰▱▱▱▱  38%                          │   progress bar (or ring in 4×2)
└──────────────────────────────────────────┘
```

- Data: `tasks.today` (max 5 rows in 4×2, 8 in 4×4).
- Checking a row toggles `done` locally + queues `pending.tasks`.
- Sort: incomplete first (stable by plan order), completed sink to the bottom
  **after** the animation completes.
- Header shows `done/total`; when `total = 0` → empty state:
  «لا مهام اليوم — استمتع بيومك 🌿».
- When the day rolls over (per `profiles.timezone`), the widget shows yesterday's
  summary with a «يوم جديد» label until the app pushes fresh data.

---

#### Widget 2 — «سلسلة الأيام» · Simple Streak
`kind: StreakSimpleWidget` · **2×2** (min 110×110 dp), not resizable

```
┌────────────────────┐
│        🔥          │   flame glyph, 40 dp, emerald→amber gradient
│         12         │   metric, 28 sp, tabular, centered
│        يوم         │   label 11 sp, muted
│   ▁▁▁▁▁▁▁          │   micro sparkline of last 7 days (2 dp bars)
└────────────────────┘
```

- Data: `streak.summary` (`current`, `best`, `week[]`, `freezes`).
- Flame is emerald at 1–6 days, amber at 7–29, and gets a subtle glow at 30+.
- At `current = 0`: outline flame + «ابدأ اليوم» CTA (tap → `pre12://progress`).
- Freeze day: small ❄ badge next to the number.

---

#### Widget 3 — «خريطة الأسبوع» · Detailed Streak
`kind: StreakDetailWidget` · **4×2** (min 250×110 dp)

```
┌──────────────────────────────────────────┐
│ سلسلة الأيام      12 يوم · الأفضل 21  ❄2 │
│  س     ح     ن     ث     ر     خ     ج    │   weekday initials (RTL order)
│  ●     ●     ●     ❄     ●     ○     ○    │   done / freeze / missed / future
│ ─────────────────────────────────────── │
│  أفضل من 82% من الطلاب        🔥 +3 اليوم │
└──────────────────────────────────────────┘
```

- 7 cells always left-to-right in **chronological** order while the labels are
  RTL — the row reads like a timeline; document this in code comments.
- States: done (filled emerald), freeze (❄ on tinted surface), missed (hollow
  danger-tinted ring), future (dashed outline, 20 % opacity).
- Comparison line is optional and only shown when `percentile` exists in the
  payload; otherwise show the weekly completion ratio.

---

#### Widget 4 — «ملاحظاتي وأهدافي» · Notes & Goals
`kind: NotesGoalsWidget` · **4×3** (min 250×180 dp), resizable to 4×4

```
┌──────────────────────────────────────────┐
│ مثبّتة                        ملاحظات →  │
│ ┌──────────────────────────────────────┐ │
│ │ هدف الأسبوع                          │ │   chip: subject color @ 12%
│ │ إنهاء فصل الغدد الصمّاء              │ │   title, 15 sp, max 2 lines
│ │ «آخر ما قرأته: صفحة 42»              │ │   excerpt, 13 sp, max 2 lines
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │ ملاحظة                                │ │
│ │ مراجعة معادلات الاتزان                │ │
│ └──────────────────────────────────────┘ │
│ + ملاحظة جديدة                            │   footer action → app
└──────────────────────────────────────────┘
```

- Data: `notes.pinned` (max 2 cards at 4×3, 3 at 4×4).
- Cards use the subject's color as a 3 dp leading bar + 12 % tinted chip.
- Tap a card → `pre12://notes?id=<id>`.
- Empty: «لا ملاحظات مثبّتة — ثبّت ملاحظة من التطبيق» + CTA.

### 10.5 Tech stack decision (evaluated 2026-10-21)

| Candidate | Verdict | Why |
|---|---|---|
| `@capawesome/capacitor-widgets` | ❌ **404 on npm** | Package does not exist (nor `@capawesome/capacitor-android-widgets`). Not usable. |
| `@capgo/capacitor-widget-kit` 8.1.15 | ⚠️ Rejected | Real, Capacitor-8 compatible, and supports Android — but it renders widgets from **SVG templates + hotspots**. That cannot deliver Material You dynamic color, native typography baseline alignment, per-cell accessibility, or Glance state animation. It also drags an iOS/Watch-centric runtime into an Android-only app. |
| **`capacitor-widget-bridge` 8.1.0** | ✅ **Chosen** | Exactly the right seam: `setItem/getItem/removeItem` writes **JSON strings** into `SharedPreferences` under a named group, `setRegisteredWidgets` + `reloadAllTimelines` refresh widgets, and `getItem` lets the app drain widget-side intents. It stays out of the rendering path, so the widgets are **100 % native Jetpack Glance**. Capacitor 8 peer (`>=8.0.0`), MIT, small (≈50 KB). |
| Hand-rolled Capacitor plugin | ❌ Not needed | No value over the bridge for this scope. |

**Rendering:** **Jetpack Glance** (`androidx.glance:glance-appwidget`), which is
Material You–native and supports interactive `ActionCallback`s — required for
the in-widget checkboxes. Cost: the Android module must adopt the **Kotlin
Gradle plugin** (Glance is Kotlin-first). Java callers remain fine
(`MainActivity` stays Java).

**Pinned versions (verified in W1):** bridge `8.1.0`, **Glance `1.2.0`**
(`glance-appwidget` + `glance-material3`), **Kotlin `2.2.21`** + the matching
`org.jetbrains.kotlin.plugin.compose` (the Compose compiler is a Kotlin plugin
since 2.0 — the two versions must never diverge), AGP `8.13.0`, Gradle `8.14.3`,
JDK 21 (`jvmTarget = 21`, matching Capacitor's Java 21). Bump these deliberately,
never implicitly.

### 10.6 Architecture & data flow

```
        ┌──────────────────────────── App (WebView) ────────────────────────────┐
        │  src/widgets/*.js  →  WidgetBridge.setItem(group,key,JSON)            │
        │  tasks/notes/streak data  ──────┐                                     │
        └─────────────────────────────────┼─────────────────────────────────────┘
                                          │ SharedPreferences(group)
                                          ▼
        ┌──────────────── Native (Kotlin) ─────────────────────────────────────┐
        │  WidgetStore (read/parse JSON)                                        │
        │  TasksWidget · StreakSimpleWidget · StreakDetailWidget · NotesWidget   │
        │  ToggleTaskAction → prefs(pending.tasks) → GlanceAppWidget.update()   │
        └─────────────────────────────────┬─────────────────────────────────────┘
                                          │ launcher renders RemoteViews
                                          ▼
                                   Home screen (Material You)
```

**SharedPreferences contract** — group name must match on **both** sides:

`group = "medapp_widget_state"`

| Key | JSON shape |
|---|---|
| `widget.meta` | `{"v":1,"updatedAt":<ms>,"userId":"…","timezone":"Asia/Baghdad","theme":"auto"}` |
| `tasks.today` | `{"date":"2026-10-21","items":[{"id":"…","title":"…","subject":"…","color":"#10B981","done":false}],"total":8,"done":3}` |
| `streak.summary` | `{"current":12,"best":21,"freezes":2,"week":[{"d":"2026-10-15","s":"done"}],"percentile":82}` |
| `notes.pinned` | `[{"id":"…","title":"…","excerpt":"…","subject":"…","color":"#10B981"}]` |
| `pending.tasks` | `[{"id":"…","done":true,"at":<ms>}]` — **written by widgets, drained by the app** |

`s ∈ {done, freeze, missed, future}`. All payloads are **plain JSON strings**
(the bridge only stores `String`). Keep them small (< 8 KB) — they are rewritten
on every sync.

**Sync policy**

- App → prefs: on login, on task toggle, on note pin/unpin, on resume, and
  after a successful Supabase sync. Then `reloadAllTimelines()`.
- Widget → app: toggle writes prefs immediately (optimistic), and the app drains
  `pending.tasks` on next open, applying to `task_progress` with
  `completed_at`, then clears the key and pushes back the canonical payload.
- **Network only through WorkManager (W5).** The rendered widget still never
  touches the network: `ToggleTaskAction` commits prefs, queues the change and
  asks `WidgetSync` for a one-time, network-constrained upload. The worker posts
  the queue to `task_progress` with the user's JWT (refreshed when needed) and
  never clears the queue — the WebView drain owns that, because localStorage
  must receive the toggle too. No polling, no periodic work.

### 10.7 Files (as built)

```
widgets.js                        ← root, shipped + precached in sw.js
                                    payload builders (tasks/streak/notes),
                                    session forwarding, pending drain,
                                    deep-link landing, pin API

android/app/src/main/java/com/pre12/medical/widgets/
├── WidgetBridge.kt               SharedPreferences group + JSON parsers,
│                                 optimistic toggle + doneAt, pending queue,
│                                 mergePending, Supabase session store
├── WidgetPalette.kt              28 M3 roles from widget_color_* (4 sets)
├── WidgetUi.kt                   GlassCard, Hairline, Chip, IconBadge,
│                                 ColumnScope.WidgetEmptyState, openAppAction(path)
├── TodayTasksWidget.kt           interactive tasks, pending-only list, row
│                                 budget via LocalSize, all-done celebration
├── SimpleStreakWidget.kt         flame hero
├── DetailedStreakWidget.kt       7-day map + today halo
├── NotesWidget.kt                three variants (combined / goals / notes) +
│                                 their receivers
├── ToggleTaskAction.kt           ActionCallback: prefs + queue + WorkManager
│                                 + broadcast + tick frame + vanish frame
├── WidgetSync.kt                 WorkManager uploader (task_progress upsert,
│                                 JWT refresh, exponential backoff)
└── MedWidgetsPlugin.kt           Capacitor bridge + requestPinAppWidget

android/app/src/main/res/
├── xml/{today_tasks,simple_streak,detailed_streak,notes,goals,notes_only}_widget_info.xml
├── layout/widget_*_preview.xml               API 31+ picker previews (6)
├── drawable/widget_ic_{flame,pin,tasks,check,target,note}.xml   tinted vectors
├── drawable/widget_anim_check.xml + animator/widget_check_trim.xml  AVD tick
├── drawable/widget_preview_*                  preview shapes/graphics
├── values/widget_colors.xml + night + v31 + night-v31   (28 roles each)
└── values/strings.xml + styles.xml            widget strings + preview styles
```

`AndroidManifest.xml` has **six** `<receiver>` entries
(`android.appwidget.action.APPWIDGET_UPDATE`, `exported="false"`,
`meta-data android.appwidget.provider`) plus a `pre12` VIEW intent filter on
`MainActivity` for the widget deep links (read through `@capacitor/app`).

### 10.8 Delivery plan

| Phase | Deliverable | Done when |
|---|---|---|
| **W0 (done)** | Tag, branch, this doc, bridge plugin, `src/widgets/` | `git tag v4.6.7-stable` pushed; plugin synced |
| **W1 (done)** | Kotlin 2.2.21 + Compose compiler + **Glance 1.2.0**, `WidgetBridge.kt`, `WidgetPalette.kt`, static «مهام اليوم» (`TodayTasksWidget` + receiver + provider XML + picker previews) | `assembleDebug` green in CI (run `39559126314`); receiver present in the merged manifest |
| **W2 (done)** | Tasks fully interactive (`ToggleTaskAction`, optimistic prefs, `pending.tasks`, publish race guard) + `widgets.js` + `MedWidgetsPlugin` + in-app «إضافة ودجت» | CI `39566019522`; JS contract test green; toggles survive a killed app |
| **W3 (done)** | `SimpleStreakWidget` + `DetailedStreakWidget` (done / missed / today halo / freeze) | Shipped with W2; pixel check still needs hardware |
| **W4 (done)** | Deep links `pre12://{tasks,streak,notes,goals}` from every header/CTA; `widgets.js` lands on the card/page (`getLaunchUrl` + `appUrlOpen`) | CI `39573818995` asserts the scheme in the merged manifest |
| **W5 (done)** | Offline-first `WidgetSyncWorker`, disappearing completed rows + AVD tick, notes/goals/notes-only variants, About cards, settings tiles ×6 | CI `39573818995` (debug) + `39574288079` (signed beta) green |
| **W6 (done on branch)** | Approved designs (Tajawal, tasks/streak/notes), lectures widget, goals progress, instant refresh, single premium settings button, `5.0.0-beta.2` | CI green; **merge to `main` still pending** |

**Version policy:** W1–W2 stayed on `4.6.7` (`versionCode 37`). The test branch
now carries **`5.0.0-beta.1` (`versionCode 38`)** so the beta installs over the
stable build; `main` is untouched until the merge.

### 10.8.1 Beta channel (no merge)

- Release: **`v5.0.0-beta.1`** (prerelease, `make_latest: false`), APK
  `Medical_Platform_v5.0.0-beta.1.apk`, **14,933,555 B**, SHA-256
  `1a8195cc55750bc8abc80ffa4a3844d9c8111ef56ae117d948c56a3e745decd8`,
  tag at `0b0639d`.
- Runs: `39574288079` (workflow_dispatch on the branch) and `39576600897`
  (the `v*` tag push rebuilds and replaces the assets — the final file is from
  the tag run; the release step is idempotent).
- The release workflow is now version-aware: a `-` in the version skips the
  Supabase `Medical_Platform_Latest.apk` / `version.json` upload, the URL
  verification and the production push notification. Production stays on
  `v4.6.7` (verified by fetching the public `version.json` after the build).
- Beta size grew from 10.16 MB (v4.6.7) to 14.93 MB — Glance + Compose runtime
  + WorkManager, three dex files, no minification.
- Offline contract: `pending.tasks` is never cleared by the worker (only by the
  WebView drain) because localStorage still has to receive the toggle; duplicate
  upserts are idempotent on `(user_id, plan_date, task_id)`.

### 10.9 Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| RemoteViews cannot blur | "Glass" looks flat | Layered gradients + hairline border (§10.2); visually validate on device |
| Glance requires Kotlin | Build breakage | Add Kotlin plugin in W1, CI compile early; keep `MainActivity` Java |
| `updatePeriodMillis` minimum 30 min | Stale widgets | Event-driven `requestUpdate()` after every app sync; never rely on tick |
| Widget/network divergence | Lost task toggles | `pending.tasks` queue is the only write path; drain **and verify** on app open |
| Arabic clipping at small sizes | Unreadable metrics | +1 sp scale, tabular numerals, test 1.3 font scale, single-line titles with ellipsis **after** 2 lines |
| Dynamic color destroys brand | Inconsistent identity | Semantic colors fixed (flame/freeze), surfaces dynamic |
| `SharedPreferences` group mismatch | Empty widgets | Group name in one Kotlin constant + one JS constant; assertion test in Node |
| APK size growth | Slower updates | Glance is small; no image assets beyond previews; verify APK size delta in CI |

### 10.10 Definition of done (widgets)

- Four widgets installable, resizable per spec, in Arabic RTL.
- Checkbox toggles work offline and reconcile on next app open.
- Light / dark / dynamic-color and 1.0 / 1.3 font-scale matrices checked.
- Empty / offline / error states designed, not defaulted.
- Preview images in the picker look premium (not screenshots with lorem text).
- No new battery drain (no polling), no new permissions beyond `VIBRATE`.
- Documented in `docs/widgets/design-spec.md`, released through CI.

---

## 11. Phase 0 Completion Log

**2026-10-21**

| Step | Result |
|---|---|
| Stable tag | `v4.6.7-stable` — *"Stable version before widgets"* — pushed to origin |
| Feature branch | `feature/home-screen-widgets` created from `main` (`1935e59`) and pushed with upstream tracking |
| AI context | This file (`PROJECT_STATE.md`) |
| Plugin evaluation | `@capawesome/capacitor-widgets` → 404; `@capgo/capacitor-widget-kit` → rejected (SVG/hotspot model); **`capacitor-widget-bridge@8.1.0` chosen** + Jetpack Glance |
| Plugin install | `npm install capacitor-widget-bridge@8.1.0` → `package.json` dependency ✅ |
| Native sync | `npx cap sync android` → plugin registered ✅ |
| Widget workspace | `src/widgets/.gitkeep` ✅ |
| Version | **unchanged at 4.6.7** (per Phase 0 instruction) |

**Immediate next action:** Phase W1 — add the Kotlin/Glance toolchain and a
static Tasks widget rendering a fake payload, then wire real data in W2.

---

### Phase W1 Completion Log (2026-10-21)

**Goal:** Kotlin + Jetpack Glance compiling, and the first real widget.

| Area | What landed |
|---|---|
| Toolchain | Kotlin `2.2.21` + `org.jetbrains.kotlin.plugin.compose`, Glance `1.2.0`, `jvmTarget = 21`, `glanceVersion` in `variables.gradle` |
| Data bridge | `widgets/WidgetBridge.kt` — reads `medapp_widget_state` prefs, parses `tasks.today` into `TodayTasks`/`TaskItem`, pure + defensive parser (bad JSON → empty day) |
| Theme | `widgets/WidgetPalette.kt` — 27 Material 3 roles built from `widget_color_*` resources; **4 qualifier sets** give Material You dynamic colour on API 31+ and emerald branding on older devices, light + dark |
| UI | `widgets/TodayTasksWidget.kt` — 24 dp card, header + counter chip, 4 dp progress bar, up to 4 task rows with static 18 dp status circles, strikethrough on done, empty state («لا توجد مهام لليوم»), overflow hint |
| Registration | `TodayTasksWidgetReceiver` in `AndroidManifest.xml`; `res/xml/today_tasks_widget_info.xml` (4×2, min 250×110 dp, resizable, 30 min safety refresh); picker `previewLayout` + vector `previewImage` |
| CI | `.github/workflows/android-compile-check.yml` — **compile-only** gate (`assembleDebug`) on the widgets branch; publishes nothing, asserts the receiver survives manifest merging |

**Verification (no local Android SDK in Termux):** CI run **`39559126314` → success**,
debug APK 18,084,642 bytes, `✅ TodayTasksWidgetReceiver is registered in the
merged manifest`.

**Two build failures found and fixed during W1** (both caught by the new gate):
1. `--` inside an XML comment (`values-night/widget_colors.xml`) — illegal in XML;
2. an empty `Box {}` in the ring drawing was missing its required content lambda.

**Deliberately deferred to W2:** click actions (`ToggleTaskAction`), `pending.tasks`
queue, `src/widgets/bridge.js`/`state.js`, and the app→prefs publisher (the widget
therefore shows its designed empty state on a fresh install until W2 wires data).

**Note:** W1 stays on version 4.6.7 and is **not** published. The widget becomes
visible to users only at the W6 release, because installing a debug APK over the
release-signed app is impossible (signature mismatch).

---

### Phase W2 Completion Log (2026-10-21)

**Goal:** four widgets, real checkbox interaction, and in-app discovery.

| Area | What landed |
|---|---|
| Plugin | `widgets/MedWidgetsPlugin.kt` — local Capacitor plugin: `publishWidgets`, `updateWidgetTasks`, `updateWidgetStreak`, `updateWidgetNotes`, `requestPinWidget`, `isPinWidgetSupported`, `getPendingToggles`, `clearPendingToggles`; registered in `MainActivity.onCreate` **before** `super.onCreate`; emits `widgetTaskToggled` while the app runs |
| Interaction | `widgets/ToggleTaskAction.kt` — Glance `ActionCallback`: optimistic prefs flip → `pending.tasks` → package-scoped broadcast → `update()` redraw. The WebView drains the queue through `setTaskCompleted` (localStorage + Supabase); the plugin merges undrained toggles into every incoming payload, so a tap can neither be lost nor visibly flip back |
| Widgets | `SimpleStreakWidget` (flame badge + hero number + best/freezes footer), `DetailedStreakWidget` (7-day map: done / missed / today halo / freeze), `NotesWidget` (3 pinned rows, goals before notes), `TodayTasksWidget` upgraded (checkbox + open-app targets, row budget from `LocalSize`) |
| Shared chrome | `widgets/WidgetUi.kt` — 24 dp glass card (1 dp edge + tonal surface), hairline, chips, icon badge, compact horizontal empty state with a working open-app CTA |
| Data | `widgets.js` (root, shipped + precached in `sw.js`) builds `tasks.today`, `streak.summary` (`MedAppStreakCore` over local `task_at_*`), `notes.pinned` (`medfav_goals` + `medfav_my_notes_v3`); refreshes on boot, `visibilitychange`, `taskUpdated`, `online`, and `widgetTaskToggled` |
| Discovery | Settings → «الشاشة الرئيسية»: hero card + four CSS preview tiles; `addHomeWidget(kind)` → `requestPinWidget`; section hidden on web/iOS, hint text adapts when the launcher refuses pinning |
| Resources | 3 provider XMLs (4×2, resizable, 130 dp min), 3 picker preview layouts, 3 vector glyphs (flame / pin / checklist), preview strings + styles, `widget_color_glass_stroke` in all four qualifier sets |
| Pages | `index`, `progress`, `notes`, `goals` load `widgets.js`; notes/goals refresh after every mutation; `goals.html` also loads `streak.js` so all publishers agree |
| CI | compile gate now asserts **all four** receivers survive manifest merging; `widgets.js` added to its trigger paths |

**Five defects found and fixed before declaring W2 done:**
1. **4×2 clipping** — the card now spends `LocalSize` on whole rows (2 at 130 dp, 3 at ~195, 4 at ~230) instead of drawing a fourth row outside RemoteViews bounds.
2. **Mis-tap safety** — the status circle toggles; the task text and header open the app.
3. **Empty state** — collapsed to one horizontal row (~34 dp); the centered stack needed ~135 dp and clipped its CTA.
4. **Publish race** — queued toggles are merged into arriving payloads (done counter adjusted by delta, so the 12-row cap still reports the real total).
5. **Weekly gutters** — 10 → 8 dp so the today halo fits at the 130 dp minimum.

**Verification (still no local Android SDK):** CI run **`39566019522` → success**, debug APK
**`18,162,125` bytes**, all four receiver assertions printed. Contract test outside the
repo (`$PREFIX/tmp/opencode/test_w2_widgets.js`) passes: tasks payload + pending
merge, streak map with Arabic initials, goals→notes ordering, drain through
`setTaskCompleted`, `publishWidgets`, and `requestPinWidget`.

**Not verifiable without hardware:** rendered pixels, light/dark/Material-You
matrices, 1.0/1.3 font scale, the system pin dialog, and a real Supabase write
originating from a widget tap. Version stays **4.6.7**; users only see the widgets
at the W6 release.

---

### Phase W6 Completion Log (2026-10-21)

**Goal:** final widget design pass + goals progress + a beta.2 build, still on the branch.

| Area | What landed |
|---|---|
| Typography | `res/font/tajawal_{regular,bold,extrabold}.ttf` bundled; every widget string goes through `WidgetUi.wText()` → `FontFamily("Tajawal")`. Glance 1.2 has no `FontFamily(@FontRes)`, so the launcher resolves by family name and falls back to the platform Arabic face when Tajawal is absent; the assets are already in the APK for the day that API lands. |
| Tasks | Slate 135° gradient card, 28 dp radius, emerald `done/total` pill, animated tick ring, disappearing completed rows, rows budgeted from `LocalSize` (3 at 4×2, 6 at 4×4). |
| Streak | `SimpleStreakWidget` 2×2: ember glow, flame, 58 sp number, 7 dots (hidden at 1×1). `DetailedStreakWidget` 4×2: 36/64 split with explicit dp widths (Glance 1.2 has no fractional weights), week map with done/today/missed/freeze markers. |
| Notes & goals | Sticky-note paper (`#F0F9FF` goals / `#FAF5FF` notes), tape inside the top bounds, title + `+`, ✦ rows, percentage pill per tracked goal. Combined card is side-by-side at ≥230 dp and stacked below it. |
| Lectures | New `LecturesWidget` (2×2, receiver + provider XML + picker preview) with bundled marine/teal art, bottom scrim, next lecture from `plans-data.json`; payload key `lectures.next`. |
| Goals | `goals.html`: target/unit inputs, progress bar + % ring, `+5%` step, `+N unit` quick add, custom “update progress” modal, average-progress stats, auto-complete at 100%, `?add=1`, optimistic cloud upsert/delete to the new `public.goals` table. |
| Refresh | `widgets.js` publishes on `hidden`/`pagehide` (before the WebView freezes) and queues one follow-up publish when a refresh is already in flight, so a burst of `+10` taps cannot be lost. |
| Settings | `src/settings.html` (new, one premium button → `requestPinWidget('tasks')`) + `widgets.js` collapses the in-app six-tile grid to the same single premium card without touching `index.html`. |
| Deep links | `pre12://add-goal` / `pre12://add-note` / `pre12://lectures` mapped in `widgets.js`; goals auto-opens its add sheet for `?add=1`. |
| Version | `5.0.0-beta.2` / `versionCode 39` across `package.json`, `build.js`, `sw.js`, `build.gradle`, `version.json`. |

**Known platform limits (honest):** Glance text cannot load a bundled TTF by
resource id, so Tajawal applies only where the launcher exposes the family; and
RemoteViews has no network image pipeline, so the lecture “cover” is bundled art.
Both are documented in code.

---

### Phase W7 Completion Log (2026-10-21)

**Goal:** instant sync, the corrected widget sizes, readable type, and a working
"add widget" button — shipped as **v5.0.0-beta.3** (still on
`feature/home-screen-widgets`, nothing merged to `main`).

| Area | What landed |
|---|---|
| Instant sync | `ToggleTaskAction` now writes prefs (`commit()`) → queues the durable toggle → **redraws (`GlanceAppWidget.update()`)** → broadcasts to the WebView → *then* enqueues WorkManager. The tick no longer waits for the network or the job queue. `MedWidgetsPlugin.publishWidgets` triggers the redraw before the session/meta bookkeeping. |
| Tasks | Now **2×3** (`minWidth 140dp`, `minHeight 160dp`, `targetCell 2×3`): 20 sp title, 16 sp rows, the `done/total` pill moved to its own meta line so the narrow column never clips it, rows budgeted from `LocalSize` (2 at 160 dp → 3 at ~218 dp). |
| Streak | `SimpleStreakWidget` is **1×1 only** (`resizeMode="none"`): vector flame (22 dp, not an emoji line box) + 32 sp number on `#0f172a` with a 1 dp `#ef4444` border. `DetailedStreakWidget` keeps 4×2 and now uses 40 sp numbers. |
| Lectures | Now **1×1**: the subject cover (`plans/phys.jpg` …, bundled in the WebView assets) fills the tile through an `Image` layer with `ContentScale.Crop`, decoded offline to RGB_565 ≤320 px so the RemoteViews bitmap stays well inside the ~1 MB binder limit. A tap opens the album. |
| Notes & goals | Titles 18 sp, rows 14 sp, bigger `+`, row budget re-tuned (1 row at 110 dp → 4 at 220 dp). |
| Settings | `MedWidgetsPlugin.openWidgetPicker()` asks the launcher for its widget picker (Android exposes no public picker intent, so every known launcher dialect is tried in order). If none answers, `src/settings.html` reveals an in-page chooser with all five widgets, each row calling the documented `requestPinWidget`. The in-app premium card in `widgets.js` uses the same path. |
| Version | `5.0.0-beta.3` / `versionCode 40` across `package.json`, `package-lock.json`, `build.js`, `sw.js`, `build.gradle`; `version.json` regenerated from the CHANGELOG. |

**Two Glance facts that shaped the code (found by reading the Glance sources):**
a *background* only accepts a drawable resource (`setViewBackgroundResource`), so
a bitmap cover can never be a background — it must be an `Image` layer; and
`ContentScale` lives in `androidx.glance.layout` (not `androidx.glance`).

**Verification:** compile check **`39597148314` → success**; release build
**`39597813937` → success**. Prerelease `v5.0.0-beta.3` (tag on `8ce3839`), APK
**15,059,184 bytes**, SHA-256
`c5b9e4914c8849ddb4426f678186ea9720a6848131a37cb1d74f6180f883f08a`.
Production is untouched: `releases/latest` is still **v4.6.7** and the Supabase
`version.json` still reports 4.6.7 (the workflow skips Storage + notifications
for any version containing a `-`).

**Not verifiable without hardware:** the rendered pixels (1×1 crop, 1.3× font
scale), which launchers expose a picker intent, and the real system pin dialog.

---

### Phase W8 Completion Log (2026-10-21)

**Goal:** the final polish before release — instant sync in both directions,
task animations, the wide tasks card, a readable week map, and the lectures
widget removed. Shipped as **v5.0.0-beta.4** (branch only, `main` untouched).

| Area | What landed |
|---|---|
| App → widget | `index.html` builds the task payload from the plan already in memory and calls `MedWidgets.updateWidgetTasks(...)` **inside the tap** — no plan fetch, no Supabase, no await. `widgets.js` adds `pushTasksNow()` as the generic fast path for every other page, and `publish()` no longer overwrites a working card with an empty list when the plan fetch fails. |
| Widget → app | `ToggleTaskAction` writes prefs → redraws → broadcasts; the plugin now emits **both** `widgetTaskToggled` and `taskUpdated` to the WebView. The pending queue is drained locally (no 250 ms delay), `setTaskCompleted` dispatches the DOM `taskUpdated`, and `index.html` repaints the card *and* the open sheet. |
| In-app animation | A `.today-task.done` class strikes the row through and fades it over 300 ms — added optimistically on tap, never waiting for the network. |
| Tasks card | Now **wide 3×2** (`minWidth 250dp`, `minHeight 120dp`, `targetCell 3×2`): title 20 sp, tasks 16 sp, the `done/total` pill and the counter on the header line, and the leftover height shared between the rows as air instead of a dead gap. |
| Lectures widget | **Deleted completely**: `LecturesWidget.kt`, its provider XML, its picker preview, its background drawable, its strings, the manifest receiver, the bridge payload (`NextLecture`/`KEY_LECTURES`), the plugin mapping and the JS builder. The compile gate now asserts six receivers. |
| Notes & goals | The widget shows the note **content** (not only the title) at 15 sp, two lines with a real ellipsis cut in JS (RemoteViews cannot ellipsize), titles 18 sp. The row budget follows the line count instead of a fixed table. |
| Detailed streak | Rebuilt: a vector flame + **48 sp** number + «يوم متتالي» on the left (26 % of the real width), and the seven days as **32 dp rings** on the right — a 4 + 3 grid, each ring a thick border (nested boxes) with its Arabic initial inside. |
| Settings | The button works for real: `openWidgetPicker()` → documented `requestPinWidget()` → an in-page six-widget chooser. The listeners are attached **before** the icon library runs (a missing icon could never leave the button dead), and the requested helper text sits right under the button. |
| Version | `5.0.0-beta.4` / `versionCode 41`. |

**Verification:** compile check **`39603445654` → success**; release build
**`39604230731` → success**. Prerelease `v5.0.0-beta.4` (tag on `61f0b5f`), APK
**15,061,358 bytes**, SHA-256
`b081e7e5d88d24b9209c0bd7941fe0149689f8b546bb99ed5a6142fcd80add7d`.
Production untouched: `releases/latest` is still **v4.6.7** and the Supabase
`version.json` still reports 4.6.7.

**Not verifiable without hardware:** the rendered pixels (3×2 crop, 32 dp rings,
1.3× font scale), whether a given launcher exposes a picker intent, and the
real system pin dialog.

---

### Phase W9 Completion Log (2026-10-21) — the "perfection strike"

**Goal:** the two things that made the app feel broken — a widget that ignored
the tap, and a settings page frozen in an old cache — plus the remaining UI
polish. Shipped as **v5.0.0-beta.5** (branch only, `main` untouched).

#### The root causes (both were real, both were silent)

| Symptom | Real cause | Fix |
|---|---|---|
| "Clicking a task in the widget does nothing until the phone restarts" | Glance 1.x keeps the composition alive in a session and `update()` only asks it to **recompose**. Our payload was read *before* `provideContent`, so the closure captured it forever — every redraw re-used the first payload. | Every widget now reads its payload **inside** the composition (`LocalContext.current`), so each recomposition sees the current prefs. |
| "Clicking a task in the app does not update the widget" | The SPA shell (`app.js`) removes every window/document listener of the view it replaces — and `widgets.js` is an *external* script, so it is never executed again. The whole widget bridge died after the first navigation. | `widgets.js` re-binds itself through a `MutationObserver` (not a DOM listener, so the shell cannot remove it) and the binding is idempotent. |
| "The settings page shows the old UI" | After an app update the WebView still holds the previous HTML in its HTTP cache, and the shell fetched pages cache-first. | `sw.js` fetches HTML with `cache: 'no-store'`, the shell does the same, and `CACHE_VERSION` moved to `v5.0.0-beta.5`. |

#### What else landed

- `ToggleTaskAction` now runs the exact sequence: **read prefs → mark the task →
  save (`commit`) → `GlanceAppWidget.update()` → then** the broadcast and the
  WorkManager upload.
- **One premium button** in `index.html` (the six old tiles are gone) with the
  helper text under it, and a light-mode skin (`#e8f5e9` / `#1b5e20`). The
  standalone `src/settings.html` was deleted — it was a mistake.
- `triggerAddWidget()`: picker → pin dialog → toast, never a network call.
- Tasks card: the title is **centred** with a hairline under the header, and the
  rows carry `defaultWeight()` so a short list fills the card instead of
  leaving a dead gap.
- Detailed streak: the seven days now show their **full Arabic names** under
  32 dp rings in a 4 + 3 block that fills the right half.
- Notes & goals: the **title** (15 sp bold) on the first line and the
  **content** (13 sp) underneath, both cut with a real ellipsis in JS.
- Deep links: the shell (`app.js`) now owns the Capacitor `pre12://` listener
  and re-dispatches it as `medapp:deeplink`, also after an SPA swap; a new
  `pre12://updates` target opens the update dialog.
- The `medapp_updates` notification channel already existed in
  `notifications.js` and is created on every start.

**Verification:** compile check **`39614036094` → success**; release build
**`39614639801` → success**. Prerelease `v5.0.0-beta.5` (tag on `07f110a`), APK
**15,051,965 bytes**, SHA-256
`fd746aac57b0e6b16c217a8e7e95bdd85044c4bf70257f8aca4517986e91013e`.
Production untouched: `releases/latest` is still **v4.6.7**, Supabase
`version.json` still reports 4.6.7.

**Not verifiable without hardware:** the rendered pixels (the 3×2 crop, the
32 dp rings, 1.3× font scale) and the real system pin dialog.

---

### Phase W10 Completion Log (2026-10-21) — "The Perfection Strike"

**Goal:** take full ownership of the notification system — a context-aware engine,
clean channels, correct deep links, real MCP testing, and a beta.6 release.

#### What was designed

**A. A new engine architecture** (`supabase/functions/_shared/scenarios.ts` +
`smart-notifications-engine/index.ts`, deployed as v25):

| Piece | What it does |
|---|---|
| `UserContext` | 30+ fields built from real data: streak + longest streak, 7-day momentum, per-subject completion, goals (target/current/unit/deadline), new content, inactivity, first-win date, the median hour the student actually works, and the pending task. |
| 21 scenarios | Each with a priority, a cooldown, a daily cap, a channel, a deep-link action and Arabic copy that varies (3–4 variants each). |
| Priority + weight | The highest-priority matching scenario wins; equal priorities are picked by weight, so two equally valid reasons still feel alive. |
| Quiet hours | Fixed 00:00–07:00 **plus learned hours**: a student who never works at 04:00 is not woken at 04:00. |
| Pacing | ≤3 notifications/day, ≤12/week, plus a per-scenario cooldown, plus a novelty filter that never repeats a headline from the last 12 sends. |
| Channel prefs | `profiles.notification_prefs` — the student chooses what reaches them; the engine obeys. |
| 3 modes | `run` (cron), `preview` (compose, don't send), `test` (a real push to your device), plus `catalog`. |

**B. New creative scenarios invented in W10** (10 of the 21 are new):
`firstWin` (celebrate the *first* win on the day it happens) · `freshStart`
("ابدأ من الصفر — لا بأس" for an account that never started: no guilt) ·
`streakMilestone` (7/14/21/30/50/100 with a named badge) · `momentum` (2 of the
last 3 days active) · `morningPlan` (5–10 am) · **`nightOwl`** (23:00–02:00:
"نومك جزء من أدائك" — a *sleep* nudge, not a study nudge) · **`comeback`**
("سلسلتك ما زالت محفوظة" after 3+ days away) · `weeklyDigest` (your week in one
line) · `subjectFocus` (your weakest subject) · `goalMilestone` / `goalDue`
(70%+ or a deadline within 2 days).

**C. Channels**: `medapp_tasks` · `medapp_streak` · `medapp_content` ·
`medapp_updates` — each with a name, a description, a colour and a per-user
switch in the app's diagnostics section.

**D. Deep linking** (bugs found and fixed):
- `update` notifications called `check({ silent: true })` → **the update dialog
  never opened** (the tap looked broken). Fixed in `native.js` *and*
  `notifications.js`.
- The new `goals` action had no route → now opens `goals.html`.
- Every notification now carries a `pre12://` URL and is routed through the
  **same** deep-link engine the widgets use (`routePre12Link`), so a tap lands
  on the exact sheet/page whether the app is open or cold-started.

#### MCP tests that were actually run (all against the live project)

1. **Deployed** the engine (v25) through the Supabase MCP deploy tool.
2. **Preview run** (cron path via `net.http_post` with the Vault secret) →
   the engine picked `firstWin` (priority 85) with the title *"أحسنت — خطوة
   واحدة تفعل الفرق"* — a *different* variant from the previous send
   (the novelty filter works).
3. **Real push #1** (`mode: test`) → `{"sent":1,"failed":0,"fcm":"v1"}` — a real
   FCM v1 message reached the registered device token.
4. **Real push #2** (`scenario: agenda`) → sent, and the payload carried
   `task_id: bio_01` + the task title so the "تم الإنجاز" button knows what to
   complete.
5. **Real push #3** (`scenario: contentForYou`) → sent to `medapp_content` with
   the target `subject.html?subject=history` — the slug came from the live
   `subjects` table, and the body named the student's strongest subject.
6. **Cron-path run** → `{"sent":0,"skipped":1}` — the daily cap refused to send
   because the old engine had already spammed 5 messages that day. **That is
   the fix working.**
7. **Channel-preference test**: set `streak:false` → the engine skipped
   `firstWin` and chose `goalDue` (content) instead; the preference was then
   restored.
8. **Local suite** `tools/test-notification-scenarios.ts` — **36 assertions,
   all green**. It caught three real bugs before deployment: a never-active
   student receiving "we miss you", a "first win" celebration firing weeks
   later, and the novelty filter comparing raw templates instead of the final
   headline.

#### Migrations
`profiles.notification_prefs` + `quiet_start`/`quiet_end`; a richer
`notification_log` (`scenario`, `channel`, `payload`, `reason`); helper RPCs
(`recent_notification_titles`, `notification_counts`,
`notification_diagnostics`); the cron moved from hourly to **every 30 minutes**
(the engine's own pacing does the rest).

#### Release
`5.0.0-beta.6` / versionCode 43 — compile check **`39622112467` → success**,
release build **`39623175049` → success**, prerelease `v5.0.0-beta.6` (tag on
`2d005cc`), APK **15,058,205 bytes**, SHA-256
`3a4870a311827f589472722b9c0f813aef02e06200d05a2e0123b1d028545f0a`.
Production untouched: `releases/latest` is still **v4.6.7** and the Supabase
`version.json` still reports 4.6.7.

**Not verifiable without a device in hand:** that the *rendered* notification
looks right on the vendor's launcher, and that a cold-started tap opens the
right sheet on that specific ROM.

---

### Phase W12 Completion Log (2026-10-21) — the official **v5.0.5**

**Goal:** the last hotfixes before the official release — the Smart Lab buttons,
the log diet, the final widget UI, and a real production merge.

#### The two silent bugs (both were root causes, not symptoms)

1. **"The widget ignores my tap until I reboot the phone."**
   Glance 1.x keeps the composition alive in a session and `update()` only asks
   that session to *recompose*. Our payload was read **before** `provideContent`,
   so the closure captured it forever and every redraw replayed the first
   payload. **Fix: every widget reads its payload inside the composition**
   (`LocalContext.current`), so each recomposition sees the current prefs.
2. **"Tapping a task in the app does not update the widget."**
   The SPA shell removes every listener of the view it replaces, and
   `widgets.js` is an *external* script that is never executed again — the whole
   widget bridge died after the first navigation. **Fix: `widgets.js` re-binds
   itself through a `MutationObserver`** (not a DOM listener, so the shell cannot
   remove it) and the binding is idempotent.

`ToggleTaskAction` now runs the exact sequence: **read prefs → mark the task →
save (`commit`) → `GlanceAppWidget.update()` → only then** the broadcast and the
WorkManager upload.

#### The Smart Lab (settings → diagnostics)
- **«عاين الرسالة»** builds a **local** notification with mock data (same titles
  and bodies as the engine) — no server round-trip.
- **«أرسل إليّ الآن»** first calls `ensureNotificationToken()` (so the device
  token exists in `profiles`), then asks the Edge Function to push the chosen
  scenario **to that device only**. The engine accepts an authenticated user for
  the test mode and never touches another device.
- The misleading "المحرك الذكي متاح داخل التطبيق فقط" message is gone, and the
  request really executes.

#### The log diet (41 GB → measured, not guessed)
`query_logs` showed the truth: **edge_logs 24,134 events vs postgres_logs 310**.
The app was sending a **HEAD request per subject on every page load**
(2,726 per subject per day ⇒ >16,000 records/day). Fixes: a 30-minute TTL with
stale-while-revalidate for the subject file-count, no `PATCH` when the FCM token
has not changed, `cache: 'no-store'` for page fetches, and a fresh SW version.
The server-side migration (`log_statement`, `log_min_duration_statement`,
`log_min_messages`) is shipped too — it needs a superuser session, which the
managed `postgres` role is not, so it is applied best-effort with a clear notice.

#### Final widget UI
- **Tasks**: wide 3×2 (250×120 dp), title **centred** with a hairline under it,
  and **every** task that fits (cap 12, not 6) with the rows stretching to fill
  the card.
- **Notes & goals**: a hairline under the title; line 1 = title, line 2 = content.
- **Detailed streak**: full Arabic day names under 32 dp rings.
- **Add-widget button**: three fallbacks — pin → system picker → in-app modal.

#### Notification pacing (5.0.5)
- Daily cap **6**, weekly cap **30** — a **ceiling, not a quota**: with no real
  event the engine sends **zero** (verified live: `sent:0, skipped:1`).
- The fixed 8 AM / 8 PM reminders and the admin/update pushes do **not** count
  towards the cap (the engine filters the log to the smart categories).
- **No user slider was added.**

#### Release
`5.0.5` / versionCode 44 — compile check **`39635863410` → success**, release
build **`39636751284` → success**. Merged to `main` (fast-forward, 30 commits),
tagged `v5.0.5`, pushed with the tag. The GitHub release is **Latest** (not a
prerelease) and the APK is live on Supabase Storage: **15,064,941 bytes**,
SHA-256 `42ab4a960a6a36a29e4a478c8e39af332f9ab2f26c79c863d2b9964ad8c17293`.
The in-app update system now offers 5.0.5 (`version.json` = 5.0.5).

---

### Phase W14 Completion Log (2026-10-21) — **the widget actually works now**

**Release:** `v5.0.6` (versionCode 45) — GitHub **Latest**, live on Supabase
Storage, `version.json` = 5.0.6. APK **15,067,233 bytes**, SHA-256
`71900a147fd2f23baf05391aafefffcae78f3c26b5af4f521a449708f0318635`.

#### The root cause (finally found — and it explains three symptoms at once)

> *Glance 1.x keeps the composition alive in a session (~45 s) and `update()`
> only asks that session to **recompose**. Compose **skips** any lambda whose
> parameters did not change and that reads **no state** — so our content re-used
> the **first** payload forever.*

That single fact produced all three of the user's complaints:

| Symptom | Why |
|---|---|
| "the checkbox does nothing (no ✓, no strike-through)" | the redraw replayed the *old* payload — the tick was written to prefs but never rendered |
| "only 1 task shows" | the old payload still had the task as *not* done… and the completed row was filtered out by the 0.9 s "vanish" rule |
| "the sync needs a phone restart" | only a **new session** (or a reboot) re-ran `provideGlance` and re-read the prefs |

**The fix:** every widget now reads a **real Compose state** inside its content
(`WidgetRefreshSignal.version` — a `mutableStateOf` bumped by the plugin on
every repaint and by the checkbox action right after the prefs write). A content
that reads a state can no longer be skipped → it re-reads SharedPreferences and
the new RemoteViews reach the launcher **in the same millisecond** (no network,
no WorkManager).

#### The four tasks

1. **Smart Lab «Send now»** — the engine accepts `forceTest: true`: it ignores
   every scenario condition and the daily/weekly caps and pushes **to the
   requesting device only** (deployed as v29). The client now surfaces the
   **real** server error (403/400/…) instead of a generic message.
2. **Tasks widget** — no weights, no Spacers, no truncation: **every** task of
   the day is rendered as a simple column, and a **completed task stays** in the
   list with its ✓ and its strike-through (that is the proof the tap landed).
   The row height shrinks slightly when there are many tasks so nothing clips.
3. **Notes widget** — line 1 = the **title** (15 sp bold), line 2 = the
   **content** (13 sp grey), in *every* layout including the stacked one (the
   content line used to be hidden there). The payload maps the real note keys
   (`title` / `content`) and cuts both with a real ellipsis.
4. **Zero-lag sync** — completing a task, adding or deleting a note, and
   changing a goal all publish to the widget **immediately**
   (`pushTasksNow` / `pushNotesNow` — no plan fetch, no network); the task push
   also refreshes the streak card in the same tick.

#### Verification
- Local suite `tools/test-notification-scenarios.ts` — **38/38 green**.
- Compile check **`39648436914` → success** (one real error caught: a missing
  Glance `height` import).
- Release build **`39649066961` → success**; the APK was re-downloaded and
  re-hashed independently.
- Live engine (**v29**): the cron path returns `200` with
  `caps:{daily:6,weekly:30}` and `sent:0, skipped:1` — i.e. **no event, no
  notification** (event-driven ✓); the test mode without a user JWT now
  answers with a precise, actionable error.

---

### Phase W15 Completion Log (2026-10-21) — **v5.0.7** (the cache killer)

**Release:** `v5.0.7` (versionCode 46) — GitHub **Latest**, live on Supabase
Storage, `version.json` = 5.0.7. APK **15,076,531 bytes**, SHA-256
`b5c3b5310cb0fcf5fe2f5e31ccdd3a8c10458ca52b3edbfb401f60253c3e2430`
(re-downloaded and re-hashed independently ✓).

#### The bulletproof cache killer
| Layer | What it does |
|---|---|
| `sw.js` | `CACHE_VERSION = 'v5.0.7-clean'`; **activate** now deletes **every** cache (`caches.keys()` → `caches.delete` for all names, whatever they are). The old code only removed `medfav-*`, so a renamed or leftover cache kept serving the previous UI. |
| `native.js` | `runCacheKiller()` compares the installed version (`App.getInfo`, falling back to the `app-version` meta tag — normalised) with `localStorage.app_version`. On a mismatch it: unregisters **all** service workers → deletes **all** caches → busts the HTTP cache → wipes the stale `localStorage` artifacts → forces `location.reload(true)`. |
| once, never a loop | The new version is written **before** the reload, so the wipe runs exactly once per bump. An interrupted wipe is detected by a timestamp marker (`app_version_wiping`) and completed on the next start **without** a second reload. |
| `MainActivity.java` | The WebView's own HTTP cache — the thing that actually served the old page — is cleared natively on a version change, once (the version is stored before the wipe ⇒ no loop). |
| data safety | The user's own work data (notes, goals, task queue) is now protected from the wipe. |

#### The rest of W15
- **The Smart Lab talks to the engine for real**: `notifications.js` no longer
  depends on `client.functions.invoke`; it calls the Edge Function with `fetch`
  (+ the user's JWT), so a missing SDK method can no longer masquerade as
  “the engine is only available in the app”, and **the exact server error** is
  shown (403/400/…).
- **`forceTest`** in the engine (v30): ignores every condition, the caps and
  the quiet hours, and pushes immediately — to the requesting device only in the
  test mode.
- **The widget checkbox repaints in the same millisecond**:
  save → `WidgetRefreshSignal.bump()` → `GlanceAppWidget.update()` (synchronously,
  before anything else), with `updateAll(context)` as a safety net, and
  `MedWidgetsToggle` logcat lines for manual verification.
- **The notes mapping is explicit**: line 1 = title (15 sp bold), line 2 =
  content (13 sp grey, ≤2 lines), in every layout.
- **`NOTIFICATION_TESTING_MANUAL.md`**: the mandatory manual — every scenario
  with its trigger condition, the expected delay, the step-by-step test and its
  channel.

#### MCP verification (live project)
- `{"mode":"run","forceTest":true,"scenario":"streakRisk"}` →
  **`{"ok":true,"sent":2,"failed":0,"forced":true}`** — two real FCM pushes
  delivered to the two registered devices ✓ and logged with the scenario,
  channel, title, body and reason ✓.
- The cron path: `{"ok":true,"sent":0,"skipped":1,"caps":{"daily":6,"weekly":30}}`
  — **no event ⇒ no notification** (event-driven ✓).
- Compile check **`39656520280` → success** (it caught a real error: the missing
  Glance `updateAll` import), release build **`39657595021` → success**.

---

### Phase W16 Completion Log (2026-10-21) — **v5.0.8** (the final QA pass)

**Release:** `v5.0.8` (versionCode 47) — GitHub **Latest**, live on Supabase
Storage, `version.json` = 5.0.8.

#### 1) The admin could not delete a user — the root cause
| | |
|---|---|
| Root cause 1 | `delete-user-account` took the id from the caller's JWT ⇒ **self-deletion only**; an admin could never delete another account. |
| Root cause 2 | The admin panel deleted from the browser with the *user's* JWT — and the `profiles` table has **no DELETE policy at all** ⇒ RLS rejected the request ⇒ the silent failure. `auth.users` was never touched either, so the account could still log in. |
| The fix | The function now accepts `user_id`, verifies the caller's role (`admin`/`moderator`) in `profiles`, and deletes the **target** with the service role: `auth.users` · `profiles` · `notes` · `goals` · `task_progress` · `favorites` · `streak_freezes` · `notification_log` · `lecture_albums` · `album_requests` (both `user_id` and `album_owner_id`) · `schedule_images` (+likes/saves) · the uploaded `files` · their Storage folders (`files`, `schedule-images`). It returns a full report. |
| The panel | `src/admin.html` calls the function and shows the server's **real** message. The self-deletion path is unchanged and still works. |
| The audit | `send-admin-notification` checks the admin role ✓ · `send-test-notification` only pushes to the caller's own device ✓ · `send-update-notification` accepts the service role / cron secret / an admin ✓ · the storage policies are sound ✓. |

#### 2) The notes widget showed the title only — the root cause
- The content line was gated behind a `twoLines` flag that was **false for every
  common size** (the 2×2 and the 4×2 are ≈110 dp; the rule was
  `height >= 130.dp`), and the row budget was a hard-coded table (2 or 3 rows)
  that did not know the rows were two lines tall ⇒ Glance clipped the content
  out of the card.
- **Now**: `StickyBudget` computes a real height budget, the content line is
  drawn **whenever there is text**, and the type scales in small cards. The
  square 2×2 card became **one** paper (notes first, then goals) because two
  papers cannot each fit a title+content row (52 dp each).
- `widgets.js` maps the note explicitly: title → `title`, else the first 15
  characters of the content, else «ملاحظة»; body → `content`, else the title
  (so nothing is repeated); the content is cut to 64 characters with a real
  ellipsis.
- **Tests**: `NotesWidgetPayloadTest.kt` (the bridge keeps both lines, every
  common size fits ≥ 1 row) — green in CI · `tools/test-widget-notes-payload.ts`
  (16 checks).

#### 3) The name reverted after re-login
- The failed `profiles` update was **swallowed** (a console warning) while the
  function reported success ⇒ nothing was saved. Now the error is reported, the
  auth metadata is secondary, and the local cache is always written.
- `index.html` applies the new name **everywhere** at once: the card is
  re-rendered, the greeting, every `[data-profile-name]`, and the author name
  inside the local notes.

#### 4) Typing Arabic did nothing until Enter — the root cause
- The Arabic IME **composes**: while it composes, the DOM value lags behind the
  IME buffer, so the search read a stale value (English works because it does
  not compose).
- **Now** `bindSearchInput` reads the IME buffer itself
  (`base + composed`) and never depends on the lagging DOM value; the
  composition end is handled explicitly.
- **Arabic normalization** (`normalizeArabic`) makes «احمد» match «أحمد»,
  «الاوراق» match «الأوراق», «مستشفي» match «مستشفى» — in the global search,
  the file lists, the notes and the PDF viewer. The PDF viewer uses
  `foldArabic` (position-preserving) so the highlights stay correct.
- The three pages that bound the search with a bare `oninput` now use the
  engine; `highlightText` is HTML-safe.
- **Tests**: `tools/test-arabic-search.ts` (14 checks).

#### 5) The album requests
Only the album owner may accept or reject — the UI offered the buttons to the
requester too, whose update the RLS rejected in silence. An accepted image now
belongs to the album owner.

#### 6) The release
- Version **5.0.8** (versionCode 47) · `sw.js` cache `v5.0.8-clean`.
- `delete-user-account` deployed (v5, ACTIVE, `verify_jwt: true`); all five
  edge functions answer (401/403 without credentials ✓).
- CI: the compile check **39670174907** (with the new unit tests) ✅ and the
  release build ✅ · local suites: 38 + 16 + 14 = **68 assertions green** ·
  43 inline scripts syntax-checked ✅.

---

### Phase W17 Completion Log (2026-10-22) — **v5.0.9** (the profile trigger)

**Release:** `v5.0.9` (versionCode 48) — GitHub **Latest**, live on Supabase
Storage, `version.json` = 5.0.9. APK **15,089,759 bytes**, SHA-256
`a0dc688e06a8235283ef84c754df7c308c3aa61f533bd0712e7f914a9955c289`
(re-downloaded and re-hashed independently ✓).

#### What the MCP inspection found (the real root cause)
| Check | Result |
|---|---|
| `pg_trigger` on `auth.users` | **EMPTY** — no trigger at all |
| `public.handle_new_user()` | **present and correct** (full_name/name + avatar_url/picture) — it was simply never called |
| `auth.users` vs `profiles` | 3 users · **1 profile** → two users (Google) had no profile row |
| `pg_policies` on `profiles` | SELECT + UPDATE only — **no INSERT** ⇒ a client-side upsert was rejected by RLS |
| `relforcerowsecurity` | false ⇒ the `SECURITY DEFINER` trigger bypasses RLS ✓ |

⇒ The chain was: *no trigger* → *no profile row* → the UI fell back to
`email.split('@')[0]` (the "hnt317601" name) and to the initial letter (no
avatar) → and the name could not be saved because there was no row to save it in.

#### The fixes
1. **The trigger** (recreated, with a guard so a failure can never break the
   signup) + the `profiles` INSERT/DELETE policies for the user's own row
   (`with check auth.uid() = id and role = 'student'` ⇒ no self-promotion) +
   a **backfill** of the two orphan users.
2. **The client is the second line of defence**: `ensureProfileRow()` upserts
   the row from the session metadata whenever it is missing or unnamed — in
   `loadUser()` on every page and in `runFullUserSync()`.
3. **The name no longer reverts**: Google rewrites `raw_user_meta_data` on
   every sign-in, and the avatar sync used to copy that provider name over the
   user's own. Now the avatar sync never writes a name, `ensureProfileRow`
   only fills an empty one, and the trigger's conflict path keeps the existing
   name (`coalesce(nullif(profiles.full_name,''), excluded.full_name)`).
4. **One avatar chain everywhere**: `profiles.avatar_url` → the session
   metadata (`avatar_url`/`picture`) → the initial letter — in the settings
   card, the notes (the shared authors' avatars are fetched once), the admin
   user list, the progress list and the admin's student page.
5. **Album request notifications**: the `albumRequest` scenario in the shared
   brain (the exact payload «📸 طلب جديد: يريد {الاسم} إضافة صورة إلى ألبومك
   '{الألبوم}'.» → `my-lectures.html?album=<id>`) + a real **database webhook**
   (a trigger on `album_requests` → `pg_net` → the engine, the secret from the
   Vault) ⇒ the owner is notified in **seconds**, not at the next 30-minute run.

#### Verified live (MCP)
- A simulated `auth.users` insert created the profile with the Google name and
  picture (inside a transaction, then rolled back — nothing left behind).
- The webhook fired: `net._http_response` → `200 {"ok":true,"sent":1,…}` and the
  `notification_log` row with the exact body and the album target ✓ (the test
  rows were deleted afterwards).
- `auth.users` 3 · `profiles` 3 · the trigger, the policies and the RLS flags
  re-read after the migration ✓.
- CI: the compile check **39677737022** ✅ and the release build ✅ · local
  suites: 47 + 10 + 14 + 16 = **87 assertions green** · 31 inline scripts
  syntax-checked ✅.

---

### Phase W19 Completion Log (2026-10-22) — **v5.1.1** (the clean repository)

**Theme:** remove every generated/duplicate artefact, make `dist/` the single
build output, and retire the old feature branch.

#### What changed
| Area | Change |
|---|---|
| Git | `feature/home-screen-widgets` deleted **locally and on the remote** (already merged into `main`). |
| Build | `build.js` writes pages to **`dist/` only**; the root existence check was removed, validation kept. |
| Git hygiene | Root `*.html` untracked (`git rm --cached`) and deleted from disk; `.gitignore` now has `/*.html` + `!widget_reference_final.html`. |
| Dead files | `g2.aar` (an HTML error page, not an AAR) · `vercel.json` · `send-test.js` (carried a live FCM token and shipped inside the APK) · 54 old `prompt` notes. |
| Packaging | `PROJECT_STATE.md` · `CHANGELOG.md` · `NOTIFICATION_TESTING_MANUAL.md` added to `EXCLUDE_TOP` → no longer inside `dist/` or the APK. |
| Tests | `tools/test-share-links.ts` reads `dist/`; the `firstWin` fixture no longer uses a hardcoded date (it was a time bomb). |

#### Verification
- `npm run build` → **exit 0** · `21 HTML pages (dist/ only)` · validation passed.
- `npx cap sync android` → **exit 0** · 21 pages inside the APK assets.
- Root contains only `widget_reference_final.html` (a design reference).
- Local suites: **111 assertions green** (15 + 9 + 47 + 10 + 14 + 16) ·
  15 inline scripts syntax-checked.

---

### Phase W20 Completion Log (2026-10-22) — **v5.1.2** (external sharing & UX)

**Theme:** let a downloaded file leave the app (share / open with), and turn the
release notes into plain user-facing Arabic.

#### What changed
| Area | Change |
|---|---|
| Native plugin | `@capacitor-community/file-opener@^8.0.1` (the registry name `@capacitor/file-opener` does not exist). Registered as `FileOpener` → **15 plugins** in `capacitor.plugins.json`. |
| Files | `files.js` §22: `shareDownloadedFile()` · `openDownloadedFileExternally()` — both write a temporary copy to `Directory.Cache` first, because downloads live as Blobs in IndexedDB. Web fallback: `navigator.share` / copy link / `openExternal`. |
| UI | `src/index.html`: each card in **الملفات المحمّلة** gained `mini-icon-btn` buttons (Lucide `share-2`, `external-link`) beside delete; `lucide.createIcons()` runs after the list is rebuilt. |
| Changelog | `CHANGELOG.md`: a friendly v5.1.2 section (4 bullets, no technical jargon) → `build.js` puts them in `version.json` → `app-update.js` shows them verbatim. |
| Version | `APP_VERSION 5.1.2` · `CACHE_VERSION v5.1.2-clean` · `app.js?v=5.1.2` · versionCode 51 · package/lock 5.1.2. |

#### Verification
- `npm run build` → **exit 0** · `version.json → 5.1.2 (4 bullets)` · validation passed.
- `npx cap sync android` → **exit 0** · `@capacitor-community/file-opener` present in the plugin manifest.
- APK contains the two buttons and `app.js?v=5.1.2`; no docs/prompt files inside.
- Local suites: **111 assertions green** · 5 inline scripts in `dist/index.html` clean.
- Release **v5.1.2 = Latest** · APK **15,044,276 B** · SHA-256 matches Storage byte-for-byte.
- CI `39845496583` (main) + `39845502862` (tag) → success · update notification sent.
