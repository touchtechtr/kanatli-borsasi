begin;

-- Yöneticiler tüm profilleri okuyabilsin.
drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

-- Normal kullanıcı yalnızca kendi düzenlenebilir profil alanlarını değiştirebilir.
-- is_admin için doğrudan UPDATE izni verilmez.
revoke update on public.profiles from authenticated;
grant update (full_name, company_id) on public.profiles to authenticated;

-- Kullanıcı listesini auth.users bilgileriyle birlikte yalnızca yöneticiye verir.
create or replace function public.admin_list_users()
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
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  ) then
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

create or replace function public.admin_get_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  ) then
    raise exception 'Bu işlem yalnızca yöneticiler içindir.';
  end if;

  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'full_name', coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name'),
    'is_admin', coalesce(p.is_admin, false),
    'profile_created_at', p.created_at,
    'auth_created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'phone', u.phone,
    'companies', coalesce(
      (
        select jsonb_agg(to_jsonb(company_row) order by company_row.created_at)
        from (
          select
            c.id,
            c.name,
            c.role::text as role,
            c.status::text as status,
            c.city,
            c.address,
            c.website,
            c.email,
            c.phone,
            c.tax_no,
            c.created_at
          from public.companies c
          where c.user_id = u.id
        ) company_row
      ),
      '[]'::jsonb
    )
  )
  into result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;

  if result is null then
    raise exception 'Kullanıcı bulunamadı.';
  end if;

  return result;
end;
$$;

revoke all on function public.admin_get_user_detail(uuid) from public;
revoke all on function public.admin_get_user_detail(uuid) from anon;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;

create or replace function public.admin_set_user_admin(
  p_user_id uuid,
  p_is_admin boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  ) then
    raise exception 'Bu işlem yalnızca yöneticiler içindir.';
  end if;

  if p_user_id = auth.uid() and p_is_admin = false then
    raise exception 'Kendi yönetici yetkinizi kaldıramazsınız.';
  end if;

  if not exists (
    select 1 from public.profiles where id = p_user_id
  ) then
    raise exception 'Kullanıcı profili bulunamadı.';
  end if;

  update public.profiles
  set is_admin = p_is_admin
  where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_user_admin(uuid, boolean) from public;
revoke all on function public.admin_set_user_admin(uuid, boolean) from anon;
grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

commit;
