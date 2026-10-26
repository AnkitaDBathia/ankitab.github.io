# My Journey

A private daily activity journal made with plain HTML, CSS, and JavaScript. GitHub Pages serves the website directly. There is no frontend compilation step, React, Vite, or PWA functionality.

## What is included

- Supabase email/password sign-in, sign-out, and password recovery.
- Water, reading with multiple books, mantra chanting, yoga, and meditation.
- Custom activities, configurable fields and dropdowns, quick presets, item management, and archiving.
- Daily history, editing and confirmed deletion, per-item totals, weekly and rolling 30-day reports.
- Native HTML dialogs, responsive desktop/mobile layout, light/dark themes, and explicit timezone calculations.
- PostgreSQL migration, ownership constraints, RLS, and automated regression tests.

The database schema is unchanged by the frontend conversion. Do not rerun the initial migration if you already applied it successfully. No live Supabase setup or deployment has been performed by this change. The project URL is still needed to connect your account.

## Database storage and cross-device access

Supabase storage and sign-in are enabled by default again. Create an email/password account in Supabase Authentication > Users > Add user > Create new user, then use that same account on desktop and mobile. Confirm your own email using the dashboard option if offered. Keep public signups disabled if this should remain your private application.

New entries are saved in Supabase after successful login. Open or refresh the mobile app to fetch the latest saved records; live updates without refresh are not implemented. Ensure the SQL migration was applied and the GitHub repository variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured before deployment. Push the updated files to deploy these changes.

Earlier guest entries are still in the original browser's localStorage. They are not automatically uploaded. A **Download guest backup** button appears when that browser has guest data, including on the login page. Download the JSON before clearing browser data. It preserves entries and configurations but is not an automatic database import.

For explicit local-only testing, `guestMode: true` in `config.js` enables guest mode. The default and generated deployment configuration use cloud mode. Supabase RLS is unchanged.

## 1. Configure Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open SQL Editor and run the complete file `ActivityTracker/supabase/migrations/202610210001_initial.sql` once.
3. Verify these tables exist with RLS enabled: `user_settings`, `activities`, `activity_items`, `activity_logs`.
4. Enable Email authentication, disable public signups for your private deployment, and create your own account under Authentication > Users. Use the confirmation option for your verified email address as appropriate.
5. Set Authentication > URL Configuration > Site URL to `http://localhost:5173/` for local testing, then `https://ankitab.github.io/` after deploying.
6. Allow both URLs as redirect URLs. For a project repository, include its path, such as `https://YOUR_NAME.github.io/REPOSITORY/`.
7. For reliable password recovery, configure Supabase SMTP and test email delivery.

The authenticated app calls `initialize_journey()` to create your five initial activities. It is idempotent and does not replace your existing configurations or logs.

## 2. Configure the website

Browser configuration now lives in **`ActivityTracker/config.js`**, not environment variables. Your previously supplied publishable key has been migrated into that local, Git-ignored file. Add your project URL there.

For a fresh checkout, copy the template:

```powershell
cd D:\Ankita\ankitab.github.io\ActivityTracker
Copy-Item config.example.js config.js
```

Edit `config.js`:

```javascript
window.MY_JOURNEY_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
};
```

Find the URL and publishable key in your Supabase project's Connect dialog. This configuration is browser-visible; use only the publishable key, never a service-role key, secret key, or database password. RLS protects the records. The old `.env.local` is unused and remains ignored by Git.

## 3. Open the website locally

You do not need to run `npm run dev` or install npm dependencies to open this website locally.

Use your editor's static server, such as VS Code Live Server:

1. Open `ActivityTracker/index.html`.
2. Choose **Open with Live Server** (requires that extension to be installed).
3. Use the HTTP URL it opens in your browser. Depending on the workspace root, this may be `http://127.0.0.1:5500/ActivityTracker/` or `http://127.0.0.1:5500/`.
4. Add the exact local app directory URL, including its trailing slash, to Supabase Authentication > URL Configuration > Redirect URLs so password recovery returns to this app.

An HTTP server is still necessary: double-clicking the HTML file opens a `file://` URL, which is not supported for this application's JavaScript modules. GitHub Pages supplies the HTTP server after deployment.

Sign in, add a glass of water, reload, and verify persistence. Sign in with the same account on mobile and refresh to check the same entry. Internet access is needed for CDN modules and Supabase.

## 4. Deploy to GitHub Pages

The `.github/workflows/deploy.yml` workflow tests the code and copies browser-ready files into `site/`. No JavaScript compilation or bundling runs.

