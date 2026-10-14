begin;

create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','moderator','finance','operations','auditor')),
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','manager','sales','finance','viewer')),
  status text not null default 'aktif' check (status in ('davetli','aktif','askida','kaldirildi')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(company_id,user_id)
);

insert into public.platform_staff(user_id,role,active)
select id,'super_admin',true from public.profiles where is_admin=true
on conflict(user_id) do update set active=true;

insert into public.company_members(company_id,user_id,role,status)
select id,user_id,'owner','aktif' from public.companies where user_id is not null
on conflict(company_id,user_id) do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.platform_staff s where s.user_id=auth.uid() and s.active=true); $$;
create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_platform_admin(); $$;
create or replace function public.is_company_member(p_company_id uuid,p_roles text[] default null)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.company_members m where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='aktif' and (p_roles is null or m.role=any(p_roles))); $$;

alter table public.platform_staff enable row level security;
alter table public.company_members enable row level security;
drop policy if exists platform_staff_self_or_admin_select on public.platform_staff;
create policy platform_staff_self_or_admin_select on public.platform_staff for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
drop policy if exists company_members_member_select on public.company_members;
create policy company_members_member_select on public.company_members for select to authenticated using(user_id=auth.uid() or public.is_platform_admin() or public.is_company_member(company_id,array['owner','manager']));
grant select on public.platform_staff,public.company_members to authenticated;

create or replace function public.get_my_platform_access()
returns jsonb language plpgsql security definer set search_path=public
as $$ declare staff public.platform_staff; begin
  select * into staff from public.platform_staff where user_id=auth.uid() and active=true;
  return jsonb_build_object('is_staff',found,'role',staff.role,'active',coalesce(staff.active,false));
end; $$;

create or replace function public.admin_list_platform_staff()
returns table(user_id uuid,email text,full_name text,role text,active boolean,granted_at timestamptz)
language plpgsql security definer set search_path=public,auth
as $$ begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  return query select s.user_id,u.email::text,coalesce(p.full_name,u.raw_user_meta_data->>'full_name')::text,s.role,s.active,s.granted_at
  from public.platform_staff s join auth.users u on u.id=s.user_id left join public.profiles p on p.id=s.user_id order by s.active desc,s.granted_at;
end; $$;

