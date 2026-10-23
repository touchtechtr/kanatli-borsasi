begin;

create table if not exists public.logistics_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.logistics_requests(id) on delete restrict,
  quote_id uuid not null unique references public.logistics_quotes(id) on delete restrict,
  requester_company_id uuid not null references public.companies(id) on delete restrict,
  carrier_company_id uuid not null references public.companies(id) on delete restrict,
  vehicle_id uuid not null references public.logistics_vehicles(id) on delete restrict,
  agreed_amount numeric(14,2) not null check(agreed_amount>0),
  currency text not null default 'TRY',
  status text not null default 'odeme_bekliyor' check(status in
    ('odeme_bekliyor','yukleme_bekliyor','tasimada','teslim_onayi_bekliyor',
     'teslim_onaylandi','uyusmazlik','tamamlandi','iptal')),
  payment_status text not null default 'odeme_bekliyor' check(payment_status in
    ('odeme_bekliyor','havuzda','serbest_birakilmaya_hazir','serbest_birakildi','iade_edildi')),
  pickup_code text not null check(pickup_code ~ '^[0-9]{6}$'),
  delivery_code text not null check(delivery_code ~ '^[0-9]{6}$'),
  pickup_started_at timestamptz,
  pickup_started_by uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  delivered_by uuid references auth.users(id) on delete set null,
  requester_confirmed_at timestamptz,
  requester_confirmed_by uuid references auth.users(id) on delete set null,
  dispute_reason text,
  disputed_at timestamptz,
  disputed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.logistics_delivery_evidence (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.logistics_deliveries(id) on delete cascade,
  stage text not null check(stage in ('yukleme','teslimat','uyusmazlik','diger')),
  evidence_type text not null check(evidence_type in ('fotograf','video','tutanak','irsaliye','diger')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  file_size bigint check(file_size is null or file_size>0),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.logistics_payments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.logistics_deliveries(id) on delete restrict,
  request_id uuid not null references public.logistics_requests(id) on delete restrict,
  quote_id uuid not null references public.logistics_quotes(id) on delete restrict,
  requester_company_id uuid not null references public.companies(id) on delete restrict,
  carrier_company_id uuid not null references public.companies(id) on delete restrict,
  amount numeric(14,2) not null check(amount>0),
  currency text not null default 'TRY',
  status text not null default 'odeme_bekliyor' check(status in
    ('odeme_bekliyor','havuzda','serbest_birakildi','iade_edildi')),
  payment_reference text,
  admin_note text,
  held_at timestamptz,
  held_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  refunded_at timestamptz,
  refunded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create index if not exists logistics_deliveries_status_idx
  on public.logistics_deliveries(status,created_at desc);
create index if not exists logistics_evidence_delivery_stage_idx
  on public.logistics_delivery_evidence(delivery_id,stage);
create index if not exists logistics_payments_status_idx
  on public.logistics_payments(status,created_at desc);

create or replace function public.can_access_logistics_delivery(p_delivery_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select public.is_platform_admin() or exists(
    select 1 from public.logistics_deliveries d
    where d.id=p_delivery_id and (
      public.is_company_member(d.requester_company_id,null)
      or public.is_company_member(d.carrier_company_id,null)
      or exists(select 1 from public.companies c where c.id in(d.requester_company_id,d.carrier_company_id) and c.user_id=auth.uid())
    )
  );
$$;

create or replace function public.accept_logistics_quote(p_quote_id uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  q public.logistics_quotes%rowtype;
  r public.logistics_requests%rowtype;
  delivery_id uuid;
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

  insert into public.logistics_deliveries(
    request_id,quote_id,requester_company_id,carrier_company_id,vehicle_id,
    agreed_amount,currency,pickup_code,delivery_code
  ) values(
    r.id,q.id,r.company_id,q.carrier_company_id,q.vehicle_id,q.amount,q.currency,
    lpad((floor(random()*1000000))::int::text,6,'0'),
    lpad((floor(random()*1000000))::int::text,6,'0')
  ) returning id into delivery_id;

  insert into public.logistics_payments(
    delivery_id,request_id,quote_id,requester_company_id,carrier_company_id,
    amount,currency
  ) values(delivery_id,r.id,q.id,r.company_id,q.carrier_company_id,q.amount,q.currency);

  return delivery_id;
end;
$$;

create or replace function public.register_logistics_delivery_evidence(
  p_delivery_id uuid,p_stage text,p_evidence_type text,p_storage_path text,
  p_original_name text,p_mime_type text default null,p_file_size bigint default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare evidence_id uuid;
begin
  if not public.can_access_logistics_delivery(p_delivery_id) then
    raise exception 'Bu teslimat dosyasına erişim yetkiniz yok.';
  end if;
  insert into public.logistics_delivery_evidence(
    delivery_id,stage,evidence_type,storage_path,original_name,mime_type,file_size,uploaded_by
  ) values(
    p_delivery_id,p_stage,p_evidence_type,p_storage_path,p_original_name,p_mime_type,p_file_size,auth.uid()
  ) returning id into evidence_id;
  return evidence_id;
end;
$$;

create or replace function public.admin_review_logistics_payment(
  p_delivery_id uuid,p_action text,p_reference text default null,p_note text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
declare d public.logistics_deliveries%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_action not in ('havuz_onayla','serbest_birak','iade') then raise exception 'Geçersiz ödeme işlemi.'; end if;

  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Taşıma dosyası bulunamadı.'; end if;

  if p_action='havuz_onayla' then
    if d.status<>'odeme_bekliyor' or d.payment_status<>'odeme_bekliyor' then
      raise exception 'Ödeme havuza alınmaya uygun değil.';
    end if;
    update public.logistics_payments set status='havuzda',payment_reference=p_reference,
      admin_note=p_note,held_at=timezone('utc',now()),held_by=auth.uid(),updated_at=timezone('utc',now())
    where delivery_id=d.id;
    update public.logistics_deliveries set status='yukleme_bekliyor',payment_status='havuzda',
      updated_at=timezone('utc',now()) where id=d.id;

  elsif p_action='serbest_birak' then
    if d.status<>'teslim_onaylandi' or d.payment_status<>'serbest_birakilmaya_hazir' then
      raise exception 'Nakliye ödemesi serbest bırakılmaya hazır değil.';
    end if;
    update public.logistics_payments set status='serbest_birakildi',payment_reference=coalesce(p_reference,payment_reference),
      admin_note=p_note,released_at=timezone('utc',now()),released_by=auth.uid(),updated_at=timezone('utc',now())
    where delivery_id=d.id;
    update public.logistics_deliveries set status='tamamlandi',payment_status='serbest_birakildi',
      completed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=d.id;
    update public.logistics_requests set status='tamamlandi',updated_at=timezone('utc',now()) where id=d.request_id;

  else
    if d.payment_status not in ('havuzda','serbest_birakilmaya_hazir') then
      raise exception 'İade edilebilir havuz ödemesi bulunmuyor.';
    end if;
    update public.logistics_payments set status='iade_edildi',payment_reference=coalesce(p_reference,payment_reference),
      admin_note=p_note,refunded_at=timezone('utc',now()),refunded_by=auth.uid(),updated_at=timezone('utc',now())
    where delivery_id=d.id;
    update public.logistics_deliveries set status='iptal',payment_status='iade_edildi',
      completed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=d.id;
    update public.logistics_requests set status='iptal',updated_at=timezone('utc',now()) where id=d.request_id;
  end if;
end;
$$;

create or replace function public.start_logistics_delivery(p_delivery_id uuid,p_pickup_code text)
returns void
language plpgsql security definer set search_path=public
as $$
declare d public.logistics_deliveries%rowtype;
begin
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Taşıma dosyası bulunamadı.'; end if;
  if d.status<>'yukleme_bekliyor' or d.payment_status<>'havuzda' then
    raise exception 'Taşıma başlatılmaya uygun değil.';
  end if;
  if d.pickup_code<>trim(p_pickup_code) then raise exception 'Yükleme kodu geçersiz.'; end if;
  if not public.is_company_member(d.carrier_company_id,null)
     and not exists(select 1 from public.companies c where c.id=d.carrier_company_id and c.user_id=auth.uid()) then
    raise exception 'Taşımayı yalnızca eşleşen nakliyeci başlatabilir.';
  end if;
  if not exists(select 1 from public.logistics_delivery_evidence
    where delivery_id=d.id and stage='yukleme') then
    raise exception 'Taşıma başlamadan önce yükleme kanıtı yüklenmelidir.';
  end if;
  update public.logistics_deliveries set status='tasimada',pickup_started_at=timezone('utc',now()),
    pickup_started_by=auth.uid(),updated_at=timezone('utc',now()) where id=d.id;
end;
$$;

create or replace function public.mark_logistics_delivered(p_delivery_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare d public.logistics_deliveries%rowtype;
begin
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found or d.status<>'tasimada' then raise exception 'Taşıma teslim bildirimi için uygun değil.'; end if;
  if not public.is_company_member(d.carrier_company_id,null)
     and not exists(select 1 from public.companies c where c.id=d.carrier_company_id and c.user_id=auth.uid()) then
    raise exception 'Teslim bildirimini yalnızca eşleşen nakliyeci yapabilir.';
  end if;
  if not exists(select 1 from public.logistics_delivery_evidence
    where delivery_id=d.id and stage='teslimat') then
    raise exception 'Teslim bildirimi için teslimat kanıtı yüklenmelidir.';
  end if;
  update public.logistics_deliveries set status='teslim_onayi_bekliyor',
    delivered_at=timezone('utc',now()),delivered_by=auth.uid(),updated_at=timezone('utc',now())
  where id=d.id;
end;
$$;

create or replace function public.confirm_logistics_delivery(p_delivery_id uuid,p_delivery_code text)
returns void
language plpgsql security definer set search_path=public
as $$
declare d public.logistics_deliveries%rowtype;
begin
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found or d.status<>'teslim_onayi_bekliyor' then
    raise exception 'Teslimat alıcı onayına hazır değil.';
  end if;
  if d.delivery_code<>trim(p_delivery_code) then raise exception 'Teslimat kodu geçersiz.'; end if;
  if not public.is_company_member(d.requester_company_id,null)
     and not exists(select 1 from public.companies c where c.id=d.requester_company_id and c.user_id=auth.uid()) then
    raise exception 'Teslimatı yalnızca talep sahibi onaylayabilir.';
  end if;
  update public.logistics_deliveries set status='teslim_onaylandi',
    payment_status='serbest_birakilmaya_hazir',requester_confirmed_at=timezone('utc',now()),
    requester_confirmed_by=auth.uid(),updated_at=timezone('utc',now()) where id=d.id;
end;
$$;

create or replace function public.dispute_logistics_delivery(p_delivery_id uuid,p_reason text)
returns void
language plpgsql security definer set search_path=public
as $$
declare d public.logistics_deliveries%rowtype;
begin
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Uyuşmazlık açıklaması en az 10 karakter olmalıdır.'; end if;
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found or d.status not in ('yukleme_bekliyor','tasimada','teslim_onayi_bekliyor','teslim_onaylandi') then
    raise exception 'Bu taşıma dosyası uyuşmazlığa açılamaz.';
  end if;
  if not public.can_access_logistics_delivery(d.id) or public.is_platform_admin() then
    raise exception 'Uyuşmazlık açma yetkiniz yok.';
  end if;
  update public.logistics_deliveries set status='uyusmazlik',dispute_reason=trim(p_reason),
    disputed_at=timezone('utc',now()),disputed_by=auth.uid(),updated_at=timezone('utc',now())
  where id=d.id;
end;
$$;

alter table public.logistics_deliveries enable row level security;
alter table public.logistics_delivery_evidence enable row level security;
alter table public.logistics_payments enable row level security;

drop policy if exists logistics_deliveries_select on public.logistics_deliveries;
create policy logistics_deliveries_select on public.logistics_deliveries for select to authenticated
using(public.can_access_logistics_delivery(id));

drop policy if exists logistics_evidence_select on public.logistics_delivery_evidence;
create policy logistics_evidence_select on public.logistics_delivery_evidence for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

drop policy if exists logistics_payments_select on public.logistics_payments;
create policy logistics_payments_select on public.logistics_payments for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

grant execute on function public.can_access_logistics_delivery(uuid) to authenticated;
grant execute on function public.accept_logistics_quote(uuid) to authenticated;
grant execute on function public.register_logistics_delivery_evidence(uuid,text,text,text,text,text,bigint) to authenticated;
grant execute on function public.admin_review_logistics_payment(uuid,text,text,text) to authenticated;
grant execute on function public.start_logistics_delivery(uuid,text) to authenticated;
grant execute on function public.mark_logistics_delivered(uuid) to authenticated;
grant execute on function public.confirm_logistics_delivery(uuid,text) to authenticated;
grant execute on function public.dispute_logistics_delivery(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
