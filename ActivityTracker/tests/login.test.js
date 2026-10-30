import { it } from 'node:test';
import assert from 'node:assert/strict';
import { signIn } from '../src/login.js';
import { authView } from '../src/views.js';
const config = {supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public-key'};
it('keeps existing email sign-in on Supabase Auth', async () => {
  let credentials;
  await signIn({auth:{signInWithPassword:async body=>{credentials=body;}}},' user@example.com ','password',config,()=>assert.fail());
  assert.deepEqual(credentials,{email:'user@example.com',password:'password'});
});
it('normalises username and installs only the authenticated session', async () => {
  let session;
  await signIn({auth:{setSession:async body=>{session=body;}}},' My User ','secret',config,async (url, options)=>{
    assert.equal(url,'https://example.supabase.co/functions/v1/username-login');
    assert.deepEqual(JSON.parse(options.body),{username:'my user',password:'secret'});
    return {ok:true,json:async()=>({access_token:'access',refresh_token:'refresh'})};
  });
  assert.equal(session.access_token,'access');
});
it('does not establish a session for errors or missing tokens', async () => {
  const client={auth:{setSession:()=>assert.fail()}};
  await assert.rejects(signIn(client,'user','wrong',config,async()=>({ok:false,json:async()=>({error:'Invalid username or password'})})),/Invalid username/);
  await assert.rejects(signIn(client,'user','wrong',config,async()=>({ok:true,json:async()=>({})})),/Could not sign in/);
  await assert.rejects(signIn(client,'x','wrong',config,()=>assert.fail()),/3/);
});
it('shows username login and email-only recovery with administrator fallback', () => {
  assert.match(authView('login'),/Username or email/);
  assert.match(authView('login'),/autocomplete="username"/);
  assert.match(authView('reset'),/Recovery email/);
  assert.match(authView('reset'),/administrator/);
});
