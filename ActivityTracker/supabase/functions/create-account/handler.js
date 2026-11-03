// Server only: never copied into the static website.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function accountHandler(admin) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    try {
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!bearer) return reply({ error: 'Please sign in again.' }, 401);
      // Verify with Auth, not client metadata or an unverified decoded JWT.
      const identity = await admin.auth.getUser(bearer);
      if (identity.error || !identity.data?.user) return reply({ error: 'Please sign in again.' }, 401);
      const membership = await admin.from('account_admins').select('user_id').eq('user_id', identity.data.user.id).maybeSingle();
      if (membership.error) throw membership.error;
      if (!membership.data) return reply({ error: 'Only the administrator can create accounts.' }, 403);

      const raw = await request.text();
      if (raw.length > 8192) return reply({ error: 'Account details are too long.' }, 400);
      let body;
      try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid account details.' }, 400); }
      const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = body?.password;
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      if (!/^[a-z0-9][a-z0-9 ._-]{2,63}$/.test(username))
        return reply({ error: 'Use a username of 3–64 letters, numbers, spaces, dots, underscores or hyphens.' }, 400);
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024)
        return reply({ error: 'Use a password of 12–1024 characters.' }, 400);
      if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        return reply({ error: 'Enter a valid recovery email or leave it blank.' }, 400);

      const limit = await admin.rpc('allow_username_login', { attempt_key: `create-account:${identity.data.user.id}` });
      if (limit.error) throw limit.error;
      if (!limit.data) return reply({ error: 'Too many requests. Try again in 15 minutes.' }, 429);
      const lookup = () => admin.from('login_usernames').select('user_id').eq('username', username).maybeSingle();
      const existing = await lookup();
      if (existing.error) throw existing.error;
      if (existing.data) return reply({ error: 'That username already exists. Choose another.' }, 409);

      const created = await admin.auth.admin.createUser({
        email: email || `${crypto.randomUUID()}@users.invalid`, password, email_confirm: true,
      });
      if (created.error || !created.data?.user)
        return reply({ error: 'Account could not be created. Check the password requirements and whether the email is already registered.' }, 400);
      const userId = created.data.user.id;
      let assignment;
      try { assignment = await admin.from('login_usernames').insert({ username, user_id: userId }); }
      catch { assignment = { error: true }; }
      if (assignment.error) {
        // A request can succeed even if its response is lost. Check before rollback.
        const check = await lookup();
        if (check.error) return reply({ error: `Could not confirm account creation. Check account ${userId} in Supabase before retrying.` }, 503);
        if (check.data?.user_id !== userId) {
          const cleanup = await admin.auth.admin.deleteUser(userId);
          if (cleanup.error) return reply({ error: `Username assignment failed. Remove the unused account ${userId} in Supabase before retrying.` }, 503);
          return reply({ error: 'Username could not be assigned. No account was kept; try another username.' }, 409);
        }
      }
      return reply({ username }, 201);
    } catch {
      return reply({ error: 'Account creation is temporarily unavailable. Please try again.' }, 503);
    }
  };
}
