begin;

-- ============================================================
-- Lojistik işletmeleri, araç yetkinlikleri ve taşıma pazarı
-- Hassas belgeler özel depoda tutulur; halka açık sorgular yalnızca
-- onaylı hizmet ve taleplerin ticari özetini gösterir.
-- ============================================================

insert into public.activity_types
  (code, segment, name, description, requires_document, enabled, sort_order)
values
  ('logistics_operator','Lojistik','Nakliye İşletmecisi',
   'Onaylı araçlarıyla canlı hayvan, yem ve tarımsal ürün taşımacılığı yapar.',
   true,true,390)
on conflict (code) do update set
  segment=excluded.segment,name=excluded.name,description=excluded.description,
  requires_document=excluded.requires_document,enabled=true,sort_order=excluded.sort_order,
  updated_at=timezone('utc',now());

insert into public.activity_document_requirements
  (activity_code,code,name,description,required,accepted_mime_types,max_file_size_mb,sort_order)
values
 ('logistics_operator','transport_authorization','Taşıma yetki belgesi',
  'Geçerli taşıma yetki belgesi veya mesleki faaliyet izin belgesi.',true,
  array['application/pdf','image/jpeg','image/png']::text[],15,10),
 ('logistics_operator','trade_registration','Vergi / oda kayıt belgesi',
  'Firmanın taşımacılık faaliyetini gösteren güncel resmi belge.',true,
  array['application/pdf','image/jpeg','image/png']::text[],15,20),
 ('logistics_operator','responsible_identity','Yetkili kişi kimlik doğrulama belgesi',
  'Yalnızca yetkili yönetici ve firma sahibi tarafından görüntülenir.',true,
  array['application/pdf','image/jpeg','image/png']::text[],10,30),
 ('logistics_operator','liability_insurance','Taşıyıcı sorumluluk sigortası',
  'Geçerli poliçe veya teminat belgesi.',true,
  array['application/pdf','image/jpeg','image/png']::text[],15,40)
on conflict(activity_code,code) do update set
 name=excluded.name,description=excluded.description,required=excluded.required,
 accepted_mime_types=excluded.accepted_mime_types,max_file_size_mb=excluded.max_file_size_mb,
 sort_order=excluded.sort_order;

-- Eski iki lojistik etiketi yeni birleşik faaliyet modeline taşınır.
insert into public.company_activities(company_id,activity_code,status,source_application_id,approved_by,activated_at,expires_at,suspension_reason,updated_at)
select company_id,'logistics_operator',status,source_application_id,approved_by,activated_at,expires_at,suspension_reason,updated_at
from public.company_activities
where activity_code in ('animal_logistics','feed_logistics')
on conflict(company_id,activity_code) do update set
 status=excluded.status,expires_at=excluded.expires_at,updated_at=timezone('utc',now());

update public.activity_types
set enabled=false,updated_at=timezone('utc',now())
where code in ('animal_logistics','feed_logistics');

create table if not exists public.logistics_vehicles (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 plate text not null,
 vehicle_type text not null check(vehicle_type in
   ('kamyon','tir','kamyonet','silobas','frigofrik','hayvan_nakil_araci','diger')),
 brand_model text,
 model_year integer check(model_year is null or model_year between 1950 and 2100),
 capacity numeric(14,2) not null check(capacity>0),
 capacity_unit text not null check(capacity_unit in ('kg','ton','adet','palet','m3')),
 status text not null default 'taslak' check(status in
   ('taslak','inceleme_bekliyor','duzeltme_istendi','onaylandi','reddedildi','askida')),
 inspection_expires_at date,
 insurance_expires_at date,
 animal_transport_certificate_expires_at date,
 admin_note text,
 submitted_at timestamptz,
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now()),
 unique(company_id,plate)
);

create table if not exists public.logistics_vehicle_capabilities (
 vehicle_id uuid not null references public.logistics_vehicles(id) on delete cascade,
 capability text not null check(capability in
   ('canli_hayvan','dokme_yem','cuval_yem','tarimsal_urun','zirai_girdi','soguk_zincir')),
 primary key(vehicle_id,capability)
);

