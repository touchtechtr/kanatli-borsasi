-- =========================================================
-- KANATLI BORSASI
-- Teklif komisyonu ve admin onay akisi
-- Tarih: 2026-10-08
-- =========================================================

-- Platform genel ayarlari. Tek satir tutulur.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  trade_commission_rate numeric(7,4) not null default 5
    check (trade_commission_rate >= 0 and trade_commission_rate <= 100),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_settings (id, trade_commission_rate)
values (true, 5)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_read on public.platform_settings;
drop policy if exists platform_settings_admin_update on public.platform_settings;

create policy platform_settings_read
on public.platform_settings
for select
to anon, authenticated
using (true);

create policy platform_settings_admin_update
on public.platform_settings
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

grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;


-- =========================================================
-- TEKLIF FINANSAL ANLIK GORUNTUSU VE ADMIN INCELEMESI
-- =========================================================

alter table public.trade_offers
  add column if not exists seller_unit_price numeric,
  add column if not exists commission_rate numeric(7,4),
  add column if not exists commission_unit_amount numeric,
  add column if not exists buyer_unit_price numeric,
  add column if not exists subtotal_amount numeric,
  add column if not exists commission_amount numeric,
  add column if not exists total_amount numeric,
  add column if not exists admin_status text,
  add column if not exists admin_id uuid references auth.users(id) on delete set null,
  add column if not exists admin_note text,
  add column if not exists admin_reviewed_at timestamptz;

-- Eski test tekliflerini yeni modele tasir.
update public.trade_offers
set
  seller_unit_price = coalesce(seller_unit_price, offered_unit_price),
  commission_rate = coalesce(commission_rate, 5),
  commission_unit_amount = coalesce(
    commission_unit_amount,
    round(offered_unit_price * 5 / 100, 2)
  ),
  buyer_unit_price = coalesce(
    buyer_unit_price,
    round(offered_unit_price * 1.05, 2)
  ),
  subtotal_amount = coalesce(
    subtotal_amount,
    round(offered_quantity * offered_unit_price, 2)
  ),
  commission_amount = coalesce(
    commission_amount,
    round(offered_quantity * offered_unit_price * 5 / 100, 2)
  ),
  total_amount = coalesce(
    total_amount,
    round(offered_quantity * offered_unit_price * 1.05, 2)
  ),
  admin_status = coalesce(admin_status, 'beklemede');

alter table public.trade_offers
  alter column seller_unit_price set not null,
  alter column commission_rate set not null,
  alter column commission_unit_amount set not null,
  alter column buyer_unit_price set not null,
  alter column subtotal_amount set not null,
  alter column commission_amount set not null,
  alter column total_amount set not null,
  alter column admin_status set not null,
  alter column admin_status set default 'beklemede';

alter table public.trade_offers
  drop constraint if exists trade_offers_admin_status_check;

alter table public.trade_offers
  add constraint trade_offers_admin_status_check
  check (admin_status in ('beklemede', 'onaylandi', 'reddedildi'));

alter table public.trade_offers
  drop constraint if exists trade_offers_financial_values_check;

alter table public.trade_offers
  add constraint trade_offers_financial_values_check
  check (
    seller_unit_price > 0
    and commission_rate >= 0
    and commission_rate <= 100
    and commission_unit_amount >= 0
    and buyer_unit_price > 0
    and subtotal_amount > 0
    and commission_amount >= 0
    and total_amount > 0
  );

create index if not exists trade_offers_admin_status_idx
  on public.trade_offers (admin_status, created_at desc);


-- =========================================================
-- YENI TEKLIF DOGRULAMA VE KOMISYON HESABI
-- offered_unit_price: alicinin saticiya teklif ettigi net birim fiyat
-- buyer_unit_price: komisyon dahil alicinin birim maliyeti
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
  listing_quantity numeric;
  active_commission_rate numeric(7,4);
begin
  if auth.uid() is null then
    raise exception 'Teklif göndermek için giriş yapmalısınız.';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = new.buyer_company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'
      and c.role::text = 'tuccar'
  ) then
    raise exception 'Yalnızca onaylı tüccar firmaları teklif gönderebilir.';
  end if;

  case new.listing_kind
    when 'listing' then
      select l.company_id, l.title, l.unit, l.status, l.quantity
      into listing_company_id, listing_title, listing_unit,
           listing_status, listing_quantity
      from public.listings l
      where l.id = new.listing_id;

    when 'livestock' then
      select l.company_id, l.title, coalesce(l.unit, 'Baş'),
             l.status, l.quantity
      into listing_company_id, listing_title, listing_unit,
           listing_status, listing_quantity
      from public.livestock_listings l
      where l.id = new.listing_id;

    when 'feed' then
      select l.company_id, l.title, l.unit, l.status, l.quantity
      into listing_company_id, listing_title, listing_unit,
           listing_status, listing_quantity
      from public.feed_listings l
      where l.id = new.listing_id;

    else
      raise exception 'Geçersiz ilan türü.';
  end case;

  if listing_company_id is null then
    raise exception 'İlan bulunamadı veya ilana ait firma bilgisi eksik.';
  end if;

  if listing_status is distinct from 'aktif' then
    raise exception 'Yalnızca aktif ilanlara teklif gönderilebilir.';
  end if;

  if listing_company_id = new.buyer_company_id then
    raise exception 'Kendi ilanınıza teklif gönderemezsiniz.';
  end if;

  if new.offered_quantity <= 0
     or new.offered_quantity > listing_quantity then
    raise exception 'Teklif miktarı sıfırdan büyük ve ilan miktarını aşmayacak şekilde olmalıdır.';
  end if;

  if new.offered_unit_price <= 0 then
    raise exception 'Teklif birim fiyatı sıfırdan büyük olmalıdır.';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = listing_company_id
      and c.status = 'onaylandi'
  ) then
    raise exception 'İlan sahibi firma şu anda işlem yapmaya uygun değil.';
  end if;

  select ps.trade_commission_rate
  into active_commission_rate
  from public.platform_settings ps
  where ps.id = true;

  active_commission_rate := coalesce(active_commission_rate, 5);

  new.seller_company_id := listing_company_id;
  new.created_by := auth.uid();
  new.product_title := listing_title;
  new.unit := listing_unit;
  new.status := 'beklemede';
  new.seller_unit_price := round(new.offered_unit_price, 2);
  new.commission_rate := active_commission_rate;
  new.commission_unit_amount := round(
    new.offered_unit_price * active_commission_rate / 100,
    2
  );
  new.buyer_unit_price := round(
    new.offered_unit_price * (1 + active_commission_rate / 100),
    2
  );
  new.subtotal_amount := round(
    new.offered_quantity * new.offered_unit_price,
    2
  );
  new.commission_amount := round(
    new.offered_quantity * new.offered_unit_price
      * active_commission_rate / 100,
    2
  );
  new.total_amount := round(
    new.offered_quantity * new.offered_unit_price
      * (1 + active_commission_rate / 100),
    2
  );
  new.admin_status := 'beklemede';
  new.admin_id := null;
  new.admin_note := null;
  new.admin_reviewed_at := null;
  new.responded_at := null;
  new.completed_at := null;
  new.created_at := timezone('utc', now());
  new.updated_at := timezone('utc', now());

  return new;
