import { it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { favouritesFirst, searchLogs, attachDictation } from '../src/journal.js';
import { entryForm } from '../src/forms.js';

it('pins favourites without mutating the underlying item order', () => {
  const items = [{id:1},{id:2,favourite:true},{id:3,favourite:true}];
  assert.deepEqual(favouritesFirst(items).map(i=>i.id),[2,3,1]);
  assert.equal(items[0].id,1);
});
it('searches names, notes, and moods across dates, ignoring case', () => {
  const data = {activities:[{id:'a',name:'Mantra'}],items:[{id:'i',name:'GIP'}]};
  const logs = [{id:1,activity_id:'a',item_id:'i',values:{notes:'Morning practice'},mood:'Calm'},
    {id:2,activity_id:'a',values:{},mood_note:'Evening reflection'}];
  assert.deepEqual(searchLogs(logs,data,'gip MORNING').map(l=>l.id),[1]);
  assert.deepEqual(searchLogs(logs,data,'reflection').map(l=>l.id),[2]);
  assert.equal(searchLogs(logs,data,'missing').length,0);
  assert.equal(searchLogs(logs,data,'calm').length,1);
});
it('saves optional mood on the same historical entry with its original date', async () => {
  const window = new Window(); globalThis.document = window.document;
  try {
    let saved;
    const fields = [{id:'done',label:'Done',type:'boolean',required:true,default_value:true}];
    const activity = {id:'y',name:'Yoga',fields,presets:[],unit:'',item_based:false};
    const edit = {id:'log',field_snapshot:fields,values:{done:true},occurred_at:'2026-10-28T10:00:00Z',mood:'Calm',mood_note:'Better'};
    entryForm(activity,[],[],'2026-10-29','UTC',(row,id)=>{saved={row,id};},edit);
    const form = document.querySelector('dialog form');
    form.elements.namedItem('mood').value='Good';
    form.elements.namedItem('mood_note').value='Rested';
    form.dispatchEvent(new window.SubmitEvent('submit',{cancelable:true,bubbles:true}));
    await new Promise(r=>setTimeout(r,0));
    assert.equal(saved.id,'log');
    assert.equal(saved.row.mood,'Good');
    assert.equal(saved.row.mood_note,'Rested');
    assert.equal(saved.row.occurred_at,edit.occurred_at);
  } finally {delete globalThis.document;await window.happyDOM.close();}
});
it('dictates only final text and stops the microphone when the form is removed', async () => {
  const window = new Window();
  try {
    window.document.body.innerHTML='<form><textarea name="mood_note">Existing</textarea><select name="voice_language"><option value="en-IN">English</option></select><button data-dictate type="button"></button><p data-voice-status></p></form>';
    let current, starts=0, aborts=0;
    class Recognition {
      constructor(){current=this;}
      start(){starts++;}
      abort(){aborts++; this.onend?.();}
    }
    const form = window.document.querySelector('form');
    attachDictation(form,{SpeechRecognition:Recognition,MutationObserver:window.MutationObserver});
    assert.equal(starts,0);
    form.querySelector('button').click();
    const result = [{transcript:'feeling peaceful'}];result.isFinal=true;
    current.onresult({resultIndex:0,results:[result]});
    assert.equal(form.elements.namedItem('mood_note').value,'Existing feeling peaceful');
    form.remove();
    await new Promise(r=>setTimeout(r,10));
    assert.equal(aborts,1);
  } finally {await window.happyDOM.close();}
});
it('keeps typing available when voice is unsupported or permission is denied', async () => {
  const window = new Window();
  try {
    window.document.body.innerHTML='<form><textarea name="mood_note">Keep this</textarea><select name="voice_language"><option>en-IN</option></select><button data-dictate type="button"></button><p data-voice-status></p></form>';
    const form=window.document.querySelector('form');
    attachDictation(form,{});
    assert.equal(form.querySelector('button').hidden,true);
    let current;
    class Recognition {
      constructor(){current=this;}
      start(){}
      abort(){}
    }
    form.querySelector('button').hidden=false;
    attachDictation(form,{SpeechRecognition:Recognition,MutationObserver:window.MutationObserver});
    form.querySelector('button').click();
    current.onerror({error:'not-allowed'});
    assert.match(form.querySelector('[data-voice-status]').textContent,/denied/);
    assert.equal(form.elements.namedItem('mood_note').value,'Keep this');
    form.remove();
    await new Promise(r=>setTimeout(r,10));
  } finally {await window.happyDOM.close();}
});