create table if not exists public.logistics_vehicle_documents (
 id uuid primary key default gen_random_uuid(),
 vehicle_id uuid not null references public.logistics_vehicles(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 document_type text not null check(document_type in
   ('ruhsat','sigorta','muayene','hayvan_tasima_izin','dezenfeksiyon','diger')),
 storage_path text not null unique,
 original_name text not null,
 mime_type text,
 file_size bigint check(file_size is null or file_size>0),
 uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default timezone('utc',now()),
 unique(vehicle_id,document_type)
);

create table if not exists public.logistics_listings (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 vehicle_id uuid not null references public.logistics_vehicles(id) on delete restrict,
 title text not null check(char_length(trim(title)) between 5 and 140),
 capability text not null check(capability in
   ('canli_hayvan','dokme_yem','cuval_yem','tarimsal_urun','zirai_girdi','soguk_zincir')),
 origin_city text not null,
 destination_city text,
 service_area text,
 available_from date not null,
 available_to date,
 price numeric(14,2) check(price is null or price>=0),
 price_unit text check(price_unit is null or price_unit in
   ('sefer','km','ton','kg','adet','teklif')),
 description text,
 status text not null default 'inceleme_bekliyor' check(status in
   ('taslak','inceleme_bekliyor','aktif','reddedildi','pasif','tamamlandi')),
 admin_note text,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now()),
 check(available_to is null or available_to>=available_from)
);

create table if not exists public.logistics_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 5 and 140),
 cargo_type text not null check(cargo_type in
   ('canli_hayvan','dokme_yem','cuval_yem','tarimsal_urun','zirai_girdi','soguk_zincir')),
 origin_city text not null,
 destination_city text not null,
 pickup_date date not null,
 quantity numeric(14,2) not null check(quantity>0),
 quantity_unit text not null check(quantity_unit in ('kg','ton','adet','palet','m3')),
 description text,
 status text not null default 'inceleme_bekliyor' check(status in
   ('inceleme_bekliyor','aktif','eslesme_yapildi','reddedildi','iptal','tamamlandi')),
 admin_note text,
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.logistics_quotes (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.logistics_requests(id) on delete cascade,
 carrier_company_id uuid not null references public.companies(id) on delete cascade,
 vehicle_id uuid not null references public.logistics_vehicles(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),
 currency text not null default 'TRY',
 message text,
 status text not null default 'beklemede' check(status in
   ('beklemede','kabul_edildi','reddedildi','geri_cekildi')),
 created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
 created_at timestamptz not null default timezone('utc',now()),
 updated_at timestamptz not null default timezone('utc',now()),
 unique(request_id,carrier_company_id)
);

create index if not exists logistics_vehicles_company_status_idx
 on public.logistics_vehicles(company_id,status);
create index if not exists logistics_listings_status_created_idx
 on public.logistics_listings(status,created_at desc);
create index if not exists logistics_requests_status_created_idx
 on public.logistics_requests(status,created_at desc);
