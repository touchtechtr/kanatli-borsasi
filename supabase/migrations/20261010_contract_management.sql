begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

grant execute on function public.current_user_is_admin() to anon, authenticated;

alter table public.contract_farming
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.contract_farming
set status = 'beklemede'
where status is null
   or status not in ('beklemede', 'aktif', 'pasif', 'tamamlandi', 'reddedildi');

alter table public.contract_farming
  alter column company_id set not null,
  alter column status set default 'beklemede',
  alter column status set not null;

alter table public.contract_farming
  drop constraint if exists contract_farming_status_check;

alter table public.contract_farming
  add constraint contract_farming_status_check
  check (status in ('beklemede', 'aktif', 'pasif', 'tamamlandi', 'reddedildi'));

drop policy if exists "Firmalar kendi sözleşme tekliflerini yönetebilir" on public.contract_farming;
drop policy if exists "Herkes sözleşmeli üretim tekliflerini okuyabilir" on public.contract_farming;
drop policy if exists contract_delete_own on public.contract_farming;
drop policy if exists contract_insert_approved_company on public.contract_farming;
drop policy if exists contract_select_active_or_own on public.contract_farming;
drop policy if exists contract_update_own_approved on public.contract_farming;
drop policy if exists contract_admin_select_all on public.contract_farming;
drop policy if exists contract_admin_update_all on public.contract_farming;

create policy contract_select_active_owner_or_admin
on public.contract_farming
for select
to public
using (
  status = 'aktif'
  or public.current_user_is_admin()
  or exists (
    select 1
    from public.companies company
    where company.id = contract_farming.company_id
      and company.user_id = auth.uid()
  )
);

create policy contract_insert_approved_integrated_company
on public.contract_farming
for insert
to authenticated
with check (
  status = 'beklemede'
  and exists (
    select 1
    from public.companies company
    where company.id = contract_farming.company_id
      and company.user_id = auth.uid()
      and company.status::text = 'onaylandi'
      and company.role::text = 'entegre'
  )
);

create policy contract_delete_own_unpublished
on public.contract_farming
for delete
to authenticated
using (
  status in ('beklemede', 'pasif', 'reddedildi')
  and exists (
    select 1
    from public.companies company
    where company.id = contract_farming.company_id
      and company.user_id = auth.uid()
  )
);

create policy contract_admin_update_all
on public.contract_farming
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.admin_review_contract(
  p_contract_id uuid,
  p_action text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Bu işlem yalnızca yöneticiler içindir.';
  end if;

  select status
  into current_status
  from public.contract_farming
  where id = p_contract_id
  for update;

  if current_status is null then
    raise exception 'Sözleşme teklifi bulunamadı.';
  end if;

  if p_action = 'onayla' and current_status = 'beklemede' then
    current_status := 'aktif';
  elsif p_action = 'reddet' and current_status = 'beklemede' then
    if nullif(btrim(coalesce(p_admin_note, '')), '') is null then
      raise exception 'Reddetme gerekçesi zorunludur.';
    end if;
    current_status := 'reddedildi';
  elsif p_action = 'durdur' and current_status = 'aktif' then
    current_status := 'pasif';
  elsif p_action = 'etkinlestir' and current_status = 'pasif' then
    current_status := 'aktif';
  elsif p_action = 'tamamla' and current_status = 'aktif' then
    current_status := 'tamamlandi';
  else
    raise exception 'Bu sözleşme için geçersiz durum geçişi.';
  end if;

  update public.contract_farming
  set
    status = current_status,
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_contract_id;
end;
$$;

revoke all on function public.admin_review_contract(uuid, text, text) from public;
revoke all on function public.admin_review_contract(uuid, text, text) from anon;
grant execute on function public.admin_review_contract(uuid, text, text) to authenticated;

commit;
