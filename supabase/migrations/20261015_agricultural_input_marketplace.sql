begin;

insert into public.activity_types(
  code, segment, name, description, requires_document, sort_order
) values (
  'agricultural_input_supplier',
  'Zirai Girdi',
  'Zirai Girdi ve Tarım Malzemeleri Satıcısı',
  'Gübre, bitki besleme, tohum, fide, sulama ekipmanı ve mevzuata uygun zirai ürünler satar.',
  true,
  160
)
on conflict (code) do update set
  segment = excluded.segment,
  name = excluded.name,
  description = excluded.description,
  requires_document = excluded.requires_document,
  sort_order = excluded.sort_order,
  enabled = true,
  updated_at = timezone('utc', now());

insert into public.activity_document_requirements(
  activity_code, code, name, description, required, sort_order
) values
  (
    'agricultural_input_supplier',
    'trade_registration',
    'Ticaret veya oda kayıt belgesi',
    'Zirai girdi veya tarım malzemesi ticaretini kapsayan güncel kayıt belgesi.',
    true,
    10
  ),
  (
    'agricultural_input_supplier',
    'product_sale_authorization',
    'Ürün satış yetki belgesi',
    'Mevzuat gerektiren gübre veya bitki koruma ürünleri için satış yetki belgesi.',
    false,
    20
  )
on conflict (activity_code, code) do update set
  name = excluded.name,
  description = excluded.description,
  required = excluded.required,
  sort_order = excluded.sort_order;

create or replace function public.enforce_company_activity_for_business_record()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  required_codes text[];
  record_company uuid;
  owner_user uuid;
begin
  if auth.uid() is null or public.is_platform_admin() then return new; end if;
  record_company := new.company_id;
  select user_id into owner_user from public.companies where id=record_company;
  if owner_user is distinct from auth.uid() then
    raise exception 'Bu firma adına işlem yapma yetkiniz yok.';
  end if;

  required_codes := case tg_table_name
    when 'feed_listings' then array['feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier']
    when 'livestock_listings' then array['animal_breeder','animal_seller','poultry_breeder','hatchery','chick_producer','egg_producer']
    when 'listings' then
      case
        when new.category in (
          'Gübre & Bitki Besleme',
          'Tohum & Fide',
          'Bitki Koruma Ürünleri',
          'Sulama & Tarım Ekipmanları',
          'Sera & Üretim Malzemeleri'
        ) then array['agricultural_input_supplier']
        else array['animal_seller','feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier','egg_producer']
      end
    when 'contract_farming' then array['contract_publisher']
    when 'slaughterhouses' then array['slaughterhouse_operator']
    else array[]::text[]
  end;

  if coalesce(array_length(required_codes,1),0)>0
     and not public.company_has_any_active_activity(record_company,required_codes) then
    raise exception 'Bu kayıt için gerekli onaylı faaliyet yetkiniz bulunmuyor.';
  end if;
  return new;
end;
$$;

commit;
