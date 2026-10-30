begin;
-- No public username/email directory. Only the server and SQL administrator use this table.
create table public.login_usernames (
  username text primary key check (username = lower(trim(username)) and username ~ '^[a-z0-9][a-z0-9 ._-]{2,63}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.login_usernames enable row level security;
revoke all on public.login_usernames from public, anon, authenticated;
grant select, insert, update, delete on public.login_usernames to service_role;

create table public.username_login_attempts (
  key text primary key,
  started_at timestamptz not null,
  attempts integer not null
);
alter table public.username_login_attempts enable row level security;
revoke all on public.username_login_attempts from public, anon, authenticated;
create function public.allow_username_login(attempt_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  delete from public.username_login_attempts where started_at < now() - interval '1 day';
  insert into public.username_login_attempts as a values(attempt_key,now(),1)
  on conflict(key) do update set
    attempts = case when a.started_at < now() - interval '15 minutes' then 1 else a.attempts+1 end,
    started_at = case when a.started_at < now() - interval '15 minutes' then now() else a.started_at end
  returning attempts into n;
  return n <= 10;
end $$;
revoke all on function public.allow_username_login(text) from public, anon, authenticated;
grant execute on function public.allow_username_login(text) to service_role;
commit;