end;
$function$;


-- =========================================================
-- ADMIN VE KATILIMCI DURUM GECISLERI
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
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) into requester_is_admin;

  select exists (
    select 1 from public.companies c
    where c.id = old.buyer_company_id and c.user_id = auth.uid()
  ) into requester_is_buyer;

  select exists (
    select 1 from public.companies c
    where c.id = old.seller_company_id and c.user_id = auth.uid()
  ) into requester_is_seller;

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
     or new.seller_unit_price is distinct from old.seller_unit_price
     or new.commission_rate is distinct from old.commission_rate
     or new.commission_unit_amount is distinct from old.commission_unit_amount
     or new.buyer_unit_price is distinct from old.buyer_unit_price
     or new.subtotal_amount is distinct from old.subtotal_amount
     or new.commission_amount is distinct from old.commission_amount
     or new.total_amount is distinct from old.total_amount
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Teklif ve komisyon bilgileri gönderildikten sonra değiştirilemez.';
  end if;

  if new.admin_status is distinct from old.admin_status then
    if not requester_is_admin then
      raise exception 'Teklifin admin inceleme durumunu yalnızca yönetici değiştirebilir.';
    end if;

    if old.admin_status <> 'beklemede'
       or new.admin_status not in ('onaylandi', 'reddedildi') then
      raise exception 'Geçersiz admin inceleme durumu geçişi.';
    end if;

    new.admin_id := auth.uid();
    new.admin_reviewed_at := timezone('utc', now());

    if new.admin_status = 'reddedildi' then
      new.status := 'reddedildi';
      new.responded_at := timezone('utc', now());
    end if;
  elsif new.admin_id is distinct from old.admin_id
     or new.admin_note is distinct from old.admin_note
     or new.admin_reviewed_at is distinct from old.admin_reviewed_at
  then
    raise exception 'Admin inceleme alanlarını yalnızca inceleme işlemi sırasında değiştirebilirsiniz.';
  end if;

  if new.status is distinct from old.status
     and not (
       requester_is_admin
       and old.admin_status = 'beklemede'
       and new.admin_status = 'reddedildi'
       and new.status = 'reddedildi'
     )
  then
    if requester_is_seller
       and old.admin_status = 'onaylandi'
       and old.status = 'beklemede'
       and new.status in ('kabul_edildi', 'reddedildi') then
      new.responded_at := timezone('utc', now());

    elsif requester_is_seller
       and old.admin_status = 'onaylandi'
       and old.status = 'kabul_edildi'
       and new.status = 'tamamlandi' then
      new.completed_at := timezone('utc', now());

    elsif requester_is_buyer
       and old.status = 'beklemede'
       and new.status = 'iptal_edildi' then
      null;

    else
      raise exception 'Bu teklif durumu değişikliği için yetkiniz yok.';
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$function$;


-- =========================================================
-- GORUNURLUK: ALICI HER ZAMAN, SATICI ADMIN ONAYINDAN SONRA
-- =========================================================

drop policy if exists trade_offers_select_participants
  on public.trade_offers;

create policy trade_offers_select_participants
on public.trade_offers
for select
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = trade_offers.buyer_company_id
      and c.user_id = auth.uid()
  )
  or (
    trade_offers.admin_status = 'onaylandi'
    and exists (
      select 1
      from public.companies c
      where c.id = trade_offers.seller_company_id
        and c.user_id = auth.uid()
    )
  )
);

-- Katilimci UPDATE politikasi satir gorunurluguyle ayni olmali.
drop policy if exists trade_offers_update_participants
  on public.trade_offers;

create policy trade_offers_update_participants
on public.trade_offers
for update
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = trade_offers.buyer_company_id
      and c.user_id = auth.uid()
  )
  or (
    trade_offers.admin_status = 'onaylandi'
    and exists (
      select 1
      from public.companies c
      where c.id = trade_offers.seller_company_id
        and c.user_id = auth.uid()
    )
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = trade_offers.buyer_company_id
      and c.user_id = auth.uid()
  )
  or (
    trade_offers.admin_status = 'onaylandi'
    and exists (
      select 1
      from public.companies c
      where c.id = trade_offers.seller_company_id
        and c.user_id = auth.uid()
    )
  )
);

