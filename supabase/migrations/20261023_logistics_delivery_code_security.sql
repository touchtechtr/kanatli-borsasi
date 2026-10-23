begin;

create table if not exists public.logistics_delivery_secrets (
  delivery_id uuid primary key references public.logistics_deliveries(id) on delete cascade,
  requester_company_id uuid not null references public.companies(id) on delete restrict,
  pickup_code text not null check(pickup_code ~ '^[0-9]{6}$'),
  delivery_code text not null check(delivery_code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default timezone('utc',now())
);

insert into public.logistics_delivery_secrets(
  delivery_id,requester_company_id,pickup_code,delivery_code
)
select id,requester_company_id,pickup_code,delivery_code
from public.logistics_deliveries
where pickup_code is not null and delivery_code is not null
on conflict(delivery_id) do nothing;

alter table public.logistics_deliveries
  alter column pickup_code drop not null,
  alter column delivery_code drop not null;

update public.logistics_deliveries
set pickup_code=null,delivery_code=null
where pickup_code is not null or delivery_code is not null;

alter table public.logistics_delivery_secrets enable row level security;

drop policy if exists logistics_delivery_secrets_select
  on public.logistics_delivery_secrets;
create policy logistics_delivery_secrets_select
on public.logistics_delivery_secrets for select to authenticated
using(
  public.is_platform_admin()
  or public.is_company_member(requester_company_id,null)
  or exists(
    select 1 from public.companies c
    where c.id=requester_company_id and c.user_id=auth.uid()
  )
);

revoke all on public.logistics_delivery_secrets from public,anon;
grant select on public.logistics_delivery_secrets to authenticated;

create or replace function public.accept_logistics_quote(p_quote_id uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  q public.logistics_quotes%rowtype;
  r public.logistics_requests%rowtype;
  delivery_id uuid;
  pickup_code_value text;
  delivery_code_value text;
begin
  if auth.uid() is null then raise exception 'Oturum gerekiyor.'; end if;

  select * into q from public.logistics_quotes where id=p_quote_id for update;
  if not found or q.status<>'beklemede' then raise exception 'Bekleyen teklif bulunamadı.'; end if;

  select * into r from public.logistics_requests where id=q.request_id for update;
  if not found or r.status<>'aktif' then raise exception 'Taşıma talebi aktif değil.'; end if;

  if not public.is_company_member(r.company_id,null)
     and not exists(select 1 from public.companies c where c.id=r.company_id and c.user_id=auth.uid()) then
    raise exception 'Bu taşıma teklifini kabul etme yetkiniz yok.';
  end if;

  if not exists(
    select 1 from public.logistics_vehicles v
    join public.logistics_vehicle_capabilities cap on cap.vehicle_id=v.id
    where v.id=q.vehicle_id and v.company_id=q.carrier_company_id
      and v.status='onaylandi' and cap.capability=r.cargo_type
  ) then raise exception 'Nakliyeci aracı artık bu taşıma için uygun değil.'; end if;

  update public.logistics_quotes set
    status=case when id=q.id then 'kabul_edildi' else 'reddedildi' end,
    updated_at=timezone('utc',now())
  where request_id=r.id and status='beklemede';

  update public.logistics_requests set status='eslesme_yapildi',
    updated_at=timezone('utc',now()) where id=r.id;

  pickup_code_value:=lpad((floor(random()*1000000))::int::text,6,'0');
  delivery_code_value:=lpad((floor(random()*1000000))::int::text,6,'0');

  insert into public.logistics_deliveries(
    request_id,quote_id,requester_company_id,carrier_company_id,vehicle_id,
    agreed_amount,currency,pickup_code,delivery_code
  ) values(
    r.id,q.id,r.company_id,q.carrier_company_id,q.vehicle_id,q.amount,q.currency,
    null,null
  ) returning id into delivery_id;

  insert into public.logistics_delivery_secrets(
    delivery_id,requester_company_id,pickup_code,delivery_code
  ) values(delivery_id,r.company_id,pickup_code_value,delivery_code_value);

  insert into public.logistics_payments(
    delivery_id,request_id,quote_id,requester_company_id,carrier_company_id,
    amount,currency
  ) values(delivery_id,r.id,q.id,r.company_id,q.carrier_company_id,q.amount,q.currency);

  return delivery_id;
end;
$$;

create or replace function public.start_logistics_delivery(
  p_delivery_id uuid,p_pickup_code text
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_deliveries%rowtype;
  expected_code text;
begin
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Taşıma dosyası bulunamadı.'; end if;
  if d.status<>'yukleme_bekliyor' or d.payment_status<>'havuzda' then
    raise exception 'Taşıma başlatılmaya uygun değil.';
  end if;
  if not public.is_company_member(d.carrier_company_id,null)
     and not exists(select 1 from public.companies c where c.id=d.carrier_company_id and c.user_id=auth.uid()) then
    raise exception 'Taşımayı yalnızca eşleşen nakliyeci başlatabilir.';
  end if;

  select pickup_code into expected_code
  from public.logistics_delivery_secrets
  where delivery_id=d.id;

  if expected_code is null or expected_code<>trim(p_pickup_code) then
    raise exception 'Yükleme kodu geçersiz.';
  end if;
  if not exists(select 1 from public.logistics_delivery_evidence
    where delivery_id=d.id and stage='yukleme') then
    raise exception 'Taşıma başlamadan önce yükleme kanıtı yüklenmelidir.';
  end if;

  update public.logistics_deliveries set status='tasimada',
    pickup_started_at=timezone('utc',now()),pickup_started_by=auth.uid(),
    updated_at=timezone('utc',now()) where id=d.id;
end;
$$;

create or replace function public.confirm_logistics_delivery(
  p_delivery_id uuid,p_delivery_code text
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_deliveries%rowtype;
  expected_code text;
begin
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found or d.status<>'teslim_onayi_bekliyor' then
    raise exception 'Teslimat alıcı onayına hazır değil.';
  end if;
  if not public.is_company_member(d.requester_company_id,null)
     and not exists(select 1 from public.companies c where c.id=d.requester_company_id and c.user_id=auth.uid()) then
    raise exception 'Teslimatı yalnızca talep sahibi onaylayabilir.';
  end if;

  select delivery_code into expected_code
  from public.logistics_delivery_secrets
  where delivery_id=d.id;

  if expected_code is null or expected_code<>trim(p_delivery_code) then
    raise exception 'Teslimat kodu geçersiz.';
  end if;

  update public.logistics_deliveries set status='teslim_onaylandi',
    payment_status='serbest_birakilmaya_hazir',
    requester_confirmed_at=timezone('utc',now()),
    requester_confirmed_by=auth.uid(),updated_at=timezone('utc',now())
  where id=d.id;
end;
$$;

notify pgrst,'reload schema';
commit;
