-- Run once. Grant only your own account administrator access afterwards (see README).
begin;
create table public.account_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.account_admins enable row level security;
revoke all on public.account_admins from public, anon, authenticated;
grant select on public.account_admins to authenticated, service_role;
create policy own_admin_status on public.account_admins for select to authenticated
  using (user_id = (select auth.uid()));
-- Membership can be changed only by the SQL administrator, never through the app.
commit;
