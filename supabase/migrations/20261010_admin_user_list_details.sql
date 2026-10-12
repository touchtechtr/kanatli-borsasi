begin;

drop function if exists public.admin_list_users();

create function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  is_admin boolean,
  profile_created_at timestamptz,
  auth_created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  companies jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Bu işlem yalnızca yöneticiler içindir.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name')::text,
    coalesce(p.is_admin, false),
    p.created_at,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'role', c.role::text,
            'status', c.status::text,
            'city', c.city,
            'address', c.address,
            'phone', c.phone,
            'email', c.email,
            'tax_no', c.tax_no,
            'website', c.website,
            'created_at', c.created_at
          )
          order by c.created_at
        )
        from public.companies c
        where c.user_id = u.id
      ),
      '[]'::jsonb
    )
  from auth.users u
  left join public.profiles p on p.id = u.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

commit;
