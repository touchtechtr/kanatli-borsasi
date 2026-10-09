begin;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['listings', 'feed_listings', 'livestock_listings'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_select', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_update', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_platform_admin())', table_name || '_admin_select', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())', table_name || '_admin_update', table_name);
  end loop;
end $$;

commit;
