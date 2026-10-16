begin;

insert into public.company_operation_rules(operation_code,name,description,required_activity_codes) values
('create_general_listing','Genel ticari ilan oluşturma','Desteklenen genel tarımsal ürün ilanı yayınlama yetkisi.',array['animal_seller','feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier','egg_producer','agricultural_input_supplier'])
on conflict(operation_code) do update set
  name=excluded.name,
  description=excluded.description,
  required_activity_codes=excluded.required_activity_codes,
  updated_at=timezone('utc',now());

create or replace function public.enforce_company_activity_for_business_record()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  operation_code text;
  category_value text;
begin
  if auth.uid() is null then return new; end if;

  category_value:=case
    when tg_table_name='listings' then coalesce(new.category,'')
    else ''
  end;

  operation_code:=case
    when tg_table_name='feed_listings' then 'create_feed_listing'
    when tg_table_name='livestock_listings' then 'create_livestock_listing'
    when tg_table_name='contract_farming' then 'publish_contract'
    when tg_table_name='slaughterhouses' then 'manage_slaughterhouse'
    when tg_table_name='listings' and category_value=any(array[
      'Gübre & Bitki Besleme','Tohum & Fide','Bitki Koruma Ürünleri',
      'Sulama & Tarım Ekipmanları','Sera & Üretim Malzemeleri'
    ]) then 'create_agri_listing'
    when tg_table_name='listings' then 'create_general_listing'
    else null
  end;

  if operation_code is not null then
    perform public.assert_company_operation_access(new.company_id,operation_code);
  end if;
  return new;
end;
$$;

create or replace function public.enforce_trade_offer_activity_and_conflict()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare operation_code text;
begin
  if auth.uid() is null then return new; end if;

  if public.companies_have_conflict(new.buyer_company_id,new.seller_company_id) then
    raise exception 'Kendi firmanızın veya bağlantılı bir firmanın ilanına teklif veremezsiniz.'
      using errcode='42501',detail='company_conflict';
  end if;

  operation_code:=case new.listing_kind
    when 'livestock' then 'bid_livestock'
    when 'feed' then 'bid_feed'
    else 'bid_feed'
  end;

  perform public.assert_company_operation_access(new.buyer_company_id,operation_code);
  return new;
end;
$$;

create or replace function public.enforce_expert_assignment_conflict()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.assigned_expert_company_id is not null then
    if public.companies_have_conflict(new.company_id,new.assigned_expert_company_id) then
      raise exception 'Firma kendi talebine veya bağlantılı firmasına bağımsız ekspertiz hizmeti veremez.'
        using errcode='42501',detail='expert_company_conflict';
    end if;
    if auth.uid() is not null then
      perform public.assert_company_operation_access(new.assigned_expert_company_id,'provide_expertise');
    elsif not public.company_has_any_active_activity(new.assigned_expert_company_id,array['expert_provider','veterinarian']) then
      raise exception 'Seçilen firmanın aktif ekspertiz veya veteriner faaliyeti bulunmuyor.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_slaughterhouse_purchase_access()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare buyer_company_id uuid;
begin
  if auth.uid() is null then return new; end if;

  if tg_table_name='slaughterhouse_purchase_requests' then
    perform public.assert_company_operation_access(new.company_id,'create_slaughterhouse_purchase');
  elsif tg_table_name='slaughterhouse_purchase_offers' then
    perform public.assert_company_operation_access(new.seller_company_id,'bid_slaughterhouse_purchase');
    select company_id into buyer_company_id
    from public.slaughterhouse_purchase_requests
    where id=new.request_id;
    if buyer_company_id is null then raise exception 'Alım talebi bulunamadı.'; end if;
    if public.companies_have_conflict(buyer_company_id,new.seller_company_id) then
      raise exception 'Kendi firmanızın veya bağlantılı bir firmanın alım talebine teklif veremezsiniz.'
        using errcode='42501',detail='company_conflict';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_slaughterhouse_purchase_request_access on public.slaughterhouse_purchase_requests;
create trigger enforce_slaughterhouse_purchase_request_access
before insert or update of company_id
on public.slaughterhouse_purchase_requests
for each row execute function public.enforce_slaughterhouse_purchase_access();

drop trigger if exists enforce_slaughterhouse_purchase_offer_access on public.slaughterhouse_purchase_offers;
create trigger enforce_slaughterhouse_purchase_offer_access
before insert or update of seller_company_id,request_id
on public.slaughterhouse_purchase_offers
for each row execute function public.enforce_slaughterhouse_purchase_access();

revoke all on function public.enforce_company_activity_for_business_record(),
  public.enforce_trade_offer_activity_and_conflict(),
  public.enforce_expert_assignment_conflict(),
  public.enforce_slaughterhouse_purchase_access()
from public,anon,authenticated;

commit;
