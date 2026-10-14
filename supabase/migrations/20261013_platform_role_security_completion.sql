begin;

create or replace function public.has_platform_role(p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_staff s
    where s.user_id = auth.uid()
      and s.active = true
      and (p_roles is null or s.role = any(p_roles))
  );
$$;

create or replace function public.get_my_platform_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  staff_row public.platform_staff;
  account_email text;
  account_name text;
begin
  select * into staff_row
  from public.platform_staff
  where user_id = auth.uid() and active = true;

  if not found then
    return jsonb_build_object(
      'is_staff', false,
      'role', null,
      'active', false,
      'email', null,
      'full_name', null
    );
  end if;

  select u.email::text,
         coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name')
    into account_email, account_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid();

  return jsonb_build_object(
    'is_staff', true,
    'role', staff_row.role,
    'active', staff_row.active,
    'email', account_email,
    'full_name', account_name
  );
end;
$$;

create or replace function public.admin_set_platform_staff(
  p_user_id uuid,
  p_role text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_target_role text;
  current_target_active boolean;
  active_super_admin_count integer;
begin
  if not public.has_platform_role(array['super_admin']) then
    raise exception 'Bu işlem için süper yönetici yetkisi gerekiyor.';
  end if;

  if p_role not in ('super_admin','moderator','finance','operations','auditor') then
    raise exception 'Geçersiz personel rolü.';
  end if;

  select role, active
    into current_target_role, current_target_active
  from public.platform_staff
  where user_id = p_user_id;

  if p_active and (
    exists(select 1 from public.companies where user_id = p_user_id)
    or exists(
      select 1 from public.company_members
      where user_id = p_user_id and status = 'aktif'
    )
  ) then
    raise exception 'Şirket sahibi veya aktif şirket üyesi platform personeli yapılamaz. Önce şirket bağlantısını ayırın.';
  end if;

  select count(*) into active_super_admin_count
  from public.platform_staff
  where role = 'super_admin' and active = true;

  if current_target_role = 'super_admin'
     and coalesce(current_target_active, false)
     and (not p_active or p_role <> 'super_admin')
     and active_super_admin_count <= 1 then
    raise exception 'Sistemde en az bir aktif süper yönetici bulunmalıdır.';
  end if;

  if p_user_id = auth.uid() and not p_active then
    raise exception 'Kendi yönetici erişiminizi kapatamazsınız.';
  end if;

  insert into public.platform_staff(
    user_id, role, active, granted_by, updated_at
  ) values (
    p_user_id, p_role, p_active, auth.uid(), timezone('utc', now())
  )
  on conflict(user_id) do update
    set role = excluded.role,
        active = excluded.active,
        granted_by = auth.uid(),
        updated_at = timezone('utc', now());

  update public.profiles
  set is_admin = p_active
  where id = p_user_id;
end;
$$;

revoke all on function public.has_platform_role(text[]) from public, anon;
revoke all on function public.get_my_platform_access() from public, anon;
revoke all on function public.admin_set_platform_staff(uuid,text,boolean) from public, anon;
grant execute on function public.has_platform_role(text[]) to authenticated;
grant execute on function public.get_my_platform_access() to authenticated;
grant execute on function public.admin_set_platform_staff(uuid,text,boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
