import { it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { accountHandler } from '../supabase/functions/create-account/handler.js';
import { createAccount, createAccountForm } from '../src/accounts.js';
import { renderView } from '../src/views.js';

const details={username:' New User ',password:'long-password-123',email:''};
function fixture(options={}) {
  const calls={created:[],deleted:[],verified:[],limits:0};
  let mapping=options.existing?{user_id:'existing-user'}:null;
  const admin={
    auth:{
      getUser:async token=>{calls.verified.push(token);return token==='valid'?{data:{user:{id:'owner'}}}:{error:true};},
      admin:{
        createUser:async input=>{calls.created.push(input);return options.createError?{error:true}:{data:{user:{id:'new-user'}}};},
        deleteUser:async id=>{calls.deleted.push(id);return options.cleanupError?{error:true}:{};},
      },
    },
    rpc:async()=>{calls.limits++;return {data:options.limited?false:true};},
    from:table=>({
      select:()=>({eq:()=>({maybeSingle:async()=>table==='account_admins'
        ? options.roleError?{error:true}:{data:options.nonAdmin?null:{user_id:'owner'}}
        :{data:mapping}})}),
      insert:async row=>{
        assert.equal(table,'login_usernames');assert.equal(row.username,'new user');
        if(!options.mappingError || options.lostResponse) mapping={user_id:row.user_id};
        return options.mappingError?{error:true}:{};
      },
    }),
  };
  const handler=accountHandler(admin);
  const request=(body=details,token='valid',method='POST')=>handler(new Request('https://example.test/create-account',{
    method,headers:token?{Authorization:`Bearer ${token}`}:{},
    ...(method==='POST'?{body:JSON.stringify(body)}:{}),
  }));
  return {request,calls};
}
it('rejects anonymous, invalid and non-admin callers before privileged writes',async()=>{
  for(const [options,token,status] of [[{},null,401],[{},'forged',401],[{nonAdmin:true},'valid',403],[{roleError:true},'valid',503]]) {
    const f=fixture(options);
    assert.equal((await f.request({...details,is_admin:true,user_id:'owner'},token)).status,status);
    assert.equal(f.calls.created.length,0);assert.equal(f.calls.limits,0);
  }
});
it('creates a username-only account with a private placeholder and no returned credentials',async()=>{
  const f=fixture(), response=await f.request();
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{username:'new user'});
  assert.deepEqual(f.calls.verified,['valid']);
  assert.match(f.calls.created[0].email,/@users\.invalid$/);
  assert.equal(f.calls.created[0].password,details.password);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(f.calls.deleted,[]);
});
it('supports optional recovery email and rejects invalid input before creating users',async()=>{
  const f=fixture();assert.equal((await f.request({...details,email:' person@example.com '})).status,201);
  assert.equal(f.calls.created[0].email,'person@example.com');
  for(const body of [null,{...details,username:'x'},{...details,password:'short'},{...details,email:'invalid'}]) {
    const invalid=fixture();assert.equal((await invalid.request(body)).status,400);assert.equal(invalid.calls.created.length,0);
  }
});
it('rejects duplicate usernames and rate-limited requests without creating accounts',async()=>{
  for(const [options,status] of [[{existing:true},409],[{limited:true},429]]) {
    const f=fixture(options);assert.equal((await f.request()).status,status);assert.equal(f.calls.created.length,0);
  }
});
it('rolls back only the just-created user when username assignment fails',async()=>{
  const f=fixture({mappingError:true});assert.equal((await f.request()).status,409);
  assert.deepEqual(f.calls.deleted,['new-user']);
  const failed=fixture({mappingError:true,cleanupError:true});
  assert.equal((await failed.request()).status,503);
  const lost=fixture({mappingError:true,lostResponse:true});
  assert.equal((await lost.request()).status,201);assert.deepEqual(lost.calls.deleted,[]);
});
it('handles preflight without granting account-creation access',async()=>{
  const f=fixture();assert.equal((await f.request(null,null,'OPTIONS')).status,200);
  assert.equal((await f.request(null,null,'GET')).status,405);assert.equal(f.calls.created.length,0);
});
it('sends the signed-in access token, never an administrator key or a new session',async()=>{
  const client={auth:{getSession:async()=>({data:{session:{access_token:'current-session'}}})}};
  const result=await createAccount(client,{supabaseUrl:'https://example.test',supabasePublishableKey:'public-key'},details,async(url,options)=>{
    assert.equal(url,'https://example.test/functions/v1/create-account');
    assert.equal(options.headers.Authorization,'Bearer current-session');assert.equal(options.headers.apikey,'public-key');
    return {ok:true,json:async()=>({username:'new user'})};
  });
  assert.equal(result.username,'new user');
  await assert.rejects(createAccount({auth:{getSession:async()=>({data:{session:null}})}},{},details,()=>assert.fail()),/sign in/);
  await assert.rejects(createAccount(client,{},details,async()=>({ok:false,json:async()=>({error:'Only the administrator'})})),/administrator/);
});
it('shows account creation only in the signed-in administrator settings',()=>{
  const data={activities:[],items:[],logs:[],settings:{timezone:'UTC',display_name:'Me'}};
  const state={page:'settings',day:'2026-11-02'};
  assert.ok(!renderView(data,state,'',false).includes('data-action="create-account"'));
  assert.ok(renderView({...data,canCreateAccounts:true},state,'',false).includes('data-action="create-account"'));
  assert.ok(!renderView({...data,canCreateAccounts:true},state,'',true).includes('data-action="create-account"'));
});
it('accepts blank email, checks confirmation and blocks repeated form submissions',async()=>{
  const window=new Window();globalThis.document=window.document;
  try {
    let saved,release,calls=0;
    const {form}=createAccountForm(async row=>{saved=row;calls++;await new Promise(r=>{release=r;});});
    for(const [key,value] of Object.entries({username:'Test User',password:details.password,confirm:'different'})) form.elements.namedItem(key).value=value;
    const submit=()=>form.dispatchEvent(new window.SubmitEvent('submit',{bubbles:true,cancelable:true}));
    submit();await new Promise(r=>setTimeout(r,0));assert.equal(calls,0);assert.match(form.querySelector('.error').textContent,/match/);
    form.elements.namedItem('confirm').value=details.password;
    submit();submit();assert.equal(calls,1);assert.equal(saved.email,'');assert.equal(saved.username,'test user');
    release();await new Promise(r=>setTimeout(r,0));assert.equal(document.querySelector('dialog'),null);
  } finally {delete globalThis.document;await window.happyDOM.close();}
});