1. In GitHub Settings > Pages, choose GitHub Actions.
2. In Settings > Secrets and variables > Actions > Variables, add:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
3. Use your project URL and publishable key as the values. The previous `VITE_*` variable names are no longer used.
4. Review and commit the source files, then push to `main` or `master`.
5. Wait for the workflow's deployment job to succeed; it reports the deployed URL.

The workflow creates the public `config.js` from those repository variables. Local `config.js`, `.env.local`, tests, migrations, and `node_modules` are not uploaded. Keep private secrets out of any browser configuration.

All asset URLs are relative. The same website works at `/` or under a GitHub project repository path without a base-path setting. Hash navigation (for example `/#history`) supports refreshing screens without server rewrites. This repository deploys the app at `https://ankitab.github.io/` rather than `/ActivityTracker/`.

To prepare the static files yourself:

```powershell
npm.cmd run stage
```

This copies files to the repository's `site/` directory and uses your local `config.js` unless `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are supplied to the process. It is a file-copy operation only. If you deploy manually, upload the contents of `site/`.

## 5. Development checks

Dependencies are needed only for local linting and tests, not to serve the website:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
```

On macOS/Linux use `npm` instead of `npm.cmd`. Tests run with Node's built-in test runner. PGlite executes the real SQL migration with two test users to verify ownership, RLS, validation, editing and deletion. Pure-function tests cover quantities, custom fields, dates and midnight/DST boundaries. Presentation tests verify escaped user content and form values.

Hosted Supabase authentication/email, live data access, and desktop/Android browser interaction still need acceptance checks against your configured project. Automated tests do not prove those external integrations work.

## How it works

- `index.html`: browser entry point and import map.
- `config.js`: local public Supabase configuration (Git-ignored).
- `src/start.js`: starts the app and reports dependency-loading errors.
- `src/app.js`: session lifecycle, navigation, and user actions.
- `src/views.js`: dashboard, activity details, history, settings, reports and login markup.
- `src/forms.js` and `src/ui.js`: native dialog forms, escaped HTML helpers and validation.
- `src/data.js` and `src/supabase.js`: authenticated database access.
- `src/lib.js`: date handling, validation and totals.
- `src/style.css`: regular CSS, with no CSS compiler.
- `scripts/serve.mjs`: optional local static server.
- `scripts/stage.mjs`: copies the website files for deployment.

The browser loads version-pinned Supabase and date-fns modules through the import map from esm.sh. This avoids a build step but requires access to that CDN. Reports use HTML/CSS bars and an accessible values table, without a chart framework. All user-controlled text is escaped before inserting HTML.

The database normalizes activities, items, logs and settings. Versioned JSONB field definitions are copied into each log by database triggers. Editing an activity therefore does not invalidate historical records. Ownership is enforced with RLS and composite foreign keys, not just UI filters. Timestamps are UTC; day grouping uses the selected IANA timezone (Asia/Kolkata by default).

Quantities may be fractional for custom measures. Each activity has one numeric summary field, or reports count entries when none is selected. Keep units consistent; create a new activity for a fundamentally different measurement. Item mode cannot change after logs exist. Archived configurations preserve history. Reading goals and mantra targets are optional.

Logs are fetched in 1,000-row pages for complete totals. Configuration lists use the default Supabase result limit. This suits a personal journal; very large deployments should add server aggregation and paginated history. Concurrent configuration edits are last-write-wins. Entry sheets use a stable UUID and an in-flight submission guard to prevent duplicate records on retries.

## Troubleshooting

- **Setup screen:** fill in `config.js` and reload. For Pages, set the two repository variables and rerun the workflow.
- **Module loading error:** check internet access and whether the network blocks esm.sh. Use HTTP/HTTPS rather than opening the HTML file directly.
- **Login rejected:** verify the account exists, email confirmation is satisfied, and Email authentication is enabled.
- **Missing initialize_journey:** apply the migration to the project matching your configuration.
- **RLS error:** check session and project configuration; do not disable RLS.
- **Wrong daily total:** check the configured timezone and entry's local date/time.
- **Recovery email missing:** check SMTP, spam, auth logs and redirect allowlist.
- **Save interrupted:** retry in the same open dialog. If a duplicate-ID message appears, refresh History to see whether the first save succeeded.
- **PowerShell blocks npm.ps1:** use `npm.cmd`.

Before considering deployment verified, test login/recovery, logging each activity, custom fields, per-item totals, editing/deletion, midnight boundaries, reload persistence, a second user's isolation, mobile dialogs and a refreshed hash URL.
