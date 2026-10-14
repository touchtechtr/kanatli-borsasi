begin;

-- V2 ilan yaşam döngüsü: sahiplik denetimi, güvenli durum geçişleri,
-- kritik düzenlemelerde yeniden moderasyon ve değişiklik geçmişi.

do $$
declare
  table_name_value text;
begin
  foreach table_name_value in array array['listings','feed_listings','livestock_listings'] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name_value, table_name_value || '_status_check');
    execute format(
      'alter table public.%I add constraint %I check (status in (''aktif'',''pasif'',''beklemede'',''reddedildi'',''satildi'',''tamamlandi''))',
      table_name_value,
      table_name_value || '_status_check'
    );
  end loop;
end $$;

create table if not exists public.listing_change_history (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (listing_type in ('listings','feed_listings','livestock_listings')),
  listing_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created','updated','status_changed','moderation_reset','deleted')),
  old_status text,
  new_status text,
  changed_fields text[] not null default '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists listing_change_history_listing_idx
  on public.listing_change_history(listing_type, listing_id, created_at desc);
create index if not exists listing_change_history_company_idx
  on public.listing_change_history(company_id, created_at desc);

alter table public.listing_change_history enable row level security;

drop policy if exists listing_change_history_owner_read on public.listing_change_history;
create policy listing_change_history_owner_read on public.listing_change_history
for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_member(company_id, array['owner','manager','sales'])
  or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
);

grant select on public.listing_change_history to authenticated;

create or replace function public.can_manage_listing(p_listing_type text, p_listing_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path=public
as $$
declare
  owner_company_id uuid;
begin
  if auth.uid() is null or p_listing_type not in ('listings','feed_listings','livestock_listings') then
    return false;
  end if;

  execute format('select company_id from public.%I where id=$1', p_listing_type)
    into owner_company_id using p_listing_id;

  if owner_company_id is null then return false; end if;

  return public.is_company_member(owner_company_id, array['owner','manager','sales'])
    or exists(select 1 from public.companies c where c.id=owner_company_id and c.user_id=auth.uid());
end;
$$;

grant execute on function public.can_manage_listing(text,uuid) to authenticated;

create or replace function public.listing_changed_fields(old_row jsonb, new_row jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(key order by key), '{}')
  from jsonb_object_keys(old_row || new_row) as key
  where old_row -> key is distinct from new_row -> key
    and key not in ('updated_at','moderated_at','moderated_by');
$$;

create or replace function public.apply_listing_owner_remoderation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  critical_fields text[] := array['title','category','animal_type','breed','quantity','unit','price','city','district','description','feed_form','packaging_type','protein_ratio','energy_value','health_status'];
  changed text[];
  field_name text;
  critical_change boolean := false;
begin
  if public.is_platform_admin() then return new; end if;

  changed := public.listing_changed_fields(to_jsonb(old), to_jsonb(new));
  foreach field_name in array critical_fields loop
    if field_name = any(changed) then critical_change := true; exit; end if;
  end loop;

  if critical_change then
    new.moderation_status := 'inceleme_bekliyor';
    new.moderation_reason := 'İlan sahibi kritik ilan bilgilerini güncelledi.';
    new.risk_score := greatest(coalesce(new.risk_score,0), 10);
    new.moderated_by := null;
    new.moderated_at := null;
    new.status := 'beklemede';
  end if;

  return new;
end;
$$;

create or replace function public.record_listing_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  before_data jsonb;
  after_data jsonb;
  changes text[];
  action_name text;
  company_value uuid;
begin
  before_data := case when tg_op='INSERT' then null else to_jsonb(old) end;
  after_data := case when tg_op='DELETE' then null else to_jsonb(new) end;
  company_value := coalesce((after_data->>'company_id')::uuid,(before_data->>'company_id')::uuid);
  changes := case when tg_op='UPDATE' then public.listing_changed_fields(before_data,after_data) else '{}' end;
  action_name := case
    when tg_op='INSERT' then 'created'
    when tg_op='DELETE' then 'deleted'
    when (before_data->>'moderation_status') is distinct from (after_data->>'moderation_status') and after_data->>'moderation_status'='inceleme_bekliyor' then 'moderation_reset'
    when (before_data->>'status') is distinct from (after_data->>'status') then 'status_changed'
    else 'updated'
  end;

  insert into public.listing_change_history(listing_type,listing_id,company_id,actor_user_id,action,old_status,new_status,changed_fields,old_data,new_data)
  values(tg_table_name,coalesce(new.id,old.id),company_value,auth.uid(),action_name,before_data->>'status',after_data->>'status',changes,before_data,after_data);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name_value text;
begin
  foreach table_name_value in array array['listings','feed_listings','livestock_listings'] loop
    execute format('drop trigger if exists listing_owner_remoderation on public.%I',table_name_value);
    execute format('create trigger listing_owner_remoderation before update on public.%I for each row execute function public.apply_listing_owner_remoderation()',table_name_value);
    execute format('drop trigger if exists listing_change_history_trigger on public.%I',table_name_value);
    execute format('create trigger listing_change_history_trigger after insert or update or delete on public.%I for each row execute function public.record_listing_change()',table_name_value);
  end loop;
end $$;

create or replace function public.set_own_listing_status(p_listing_type text, p_listing_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  current_status text;
  current_moderation text;
begin
  if not public.can_manage_listing(p_listing_type,p_listing_id) then
    raise exception 'Bu ilanı yönetme yetkiniz bulunmuyor.';
  end if;
  if p_status not in ('aktif','pasif','satildi') then raise exception 'Geçersiz ilan durumu.'; end if;

  execute format('select status,moderation_status from public.%I where id=$1 for update',p_listing_type)
    into current_status,current_moderation using p_listing_id;

  if p_status='aktif' and current_moderation in ('inceleme_bekliyor','reddedildi') then
    raise exception 'İncelemedeki veya reddedilen ilan doğrudan yayınlanamaz.';
  end if;
  if current_status='satildi' and p_status<>'satildi' then
    raise exception 'Satıldı olarak kapanan ilan yeniden yayınlanamaz. Yeni ilan oluşturun.';
  end if;

  execute format('update public.%I set status=$1%s where id=$2',p_listing_type,
    case when p_listing_type in ('feed_listings','livestock_listings') then ', updated_at=timezone(''utc'',now())' else '' end)
  using p_status,p_listing_id;
end;
$$;

grant execute on function public.set_own_listing_status(text,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
