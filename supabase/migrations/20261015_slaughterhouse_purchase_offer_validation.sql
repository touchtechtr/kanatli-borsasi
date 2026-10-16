begin;

create or replace function public.submit_slaughterhouse_purchase_offer(
  p_request_id uuid,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.companies;
  r public.slaughterhouse_purchase_requests;
  result_id uuid;
  offered_quantity integer;
  offered_price numeric;
  offered_date date;
  offered_weight numeric;
  offered_price_unit text;
begin
  if auth.uid() is null then raise exception 'Bu işlem için giriş yapmalısınız.'; end if;
  if public.is_platform_admin() then raise exception 'Platform personeli ticari işlem başlatamaz.'; end if;

  select * into c from public.companies
  where user_id=auth.uid() and status::text='onaylandi';
  select * into r from public.slaughterhouse_purchase_requests
  where id=p_request_id and status='acik';

  if c.id is null then raise exception 'Onaylı şirket hesabı gerekiyor.'; end if;
  if r.id is null then raise exception 'Yalnızca yönetim tarafından onaylanmış açık alım taleplerine teklif verilebilir.'; end if;
  if c.id=r.company_id or public.companies_have_conflict(c.id,r.company_id) then
    raise exception 'Kendi veya bağlantılı şirketinizin talebine teklif veremezsiniz.';
  end if;
  if not public.company_has_any_active_activity(c.id,array['animal_breeder','animal_seller','poultry_breeder','hatchery','chick_producer']) then
    raise exception 'Canlı hayvan satış yetkiniz ve onaylı faaliyet belgeleriniz bulunmuyor.';
  end if;

  offered_quantity:=nullif(p_data->>'quantity','')::integer;
  offered_price:=nullif(p_data->>'unit_price','')::numeric;
  offered_date:=nullif(p_data->>'proposed_delivery_date','')::date;
  offered_weight:=nullif(p_data->>'average_live_weight','')::numeric;
  offered_price_unit:=p_data->>'price_unit';

  if offered_quantity is null or offered_quantity<=0 then raise exception 'Teklif miktarı sıfırdan büyük olmalıdır.'; end if;
  if offered_quantity>r.quantity_required then raise exception 'Teklif miktarı talep edilen % adedi aşamaz.',r.quantity_required; end if;
  if offered_price is null or offered_price<=0 then raise exception 'Birim fiyat sıfırdan büyük olmalıdır.'; end if;
  if offered_price_unit not in ('kg_canli','bas') then raise exception 'Geçersiz fiyat birimi.'; end if;
  if offered_price_unit='kg_canli' and (offered_weight is null or offered_weight<=0) then
    raise exception 'Canlı kilogram fiyatlı teklifte ortalama canlı ağırlık zorunludur.';
  end if;
  if offered_date is null or offered_date<r.delivery_start or offered_date>r.delivery_end then
    raise exception 'Önerilen teslim tarihi % ile % arasında olmalıdır.',r.delivery_start,r.delivery_end;
  end if;

  insert into public.slaughterhouse_purchase_offers(
    request_id,seller_company_id,livestock_listing_id,quantity,
    average_live_weight,unit_price,price_unit,proposed_delivery_date,
    transport_included,message,created_by
  ) values(
    p_request_id,c.id,nullif(p_data->>'livestock_listing_id','')::uuid,
    offered_quantity,offered_weight,offered_price,offered_price_unit,
    offered_date,coalesce((p_data->>'transport_included')::boolean,false),
    nullif(btrim(coalesce(p_data->>'message','')),''),auth.uid()
  ) returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.accept_slaughterhouse_purchase_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  o public.slaughterhouse_purchase_offers;
  r public.slaughterhouse_purchase_requests;
  d_id uuid;
begin
  if auth.uid() is null then raise exception 'Bu işlem için giriş yapmalısınız.'; end if;
  if public.is_platform_admin() then raise exception 'Platform personeli ticari işlem başlatamaz.'; end if;

  select * into o from public.slaughterhouse_purchase_offers
  where id=p_offer_id for update;
  if o.id is null or o.status<>'beklemede' then raise exception 'Bekleyen teklif bulunamadı.'; end if;

  select * into r from public.slaughterhouse_purchase_requests
  where id=o.request_id for update;
  if r.id is null or r.status<>'acik' then raise exception 'Bu alım talebi teklif kabulüne açık değil.'; end if;
  if o.quantity>r.quantity_required then raise exception 'Teklif miktarı talep miktarını aşıyor; bu teklif kabul edilemez.'; end if;
  if o.proposed_delivery_date<r.delivery_start or o.proposed_delivery_date>r.delivery_end then
    raise exception 'Teklifin teslim tarihi talep aralığının dışında; bu teklif kabul edilemez.';
  end if;
  if not exists(select 1 from public.companies c where c.id=r.company_id and c.user_id=auth.uid()) then
    raise exception 'Bu alım talebini yönetme yetkiniz yok.';
  end if;

  update public.slaughterhouse_purchase_offers
  set status=case when id=p_offer_id then 'kabul_edildi' else 'reddedildi' end,
      updated_at=timezone('utc',now())
  where request_id=r.id and status='beklemede';

  update public.slaughterhouse_purchase_requests
  set status='eslesme_yapildi',updated_at=timezone('utc',now())
  where id=r.id;

  insert into public.slaughterhouse_deliveries(
    request_id,offer_id,buyer_company_id,seller_company_id,
    delivery_code,planned_quantity
  ) values(
    r.id,o.id,r.company_id,o.seller_company_id,
    lpad((floor(random()*1000000))::int::text,6,'0'),o.quantity
  ) returning id into d_id;

  return d_id;
end;
$$;

revoke all on function public.submit_slaughterhouse_purchase_offer(uuid,jsonb) from public,anon;
revoke all on function public.accept_slaughterhouse_purchase_offer(uuid) from public,anon;
grant execute on function public.submit_slaughterhouse_purchase_offer(uuid,jsonb) to authenticated;
grant execute on function public.accept_slaughterhouse_purchase_offer(uuid) to authenticated;

commit;
