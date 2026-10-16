begin;

insert into public.activity_types(code,segment,name,description,requires_document,sort_order) values
('slaughterhouse_buyer','Kesimhane Alımı','Kesimhane Hayvan Alıcısı','Kesimhane adına toplu canlı hayvan alım talebi açar.',true,215),
('meat_processor','İşleme ve Hizmet','Et İşleme Tesisi','Kesim sonrası et işleme faaliyeti yürütür.',true,216)
on conflict(code) do update set name=excluded.name,description=excluded.description,enabled=true,updated_at=timezone('utc',now());

insert into public.activity_document_requirements(activity_code,code,name,description,required,sort_order) values
('slaughterhouse_buyer','operating_license','Kesimhane çalışma/onay belgesi','Toplu alım yapacak tesise ait güncel izin.',true,10),
('meat_processor','operating_license','Et işleme tesisi izin belgesi',null,true,10)
on conflict(activity_code,code) do update set name=excluded.name,description=excluded.description,required=excluded.required;

create table if not exists public.slaughterhouse_purchase_requests(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  slaughterhouse_id uuid references public.slaughterhouses(id) on delete set null,
  title text not null,
  animal_type text not null,
  breed text,
  quantity_required integer not null check(quantity_required>0),
  min_live_weight numeric,
  max_live_weight numeric,
  price_model text not null check(price_model in ('sabit_kg','sabit_bas','kapali_teklif','cerceve_program')),
  target_price numeric,
  city text not null,
  delivery_address text,
  delivery_start date not null,
  delivery_end date not null,
  health_requirements text,
  expert_required boolean not null default false,
  transport_responsibility text not null default 'satici' check(transport_responsibility in ('satici','kesimhane','anlasmali')),
  payment_terms text,
  description text,
  status text not null default 'acik' check(status in ('taslak','acik','eslesme_yapildi','kapali','iptal')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  check(delivery_end>=delivery_start)
);

create table if not exists public.slaughterhouse_purchase_offers(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.slaughterhouse_purchase_requests(id) on delete cascade,
  seller_company_id uuid not null references public.companies(id) on delete cascade,
  livestock_listing_id uuid references public.livestock_listings(id) on delete set null,
  quantity integer not null check(quantity>0),
  average_live_weight numeric,
  unit_price numeric not null check(unit_price>0),
  price_unit text not null check(price_unit in ('kg_canli','bas')),
  proposed_delivery_date date not null,
  transport_included boolean not null default false,
  message text,
  status text not null default 'beklemede' check(status in ('beklemede','kabul_edildi','reddedildi','geri_cekildi')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(request_id,seller_company_id)
);

create table if not exists public.slaughterhouse_deliveries(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.slaughterhouse_purchase_requests(id) on delete restrict,
  offer_id uuid not null unique references public.slaughterhouse_purchase_offers(id) on delete restrict,
  buyer_company_id uuid not null references public.companies(id),
  seller_company_id uuid not null references public.companies(id),
  delivery_code text not null,
  planned_quantity integer not null,
  delivered_quantity integer,
  rejected_quantity integer not null default 0,
  total_live_weight numeric,
  vehicle_plate text,
  weighbridge_document_no text,
  delivery_notes text,
  buyer_confirmed_at timestamptz,
  buyer_confirmed_by uuid references auth.users(id),
  seller_confirmed_at timestamptz,
  seller_confirmed_by uuid references auth.users(id),
  dispute_reason text,
  disputed_at timestamptz,
  status text not null default 'teslimat_bekleniyor' check(status in ('teslimat_bekleniyor','alici_onayladi','teslim_onaylandi','uyusmazlik','tamamlandi','iptal')),
  payment_status text not null default 'onay_bekliyor' check(payment_status in ('onay_bekliyor','serbest_birakilmaya_hazir','serbest_birakildi','uyusmazlikta_bekletiliyor','iade_edildi')),
  payment_released_at timestamptz,
  payment_released_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.slaughterhouse_delivery_evidence(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.slaughterhouse_deliveries(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  evidence_type text not null check(evidence_type in ('fotoğraf','video','tartim_fisi','teslim_tutanagi','saglik_belgesi','diger')),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  file_hash text,
  captured_at timestamptz,
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default timezone('utc',now())
);

alter table public.slaughterhouse_purchase_requests enable row level security;
alter table public.slaughterhouse_purchase_offers enable row level security;
alter table public.slaughterhouse_deliveries enable row level security;
alter table public.slaughterhouse_delivery_evidence enable row level security;

create or replace function public.can_access_slaughter_delivery(p_delivery_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.slaughterhouse_deliveries d
    where d.id=p_delivery_id and (
      public.is_platform_admin() or
      public.is_company_member(d.buyer_company_id,null) or
      public.is_company_member(d.seller_company_id,null) or
      exists(select 1 from public.companies c where c.id in(d.buyer_company_id,d.seller_company_id) and c.user_id=auth.uid())
    )
  );
$$;

drop policy if exists purchase_requests_select on public.slaughterhouse_purchase_requests;
create policy purchase_requests_select on public.slaughterhouse_purchase_requests for select to authenticated using(status='acik' or public.is_platform_admin() or public.is_company_member(company_id,null) or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
drop policy if exists purchase_offers_select on public.slaughterhouse_purchase_offers;
create policy purchase_offers_select on public.slaughterhouse_purchase_offers for select to authenticated using(public.is_platform_admin() or public.is_company_member(seller_company_id,null) or exists(select 1 from public.companies c where c.id=seller_company_id and c.user_id=auth.uid()) or exists(select 1 from public.slaughterhouse_purchase_requests r join public.companies c on c.id=r.company_id where r.id=request_id and c.user_id=auth.uid()));
drop policy if exists deliveries_select on public.slaughterhouse_deliveries;
create policy deliveries_select on public.slaughterhouse_deliveries for select to authenticated using(public.can_access_slaughter_delivery(id));
drop policy if exists evidence_select on public.slaughterhouse_delivery_evidence;
create policy evidence_select on public.slaughterhouse_delivery_evidence for select to authenticated using(public.can_access_slaughter_delivery(delivery_id));
drop policy if exists evidence_insert on public.slaughterhouse_delivery_evidence;
create policy evidence_insert on public.slaughterhouse_delivery_evidence for insert to authenticated with check(uploaded_by=auth.uid() and public.can_access_slaughter_delivery(delivery_id));

grant select on public.slaughterhouse_purchase_requests,public.slaughterhouse_purchase_offers,public.slaughterhouse_deliveries,public.slaughterhouse_delivery_evidence to authenticated;
grant insert on public.slaughterhouse_delivery_evidence to authenticated;

create or replace function public.create_slaughterhouse_purchase_request(p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.companies; result_id uuid;
begin
  if public.is_platform_admin() then raise exception 'Platform personeli ticari işlem başlatamaz.'; end if;
  select * into c from public.companies where user_id=auth.uid() and status::text='onaylandi';
  if c.id is null then raise exception 'Onaylı şirket hesabı gerekiyor.'; end if;
  if not public.company_has_any_active_activity(c.id,array['slaughterhouse_operator','slaughterhouse_buyer']) then raise exception 'Kesimhane alım yetkiniz bulunmuyor.'; end if;
  insert into public.slaughterhouse_purchase_requests(company_id,slaughterhouse_id,title,animal_type,breed,quantity_required,min_live_weight,max_live_weight,price_model,target_price,city,delivery_address,delivery_start,delivery_end,health_requirements,expert_required,transport_responsibility,payment_terms,description,created_by)
  values(c.id,nullif(p_data->>'slaughterhouse_id','')::uuid,p_data->>'title',p_data->>'animal_type',nullif(p_data->>'breed',''),(p_data->>'quantity_required')::integer,nullif(p_data->>'min_live_weight','')::numeric,nullif(p_data->>'max_live_weight','')::numeric,p_data->>'price_model',nullif(p_data->>'target_price','')::numeric,p_data->>'city',nullif(p_data->>'delivery_address',''),(p_data->>'delivery_start')::date,(p_data->>'delivery_end')::date,nullif(p_data->>'health_requirements',''),coalesce((p_data->>'expert_required')::boolean,false),coalesce(p_data->>'transport_responsibility','satici'),nullif(p_data->>'payment_terms',''),nullif(p_data->>'description',''),auth.uid()) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.submit_slaughterhouse_purchase_offer(p_request_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.companies; r public.slaughterhouse_purchase_requests; result_id uuid;
begin
  if public.is_platform_admin() then raise exception 'Platform personeli ticari işlem başlatamaz.'; end if;
  select * into c from public.companies where user_id=auth.uid() and status::text='onaylandi';
  select * into r from public.slaughterhouse_purchase_requests where id=p_request_id and status='acik';
  if c.id is null or r.id is null then raise exception 'Şirket veya açık alım talebi bulunamadı.'; end if;
  if c.id=r.company_id or public.companies_have_conflict(c.id,r.company_id) then raise exception 'Kendi veya bağlantılı şirketinizin talebine teklif veremezsiniz.'; end if;
  if not public.company_has_any_active_activity(c.id,array['animal_breeder','animal_seller','poultry_breeder','hatchery','chick_producer']) then raise exception 'Canlı hayvan satış yetkiniz bulunmuyor.'; end if;
  insert into public.slaughterhouse_purchase_offers(request_id,seller_company_id,livestock_listing_id,quantity,average_live_weight,unit_price,price_unit,proposed_delivery_date,transport_included,message,created_by)
  values(p_request_id,c.id,nullif(p_data->>'livestock_listing_id','')::uuid,(p_data->>'quantity')::integer,nullif(p_data->>'average_live_weight','')::numeric,(p_data->>'unit_price')::numeric,p_data->>'price_unit',(p_data->>'proposed_delivery_date')::date,coalesce((p_data->>'transport_included')::boolean,false),nullif(p_data->>'message',''),auth.uid()) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.accept_slaughterhouse_purchase_offer(p_offer_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare o public.slaughterhouse_purchase_offers; r public.slaughterhouse_purchase_requests; d_id uuid;
begin
  select * into o from public.slaughterhouse_purchase_offers where id=p_offer_id for update;
  select * into r from public.slaughterhouse_purchase_requests where id=o.request_id for update;
  if not exists(select 1 from public.companies c where c.id=r.company_id and c.user_id=auth.uid()) then raise exception 'Bu alım talebini yönetme yetkiniz yok.'; end if;
  update public.slaughterhouse_purchase_offers set status=case when id=p_offer_id then 'kabul_edildi' else 'reddedildi' end,updated_at=timezone('utc',now()) where request_id=r.id and status='beklemede';
  update public.slaughterhouse_purchase_requests set status='eslesme_yapildi',updated_at=timezone('utc',now()) where id=r.id;
  insert into public.slaughterhouse_deliveries(request_id,offer_id,buyer_company_id,seller_company_id,delivery_code,planned_quantity)
  values(r.id,o.id,r.company_id,o.seller_company_id,lpad((floor(random()*1000000))::int::text,6,'0'),o.quantity) returning id into d_id;
  return d_id;
end; $$;

create or replace function public.confirm_slaughterhouse_delivery(p_delivery_id uuid,p_code text,p_data jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d public.slaughterhouse_deliveries; evidence_count integer; total_value numeric;
begin
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if not exists(select 1 from public.companies c where c.id=d.buyer_company_id and c.user_id=auth.uid()) then raise exception 'Alıcı şirket yetkisi gerekiyor.'; end if;
  if d.delivery_code<>p_code then raise exception 'Teslimat kodu hatalı.'; end if;
  select count(*) into evidence_count from public.slaughterhouse_delivery_evidence where delivery_id=d.id and evidence_type in ('video','fotoğraf','tartim_fisi');
  select o.unit_price * case when o.price_unit='bas' then (p_data->>'delivered_quantity')::numeric else (p_data->>'total_live_weight')::numeric end into total_value from public.slaughterhouse_purchase_offers o where o.id=d.offer_id;
  if (total_value>=100000 or coalesce((p_data->>'rejected_quantity')::integer,0)>0) and evidence_count=0 then raise exception 'Yüksek tutarlı veya farklılık bulunan teslimatta fotoğraf, video ya da tartım belgesi zorunludur.'; end if;
  update public.slaughterhouse_deliveries set delivered_quantity=(p_data->>'delivered_quantity')::integer,rejected_quantity=coalesce((p_data->>'rejected_quantity')::integer,0),total_live_weight=nullif(p_data->>'total_live_weight','')::numeric,vehicle_plate=nullif(p_data->>'vehicle_plate',''),weighbridge_document_no=nullif(p_data->>'weighbridge_document_no',''),delivery_notes=nullif(p_data->>'delivery_notes',''),buyer_confirmed_at=timezone('utc',now()),buyer_confirmed_by=auth.uid(),status='alici_onayladi',updated_at=timezone('utc',now()) where id=d.id;
end; $$;

create or replace function public.seller_confirm_slaughterhouse_delivery(p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.slaughterhouse_deliveries;
begin
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if not exists(select 1 from public.companies c where c.id=d.seller_company_id and c.user_id=auth.uid()) then raise exception 'Satıcı şirket yetkisi gerekiyor.'; end if;
  if d.status<>'alici_onayladi' then raise exception 'Önce alıcı teslimatı onaylamalıdır.'; end if;
  update public.slaughterhouse_deliveries set seller_confirmed_at=timezone('utc',now()),seller_confirmed_by=auth.uid(),status='teslim_onaylandi',payment_status='serbest_birakilmaya_hazir',updated_at=timezone('utc',now()) where id=d.id;
end; $$;

create or replace function public.dispute_slaughterhouse_delivery(p_delivery_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_access_slaughter_delivery(p_delivery_id) or public.is_platform_admin() then raise exception 'Uyuşmazlık açma yetkiniz yok.'; end if;
  update public.slaughterhouse_deliveries set status='uyusmazlik',payment_status='uyusmazlikta_bekletiliyor',dispute_reason=nullif(btrim(p_reason),''),disputed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_delivery_id and status not in('tamamlandi','iptal');
end; $$;

create or replace function public.admin_release_slaughterhouse_payment(p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  update public.slaughterhouse_deliveries set status='tamamlandi',payment_status='serbest_birakildi',payment_released_at=timezone('utc',now()),payment_released_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_delivery_id and status='teslim_onaylandi' and payment_status='serbest_birakilmaya_hazir';
  if not found then raise exception 'Ödeme serbest bırakılmaya hazır değil.'; end if;
end; $$;

revoke all on function public.create_slaughterhouse_purchase_request(jsonb),public.submit_slaughterhouse_purchase_offer(uuid,jsonb),public.accept_slaughterhouse_purchase_offer(uuid),public.confirm_slaughterhouse_delivery(uuid,text,jsonb),public.seller_confirm_slaughterhouse_delivery(uuid),public.dispute_slaughterhouse_delivery(uuid,text),public.admin_release_slaughterhouse_payment(uuid) from public,anon;
grant execute on function public.create_slaughterhouse_purchase_request(jsonb),public.submit_slaughterhouse_purchase_offer(uuid,jsonb),public.accept_slaughterhouse_purchase_offer(uuid),public.confirm_slaughterhouse_delivery(uuid,text,jsonb),public.seller_confirm_slaughterhouse_delivery(uuid),public.dispute_slaughterhouse_delivery(uuid,text),public.admin_release_slaughterhouse_payment(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('slaughterhouse-delivery-evidence','slaughterhouse-delivery-evidence',false,104857600,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf']) on conflict(id) do update set file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists delivery_evidence_storage_insert on storage.objects;
create policy delivery_evidence_storage_insert on storage.objects for insert to authenticated with check(bucket_id='slaughterhouse-delivery-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists delivery_evidence_storage_select on storage.objects;
create policy delivery_evidence_storage_select on storage.objects for select to authenticated using(bucket_id='slaughterhouse-delivery-evidence' and exists(select 1 from public.slaughterhouse_delivery_evidence e where e.storage_path=name and public.can_access_slaughter_delivery(e.delivery_id)));

do $$ begin
  if to_regprocedure('public.block_platform_staff_commerce()') is not null then
    drop trigger if exists block_platform_staff_commerce_trigger on public.slaughterhouse_purchase_requests;
    create trigger block_platform_staff_commerce_trigger before insert on public.slaughterhouse_purchase_requests for each row execute function public.block_platform_staff_commerce();
    drop trigger if exists block_platform_staff_commerce_trigger on public.slaughterhouse_purchase_offers;
    create trigger block_platform_staff_commerce_trigger before insert on public.slaughterhouse_purchase_offers for each row execute function public.block_platform_staff_commerce();
  end if;
end $$;

-- Yeni kesimhane alım akışındaki bütün hareketleri yönetim hareket kaydına ekler.
do $$
declare table_name_value text;
begin
  if to_regprocedure('public.record_platform_audit_event()') is not null then
    foreach table_name_value in array array[
      'slaughterhouse_purchase_requests',
      'slaughterhouse_purchase_offers',
      'slaughterhouse_deliveries',
      'slaughterhouse_delivery_evidence'
    ] loop
      execute format('drop trigger if exists platform_audit_trigger on public.%I', table_name_value);
      execute format('create trigger platform_audit_trigger after insert or update or delete on public.%I for each row execute function public.record_platform_audit_event()', table_name_value);
    end loop;
  end if;
end $$;

-- Karşı taraf bildirimlerini üretir. Var olan e-posta kuyruğu tetikleyicisi bu
-- kayıtları otomatik olarak e-postaya dönüştürür.
create or replace function public.notify_slaughterhouse_purchase_event()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  buyer_user uuid;
  seller_user uuid;
  request_id_value uuid;
  request_title text;
  target_user uuid;
  notification_title text;
  notification_message text;
  notification_link text;
begin
  if tg_table_name='slaughterhouse_purchase_offers' then
    request_id_value:=new.request_id;
    select r.title,c.user_id into request_title,buyer_user
    from public.slaughterhouse_purchase_requests r
    join public.companies c on c.id=r.company_id
    where r.id=request_id_value;
    select c.user_id into seller_user from public.companies c where c.id=new.seller_company_id;

    if tg_op='INSERT' then
      target_user:=buyer_user;
      notification_title:='Yeni kesimhane alım teklifi';
      notification_message:=request_title||' talebinize yeni bir teklif gönderildi.';
    elsif new.status is distinct from old.status then
      target_user:=seller_user;
      notification_title:='Kesimhane teklifiniz güncellendi';
      notification_message:=request_title||' teklifinizin durumu: '||new.status||'.';
    else
      return new;
    end if;
    notification_link:='/kesimhane/alim-merkezi/'||request_id_value;

  elsif tg_table_name='slaughterhouse_deliveries' then
    request_id_value:=new.request_id;
    select r.title into request_title from public.slaughterhouse_purchase_requests r where r.id=request_id_value;
    select c.user_id into buyer_user from public.companies c where c.id=new.buyer_company_id;
    select c.user_id into seller_user from public.companies c where c.id=new.seller_company_id;

    if tg_op='INSERT' then
      target_user:=seller_user;
      notification_title:='Teklifiniz kabul edildi';
      notification_message:=request_title||' için teslimat süreci başlatıldı.';
    elsif new.status is distinct from old.status then
      notification_title:='Kesimhane teslimat durumu güncellendi';
      notification_message:=request_title||' teslimatının yeni durumu: '||new.status||'.';
      notification_link:='/kesimhane/alim-merkezi/'||request_id_value;
      insert into public.notifications(recipient_user_id,actor_user_id,entity_type,entity_id,event_type,title,message,link)
      select uid,auth.uid(),'Kesimhane alımı',new.id,'slaughterhouse_delivery_status',notification_title,notification_message,notification_link
      from (values(buyer_user),(seller_user)) users(uid)
      where uid is not null and uid is distinct from auth.uid();
      return new;
    else
      return new;
    end if;
    notification_link:='/kesimhane/alim-merkezi/'||request_id_value;
  else
    return new;
  end if;

  if target_user is not null and target_user is distinct from auth.uid() then
    insert into public.notifications(recipient_user_id,actor_user_id,entity_type,entity_id,event_type,title,message,link)
    values(target_user,auth.uid(),'Kesimhane alımı',new.id,'slaughterhouse_purchase_update',notification_title,notification_message,notification_link);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_slaughterhouse_offer_event on public.slaughterhouse_purchase_offers;
create trigger notify_slaughterhouse_offer_event
after insert or update on public.slaughterhouse_purchase_offers
for each row execute function public.notify_slaughterhouse_purchase_event();

drop trigger if exists notify_slaughterhouse_delivery_event on public.slaughterhouse_deliveries;
create trigger notify_slaughterhouse_delivery_event
after insert or update on public.slaughterhouse_deliveries
for each row execute function public.notify_slaughterhouse_purchase_event();

revoke all on function public.notify_slaughterhouse_purchase_event() from public,anon,authenticated;

commit;
