begin;

-- =====================================================
-- Kesimhane randevuları: yönetim alanları
-- =====================================================

alter table public.slaughter_appointments
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop policy if exists slaughter_appointments_admin_update
on public.slaughter_appointments;

create policy slaughter_appointments_admin_update
on public.slaughter_appointments
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

create or replace function public.admin_review_slaughter_appointment(
  p_appointment_id uuid,
  p_action text,
  p_admin_note text default null
)
returns public.slaughter_appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.slaughter_appointments;
  next_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Bu işlem için yönetici yetkisi gerekiyor.';
  end if;

  if p_action not in ('onayla', 'reddet') then
    raise exception 'Geçersiz randevu işlemi.';
  end if;

  if p_action = 'reddet' and nullif(btrim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'Reddetme gerekçesi zorunludur.';
  end if;

  next_status := case when p_action = 'onayla' then 'Onaylandı' else 'Reddedildi' end;

  update public.slaughter_appointments
  set status = next_status,
      admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_appointment_id
    and status = 'Onay Bekliyor'
  returning * into result;

  if result.id is null then
    raise exception 'Randevu bulunamadı veya daha önce sonuçlandırılmış.';
  end if;

  return result;
end;
$$;

revoke all on function public.admin_review_slaughter_appointment(uuid, text, text)
from public;
grant execute on function public.admin_review_slaughter_appointment(uuid, text, text)
to authenticated;

-- =====================================================
-- Ekspertiz talepleri: yönetim ve uzman atama alanları
-- =====================================================

alter table public.expert_requests
  add column if not exists assigned_expert_company_id uuid references public.companies(id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop policy if exists expert_admin_select_all on public.expert_requests;
drop policy if exists expert_admin_update on public.expert_requests;
drop policy if exists expert_assigned_company_select on public.expert_requests;

create policy expert_admin_select_all
on public.expert_requests
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

create policy expert_admin_update
on public.expert_requests
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

create policy expert_assigned_company_select
on public.expert_requests
for select
to authenticated
using (
  exists (
    select 1 from public.companies c
    where c.id = expert_requests.assigned_expert_company_id
      and c.user_id = auth.uid()
  )
);

create or replace function public.protect_expert_request_management_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_is_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) into requester_is_admin;

  if requester_is_admin then
    new.updated_at := timezone('utc', now());
    return new;
  end if;

  if old.user_id <> auth.uid() then
    raise exception 'Bu talebi değiştirme yetkiniz yok.';
  end if;

  if old.status <> 'beklemede' then
    raise exception 'Sonuçlandırılmış ekspertiz talebi değiştirilemez.';
  end if;

  if new.status is distinct from old.status
     or new.assigned_expert_company_id is distinct from old.assigned_expert_company_id
     or new.admin_note is distinct from old.admin_note
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
  then
    raise exception 'Yönetim alanlarını yalnızca yönetici değiştirebilir.';
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists protect_expert_request_management_trigger
on public.expert_requests;

create trigger protect_expert_request_management_trigger
before update on public.expert_requests
for each row execute function public.protect_expert_request_management_fields();

create or replace function public.admin_review_expert_request(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null,
  p_expert_company_id uuid default null
)
returns public.expert_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.expert_requests;
  next_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Bu işlem için yönetici yetkisi gerekiyor.';
  end if;

  if p_action not in ('onayla', 'reddet') then
    raise exception 'Geçersiz ekspertiz işlemi.';
  end if;

  if p_action = 'reddet' and nullif(btrim(coalesce(p_admin_note, '')), '') is null then
    raise exception 'Reddetme gerekçesi zorunludur.';
  end if;

  if p_expert_company_id is not null and not exists (
    select 1 from public.companies c
    where c.id = p_expert_company_id
      and c.status = 'onaylandi'::company_status
      and c.role::text = 'uzman'
  ) then
    raise exception 'Seçilen uzman firması geçerli veya onaylı değil.';
  end if;

  next_status := case
    when p_action = 'reddet' then 'reddedildi'
    when p_expert_company_id is not null then 'uzman_atandi'
    else 'onaylandi'
  end;

  update public.expert_requests
  set status = next_status,
      assigned_expert_company_id = case
        when p_action = 'onayla' then p_expert_company_id
        else null
      end,
      admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_request_id
    and status = 'beklemede'
  returning * into result;

  if result.id is null then
    raise exception 'Ekspertiz talebi bulunamadı veya daha önce sonuçlandırılmış.';
  end if;

  return result;
end;
$$;

revoke all on function public.admin_review_expert_request(uuid, text, text, uuid)
from public;
grant execute on function public.admin_review_expert_request(uuid, text, text, uuid)
to authenticated;

commit;
