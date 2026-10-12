-- =========================================================
-- KANATLI BORSASI
-- Canli hayvan ilan ayrintilari ve minimum teklif kontrolu
-- Tarih: 2026-10-11
-- =========================================================

alter table public.livestock_listings
  add column if not exists district text,
  add column if not exists description text,
  add column if not exists gender text,
  add column if not exists vaccination_status text,
  add column if not exists health_certificate boolean not null default false,
  add column if not exists negotiable boolean not null default false,
  add column if not exists min_order_quantity integer,
  add column if not exists delivery_available boolean not null default false,
  add column if not exists delivery_terms text;

alter table public.livestock_listings
  drop constraint if exists livestock_min_order_quantity_check;

alter table public.livestock_listings
  add constraint livestock_min_order_quantity_check
  check (
    min_order_quantity is null
    or (
      min_order_quantity > 0
      and min_order_quantity <= quantity
    )
  );

alter table public.livestock_listings
  drop constraint if exists livestock_gender_check;

alter table public.livestock_listings
  add constraint livestock_gender_check
  check (
    gender is null
    or gender in ('Disi', 'Erkek', 'Karisik', 'Belirtilmedi')
  );

create index if not exists livestock_listings_city_district_idx
  on public.livestock_listings (city, district);

-- Canli hayvan tekliflerinde ilan sahibinin belirledigi minimum miktari
-- veritabani seviyesinde de zorunlu tutar.
create or replace function public.enforce_livestock_min_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  required_minimum numeric;
begin
  if new.listing_kind <> 'livestock' then
    return new;
  end if;

  select coalesce(l.min_order_quantity, 1)
  into required_minimum
  from public.livestock_listings l
  where l.id = new.listing_id;

  if required_minimum is null then
    raise exception 'Canli hayvan ilani bulunamadi.';
  end if;

  if new.offered_quantity < required_minimum then
    raise exception
      'Teklif miktari ilanin minimum siparis miktarindan az olamaz.';
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_livestock_min_offer_trigger
  on public.trade_offers;

create trigger enforce_livestock_min_offer_trigger
before insert on public.trade_offers
for each row
execute function public.enforce_livestock_min_offer();
