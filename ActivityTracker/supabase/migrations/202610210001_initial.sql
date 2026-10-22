-- My Journey: run once through Supabase SQL Editor or `supabase db push`.
begin;
create table public.user_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'My friend' check(length(display_name) between 1 and 100),
 timezone text not null default 'Asia/Kolkata',
 appearance text not null default 'system' check(appearance in ('light','dark','system')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Field definitions are an ordered, versioned JSON document, atomically updated.
create table public.activities (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 seed_key text, name text not null check(length(trim(name)) between 1 and 100), description text not null default '',
 icon text not null default 'sparkles', unit text not null default '', position integer not null default 0,
 archived boolean not null default false, item_based boolean not null default false,
 presets jsonb not null default '[]', fields jsonb not null default '[]', quantity_field_id text,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id), unique(user_id,seed_key), check(jsonb_typeof(fields)='array'),check(jsonb_typeof(presets)='array')
);
create table public.activity_items (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 activity_id uuid not null, name text not null check(length(trim(name)) between 1 and 200), author text not null default '',
 description text not null default '',status text not null default 'Not Started' check(status in ('Not Started','Reading','Completed')),
 goal numeric check(goal>0),archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(activity_id,user_id) references public.activities(id,user_id) on delete restrict,unique(id,activity_id,user_id)
);
create table public.activity_logs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 activity_id uuid not null,item_id uuid,values jsonb not null default '{}',
 field_snapshot jsonb not null default '[]',quantity_field_id text,
 occurred_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(activity_id,user_id) references public.activities(id,user_id) on delete restrict,
 foreign key(item_id,activity_id,user_id) references public.activity_items(id,activity_id,user_id) on delete restrict,
 check(jsonb_typeof(values)='object')
);
create index activities_owner_order on public.activities(user_id,position);
create index items_owner_activity on public.activity_items(user_id,activity_id);
create index logs_owner_time on public.activity_logs(user_id,occurred_at desc);
create index logs_owner_activity_item on public.activity_logs(user_id,activity_id,item_id);