create or replace function public.admin_set_platform_staff(p_user_id uuid,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not exists(select 1 from public.platform_staff where user_id=auth.uid() and role='super_admin' and active=true) then raise exception 'Bu işlem için süper yönetici yetkisi gerekiyor.'; end if;
  if p_role not in ('super_admin','moderator','finance','operations','auditor') then raise exception 'Geçersiz personel rolü.'; end if;
  if p_user_id=auth.uid() and not p_active then raise exception 'Kendi yönetici erişiminizi kapatamazsınız.'; end if;
  insert into public.platform_staff(user_id,role,active,granted_by,updated_at) values(p_user_id,p_role,p_active,auth.uid(),timezone('utc',now()))
  on conflict(user_id) do update set role=excluded.role,active=excluded.active,granted_by=auth.uid(),updated_at=timezone('utc',now());
  update public.profiles set is_admin=p_active where id=p_user_id;
end; $$;

create or replace function public.admin_assign_company_member(p_company_id uuid,p_user_id uuid,p_role text,p_status text default 'aktif')
returns void language plpgsql security definer set search_path=public
as $$ begin
  if not exists(select 1 from public.platform_staff where user_id=auth.uid() and role='super_admin' and active=true) then raise exception 'Süper yönetici yetkisi gerekiyor.'; end if;
  if p_role not in ('owner','manager','sales','finance','viewer') or p_status not in ('davetli','aktif','askida','kaldirildi') then raise exception 'Geçersiz şirket üyeliği.'; end if;
  if exists(select 1 from public.platform_staff where user_id=p_user_id and active=true) then raise exception 'Platform personeli aynı anda aktif şirket üyesi olamaz.'; end if;
  insert into public.company_members(company_id,user_id,role,status,invited_by,updated_at)
  values(p_company_id,p_user_id,p_role,p_status,auth.uid(),timezone('utc',now()))
  on conflict(company_id,user_id) do update set role=excluded.role,status=excluded.status,invited_by=auth.uid(),updated_at=timezone('utc',now());
  if p_role='owner' and p_status='aktif' then
    update public.company_members set status='kaldirildi',updated_at=timezone('utc',now()) where company_id=p_company_id and user_id<>p_user_id and role='owner';
    update public.companies set user_id=p_user_id where id=p_company_id;
  end if;
end; $$;

create or replace function public.block_platform_staff_commerce()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if public.is_platform_admin() then raise exception 'Platform personeli ticari işlem başlatamaz. Şirket işlemleri için ayrı bir şirket hesabı kullanın.'; end if;
  return new;
end; $$;

create or replace function public.enforce_platform_staff_permission()
returns trigger language plpgsql security definer set search_path=public
as $$
declare staff_role text; required_area text:=tg_argv[0];
begin
  select role into staff_role from public.platform_staff where user_id=auth.uid() and active=true;
  if staff_role is null then return case when tg_op='DELETE' then old else new end; end if;
  if staff_role='super_admin'
     or (required_area='moderation' and staff_role='moderator')
     or (required_area='finance' and staff_role='finance')
     or (required_area='operations' and staff_role='operations') then
    return case when tg_op='DELETE' then old else new end;
  end if;
  raise exception 'Bu işlem için % alanı yetkiniz bulunmuyor.',required_area;
end; $$;

do $$ declare t text; begin
  foreach t in array array['listings','feed_listings','livestock_listings','trade_offers','contract_farming','slaughter_appointments','expert_requests','listing_promotions','company_activity_applications'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists block_platform_staff_commerce_trigger on public.%I',t);
      execute format('create trigger block_platform_staff_commerce_trigger before insert on public.%I for each row execute function public.block_platform_staff_commerce()',t);
    end if;
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['companies','company_activity_applications','company_activity_documents','company_activities','listings','feed_listings','livestock_listings','listing_promotions','trade_offers'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists enforce_platform_staff_permission_trigger on public.%I',t);
      execute format('create trigger enforce_platform_staff_permission_trigger before update or delete on public.%I for each row execute function public.enforce_platform_staff_permission(''moderation'')',t);
    end if;
  end loop;
  foreach t in array array['trade_payments'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists enforce_platform_staff_permission_trigger on public.%I',t);
      execute format('create trigger enforce_platform_staff_permission_trigger before update or delete on public.%I for each row execute function public.enforce_platform_staff_permission(''finance'')',t);
    end if;
  end loop;
  foreach t in array array['contract_farming','slaughterhouses','slaughter_appointments','expert_requests'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists enforce_platform_staff_permission_trigger on public.%I',t);
      execute format('create trigger enforce_platform_staff_permission_trigger before update or delete on public.%I for each row execute function public.enforce_platform_staff_permission(''operations'')',t);
    end if;
  end loop;
end $$;

revoke all on function public.get_my_platform_access() from public,anon;
revoke all on function public.admin_list_platform_staff() from public,anon;
revoke all on function public.admin_set_platform_staff(uuid,text,boolean) from public,anon;
revoke all on function public.admin_assign_company_member(uuid,uuid,text,text) from public,anon;
revoke all on function public.block_platform_staff_commerce() from public,anon,authenticated;
revoke all on function public.enforce_platform_staff_permission() from public,anon,authenticated;
grant execute on function public.get_my_platform_access() to authenticated;
grant execute on function public.admin_list_platform_staff() to authenticated;
grant execute on function public.admin_set_platform_staff(uuid,text,boolean) to authenticated;
grant execute on function public.admin_assign_company_member(uuid,uuid,text,text) to authenticated;

do $$ declare t text; begin
  if to_regprocedure('public.record_platform_audit_event()') is not null then
    foreach t in array array['platform_staff','company_members'] loop
      execute format('drop trigger if exists platform_audit_trigger on public.%I',t);
      execute format('create trigger platform_audit_trigger after insert or update or delete on public.%I for each row execute function public.record_platform_audit_event()',t);
    end loop;
  end if;
end $$;

commit;
