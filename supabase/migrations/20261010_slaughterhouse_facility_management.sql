begin;

alter table public.slaughterhouses
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.slaughterhouses
  alter column company_id set not null,
  alter column status set default 'Beklemede',
  alter column status set not null;

alter table public.slaughterhouses
  drop constraint if exists slaughterhouses_status_check;

alter table public.slaughterhouses
  add constraint slaughterhouses_status_check
  check (status in ('Beklemede', 'Aktif', 'Pasif', 'Reddedildi'));

drop policy if exists slaughterhouses_select_active on public.slaughterhouses;
drop policy if exists slaughterhouses_select_owner_or_admin on public.slaughterhouses;
drop policy if exists slaughterhouses_insert_approved_integrated on public.slaughterhouses;
drop policy if exists slaughterhouses_delete_own_unpublished on public.slaughterhouses;
drop policy if exists slaughterhouses_admin_update on public.slaughterhouses;

create policy slaughterhouses_select_active
on public.slaughterhouses
for select
to anon, authenticated
using (status = 'Aktif');

create policy slaughterhouses_select_owner_or_admin
on public.slaughterhouses
for select
to authenticated
using (
  public.current_user_is_admin()
  or exists (
    select 1
    from public.companies company
    where company.id = slaughterhouses.company_id
      and company.user_id = auth.uid()
  )
);

create policy slaughterhouses_insert_approved_integrated
on public.slaughterhouses
for insert
to authenticated
with check (
  status = 'Beklemede'
  and exists (
    select 1
    from public.companies company
    where company.id = slaughterhouses.company_id
      and company.user_id = auth.uid()
      and company.status::text = 'onaylandi'
      and company.role::text = 'entegre'
  )
);

create policy slaughterhouses_delete_own_unpublished
on public.slaughterhouses
for delete
to authenticated
using (
  status in ('Beklemede', 'Reddedildi')
  and exists (
    select 1
    from public.companies company
    where company.id = slaughterhouses.company_id
      and company.user_id = auth.uid()
  )
);

create policy slaughterhouses_admin_update
on public.slaughterhouses
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.admin_review_slaughterhouse(
  p_slaughterhouse_id uuid,
  p_action text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Bu işlem yalnızca yöneticiler içindir.';
  end if;

  select status
  into next_status
  from public.slaughterhouses
  where id = p_slaughterhouse_id
  for update;

  if next_status is null then
    raise exception 'Kesimhane tesisi bulunamadı.';
  end if;

  if p_action = 'onayla' and next_status = 'Beklemede' then
    next_status := 'Aktif';
  elsif p_action = 'reddet' and next_status = 'Beklemede' then
    if nullif(btrim(coalesce(p_admin_note, '')), '') is null then
      raise exception 'Reddetme gerekçesi zorunludur.';
    end if;
    next_status := 'Reddedildi';
  elsif p_action = 'durdur' and next_status = 'Aktif' then
    next_status := 'Pasif';
  elsif p_action = 'etkinlestir' and next_status = 'Pasif' then
    next_status := 'Aktif';
  else
    raise exception 'Bu tesis için geçersiz durum geçişi.';
  end if;

  update public.slaughterhouses
  set
    status = next_status,
    admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_slaughterhouse_id;
end;
$$;

revoke all on function public.admin_review_slaughterhouse(uuid, text, text) from public;
revoke all on function public.admin_review_slaughterhouse(uuid, text, text) from anon;
grant execute on function public.admin_review_slaughterhouse(uuid, text, text) to authenticated;

commit;
