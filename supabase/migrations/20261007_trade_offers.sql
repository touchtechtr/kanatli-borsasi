-- =========================================================
-- KANATLI BORSASI
-- Gerçek ticari teklif sistemi
-- Tarih: 2026-10-07
-- =========================================================

create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),

  listing_kind text not null
    check (
      listing_kind in (
        'listing',
        'livestock',
        'feed'
      )
    ),

  listing_id uuid not null,

  buyer_company_id uuid not null
    references public.companies(id)
    on delete restrict,

  seller_company_id uuid not null
    references public.companies(id)
    on delete restrict,

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  product_title text not null,

  offered_quantity numeric not null
    check (offered_quantity > 0),

  unit text not null,

  offered_unit_price numeric not null
    check (offered_unit_price > 0),

  message text,

  status text not null default 'beklemede'
    check (
      status in (
        'beklemede',
        'kabul_edildi',
        'reddedildi',
        'iptal_edildi',
        'tamamlandi'
      )
    ),

  responded_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null
    default timezone('utc', now()),

  updated_at timestamptz not null
    default timezone('utc', now()),

  constraint trade_offers_different_companies
    check (buyer_company_id <> seller_company_id)
);

create index if not exists trade_offers_listing_idx
  on public.trade_offers (
    listing_kind,
    listing_id
  );

create index if not exists trade_offers_buyer_idx
  on public.trade_offers (
    buyer_company_id,
    created_at desc
  );

create index if not exists trade_offers_seller_idx
  on public.trade_offers (
    seller_company_id,
    created_at desc
  );

create index if not exists trade_offers_status_idx
  on public.trade_offers (
    status,
    created_at desc
  );


-- =========================================================
-- YENİ TEKLİF DOĞRULAMA
-- =========================================================

create or replace function public.validate_trade_offer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  listing_company_id uuid;
  listing_title text;
  listing_unit text;
  listing_status text;
begin
  if auth.uid() is null then
    raise exception
      'Teklif göndermek için giriş yapmalısınız.';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = new.buyer_company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'
      and c.role::text = 'tuccar'
  ) then
    raise exception
      'Yalnızca onaylı tüccar firmaları teklif gönderebilir.';
  end if;

  case new.listing_kind
    when 'listing' then
      select
        l.company_id,
        l.title,
        l.unit,
        l.status
      into
        listing_company_id,
        listing_title,
        listing_unit,
        listing_status
      from public.listings l
      where l.id = new.listing_id;

    when 'livestock' then
      select
        l.company_id,
        l.title,
        coalesce(l.unit, 'Baş'),
        l.status
      into
        listing_company_id,
        listing_title,
        listing_unit,
        listing_status
      from public.livestock_listings l
      where l.id = new.listing_id;

    when 'feed' then
      select
        l.company_id,
        l.title,
        l.unit,
        l.status
      into
        listing_company_id,
        listing_title,
        listing_unit,
        listing_status
      from public.feed_listings l
      where l.id = new.listing_id;

    else
      raise exception 'Geçersiz ilan türü.';
  end case;

  if listing_company_id is null then
    raise exception
      'İlan bulunamadı veya ilana ait firma bilgisi eksik.';
  end if;

  if listing_status is distinct from 'aktif' then
    raise exception
      'Yalnızca aktif ilanlara teklif gönderilebilir.';
  end if;

  if listing_company_id = new.buyer_company_id then
    raise exception
      'Kendi ilanınıza teklif gönderemezsiniz.';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = listing_company_id
      and c.status = 'onaylandi'
  ) then
    raise exception
      'İlan sahibi firma şu anda işlem yapmaya uygun değil.';
  end if;

  new.seller_company_id := listing_company_id;
  new.created_by := auth.uid();
  new.product_title := listing_title;
  new.unit := listing_unit;
  new.status := 'beklemede';
  new.responded_at := null;
  new.completed_at := null;
  new.created_at := timezone('utc', now());
  new.updated_at := timezone('utc', now());

  return new;
end;
$function$;


drop trigger if exists
  validate_trade_offer_insert_trigger
  on public.trade_offers;

create trigger validate_trade_offer_insert_trigger
before insert on public.trade_offers
for each row
execute function public.validate_trade_offer_insert();


