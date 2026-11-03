# My Journey

A private daily activity journal made with plain HTML, CSS, and JavaScript. GitHub Pages serves the website directly. There is no frontend compilation step, React, Vite, or PWA functionality.

## What is included

- Supabase email/password sign-in, sign-out, and password recovery.
- Water, reading with multiple books, mantra chanting, yoga, and meditation.
- Custom activities, configurable fields and dropdowns, quick presets, item management, and archiving.
- Daily history, editing and confirmed deletion, per-item totals, weekly and rolling 30-day reports.
- Native HTML dialogs, responsive desktop/mobile layout, light/dark themes, and explicit timezone calculations.
- PostgreSQL migration, ownership constraints, RLS, and automated regression tests.
- Build, Maintain and Replace habits on the same dashboard, with weekday schedules and optional dashboard visibility.
- Recorded-day boundary consistency, replacement opportunities, calendar-month summaries, and optional weekly reflections.

The database schema is unchanged by the frontend conversion. Do not rerun the initial migration if you already applied it successfully. No live Supabase setup or deployment has been performed by this change. The project URL and publishable key are configured in `ActivityTracker/config.js`.

## Unified habits update

Before deploying this update, run **`ActivityTracker/supabase/migrations/202611020001_unified_habits.sql` once** in Supabase SQL Editor. Apply any earlier migrations you have not already run, in filename order. Do not rerun previously applied migrations. This adds columns and two tables; it does not replace existing activities, logs, accounts or IDs. Existing activities become Build habits, with no duplicate defaults. The username-login Edge Function does not change.

After the migration, commit and push the website changes. Wait for the Pages deployment to succeed, then open **https://ankitadbathia.github.io/ankitab.github.io/ActivityTracker/index.html**. The app's asset version is `20261102-accounts`; the website URL stays the same.

Create or configure an activity and choose:

- **Build:** existing completion, quantity, duration, book and mantra tracking. Open **Tracking options and goals** for the existing simple/advanced field editor. Amounts above the goal remain recorded; Insights counts goal achievement at most once per applicable day.
- **Maintain:** describe a boundary. Tap Achieved, Not achieved or Not applicable. Changing the outcome corrects that day's entry. Add details for an optional note; Undo removes the record. One result per local date is enforced by the database.
- **Replace:** describe a trigger and healthier response. Tap an outcome only when a real opportunity occurs. Multiple opportunities per day are allowed. Add details for an optional note or measurement (for example, minutes). There is no required daily check-in.

**More options** contains icon, category, weekdays and dashboard visibility. Hidden habits remain available under Activities; Archive preserves history. A habit with saved entries cannot change its type; archive it and create another instead.

Insights offers the last 7 days, last 30 days, or a calendar month through the selected date. Actual measurements are shown separately from achievement. Different recorded measurement definitions/units are kept separate. There is no combined score.

Reporting rules:

- Build achievement uses the day's recorded goal and requires all configured daily item goals. Repeated logs or excess quantity never create extra goal-achieved days. Unscheduled days do not contribute to consistency; their actual entries remain visible.
- Maintain consistency is achieved / applicable recorded outcomes. Not applicable and unscheduled days are excluded; unrecorded scheduled days are listed separately, never counted as failures.
- Replace reports actual recorded opportunities. A percentage is shown only when both successes and incomplete opportunities, or incomplete opportunities alone, have been recorded. Success-only logging shows counts, not a presumed 100% success rate. Missing opportunities cannot be inferred.
- Future days are not counted as missing. Archived periods do not accrue missing days.
- Settings history starts on migration day. Old logs are retained, but earlier goals and schedules cannot be reconstructed and are marked unknown rather than scored. Legacy measurement units that were never stored are labelled unknown.
- The first new entry on a local day freezes that day's criteria. Subsequent configuration changes apply to unrecorded days, while saved entries retain their criteria. New entries also store their local date, timezone, original field definitions and measurement unit; later timezone or configuration changes do not shift those entries. Legacy entries without stored timezone continue using the account timezone. Correcting an entry's date uses the dated configuration for its new day.

The optional **Reflect on this week** action is in Insights. It opens three short questions for the Monday-based week containing the selected ending date. Reopening that week edits its existing reflection. Reflections and configuration history use owner-only RLS; clients cannot forge configuration history.

