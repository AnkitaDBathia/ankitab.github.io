begin;
alter table public.activities add column balance_enabled boolean not null default false;
alter table public.activity_items add column balance_enabled boolean not null default false;
alter table public.activity_logs add column entry_type text not null default 'performed' check(entry_type in ('performed','used'));
create or replace function public.validate_log() returns trigger language plpgsql set search_path='' as $$
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
 if new.entry_type='performed' then perform public.validate_values(new.field_snapshot,new.values); end if;
 new.updated_at:=now();return new;
end $$;

create function public.guard_balance() returns trigger language plpgsql set search_path='' as $$
declare a public.activities; enabled boolean; balance numeric; r public.activity_logs; amount numeric;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 select * into a from public.activities where id=r.activity_id for update;
 if tg_op<>'INSERT' and old.entry_type='used' then raise exception 'Usage records cannot be edited or deleted'; end if;
 if tg_op='UPDATE' and old.entry_type<>new.entry_type then raise exception 'Entry type cannot change'; end if;
 enabled:=a.balance_enabled;
 if r.item_id is not null then select balance_enabled into enabled from public.activity_items where id=r.item_id; end if;
 if tg_op<>'DELETE' and new.entry_type='used' then
  if not enabled or a.habit_type<>'build' or a.quantity_field_id is null then raise exception 'Enable a quantity balance first'; end if;
  if jsonb_typeof(new.values->a.quantity_field_id) is distinct from 'number' then raise exception 'Enter a numeric amount'; end if;
  amount:=(new.values->>a.quantity_field_id)::numeric;
  if amount is null or amount<=0 then raise exception 'Enter a positive amount'; end if;
 end if;
 if enabled or exists(select 1 from public.activity_logs where activity_id=r.activity_id and item_id is not distinct from r.item_id and entry_type='used') then
  select coalesce(sum((values->>quantity_field_id)::numeric * case when entry_type='used' then -1 else 1 end),0) into balance
   from public.activity_logs where activity_id=r.activity_id and item_id is not distinct from r.item_id and id<>r.id;
  if tg_op<>'DELETE' then
   amount:=(new.values->>new.quantity_field_id)::numeric;
   if amount is null or amount<0 then raise exception 'Balance entries need a nonnegative quantity'; end if;
   balance:=balance+amount*case when new.entry_type='used' then -1 else 1 end;
  end if;
  if balance<0 then raise exception 'Amount exceeds available balance'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
-- Runs after existing BEFORE validators have set quantity snapshots.
create trigger zz_guard_balance before insert or update or delete on public.activity_logs for each row execute function public.guard_balance();
create function public.freeze_balance_measurement() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.quantity_field_id is distinct from old.quantity_field_id or new.unit is distinct from old.unit or new.habit_type<>old.habit_type) and
 (old.balance_enabled or exists(select 1 from public.activity_items where activity_id=old.id and balance_enabled) or exists(select 1 from public.activity_logs where activity_id=old.id and entry_type='used')) then
 raise exception 'Keep the measurement of a balance habit; create another habit for a different unit'; end if;
 if new.balance_enabled and (new.item_based or new.quantity_field_id is null or new.habit_type<>'build') then raise exception 'Enable balance on a quantity habit or on its individual items'; end if;
 return new;
end $$;
create trigger freeze_balance_measurement before update or insert on public.activities for each row execute function public.freeze_balance_measurement();
create function public.check_item_balance() returns trigger language plpgsql set search_path='' as $$
declare a public.activities;
begin
 select * into a from public.activities where id=new.activity_id for update;
 if new.balance_enabled and (a.quantity_field_id is null or a.habit_type<>'build') then raise exception 'Balance needs a quantity-based Build habit'; end if;
 return new;
end $$;
create trigger check_item_balance before insert or update on public.activity_items for each row execute function public.check_item_balance();
commit;
