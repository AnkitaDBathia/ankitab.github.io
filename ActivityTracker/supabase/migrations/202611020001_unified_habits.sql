-- Run once after all earlier migrations, before deploying the unified-habits frontend.
begin;
alter table public.activities
 add column habit_type text not null default 'build' check(habit_type in ('build','maintain','replace')),
 add column category text not null default '' check(length(category)<=100),
 add column applicable_days integer[] not null default array[0,1,2,3,4,5,6]
   check(cardinality(applicable_days)>0 and applicable_days <@ array[0,1,2,3,4,5,6] and array_position(applicable_days,null) is null),
 add column show_on_dashboard boolean not null default true,
 add column boundary text not null default '' check(length(boundary)<=2000),
 add column unwanted_behavior text not null default '' check(length(unwanted_behavior)<=2000),
 add column replacement text not null default '' check(length(replacement)<=2000);

alter table public.activity_logs
 add column habit_type text not null default 'build' check(habit_type in ('build','maintain','replace')),
 add column outcome text check(outcome in ('achieved','not_achieved','replaced','not_replaced','not_applicable')),
 add column habit_day date,
 add column habit_timezone text,
 add column habit_snapshot jsonb,
 add column measurement_unit text,
 add column habit_note text not null default '' check(length(habit_note)<=10000);
create unique index one_boundary_per_day on public.activity_logs(activity_id,habit_day) where habit_type='maintain';

create table public.habit_revisions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 activity_id uuid not null,
 effective_day date not null,
 snapshot jsonb not null,
 recorded_at timestamptz not null default now(),
 foreign key(activity_id,user_id) references public.activities(id,user_id) on delete cascade,
 unique(activity_id,effective_day)
);
alter table public.habit_revisions enable row level security;
create policy read_own_revisions on public.habit_revisions for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.habit_revisions from public,anon,authenticated;
grant select on public.habit_revisions to authenticated;

create table public.weekly_reflections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 week_start date not null check(extract(isodow from week_start)=1),
 went_well text not null default '' check(length(went_well)<=10000),
 difficult text not null default '' check(length(difficult)<=10000),
 next_step text not null default '' check(length(next_step)<=10000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,week_start)
);
alter table public.weekly_reflections enable row level security;
create policy own_reflections on public.weekly_reflections for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.weekly_reflections from public,anon;
grant select,insert,update,delete on public.weekly_reflections to authenticated;
create trigger touch_reflection before update on public.weekly_reflections for each row execute function public.touch_owned_row();

create function public.habit_configuration(a public.activities) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('habit_type',a.habit_type,'daily_goal',a.daily_goal,
 'applicable_days',a.applicable_days,'archived',a.archived,'boundary',a.boundary,
 'unwanted_behavior',a.unwanted_behavior,'replacement',a.replacement,
 'unit',a.unit,'quantity_field_id',a.quantity_field_id,'fields',a.fields,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'goal',i.goal,'goal_period',i.goal_period,'archived',i.archived)) from public.activity_items i where i.activity_id=a.id),'[]'::jsonb));
$$;
create function public.check_habit_configuration() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.habit_type<>old.habit_type and exists(select 1 from public.activity_logs where activity_id=old.id) then
   raise exception 'Keep the type of a habit with history. Archive it and create a new habit instead.';
 end if;
 if new.habit_type<>'build' and (new.item_based or new.daily_goal is not null) then raise exception 'Boundaries and replacements do not use item lists or daily quantity goals'; end if;
 if new.habit_type='maintain' and trim(new.boundary)='' then raise exception 'Describe your boundary'; end if;
 if new.habit_type='replace' and (trim(new.unwanted_behavior)='' or trim(new.replacement)='') then raise exception 'Describe the trigger and replacement'; end if;
 return new;
end $$;
create trigger check_habit_configuration before insert or update on public.activities for each row execute function public.check_habit_configuration();

create function public.record_habit_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.activities; tz text; day date;
begin
 if tg_table_name='activities' then a:=new;
 else select * into a from public.activities where id=new.activity_id and user_id=new.user_id; end if;
 select timezone into tz from public.user_settings where user_id=a.user_id;
 day:=(now() at time zone coalesce(tz,'Asia/Kolkata'))::date;
 insert into public.habit_revisions(user_id,activity_id,effective_day,snapshot)
 values(a.user_id,a.id,day,public.habit_configuration(a))
 on conflict(activity_id,effective_day) do update set snapshot=excluded.snapshot,recorded_at=now();
 return new;
end $$;
revoke all on function public.record_habit_revision() from public,anon,authenticated;
create trigger record_habit_revision after insert or update on public.activities for each row execute function public.record_habit_revision();
create trigger record_item_revision after insert or update on public.activity_items for each row execute function public.record_habit_revision();
-- Start history of settings today; never invent earlier schedules or goals.
insert into public.habit_revisions(user_id,activity_id,effective_day,snapshot)
select a.user_id,a.id,(now() at time zone coalesce(s.timezone,'Asia/Kolkata'))::date,public.habit_configuration(a)
from public.activities a left join public.user_settings s on s.user_id=a.user_id;

create function public.validate_habit_log() returns trigger language plpgsql set search_path='' as $$
declare a public.activities; tz text; cfg jsonb;
begin
 if tg_op='INSERT' then
   select * into a from public.activities where id=new.activity_id and user_id=new.user_id for update;
   select timezone into tz from public.user_settings where user_id=new.user_id;
   new.habit_timezone:=coalesce(tz,'Asia/Kolkata');
   new.habit_day:=(new.occurred_at at time zone new.habit_timezone)::date;
   select habit_snapshot into cfg from public.activity_logs where activity_id=a.id and habit_day=new.habit_day and habit_snapshot is not null order by created_at,id limit 1;
   if cfg is null then
     select snapshot into cfg from public.habit_revisions where activity_id=a.id and effective_day<=new.habit_day order by effective_day desc limit 1;
   end if;
   new.habit_type:=a.habit_type;
   new.habit_snapshot:=cfg;
   new.measurement_unit:=a.unit;
 else
   new.habit_type:=old.habit_type;
   new.measurement_unit:=old.measurement_unit;
   new.habit_timezone:=old.habit_timezone;
   new.habit_day:=case when old.habit_timezone is null then null else (new.occurred_at at time zone old.habit_timezone)::date end;
   new.habit_snapshot:=old.habit_snapshot;
   if new.habit_day is distinct from old.habit_day then
     select habit_snapshot into new.habit_snapshot from public.activity_logs where activity_id=new.activity_id and habit_day=new.habit_day and id<>old.id and habit_snapshot is not null order by created_at,id limit 1;
     if new.habit_snapshot is null then
       select snapshot into new.habit_snapshot from public.habit_revisions where activity_id=new.activity_id and effective_day<=new.habit_day order by effective_day desc limit 1;
     end if;
   end if;
 end if;
 if new.habit_snapshot->>'habit_type' <> new.habit_type then new.habit_snapshot:=null; end if;
 if new.habit_type='build' and new.outcome is not null then raise exception 'Build entries use measurements'; end if;
 if new.habit_type='maintain' and (new.outcome is null or new.outcome not in ('achieved','not_achieved','not_applicable')) then raise exception 'Choose a boundary outcome'; end if;
 if new.habit_type='replace' and (new.outcome is null or new.outcome not in ('replaced','not_replaced','not_applicable')) then raise exception 'Choose a replacement outcome'; end if;
 return new;
end $$;
create trigger validate_habit_log before insert or update on public.activity_logs for each row execute function public.validate_habit_log();
commit;