Verification uses the existing Node test runner, happy-dom form tests, and real PostgreSQL migrations in PGlite. Run `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run stage` from `ActivityTracker`. Staging copies static assets only; there is no build compiler or separate type-check command. Live Supabase migration and authenticated cross-device checks must be performed against your project after deployment.

## Database storage and cross-device access

### Administrator-only account creation

After the one-time setup below, sign in with your own administrator account and open **Settings → Accounts → Create account**. Enter a username and password; recovery email is optional. The new user signs in with their username and password. This form creates regular accounts only and does not switch you into the new account. Supabase's own Create User form still requires an email; use My Journey's form instead.

One-time setup:

1. Run `ActivityTracker/supabase/migrations/202611020002_account_admins.sql` in Supabase SQL Editor after the earlier migrations.
2. In Authentication → Users, copy **your own existing account's User UID**. Run this SQL with that UUID substituted (do not use the new user's UUID):

   ```sql
   insert into public.account_admins(user_id)
   values ('YOUR_OWN_EXISTING_USER_UUID')
   on conflict do nothing;
   ```

   This is the only administrator assignment required. Do not add other users to this table. Neither regular users nor app administrators can grant administrator membership through the website.

3. Deploy the new Edge Function from the `ActivityTracker` directory:

   ```powershell
   npx supabase login
   npx supabase functions deploy create-account --project-ref lsksomxjzfnwqbcabuvx --no-verify-jwt
   ```

   Alternatively use the Supabase Edge Function editor: create a function named **`create-account`**, add both `index.ts` and `handler.js` from `ActivityTracker/supabase/functions/create-account/`, then deploy. Disable the gateway's legacy JWT verification for this function. The handler itself verifies the bearer token with Supabase Auth and then checks administrator membership on every request; unauthenticated and ordinary users are rejected. Keep the existing `username-login` function deployed.

4. Keep **Allow new users to sign up** disabled in Supabase Authentication settings. This prevents direct public Auth registration; administrator-created accounts still work. Do not enable public signup to use this feature.
5. Commit/push the website files, wait for GitHub Pages deployment, then refresh and sign in as your administrator account. Account-creation controls are in Settings. The current asset version is `20261102-accounts`.

The service-role key stays in the Edge Function environment, never in browser configuration. The browser sends only its current user's access token. Account creation checks usernames, password length, optional email, and duplicate usernames. Requests are limited to ten per administrator per fifteen minutes. Accounts without a recovery email use an internal `@users.invalid` address; users never need to enter it. For an optional recovery email, enter the intended user's correct address: the administrator confirms it when creating the account, and no verification email is sent by this flow. Existing accounts are not modified.

If username assignment fails, the function checks whether it actually succeeded before rolling back the newly created account. If the server cannot confirm or clean up a partial result, the message identifies the account to check in Supabase. Do not repeatedly create another account after such a message.

Forgotten passwords without a recovery email still use the existing `manage-user.mjs` administrator tool with the `reset` action. Password-reset controls are not part of the account-creation form. This update has not automatically applied the SQL, assigned an administrator, changed signup settings, or deployed the function to the live project.

Implementation follows Supabase's [verified-user lookup](https://supabase.com/docs/reference/javascript/auth-getuser) and [server-only createUser API](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Supabase storage and sign-in are enabled by default again. Create an email/password account in Supabase Authentication > Users > Add user > Create new user, then use that same account on desktop and mobile. Confirm your own email using the dashboard option if offered. Keep public signups disabled if this should remain your private application.

New entries are saved in Supabase after successful login. Open or refresh the mobile app to fetch the latest saved records; live updates without refresh are not implemented. Ensure the SQL migration was applied and the GitHub repository variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are configured before deployment. Push the updated files to deploy these changes.

Earlier guest entries remain in the original browser's localStorage and are not automatically uploaded. The guest-backup banner and button have been removed; saved browser data is preserved.

For explicit local-only testing, `guestMode: true` in `config.js` enables guest mode. The default and generated deployment configuration use cloud mode. Supabase RLS is unchanged.

