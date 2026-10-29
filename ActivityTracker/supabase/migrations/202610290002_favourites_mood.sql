-- Run once after the targets migration.
begin;
alter table public.activity_items add column favourite boolean not null default false;
alter table public.activity_logs
  add column mood text check (mood in ('Great','Good','Okay','Low','Stressed','Calm','Energised','Tired')),
  add column mood_note text not null default '' check (length(mood_note) <= 10000);
commit;
