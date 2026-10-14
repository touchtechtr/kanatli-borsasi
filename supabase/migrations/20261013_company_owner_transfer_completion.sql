begin;

-- Şirket sahipliği aktarılırken eski şemadaki kullanıcı bazlı sahiplik
-- alanlarını da yeni hesaba taşır. Teklif/audit aktörleri geçmiş kayıt
-- oldukları için bilinçli olarak değiştirilmez.
create or replace function public.admin_assign_company_member(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text default 'aktif'
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_owner_id uuid;
  company_name text;
  target_email text;
  resource_table text;
begin
  if not exists (
    select 1
    from public.platform_staff
    where user_id = auth.uid()
      and role = 'super_admin'
      and active = true
  ) then
    raise exception 'Süper yönetici yetkisi gerekiyor.';
  end if;

  if p_role not in ('owner','manager','sales','finance','viewer')
     or p_status not in ('davetli','aktif','askida','kaldirildi') then
    raise exception 'Geçersiz şirket üyeliği.';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Seçilen kullanıcı bulunamadı.';
  end if;

  if exists (
    select 1 from public.platform_staff
    where user_id = p_user_id and active = true
  ) then
    raise exception 'Platform personeli aynı anda aktif şirket üyesi olamaz.';
  end if;

  select c.user_id, c.name
    into old_owner_id, company_name
  from public.companies c
  where c.id = p_company_id
  for update;

  if not found then
    raise exception 'Şirket bulunamadı.';
  end if;

  select u.email::text into target_email
  from auth.users u
  where u.id = p_user_id;

  if p_role = 'owner' and p_status = 'aktif' then
    if exists (
      select 1 from public.companies c
      where c.user_id = p_user_id and c.id <> p_company_id
    ) then
      raise exception 'Seçilen kullanıcı başka bir şirketin sahibidir.';
    end if;

    -- Güncel işletme kaynaklarını yeni kullanıcıya geçir. Yalnızca hem
    -- company_id hem user_id taşıyan ve sahipliğe bağlı çalışan tablolar.
    foreach resource_table in array array[
      'listings',
      'feed_listings',
      'livestock_listings',
      'slaughter_appointments',
      'expert_requests'
    ] loop
      if to_regclass('public.' || resource_table) is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = resource_table
             and column_name = 'company_id'
         )
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = resource_table
             and column_name = 'user_id'
         ) then
        execute format(
          'update public.%I set user_id = $1 where company_id = $2 and user_id = $3',
          resource_table
        ) using p_user_id, p_company_id, old_owner_id;
      end if;
    end loop;

    update public.company_members
       set status = 'kaldirildi',
           updated_at = timezone('utc', now())
     where company_id = p_company_id
       and user_id <> p_user_id
       and role = 'owner';

    insert into public.company_members(
      company_id, user_id, role, status, invited_by, updated_at
    ) values (
      p_company_id, p_user_id, 'owner', 'aktif', auth.uid(), timezone('utc', now())
    )
    on conflict(company_id, user_id) do update
      set role = 'owner',
          status = 'aktif',
          invited_by = auth.uid(),
          updated_at = timezone('utc', now());

    update public.companies
       set user_id = p_user_id
     where id = p_company_id;

    -- Eski profil bağlantısını temizle, yeni sahibin profilini şirkete bağla.
    update public.profiles
       set company_id = null
     where id = old_owner_id
       and company_id = p_company_id;

    update public.profiles
       set company_id = p_company_id
     where id = p_user_id;

    if to_regclass('public.notifications') is not null then
      insert into public.notifications(
        recipient_user_id,
        actor_user_id,
        entity_type,
        entity_id,
        event_type,
        title,
        message,
        link
      ) values (
        p_user_id,
        auth.uid(),
        'company',
        p_company_id,
        'company_ownership_transferred',
        'Şirket hesabınız hazır',
        company_name || ' şirketinin sahipliği hesabınıza aktarıldı.',
        '/profil/sirket'
      );
    end if;
  else
    insert into public.company_members(
      company_id, user_id, role, status, invited_by, updated_at
    ) values (
      p_company_id, p_user_id, p_role, p_status, auth.uid(), timezone('utc', now())
    )
    on conflict(company_id, user_id) do update
      set role = excluded.role,
          status = excluded.status,
          invited_by = auth.uid(),
          updated_at = timezone('utc', now());
  end if;
end;
$$;

revoke all on function public.admin_assign_company_member(uuid,uuid,text,text)
  from public, anon;
grant execute on function public.admin_assign_company_member(uuid,uuid,text,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
