import { h, icon, input, textarea, select, checkbox, valueOf, checked, sheet, button, symbols, readValues, fieldControl } from './ui.js';
import { typeOf, outcomes, outcomeLabel, habitDay, scheduled, dayConfiguration, measurementTotals, habitSummary, weekStart, validateHabit } from './habits.js';
import { automaticOccurrence } from './tracking.js';
import { validateFields } from './lib.js';

export function habitConfig(save,activity,buildEditor) {
  const {form,close}=sheet(activity?'Edit habit':'Create habit',`
    ${input('Habit name','name',activity?.name,'text','required maxlength="100"')}
    ${select('Habit type','habit_type',[['build','Build — develop a positive habit'],['maintain','Maintain — keep a boundary'],['replace','Replace — choose a healthier response']],typeOf(activity))}
    <div data-maintain>${textarea('Boundary or rule','boundary',activity?.boundary)}</div>
    <div data-replace>${textarea('Unwanted behaviour or trigger','unwanted_behavior',activity?.unwanted_behavior)}${textarea('Healthy replacement','replacement',activity?.replacement)}${input('Optional measurement unit','unit',activity?.unit,'text','placeholder="e.g. minutes or pages"')}</div>
    <div data-build>${button('Tracking options and goals','build-options')}</div>
    <details><summary>More options</summary>${textarea('Description','description',activity?.description)}${input('Category (optional)','category',activity?.category,'text','maxlength="100"')}${select('Icon','icon',Object.entries(symbols).map(([key,val])=>[key,`${val} ${key}`]),activity?.icon??'sparkles')}
    <fieldset><legend>Applicable days</legend><div class="habit-days">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label,i)=>checkbox(label,`day-${i}`,(activity?.applicable_days??[0,1,2,3,4,5,6]).includes(i))).join('')}</div></fieldset>
    ${checkbox('Show on dashboard','show_on_dashboard',activity?.show_on_dashboard!==false)}</details>
    <p class="muted">Earlier dates keep their recorded settings. A habit with history keeps its type.</p>
    <button type="submit" class="primary wide">Save habit</button>`,async()=>{await save(draft(),activity?.id);});
  function draft() {
    const type=valueOf(form,'habit_type');
    const measurement={id:'measurement',label:valueOf(form,'unit')||'Amount',type:'number',required:false,default_value:null,position:0,options:[],min:0,max:null};
    const row={...activity,name:valueOf(form,'name').trim(),habit_type:type,description:valueOf(form,'description'),category:valueOf(form,'category'),icon:valueOf(form,'icon'),
      boundary:valueOf(form,'boundary'),unwanted_behavior:valueOf(form,'unwanted_behavior'),replacement:valueOf(form,'replacement'),
      show_on_dashboard:checked(form,'show_on_dashboard'),applicable_days:[0,1,2,3,4,5,6].filter(i=>checked(form,`day-${i}`)),
      position:activity?.position??5,archived:activity?.archived??false};
    if(type!=='build') Object.assign(row,{item_based:false,daily_goal:null,presets:[],unit:type==='replace'?valueOf(form,'unit'):'',
      fields:type==='replace'&&valueOf(form,'unit')?[measurement]:[],quantity_field_id:type==='replace'&&valueOf(form,'unit')?'measurement':null});
    else if(typeOf(activity)!=='build'||!activity) Object.assign(row,{item_based:false,daily_goal:null,presets:[],unit:'',quantity_field_id:null,fields:[{id:'completed',label:'Completed',type:'boolean',required:true,default_value:true,position:0,options:[],min:null,max:null}]});
    validateHabit(row);return row;
  }
  function update(){ const type=valueOf(form,'habit_type'); for(const key of ['build','maintain','replace']) form.querySelector(`[data-${key}]`).hidden=type!==key; }
  form.addEventListener('change',update);
  form.querySelector('[data-action="build-options"]').onclick=()=>{
    try {const row=draft();close();buildEditor((changes,id)=>save({...row,...changes,habit_type:'build'},id),row);}
    catch(e){form.querySelector('.error').textContent=e.message;}
  };
  update();
}

