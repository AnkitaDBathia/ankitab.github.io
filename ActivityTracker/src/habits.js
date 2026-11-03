import { localDay, habitDay, moveDay, total, completed } from './lib.js';
export { habitDay } from './lib.js';
export const typeOf = a => a?.habit_type ?? 'build';
export const outcomes = {
  maintain: [['achieved','Achieved'],['not_achieved','Not achieved'],['not_applicable','Not applicable']],
  replace: [['replaced','Replaced'],['not_replaced','Did not replace'],['not_applicable','Not applicable']],
};
export const outcomeLabel = value => Object.values(outcomes).flat().find(([id])=>id===value)?.[1] ?? '';
export const scheduled = (config,day) => !config.archived && (config.applicable_days ?? [0,1,2,3,4,5,6]).includes(new Date(`${day}T12:00:00Z`).getUTCDay());
export function configurationAt(data, activity, day) {
  return (data.revisions ?? []).filter(r=>r.activity_id===activity.id && r.effective_day<=day)
    .sort((a,b)=>b.effective_day.localeCompare(a.effective_day))[0]?.snapshot ?? null;
}
export function dayConfiguration(data, activity, day, logs = data.logs) {
  const first = logs.filter(l=>l.activity_id===activity.id && habitDay(l,data.settings.timezone)===day && l.habit_snapshot)
    .sort((a,b)=>(a.created_at??a.occurred_at).localeCompare(b.created_at??b.occurred_at)||a.id.localeCompare(b.id))[0];
  const cfg=first?.habit_snapshot ?? configurationAt(data,activity,day);
  return cfg && typeOf(cfg)===typeOf(activity)?cfg:null;
}
// Keep different measurement definitions separate when a habit changes over time.
export function measurementTotals(logs, activity) {
  const totals=new Map();
  for(const log of logs.filter(l=>l.activity_id===activity.id && l.quantity_field_id)) {
    const field=log.field_snapshot?.find(f=>f.id===log.quantity_field_id);
    const value=log.values[log.quantity_field_id];
    if(typeof value!=='number') continue;
    const unit=log.measurement_unit ?? log.habit_snapshot?.unit ?? `${field?.label??'Quantity'} (original unit unknown)`;
    const key=JSON.stringify([log.quantity_field_id,unit]);
    const current=totals.get(key)??{unit,value:0};
    current.value+=value;totals.set(key,current);
  }
  return [...totals.values()];
}
export function configurationSnapshot(activity,items=[]) {
  return {...structuredClone(activity),habit_type:typeOf(activity),applicable_days:activity.applicable_days ?? [0,1,2,3,4,5,6],
    items:structuredClone(items.filter(i=>i.activity_id===activity.id))};
}
export function validateHabit(a) {
  if (!['build','maintain','replace'].includes(typeOf(a))) throw new Error('Choose a habit type.');
  if (a.applicable_days && (!a.applicable_days.length || a.applicable_days.some(d=>!Number.isInteger(d)||d<0||d>6))) throw new Error('Choose at least one applicable day.');
  if (typeOf(a)==='maintain' && !a.boundary?.trim()) throw new Error('Describe the boundary.');
  if (typeOf(a)==='replace' && (!a.unwanted_behavior?.trim() || !a.replacement?.trim())) throw new Error('Describe the trigger and healthy replacement.');
  if (typeOf(a)!=='build' && (a.item_based || a.daily_goal!=null)) throw new Error('Daily quantity goals and items are for Build habits.');
}
export function habitSummary(data,a,days) {
  const type=typeOf(a), tz=data.settings.timezone;
  const today=localDay(new Date(),tz), byDay=new Map();
  for(const log of data.logs) {
    if(log.activity_id!==a.id) continue;
    const day=habitDay(log,tz);
    if(!byDay.has(day)) byDay.set(day,[]);
    byDay.get(day).push(log);
  }
  const result={type,actual:0,recorded:0,achieved:0,applicable:0,missing:0,na:0,unknown:0,opportunities:0,successes:0,incomplete:0,goalDays:0,practised:0};
  for(const day of days) {
    if(day>today) continue;
    const logs=byDay.get(day)??[];
    result.actual+=total(logs,a.id);
    // A saved entry freezes that day's criteria. Otherwise use the dated revision.
    const cfg=dayConfiguration(data,a,day,logs);
    if(type==='replace') {
      result.successes+=logs.filter(l=>l.outcome==='replaced').length;
      result.incomplete+=logs.filter(l=>l.outcome==='not_replaced').length;
      result.na+=logs.filter(l=>l.outcome==='not_applicable').length;
    }
    if(!cfg) {result.unknown++;continue;}
    if(!scheduled(cfg,day)) continue;
    result.applicable++;
    if(type==='replace') continue;
    const dailyItems=(cfg.items??[]).filter(i=>!i.archived&&i.goal&&i.goal_period==='daily');
    const hasGoal=type==='build'&&(cfg.daily_goal!=null||dailyItems.length>0||cfg.fields?.some(f=>f.type==='boolean'));
    if(hasGoal) result.goalDays++;
    if(!logs.length) {result.missing++;continue;}
    if(type==='maintain') {
      const log=[...logs].sort((x,y)=>y.occurred_at.localeCompare(x.occurred_at))[0];
      if(log.outcome==='not_applicable') {result.na++;continue;}
      result.recorded++;
      if(log.outcome==='achieved') result.achieved++;
    } else {
      result.recorded++;
      const matching=logs.filter(l=>l.quantity_field_id===cfg.quantity_field_id && (l.measurement_unit??l.habit_snapshot?.unit??cfg.unit)===cfg.unit);
      const value=total(matching,a.id);
      const freeform=!cfg.quantity_field_id&&!cfg.fields?.some(f=>f.type==='boolean');
      const didPractice=completed(logs,a.id)||value>0||(freeform&&(!cfg.fields?.length||logs.some(l=>l.field_snapshot?.some(f=>!['boolean','number','duration'].includes(f.type) && l.values[f.id]))));
      if(didPractice) result.practised++;
      if(hasGoal) {
        const count=cfg.fields?.some(f=>f.type==='boolean')?logs.filter(l=>completed([l],a.id)).length:logs.length;
        const activityGoal=cfg.daily_goal!=null ? (cfg.quantity_field_id?value:count)>=cfg.daily_goal : dailyItems.length ? true : completed(logs,a.id);
        if(activityGoal && dailyItems.every(i=>total(matching,a.id,i.id)>=i.goal)) result.achieved++;
      }
    }
  }
  result.opportunities=result.successes+result.incomplete;
  result.percent=type==='maintain'&&result.recorded ? result.achieved/result.recorded*100
    :type==='replace'&&result.incomplete>0 ? result.successes/result.opportunities*100 : null;
  return result;
}
export function weekStart(day) {
  const weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
  return moveDay(day,-((weekday+6)%7));
}
