import { input, sheet, valueOf } from './ui.js';

export async function createAccount(client, config, details, fetcher = fetch) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('Please sign in again.');
  const response = await fetcher(`${config.supabaseUrl}/functions/v1/create-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(details),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Account creation is unavailable. Check that the create-account function is deployed.');
  if (!result.username) throw new Error('Could not confirm creation. Check the account before retrying.');
  return result;
}

export function createAccountForm(save) {
  return sheet('Create account', `
    ${input('Username','username','','text','required minlength="3" maxlength="64" autocomplete="off" autocapitalize="none" spellcheck="false"')}
    ${input('Password','password','','password','required minlength="12" maxlength="1024" autocomplete="new-password"')}
    ${input('Repeat password','confirm','','password','required autocomplete="new-password"')}
    ${input('Recovery email (optional)','email','','email','maxlength="254" autocomplete="off"')}
    <p class="muted">Leave email blank for username-only sign-in. Without a recovery email, forgotten passwords need an administrator reset.</p>
    <button type="submit" class="primary wide">Create account</button>`, async form => {
      if (!form.reportValidity()) throw new Error('Please complete the account details.');
      const username=valueOf(form,'username').trim().toLowerCase(), password=valueOf(form,'password');
      if (!/^[a-z0-9][a-z0-9 ._-]{2,63}$/.test(username)) throw new Error('Use a username of 3–64 letters, numbers, spaces, dots, underscores or hyphens.');
      if (password!==valueOf(form,'confirm')) throw new Error('Passwords do not match.');
      await save({username,password,email:valueOf(form,'email').trim()});
    });
}
