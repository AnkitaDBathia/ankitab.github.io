-- Run once in Supabase SQL Editor after the initial migration.
begin;
alter table public.activities add column daily_goal numeric check (daily_goal > 0);
alter table public.activity_items add column goal_period text not null default 'total'
  check (goal_period in ('daily', 'total'));
commit;