-- =========================================================
-- TEKLİF DURUM DEĞİŞİKLİĞİ DOĞRULAMA
-- =========================================================

create or replace function public.validate_trade_offer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_is_admin boolean := false;
  requester_is_buyer boolean := false;
  requester_is_seller boolean := false;
begin
  if auth.uid() is null then
    raise exception
      'Bu işlem için giriş yapmalısınız.';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
  into requester_is_admin;

  select exists (
    select 1
    from public.companies c
    where c.id = old.buyer_company_id
      and c.user_id = auth.uid()
  )
  into requester_is_buyer;

  select exists (
    select 1
    from public.companies c
    where c.id = old.seller_company_id
      and c.user_id = auth.uid()
  )
  into requester_is_seller;

  if new.listing_kind is distinct from old.listing_kind
     or new.listing_id is distinct from old.listing_id
     or new.buyer_company_id is distinct from old.buyer_company_id
     or new.seller_company_id is distinct from old.seller_company_id
     or new.created_by is distinct from old.created_by
     or new.product_title is distinct from old.product_title
     or new.offered_quantity is distinct from old.offered_quantity
     or new.unit is distinct from old.unit
     or new.offered_unit_price is distinct from old.offered_unit_price
     or new.message is distinct from old.message
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Teklif içeriği gönderildikten sonra değiştirilemez.';
  end if;

  if new.status is distinct from old.status then
    if requester_is_admin then
      null;

    elsif requester_is_seller
      and old.status = 'beklemede'
      and new.status in (
        'kabul_edildi',
        'reddedildi'
      )
    then
      null;

    elsif requester_is_seller
      and old.status = 'kabul_edildi'
      and new.status = 'tamamlandi'
    then
      null;

    elsif requester_is_buyer
      and old.status = 'beklemede'
      and new.status = 'iptal_edildi'
    then
      null;

    else
      raise exception
        'Bu teklif durumu değişikliği için yetkiniz yok.';
    end if;
  end if;

  if old.status = 'beklemede'
     and new.status in (
       'kabul_edildi',
       'reddedildi'
     )
  then
    new.responded_at := timezone('utc', now());
  end if;

  if new.status = 'tamamlandi'
     and old.status is distinct from 'tamamlandi'
  then
    new.completed_at := timezone('utc', now());
  end if;

  new.updated_at := timezone('utc', now());

  return new;
end;
$function$;


drop trigger if exists
  validate_trade_offer_update_trigger
  on public.trade_offers;

create trigger validate_trade_offer_update_trigger
before update on public.trade_offers
for each row
execute function public.validate_trade_offer_update();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.trade_offers
enable row level security;

drop policy if exists trade_offers_select_participants
  on public.trade_offers;

drop policy if exists trade_offers_insert_approved_trader
  on public.trade_offers;

drop policy if exists trade_offers_update_participants
  on public.trade_offers;

drop policy if exists trade_offers_admin_select
  on public.trade_offers;

drop policy if exists trade_offers_admin_update
  on public.trade_offers;


create policy trade_offers_select_participants
on public.trade_offers
for select
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id in (
      trade_offers.buyer_company_id,
      trade_offers.seller_company_id
    )
      and c.user_id = auth.uid()
  )
);


create policy trade_offers_insert_approved_trader
on public.trade_offers
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.companies c
    where c.id = trade_offers.buyer_company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'
      and c.role::text = 'tuccar'
  )
);


create policy trade_offers_update_participants
on public.trade_offers
for update
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id in (
      trade_offers.buyer_company_id,
      trade_offers.seller_company_id
    )
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id in (
      trade_offers.buyer_company_id,
      trade_offers.seller_company_id
    )
      and c.user_id = auth.uid()
  )
);


create policy trade_offers_admin_select
on public.trade_offers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);


create policy trade_offers_admin_update
on public.trade_offers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);


-- Teklif kayıtları ticari denetim geçmişidir.
-- Kullanıcılar doğrudan silemez.
revoke delete on public.trade_offers
from anon, authenticated;

revoke all on public.trade_offers
from anon;

grant select, insert, update
on public.trade_offers
to authenticated;