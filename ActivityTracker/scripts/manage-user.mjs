// Local administrator tool. Never included in the published website.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
let hidden = false;
const output = new Writable({ write(chunk, encoding, done) { if (!hidden) process.stdout.write(chunk, encoding); done(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
async function ask(label, secret = false) {
  if (secret) process.stdout.write(label);
  hidden = secret;
  try { return await rl.question(secret ? '' : label); }
  finally { hidden = false; if (secret) process.stdout.write('\n'); }
}
try {
  const url = (process.env.SUPABASE_URL || await ask('Supabase project URL: ')).trim().replace(/\/$/, '');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') throw new Error('Enter an HTTPS project origin.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || await ask('Supabase service-role key (hidden): ', true);
  async function request(path, method = 'GET', body) {
    const response = await fetch(url + path, { method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body ? {body:JSON.stringify(body)} : {}) });
    const result = await response.json().catch(()=>null);
    if (!response.ok) throw new Error(`Administrator request failed (${response.status}). Check the account details, key, and username migration.`);
    return result;
  }
  const action = (await ask('Action (create / link / reset): ')).trim();
  if (!['create','link','reset'].includes(action)) throw new Error('Unknown action.');
  const username = (await ask('Username: ')).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 ._-]{2,63}$/.test(username)) throw new Error('Username must contain 3–64 letters, numbers, spaces, dots, underscores or hyphens, starting with a letter or number.');
  const existing = await request(`/rest/v1/login_usernames?username=eq.${encodeURIComponent(username)}&select=user_id`);
  if (action !== 'reset' && existing.length) throw new Error('Username already exists.');
  if (action === 'link') {
    const user_id = (await ask('Existing Supabase user UUID: ')).trim();
    await request('/rest/v1/login_usernames','POST',{username,user_id});
  } else {
    if (action === 'reset' && !existing.length) throw new Error('Username not found.');
    const email = action === 'create' ? (await ask('Recovery email (optional; blank for none): ')).trim() : '';
    const password = await ask('New password, at least 12 characters (hidden): ',true);
    if (password.length < 12) throw new Error('Use at least 12 characters.');
    if (password !== await ask('Repeat password (hidden): ',true)) throw new Error('Passwords do not match.');
    if (action === 'reset') await request(`/auth/v1/admin/users/${existing[0].user_id}`,'PUT',{password});
    else {
      const user = await request('/auth/v1/admin/users','POST',{
        email: email || `${crypto.randomUUID()}@users.invalid`, password, email_confirm:true,
      });
      try { await request('/rest/v1/login_usernames','POST',{username,user_id:user.id}); }
      catch {
        // Roll back only the account this invocation just created.
        try { await request(`/auth/v1/admin/users/${user.id}`,'DELETE'); }
        catch { throw new Error(`Username assignment failed. Remove the newly created unused account ${user.id} in Supabase before retrying.`); }
        throw new Error('Username assignment failed; the newly created account was removed.');
      }
    }
  }
  console.log(`Account ${action} completed for ${username}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { rl.close(); }