create function public.validate_values(definitions jsonb, vals jsonb) returns void language plpgsql set search_path='' as $$
declare f jsonb; v jsonb; k text;
begin
 if jsonb_typeof(vals) is distinct from 'object' then raise exception 'Values must be an object'; end if;
 for k in select jsonb_object_keys(vals) loop
  if not exists(select 1 from jsonb_array_elements(definitions) x where x->>'id'=k) then raise exception 'Unknown field'; end if;
 end loop;
 for f in select * from jsonb_array_elements(definitions) loop
  v := vals->(f->>'id');
  if v is null or v='null'::jsonb or v='""'::jsonb then
   if coalesce((f->>'required')::boolean,false) then raise exception '% is required',f->>'label'; end if;
   continue;
  end if;
  case f->>'type'
   when 'number','duration' then
    if jsonb_typeof(v)<>'number' then raise exception 'Numeric value required'; end if;
    if (f->>'min' is not null and (v::text)::numeric<(f->>'min')::numeric) or (f->>'max' is not null and (v::text)::numeric>(f->>'max')::numeric) then raise exception 'Value outside allowed range'; end if;
   when 'boolean' then if jsonb_typeof(v)<>'boolean' then raise exception 'Boolean required'; end if;
   when 'select' then if jsonb_typeof(v)<>'string' or not (f->'options' @> jsonb_build_array(v)) then raise exception 'Invalid selection'; end if;
   when 'date' then
    if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
    perform (v#>>'{}')::date;
   when 'text','multiline' then if jsonb_typeof(v)<>'string' or length(v#>>'{}')>10000 then raise exception 'Invalid text'; end if;
   else raise exception 'Unsupported field type';
  end case;
 end loop;
end $$;

create function public.validate_activity() returns trigger language plpgsql set search_path='' as $$
declare f jsonb; p jsonb;
begin
 if tg_op='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id or new.seed_key is distinct from old.seed_key then raise exception 'Identity is immutable'; end if;
  if new.item_based<>old.item_based and exists(select 1 from public.activity_logs where activity_id=old.id) then raise exception 'Item mode cannot change after logging'; end if;
  new.version:=old.version+1; new.created_at:=old.created_at;
 end if;
 if jsonb_array_length(new.fields)>50 then raise exception 'At most 50 fields'; end if;
 if exists(select 1 from jsonb_array_elements(new.fields) definition group by definition->>'id' having count(*)>1) then raise exception 'Duplicate field ID'; end if;
 for f in select * from jsonb_array_elements(new.fields) loop
  if coalesce(f->>'id','')='' or coalesce(trim(f->>'label'),'')='' or coalesce(f->>'type','') not in ('number','duration','text','multiline','boolean','select','date') then raise exception 'Invalid field definition'; end if;
  if jsonb_typeof(f->'required') is distinct from 'boolean' or jsonb_typeof(f->'options') is distinct from 'array' then raise exception 'Invalid field metadata'; end if;
  if (f->>'min')::numeric>(f->>'max')::numeric then raise exception 'Invalid bounds'; end if;
  if f->>'type'='select' then
   if jsonb_array_length(f->'options')=0 or exists(select 1 from jsonb_array_elements(f->'options') o where jsonb_typeof(o)<>'string' or trim(o#>>'{}')='') or exists(select 1 from jsonb_array_elements(f->'options') o group by o having count(*)>1) then raise exception 'Invalid dropdown options'; end if;
  end if;
  if f->'default_value' is not null and f->'default_value'<>'null'::jsonb then perform public.validate_values(jsonb_build_array(f),jsonb_build_object(f->>'id',f->'default_value')); end if;
 end loop;
 if new.quantity_field_id is not null and not exists(select 1 from jsonb_array_elements(new.fields) definition where definition->>'id'=new.quantity_field_id and definition->>'type' in ('number','duration')) then raise exception 'Summary field must be numeric'; end if;
 for p in select * from jsonb_array_elements(new.presets) loop
  if jsonb_typeof(p)<>'number' or p::text::numeric<=0 then raise exception 'Presets must be positive numbers'; end if;
 end loop;
 new.updated_at:=now(); return new;
end $$;
create trigger validate_activity before insert or update on public.activities for each row execute function public.validate_activity();

create function public.validate_log() returns trigger language plpgsql set search_path='' as $$
declare a public.activities; i public.activity_items;
begin
 if tg_op='INSERT' then
  select * into a from public.activities where id=new.activity_id and user_id=new.user_id;
  if not found or a.archived then raise exception 'Activity unavailable'; end if;
  if a.item_based and new.item_id is null then raise exception 'Select an item'; end if;
  if not a.item_based and new.item_id is not null then raise exception 'This activity does not use items'; end if;
  if new.item_id is not null then
   select * into i from public.activity_items where id=new.item_id and activity_id=a.id and user_id=new.user_id;
   if not found or i.archived then raise exception 'Item unavailable'; end if;
  end if;
  new.field_snapshot:=a.fields;new.quantity_field_id:=a.quantity_field_id;new.created_at:=now();
 else
  if new.id<>old.id or new.user_id<>old.user_id or new.activity_id<>old.activity_id or new.item_id is distinct from old.item_id then raise exception 'Log identity is immutable'; end if;
  new.field_snapshot:=old.field_snapshot;new.quantity_field_id:=old.quantity_field_id;new.created_at:=old.created_at;
 end if;
 perform public.validate_values(new.field_snapshot,new.values);
 new.updated_at:=now();return new;
end $$;
create trigger validate_log before insert or update on public.activity_logs for each row execute function public.validate_log();

create function public.touch_owned_row() returns trigger language plpgsql set search_path='' as $$
begin
 if new.user_id<>old.user_id then raise exception 'Owner is immutable'; end if;
 new.created_at:=old.created_at;new.updated_at:=now();return new;
end $$;
create trigger touch_settings before update on public.user_settings for each row execute function public.touch_owned_row();
create trigger touch_items before update on public.activity_items for each row execute function public.touch_owned_row();
create function public.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Unknown timezone'; end if;
 return new;
end $$;
create trigger validate_timezone before insert or update on public.user_settings for each row execute function public.validate_timezone();

alter table public.user_settings enable row level security;
alter table public.activities enable row level security;
alter table public.activity_items enable row level security;
alter table public.activity_logs enable row level security;
create policy own_settings on public.user_settings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_activities on public.activities for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_items on public.activity_items for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy own_logs on public.activity_logs for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.user_settings,public.activities,public.activity_items,public.activity_logs from anon;
grant select,insert,update,delete on public.user_settings,public.activities,public.activity_items,public.activity_logs to authenticated;

-- Caller-scoped and idempotent: never accepts another user's identifier.
create function public.initialize_journey() returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); qty jsonb; practice jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 insert into public.user_settings(user_id) values(uid) on conflict do nothing;
 qty:='[{"id":"quantity","label":"Quantity","type":"number","required":true,"default_value":1,"position":0,"options":[],"min":1,"max":1000000}]';
 practice:='[{"id":"completed","label":"Completed","type":"boolean","required":true,"default_value":true,"position":0,"options":[],"min":null,"max":null},{"id":"type","label":"Type","type":"select","required":true,"default_value":"General","position":1,"options":["General","Gentle","Guided"],"min":null,"max":null},{"id":"duration","label":"Duration (minutes)","type":"duration","required":false,"default_value":null,"position":2,"options":[],"min":0,"max":1440},{"id":"notes","label":"Notes","type":"multiline","required":false,"default_value":null,"position":3,"options":[],"min":null,"max":null}]';
 insert into public.activities(user_id,seed_key,name,description,icon,unit,position,item_based,presets,fields,quantity_field_id) values
 (uid,'water','Water','Make room for a little refreshment.','water','glasses',0,false,'[1,2,3]',qty,'quantity'),
 (uid,'reading','Reading','One page can open a new world.','book','pages',1,true,'[1,2,5]',qty,'quantity'),
 (uid,'mantra','Mantra','A moment of intention, repeated.','sun','chants',2,true,'[1,11,108]',qty,'quantity'),
 (uid,'yoga','Yoga','Find a little balance.','leaf','minutes',3,false,'[]',practice,'duration'),
 (uid,'meditation','Meditation','Come back to the present.','moon','minutes',4,false,'[]',practice,'duration') on conflict(user_id,seed_key) do nothing;
end $$;
revoke all on function public.initialize_journey() from public,anon;
grant execute on function public.initialize_journey() to authenticated;
commit;
