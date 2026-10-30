export async function signIn(client, identifier, password, config, fetcher = fetch) {
  const value = identifier.trim();
  // Existing accounts retain email sign-in and native recovery.
  if (value.includes('@')) return client.auth.signInWithPassword({ email: value, password });
  if (!/^[a-z0-9][a-z0-9 ._-]{2,63}$/i.test(value))
    throw new Error('Use a username of 3–64 letters, numbers, spaces, dots, underscores or hyphens.');
  const response = await fetcher(`${config.supabaseUrl}/functions/v1/username-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
    body: JSON.stringify({ username: value.toLowerCase(), password }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Username sign-in is unavailable. Contact the administrator.');
  if (!result.access_token || !result.refresh_token) throw new Error('Could not sign in. Please retry.');
  return client.auth.setSession(result);
}
