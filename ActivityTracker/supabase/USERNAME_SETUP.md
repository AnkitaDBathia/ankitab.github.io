# Username sign-in setup

1. Run `migrations/202610300001_usernames.sql` once in Supabase SQL Editor.
2. Deploy the `username-login` Edge Function. From `ActivityTracker`, with the Supabase CLI signed in:

   ```sh
   supabase functions deploy username-login --project-ref lsksomxjzfnwqbcabuvx --no-verify-jwt
   ```

   Alternatively use Supabase's Edge Function editor to deploy `functions/username-login/index.ts` as `username-login` with JWT verification disabled. This endpoint must accept signed-out users; it verifies their password through Supabase Auth. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase. Do not put a service-role key in browser config or GitHub Pages.

3. Run the local administrator tool from `ActivityTracker`:

   ```sh
   node scripts/manage-user.mjs
   ```

   Enter your project URL and service-role key at the prompts (key/password input is hidden). Choose:
   - `create`: unique username, optional recovery email, and password. With no email, an internal random `@users.invalid` identifier is used. The user signs in with their username, never this identifier. Administrators should verify any supplied recovery email with its owner before creating the account.
   - `link`: assign a username to an existing user's UUID from Supabase Authentication. Their email, password and journal remain intact.
   - `reset`: set a new password for a username after independently verifying the person's identity.

Usernames ignore case and surrounding spaces. They contain 3–64 letters (a–z), numbers, spaces, dots, underscores or hyphens, starting with a letter or number. Display names remain unrestricted by these login rules.

Users with real email can use **Forgot your password?** and enter that email. Users without email contact the administrator. Existing email sign-in remains available. Keep public sign-ups disabled if all accounts should be administrator-created. Configure the published app URL under Supabase Authentication URL Configuration for recovery links.

The username table has no anonymous or authenticated access. The server returns tokens only after checking the password; it never exposes a username-to-email lookup. Username login allows ten attempts per username per 15-minute window, in addition to Supabase Auth controls. This also means repeated attempts can temporarily lock a username; wait before trying again.

Push the frontend only after the migration and function are deployed. A GitHub push alone does not deploy Supabase functions. Real hosted sign-in and recovery must be smoke-tested after deployment.