export function outcomeForm(activity,day,tz,save,edit) {
  tz=edit?.habit_timezone??tz;
  const entryId=crypto.randomUUID();
  const type=edit?.habit_type??typeOf(activity);
  const fields=edit?.field_snapshot??activity.fields;
  sheet(edit?'Correct entry':`Log ${activity.name}`,`
    <p>${h(edit?.habit_snapshot?.boundary||edit?.habit_snapshot?.replacement||activity.boundary||activity.replacement)}</p>
    ${select('Outcome','outcome',outcomes[type],edit?.outcome??outcomes[type][0][0])}
    ${fields.map(f=>fieldControl(f,edit?.values?.[f.id]??f.default_value)).join('')}
    ${textarea('Notes (optional)','habit_note',edit?.habit_note)}
    <details><summary>Change date</summary>${input('Date','date',edit?habitDay(edit,tz):day,'date','required')}</details>
    <button type="submit" class="primary wide">Save entry</button>`,async form=>{
      const values=readValues(form,fields),errors=validateFields(fields,values);
      if(Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
      const date=valueOf(form,'date');
      await save({...(edit?{}:{id:entryId,activity_id:activity.id,item_id:null}),values,outcome:valueOf(form,'outcome'),habit_note:valueOf(form,'habit_note'),
        occurred_at:edit&&date===habitDay(edit,tz)?edit.occurred_at:automaticOccurrence(date,tz)},edit?.id);
    });
}

export function boundaryCard(a,data,day) {
  const type=typeOf(a),logs=data.logs.filter(l=>l.activity_id===a.id&&habitDay(l,data.settings.timezone)===day);
  const latest=[...logs].sort((x,y)=>y.occurred_at.localeCompare(x.occurred_at))[0];
  const cfg=dayConfiguration(data,a,day)??a;
  const summary=type==='maintain'?(latest?outcomeLabel(latest.outcome):'Not checked yet')
    :logs.length?`${logs.filter(l=>l.outcome==='replaced').length} successful replacements recorded`:'No opportunities recorded';
  return `<article class="activity-card"><div class="activity-card-heading"><span class="activity-icon ${h(a.icon)}">${icon(a.icon)}</span><a class="grow" href="#activity/${h(a.id)}"><h3>${h(a.name)}</h3></a><span class="badge">${h(type)}</span></div>
    <p>${h(type==='maintain'?cfg.boundary:`${cfg.unwanted_behavior} → ${cfg.replacement}`)}</p><strong>${h(summary)}</strong>
    ${!scheduled(cfg,day)?'<p class="muted">Not scheduled for this day. Recording is optional.</p>':''}
    ${a.archived?'<p class="muted">Archived</p>':`<div class="habit-outcomes">${outcomes[type].map(([value,label])=>`<button type="button" data-action="habit-outcome" data-id="${h(a.id)}" data-outcome="${value}" ${type==='maintain'&&latest?.outcome===value?'disabled aria-pressed="true"':''}>${h(label)}</button>`).join('')}</div>${button('Add details','entry',a.id,'text-button')}`}${latest?button('Undo latest','undo-log',latest.id,'text-button'):''}
    <small class="muted">${type==='replace'?'Record only when a real opportunity occurs.':'No record is not a missed boundary.'}</small></article>`;
}

export function consistencyView(data,days) {
  return `<section class="panel padded"><h2>Progress and consistency</h2><p class="muted">Actual amounts stay separate from achievement. Unscheduled and not-applicable days are excluded; missing records are not failures. Older dates without known settings are not scored.</p>
    ${data.activities.map(a=>{
      const s=habitSummary(data,a,days);
      const amounts=measurementTotals(data.logs.filter(l=>days.includes(habitDay(l,data.settings.timezone))),a).map(m=>`${m.value} ${m.unit}`).join(' · ');
      const description=s.type==='build'?`${s.practised} scheduled days with progress · ${s.goalDays?`${s.achieved} goal-achieved days (once per day)`:'No known daily goal in this period'}`
        :s.type==='maintain'?`${s.achieved} / ${s.recorded} applicable, recorded days${s.percent===null?'':` · ${s.percent.toFixed(1)}% consistency`}`
        :`${s.successes} successful replacements · ${s.incomplete} incomplete opportunities${s.percent===null?'':` · ${s.percent.toFixed(1)}% among recorded opportunities`}`;
      return `<div class="log-row"><div><strong>${h(a.name)} · ${h(s.type)}</strong><p>${h(description)}</p>${amounts?`<p>Actual measurements: ${h(amounts)}</p>`:''}<small>${s.type==='replace'?'Unrecorded opportunities cannot be inferred. ':`${s.missing} unrecorded scheduled days · `}${s.na} not applicable · ${s.unknown} days without known settings</small></div></div>`;
    }).join('')}</section>`;
}
export function reflectionForm(save,day,existing) {
  const start=weekStart(day);
  sheet(`Week of ${start}`,`${textarea('What went well?','went_well',existing?.went_well)}${textarea('What was difficult?','difficult',existing?.difficult)}${textarea('What small improvement should I try next week?','next_step',existing?.next_step)}<button class="primary wide">Save reflection</button>`,form=>save({week_start:start,went_well:valueOf(form,'went_well'),difficult:valueOf(form,'difficult'),next_step:valueOf(form,'next_step')},existing?.id));
}