## 1. Configure Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open SQL Editor and run the complete file `ActivityTracker/supabase/migrations/202610210001_initial.sql` once.
3. Verify these tables exist with RLS enabled: `user_settings`, `activities`, `activity_items`, `activity_logs`.
4. Enable Email authentication, disable public signups for your private deployment, and create your own account under Authentication > Users. Use the confirmation option for your verified email address as appropriate.
5. Set Authentication > URL Configuration > Site URL to `http://localhost:5173/` for local testing, then `https://ankitadbathia.github.io/ankitab.github.io/` after deploying.
6. Allow both URLs as redirect URLs. For a project repository, include its path, such as `https://YOUR_NAME.github.io/REPOSITORY/`.
7. For reliable password recovery, configure Supabase SMTP and test email delivery.

The authenticated app calls `initialize_journey()` to create your five initial activities. It is idempotent and does not replace your existing configurations or logs.

## 2. Configure the website

Browser configuration now lives in **`ActivityTracker/config.js`**, not environment variables. Your previously supplied publishable key has been migrated into that public configuration file included in Git. Add your project URL there.

The committed configuration is ready for this project. Only for a different Supabase project, replace it using the template:

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

The workflow uses repository variables when provided, otherwise it copies the committed public `config.js`. `.env.local`, tests, migrations, and `node_modules` are not uploaded by the workflow. Keep private secrets out of any browser configuration.

All asset URLs are relative. Hash navigation supports refreshing screens without server rewrites. This repository deploys the app at `https://ankitadbathia.github.io/ankitab.github.io/ActivityTracker/index.html`; the repository root redirects there.

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

## Faster logging and simpler setup

- For Yoga and other completion activities, use **Mark done** on the dashboard or activity page. It saves immediately and shows **Done** for the selected day. Correct an accidental entry from History using Edit or Delete.
- Existing practices can use one-tap completion when their required fields have valid defaults. Optional details remain available through **Add details**. If a required type has no default, choose **Done / not done** in activity setup to simplify it, or provide a default in custom fields.
- Activity setup starts with a name and a tracking choice: **Done / not done**, **A quantity**, or **Custom fields**. Done-only activities need no units, presets or field definitions. Quantity activities ask for a unit and quick-add amounts. Descriptions, icons, ordering and separate items are under **More options**.
- To simplify existing Yoga, open **Activities > Configure**, choose **Done / not done**, and save. New entries use completion only; old entries retain their original fields and values.
- Routine entries record time automatically. **Change date or time** is collapsed and optional. If you selected a previous date on the dashboard, the entry belongs to that date. Editing an existing entry preserves its original timestamp unless you change it.

## How it works

- `index.html`: browser entry point and import map.
- `config.js`: public Supabase configuration included in Git.
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

## Pages paths for this repository

The repository is `AnkitaDBathia/ankitab.github.io`, a project site. With the custom GitHub Actions workflow, the app is published at `https://ankitadbathia.github.io/ankitab.github.io/`. With Pages configured to deploy the repository root directly from a branch, the app remains under `https://ankitadbathia.github.io/ankitab.github.io/ActivityTracker/index.html`. Both methods include the public configuration after `ActivityTracker/config.js` is committed. Use the exact app directory URL for Supabase authentication redirects, including the trailing slash.

### Targets, undo, and date refresh

Before publishing this update, run `ActivityTracker/supabase/migrations/202610290001_targets.sql` once in Supabase SQL Editor. It adds optional activity daily targets and daily/overall item target periods; existing item goals remain overall goals. Do not rerun the initial migration.

Activity cards display target progress and remaining amounts. Completed activities have an Undo button for their latest completion on the selected date. New-entry save messages also offer Undo. Returning on a new calendar day switches the journal to today and closes stale dialogs. Intentionally selected past dates remain selected during the same day, with a visible date notice.

### Favourites, search, and mood notes

Run `ActivityTracker/supabase/migrations/202610290002_favourites_mood.sql` once before publishing these features. Star mantras to sort them first; History has an optional Search panel searching all dates. Yoga and meditation entry forms offer optional mood and note fields. After one-tap completion, Mood edits that same entry. Voice notes use browser speech recognition when supported, with English/Hindi/Gujarati choices. The browser may send audio to its transcription service; the app stores only the editable resulting text. Typing is always available.
