import { it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { habitSummary, measurementTotals, weekStart, dayConfiguration } from '../src/habits.js';
import { activityForm } from '../src/forms.js';
import { outcomeForm, boundaryCard, reflectionForm } from '../src/habit-ui.js';
import { renderView } from '../src/views.js';
import { createGuestStore } from '../src/guest.js';
import { localDay, onDay } from '../src/lib.js';
import { searchLogs } from '../src/journal.js';

const days=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'];
const field={id:'q',label:'Pages',type:'number',required:false,default_value:null,position:0,options:[],min:0,max:null};
const habit=(type='build')=>({id:'a',name:'Reading',habit_type:type,icon:'book',fields:type==='build'?[field]:[],quantity_field_id:type==='build'?'q':null,unit:'pages',presets:[],daily_goal:type==='build'?10:null,item_based:false,applicable_days:[0,1,2,3,4,5,6],boundary:'No phone before bed',unwanted_behavior:'Scrolling',replacement:'Read',description:'',position:0});
function dataFor(a,logs=[]) {
  return {activities:[a],items:[],settings:{timezone:'Asia/Kolkata',display_name:'Me'},logs,revisions:[{activity_id:a.id,effective_day:days[0],snapshot:a}],reflections:[]};
}
function log(a,day,extra={}) {
  return {id:crypto.randomUUID(),activity_id:a.id,occurred_at:day+'T10:00:00Z',habit_day:day,habit_type:a.habit_type,habit_snapshot:structuredClone(a),field_snapshot:a.fields,quantity_field_id:a.quantity_field_id,values:{q:30},measurement_unit:a.unit,...extra};
}
it('retains excess quantities and counts achievement once per scheduled day',()=>{
  const a=habit(), data=dataFor(a,[log(a,days[0]),log(a,days[0],{values:{q:20}})]);
  const s=habitSummary(data,a,days);
  assert.equal(s.actual,50);assert.equal(s.achieved,1);assert.equal(s.practised,1);assert.equal(s.missing,6);
  assert.equal(habitSummary(data,a,['2099-01-01']).missing,0);
});
it('uses recorded applicable days only for boundary consistency',()=>{
  const a={...habit('maintain'),applicable_days:[1,2,3,4,5]};
  const data=dataFor(a,[log(a,days[0],{outcome:'achieved'}),log(a,days[1],{outcome:'not_achieved'}),log(a,days[2],{outcome:'not_applicable'}),log(a,days[5],{outcome:'not_achieved'})]);
  const s=habitSummary(data,a,days);
  assert.equal(s.recorded,2);assert.equal(s.percent,50);assert.equal(s.missing,2);assert.equal(s.na,1);assert.equal(s.applicable,5);
});
it('shows replacement counts without inventing opportunities or a success percentage',()=>{
  const a=habit('replace'), data=dataFor(a,[log(a,days[0],{outcome:'replaced'}),log(a,days[0],{outcome:'replaced'}),log(a,days[1],{outcome:'not_applicable'})]);
  assert.equal(habitSummary(data,a,days).percent,null);
  assert.equal(habitSummary(data,a,days).missing,0);
  data.logs.push(log(a,days[2],{outcome:'not_replaced'}));
  const s=habitSummary(data,a,days);
  assert.equal(s.opportunities,3);assert.equal(s.successes,2);assert.equal(s.na,1);assert.equal(s.percent,2/3*100);
});
it('preserves dated goals and labels unknown legacy settings instead of inventing them',()=>{
  const a=habit(), data=dataFor(a,[log(a,days[0],{values:{q:12}})]);
  data.revisions.push({activity_id:'a',effective_day:days[1],snapshot:{...a,daily_goal:20}});
  data.activities[0]={...a,daily_goal:20};
  data.logs.push(log({...a,daily_goal:20},days[1],{values:{q:12}}));
  assert.equal(habitSummary(data,a,days).achieved,1);
  assert.equal(habitSummary(data,a,['2026-10-18']).unknown,1);
  assert.equal(habitSummary(data,a,['2026-10-18']).missing,0);
  assert.equal(dayConfiguration(data,a,days[0]).daily_goal,10);
});
it('keeps measurement units separate and local days stable after timezone changes',()=>{
  const a=habit(), one=log(a,days[0]), two=log(a,days[1],{measurement_unit:'minutes',values:{q:5}});
  assert.deepEqual(measurementTotals([one,two],a),[{unit:'pages',value:30},{unit:'minutes',value:5}]);
  assert.equal(onDay([one],days[0],'Pacific/Kiritimati').length,1);
  assert.equal(weekStart('2026-10-25'),'2026-10-19');
});
it('requires each daily mantra goal and never caps recorded quantities',()=>{
  const a={...habit(),daily_goal:null,items:[{id:'m1',goal:9,goal_period:'daily'},{id:'m2',goal:27,goal_period:'daily'}]};
  const data=dataFor(a,[log(a,days[0],{item_id:'m1',values:{q:100}}),log(a,days[0],{item_id:'m2',values:{q:26}})]);
  assert.equal(habitSummary(data,a,days).achieved,0);
  data.logs.push(log(a,days[0],{item_id:'m2',values:{q:10}}));
  assert.equal(habitSummary(data,a,days).achieved,1);assert.equal(habitSummary(data,a,days).actual,136);
});
it('does not count a note on an incomplete practice as achievement or practice',()=>{
  const a={...habit(),daily_goal:null,quantity_field_id:null,fields:[{id:'done',type:'boolean'},{id:'note',type:'text'}]};
  const data=dataFor(a,[log(a,days[0],{values:{done:false,note:'Could not practise'}})]);
  const s=habitSummary(data,a,days);
  assert.equal(s.achieved,0);assert.equal(s.practised,0);assert.equal(s.recorded,1);
});

let window;
beforeEach(()=>{window=new Window({url:'http://localhost:5173'});globalThis.document=window.document;});
afterEach(async()=>{delete globalThis.document;await window.happyDOM.close();});
const submit=async form=>{form.dispatchEvent(new window.SubmitEvent('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));};
function set(form,name,value){form.elements.namedItem(name).value=value;}
it('creates a boundary with minimal inputs and stores dashboard and schedule options',async()=>{
  let saved;
  activityForm(async row=>{saved=row;});
  const form=document.querySelector('form');
  set(form,'name','Phone-free meals');set(form,'habit_type','maintain');
  form.dispatchEvent(new window.Event('change'));
  assert.equal(form.querySelector('[data-build]').hidden,true);
  assert.equal(form.querySelector('[data-maintain]').hidden,false);
  set(form,'boundary','Keep phone away while eating');
  form.elements.namedItem('day-0').checked=false;
  form.elements.namedItem('show_on_dashboard').checked=false;
  await submit(form);
  assert.equal(saved.habit_type,'maintain');assert.equal(saved.show_on_dashboard,false);assert.equal(saved.applicable_days.includes(0),false);
  assert.deepEqual(saved.fields,[]);assert.equal(saved.daily_goal,null);
});
it('keeps existing Build tracking fields while editing general habit settings',async()=>{
  const a=habit();let saved;
  activityForm(async row=>{saved=row;},a);
  const form=document.querySelector('form');set(form,'category','Learning');await submit(form);
  assert.deepEqual(saved.fields,a.fields);assert.equal(saved.daily_goal,10);assert.equal(saved.category,'Learning');
});
it('creates replacement measurements with optional fields and corrects a historical result',async()=>{
  let saved;
  activityForm(async row=>{saved=row;});
  const form=document.querySelector('form');set(form,'name','Read instead');set(form,'habit_type','replace');set(form,'unwanted_behavior','Scrolling');set(form,'replacement','Read');set(form,'unit','minutes');await submit(form);
  assert.equal(saved.fields[0].required,false);assert.equal(saved.fields[0].type,'number');
  const a={...saved,id:'replacement'};
  const old=log(a,days[0],{outcome:'replaced',habit_timezone:'Asia/Kolkata',values:{measurement:5}});let result;
  outcomeForm(a,days[1],'UTC',async(row,id)=>{result={row,id};},old);
  const entry=document.querySelector('form');set(entry,'outcome','not_replaced');set(entry,'habit_note','Corrected');await submit(entry);
  assert.equal(result.id,old.id);assert.equal(result.row.occurred_at,old.occurred_at);assert.equal(result.row.habit_note,'Corrected');assert.equal(result.row.outcome,'not_replaced');
});
it('keeps all habit types together, hides dashboard opt-outs, and escapes notes',()=>{
  const a=habit('maintain'), r={...habit('replace'),id:'r',name:'Replacement'}, data=dataFor(a);
  data.activities.push(r,{...habit(),id:'hidden',name:'Hidden habit',show_on_dashboard:false});
  data.revisions.push({activity_id:r.id,effective_day:days[0],snapshot:r});
  const html=renderView(data,{page:'dashboard',day:days[0]},'');
  assert.ok(html.includes('Not checked yet'));assert.ok(html.includes('No opportunities recorded'));assert.ok(!html.includes('Hidden habit'));
  assert.ok(!boundaryCard({...a,archived:true},data,days[0]).includes('data-action="habit-outcome"'));
  data.logs.push(log(a,days[0],{outcome:'achieved',habit_note:'<script>phone</script>'}));
  assert.equal(searchLogs(data.logs,data,'phone').length,1);
  const history=renderView(data,{page:'history',day:days[0]},'');
  assert.ok(history.includes('&lt;script&gt;'));assert.ok(!history.includes('<script>phone'));
});
it('saves an optional weekly reflection and reopens the same record',async()=>{
  let saved;
  reflectionForm(async(row,id)=>{saved={row,id};},days[3],{id:'reflection',went_well:'Kept going'});
  const form=document.querySelector('form');assert.equal(form.elements.namedItem('went_well').value,'Kept going');await submit(form);
  assert.equal(saved.id,'reflection');assert.equal(saved.row.week_start,days[0]);assert.equal(saved.row.next_step,'');
});
it('renders month-to-date insights and truthful success-only replacement counts',()=>{
  const a=habit('replace'), data=dataFor(a,[log(a,days[0],{outcome:'replaced'})]);
  const html=renderView(data,{page:'reports',day:'2026-10-25',period:0},'');
  assert.ok(html.includes('2026-10-01'));assert.ok(html.includes('2026-10-25'));
  const rendered=document.createElement('div');rendered.innerHTML=html;
  assert.ok(rendered.textContent.includes('1 successful replacements'));assert.ok(!rendered.textContent.includes('100%'));
  assert.ok(html.includes('Reflect on this week'));
});
it('retries a failed replacement save with the same id to prevent ambiguous duplicate inserts',async()=>{
  const ids=[];
  outcomeForm(habit('replace'),days[0],'UTC',async row=>{ids.push(row.id);if(ids.length===1) throw new Error('Offline');});
  const form=document.querySelector('form');await submit(form);await submit(form);
  assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
});
it('enforces guest boundary uniqueness, corrections and frozen settings',()=>{
  const memory=new Map();const store=createGuestStore({getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)});
  const a=store.save('activities',{...habit('maintain'),id:'boundary'});
  const today=localDay(new Date(),'Asia/Kolkata');
  const entry=store.save('activity_logs',{activity_id:a.id,item_id:null,values:{},occurred_at:new Date().toISOString(),outcome:'achieved'});
  assert.throws(()=>store.save('activity_logs',{activity_id:a.id,item_id:null,values:{},occurred_at:new Date().toISOString(),outcome:'not_achieved'}),/already has/);
  store.save('activities',{boundary:'Changed rule'},a.id);
  const updated=store.save('activity_logs',{outcome:'not_achieved'},entry.id);
  assert.equal(updated.habit_snapshot.boundary,a.boundary);assert.equal(updated.habit_day,today);assert.equal(store.load().logs.length,1);
  store.remove(entry.id);assert.equal(store.load().logs.length,0);
});

it('keeps quick logging visible while allowing dashboard panels to collapse',()=>{
  const a={...habit(),item_based:true,seed_key:'mantra',daily_goal:null};
  const data=dataFor(a);
  data.items=[{id:'m',activity_id:a.id,name:'GIP',goal:9,goal_period:'daily'}];
  data.revisions[0].snapshot={...a,items:data.items};
  const state={page:'dashboard',day:days[0]};
  document.body.innerHTML=renderView(data,state,'');
  assert.ok(document.querySelector('[data-panel="build"]').open);
  assert.ok(document.querySelector('[data-panel="items-a"]').open);
  assert.ok(document.querySelector('[data-action="increment-item"]'));
  assert.equal(document.querySelector('[data-panel="recent"]').open,false);
  document.body.innerHTML=renderView(data,{...state,panels:{build:false,'items-a':false}},'');
  assert.equal(document.querySelector('[data-panel="build"]').open,false);
  assert.equal(document.querySelector('[data-panel="items-a"]').open,false);
});

it('renders compact boundary controls directly and keeps guidance under More',()=>{
  for(const type of ['maintain','replace']) {
    const a=habit(type),data=dataFor(a);
    document.body.innerHTML=boundaryCard(a,data,days[0],true);
    assert.ok(document.querySelector('.boundary-row'));
    assert.equal(document.querySelectorAll('.boundary-actions > [data-action="habit-outcome"]').length,3);
    assert.equal(document.querySelector('.row-more').open,false);
    assert.ok(document.querySelector('.row-more [data-action="entry"]'));
    assert.equal(document.querySelector('.activity-card'),null);
    document.body.innerHTML=boundaryCard({...a,archived:true},data,days[0],true);
    assert.equal(document.querySelector('[data-action="habit-outcome"]'),null);
  }
});