create index if not exists logistics_quotes_request_status_idx
 on public.logistics_quotes(request_id,status);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('logistics-documents','logistics-documents',false,15728640,
 array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.get_my_logistics_access()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_company uuid; v_active boolean;
begin
 if v_user is null then return jsonb_build_object('authenticated',false); end if;
 select id into v_company from public.companies where user_id=v_user limit 1;
 if v_company is null then
  return jsonb_build_object('authenticated',true,'company_id',null,'active',false);
 end if;
 v_active:=public.company_has_any_active_activity(v_company,
   array['logistics_operator','animal_logistics','feed_logistics']);
 return jsonb_build_object('authenticated',true,'company_id',v_company,'active',v_active);
end $$;

create or replace function public.save_logistics_vehicle(p_data jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_company uuid; v_id uuid;
begin
 if v_user is null then raise exception 'Oturum gerekiyor.'; end if;
 select id into v_company from public.companies
  where user_id=v_user and status::text='onaylandi' limit 1;
 if v_company is null then raise exception 'Onaylı şirket bulunamadı.'; end if;
 if not public.company_has_any_active_activity(v_company,
    array['logistics_operator','animal_logistics','feed_logistics']) then
  raise exception 'Onaylı nakliye faaliyeti gerekiyor.';
 end if;
 v_id:=nullif(p_data->>'id','')::uuid;
 if v_id is null then
  insert into public.logistics_vehicles(company_id,plate,vehicle_type,brand_model,model_year,
    capacity,capacity_unit,inspection_expires_at,insurance_expires_at,
    animal_transport_certificate_expires_at,created_by)
  values(v_company,upper(regexp_replace(p_data->>'plate','\s+','','g')),
    p_data->>'vehicle_type',nullif(p_data->>'brand_model',''),
    nullif(p_data->>'model_year','')::integer,(p_data->>'capacity')::numeric,
    p_data->>'capacity_unit',nullif(p_data->>'inspection_expires_at','')::date,
    nullif(p_data->>'insurance_expires_at','')::date,
    nullif(p_data->>'animal_transport_certificate_expires_at','')::date,v_user)
  returning id into v_id;
 else
  update public.logistics_vehicles set
   plate=upper(regexp_replace(p_data->>'plate','\s+','','g')),
   vehicle_type=p_data->>'vehicle_type',brand_model=nullif(p_data->>'brand_model',''),
   model_year=nullif(p_data->>'model_year','')::integer,
   capacity=(p_data->>'capacity')::numeric,capacity_unit=p_data->>'capacity_unit',
   inspection_expires_at=nullif(p_data->>'inspection_expires_at','')::date,
   insurance_expires_at=nullif(p_data->>'insurance_expires_at','')::date,
   animal_transport_certificate_expires_at=nullif(p_data->>'animal_transport_certificate_expires_at','')::date,
   status='taslak',admin_note=null,updated_at=timezone('utc',now())
  where id=v_id and company_id=v_company;
  if not found then raise exception 'Araç bulunamadı.'; end if;
 end if;
 delete from public.logistics_vehicle_capabilities where vehicle_id=v_id;
 insert into public.logistics_vehicle_capabilities(vehicle_id,capability)
 select v_id,value from jsonb_array_elements_text(coalesce(p_data->'capabilities','[]'::jsonb))
 where value in ('canli_hayvan','dokme_yem','cuval_yem','tarimsal_urun','zirai_girdi','soguk_zincir')
 on conflict do nothing;
 return v_id;
end $$;

create or replace function public.register_logistics_vehicle_document(
 p_vehicle_id uuid,p_document_type text,p_storage_path text,p_original_name text,
 p_mime_type text default null,p_file_size bigint default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_company uuid; v_id uuid;
begin
 select company_id into v_company from public.logistics_vehicles
 where id=p_vehicle_id and created_by=auth.uid();
 if v_company is null then raise exception 'Araç bulunamadı.'; end if;
 insert into public.logistics_vehicle_documents(vehicle_id,company_id,document_type,
  storage_path,original_name,mime_type,file_size,uploaded_by)
 values(p_vehicle_id,v_company,p_document_type,p_storage_path,p_original_name,p_mime_type,p_file_size,auth.uid())
 on conflict(vehicle_id,document_type) do update set storage_path=excluded.storage_path,
  original_name=excluded.original_name,mime_type=excluded.mime_type,file_size=excluded.file_size,
  uploaded_by=auth.uid(),created_at=timezone('utc',now())
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.submit_logistics_vehicle(p_vehicle_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_missing text;
begin
 if not exists(select 1 from public.logistics_vehicles where id=p_vehicle_id and created_by=auth.uid())
 then raise exception 'Araç bulunamadı.'; end if;
 if not exists(select 1 from public.logistics_vehicle_capabilities where vehicle_id=p_vehicle_id)
 then raise exception 'En az bir taşıma yetkinliği seçin.'; end if;
 select string_agg(x.t,', ') into v_missing
 from (values('ruhsat'),('sigorta'),('muayene')) x(t)
 where not exists(select 1 from public.logistics_vehicle_documents d
   where d.vehicle_id=p_vehicle_id and d.document_type=x.t);
 if v_missing is not null then raise exception 'Eksik araç belgeleri: %',v_missing; end if;
 update public.logistics_vehicles set status='inceleme_bekliyor',
  submitted_at=timezone('utc',now()),updated_at=timezone('utc',now())
 where id=p_vehicle_id and created_by=auth.uid();
end $$;

create or replace function public.admin_review_logistics_vehicle(
 p_vehicle_id uuid,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
 if p_action not in ('onayla','reddet','duzeltme','askiya_al')
 then raise exception 'Geçersiz işlem.'; end if;
 update public.logistics_vehicles set
  status=case p_action when 'onayla' then 'onaylandi' when 'reddet' then 'reddedildi'
    when 'duzeltme' then 'duzeltme_istendi' else 'askida' end,
  admin_note=p_note,reviewed_at=timezone('utc',now()),reviewed_by=auth.uid(),
  updated_at=timezone('utc',now())
 where id=p_vehicle_id;
 if not found then raise exception 'Araç bulunamadı.'; end if;
end $$;

create or replace function public.create_logistics_listing(p_data jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_company uuid; v_vehicle uuid; v_cap text; v_id uuid;
begin
 select id into v_company from public.companies where user_id=v_user and status::text='onaylandi';
 v_vehicle:=(p_data->>'vehicle_id')::uuid; v_cap:=p_data->>'capability';
 if not public.company_has_any_active_activity(v_company,array['logistics_operator','animal_logistics','feed_logistics'])
 then raise exception 'Onaylı nakliye faaliyeti gerekiyor.'; end if;
 if not exists(select 1 from public.logistics_vehicles v
  join public.logistics_vehicle_capabilities c on c.vehicle_id=v.id
  where v.id=v_vehicle and v.company_id=v_company and v.status='onaylandi' and c.capability=v_cap)
 then raise exception 'Seçilen araç bu taşıma türü için onaylı değil.'; end if;
 insert into public.logistics_listings(company_id,vehicle_id,title,capability,origin_city,
  destination_city,service_area,available_from,available_to,price,price_unit,description,created_by)
 values(v_company,v_vehicle,p_data->>'title',v_cap,p_data->>'origin_city',
  nullif(p_data->>'destination_city',''),nullif(p_data->>'service_area',''),
  (p_data->>'available_from')::date,nullif(p_data->>'available_to','')::date,
  nullif(p_data->>'price','')::numeric,nullif(p_data->>'price_unit',''),
  nullif(p_data->>'description',''),v_user) returning id into v_id;
 return v_id;
end $$;

create or replace function public.create_logistics_request(p_data jsonb)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_company uuid; v_id uuid;
begin
 select id into v_company from public.companies where user_id=auth.uid() and status::text='onaylandi';
 if v_company is null then raise exception 'Onaylı şirket gerekiyor.'; end if;
 insert into public.logistics_requests(company_id,title,cargo_type,origin_city,destination_city,
  pickup_date,quantity,quantity_unit,description,created_by)
 values(v_company,p_data->>'title',p_data->>'cargo_type',p_data->>'origin_city',
  p_data->>'destination_city',(p_data->>'pickup_date')::date,
  (p_data->>'quantity')::numeric,p_data->>'quantity_unit',nullif(p_data->>'description',''),auth.uid())
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.submit_logistics_quote(p_request_id uuid,p_vehicle_id uuid,
 p_amount numeric,p_message text default null)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_company uuid; v_owner uuid; v_cargo text; v_id uuid;
begin
 select id into v_company from public.companies where user_id=auth.uid() and status::text='onaylandi';
 select company_id,cargo_type into v_owner,v_cargo from public.logistics_requests
  where id=p_request_id and status='aktif';
 if v_owner is null then raise exception 'Aktif taşıma talebi bulunamadı.'; end if;
 if v_owner=v_company then raise exception 'Kendi talebinize teklif veremezsiniz.'; end if;
 if not exists(select 1 from public.logistics_vehicles v
  join public.logistics_vehicle_capabilities c on c.vehicle_id=v.id
  where v.id=p_vehicle_id and v.company_id=v_company and v.status='onaylandi' and c.capability=v_cargo)
 then raise exception 'Bu yük türü için onaylı aracınız bulunmuyor.'; end if;
 insert into public.logistics_quotes(request_id,carrier_company_id,vehicle_id,amount,message,created_by)
 values(p_request_id,v_company,p_vehicle_id,p_amount,p_message,auth.uid())
 on conflict(request_id,carrier_company_id) do update set vehicle_id=excluded.vehicle_id,
  amount=excluded.amount,message=excluded.message,status='beklemede',
  updated_at=timezone('utc',now())
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.admin_review_logistics_market_item(
 p_kind text,p_id uuid,p_action text,p_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
 if p_action not in ('onayla','reddet') then raise exception 'Geçersiz işlem.'; end if;
 if p_kind='listing' then
  update public.logistics_listings set status=case when p_action='onayla' then 'aktif' else 'reddedildi' end,
   admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where id=p_id;
 elsif p_kind='request' then
  update public.logistics_requests set status=case when p_action='onayla' then 'aktif' else 'reddedildi' end,
   admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where id=p_id;
 else raise exception 'Geçersiz kayıt türü.'; end if;
 if not found then raise exception 'Kayıt bulunamadı.'; end if;
end $$;

alter table public.logistics_vehicles enable row level security;
alter table public.logistics_vehicle_capabilities enable row level security;
alter table public.logistics_vehicle_documents enable row level security;
alter table public.logistics_listings enable row level security;
alter table public.logistics_requests enable row level security;
alter table public.logistics_quotes enable row level security;

drop policy if exists logistics_vehicles_select on public.logistics_vehicles;
create policy logistics_vehicles_select on public.logistics_vehicles for select to authenticated
using(is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));

drop policy if exists logistics_capabilities_select on public.logistics_vehicle_capabilities;
create policy logistics_capabilities_select on public.logistics_vehicle_capabilities for select to authenticated
using(exists(select 1 from public.logistics_vehicles v join public.companies c on c.id=v.company_id
 where v.id=vehicle_id and (c.user_id=auth.uid() or is_platform_admin())));

drop policy if exists logistics_documents_select on public.logistics_vehicle_documents;
create policy logistics_documents_select on public.logistics_vehicle_documents for select to authenticated
using(is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));

drop policy if exists logistics_listings_select on public.logistics_listings;
create policy logistics_listings_select on public.logistics_listings for select to public
using(status='aktif' or is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));

drop policy if exists logistics_requests_select on public.logistics_requests;
create policy logistics_requests_select on public.logistics_requests for select to authenticated
using(status='aktif' or is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));

drop policy if exists logistics_quotes_select on public.logistics_quotes;
create policy logistics_quotes_select on public.logistics_quotes for select to authenticated
using(is_platform_admin() or exists(select 1 from public.companies c where c.id=carrier_company_id and c.user_id=auth.uid())
 or exists(select 1 from public.logistics_requests r join public.companies c on c.id=r.company_id
  where r.id=request_id and c.user_id=auth.uid()));

drop policy if exists logistics_storage_select on storage.objects;
create policy logistics_storage_select on storage.objects for select to authenticated
using(bucket_id='logistics-documents' and (
 is_platform_admin() or exists(select 1 from public.logistics_vehicle_documents d
 join public.companies c on c.id=d.company_id where d.storage_path=name and c.user_id=auth.uid())
));

drop policy if exists logistics_storage_insert on storage.objects;
create policy logistics_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='logistics-documents' and exists(
 select 1 from public.companies c where c.user_id=auth.uid()
 and (storage.foldername(name))[1]=c.id::text
));

grant execute on function public.get_my_logistics_access() to authenticated;
grant execute on function public.save_logistics_vehicle(jsonb) to authenticated;
grant execute on function public.register_logistics_vehicle_document(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.submit_logistics_vehicle(uuid) to authenticated;
grant execute on function public.admin_review_logistics_vehicle(uuid,text,text) to authenticated;
grant execute on function public.create_logistics_listing(jsonb) to authenticated;
grant execute on function public.create_logistics_request(jsonb) to authenticated;
grant execute on function public.submit_logistics_quote(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.admin_review_logistics_market_item(text,uuid,text,text) to authenticated;

commit;