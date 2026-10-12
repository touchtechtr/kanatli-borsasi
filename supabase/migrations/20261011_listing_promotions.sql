-- =========================================================
-- KANATLI BORSASI
-- İlan öne çıkarma / vitrin paketleri
-- Tarih: 2026-10-11
--
-- Not: Gerçek ödeme sağlayıcısı bağlanana kadar talepler
-- yönetici onayıyla etkinleştirilir.
-- =========================================================

create table if not exists public.listing_promotion_packages (
  code text primary key,
  name text not null,
  description text not null,
  price numeric(12,2) not null check (price >= 0),
  duration_days integer not null check (duration_days > 0),
  priority integer not null default 0,
  is_featured boolean not null default false,
  is_highlighted boolean not null default false,
  is_urgent boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.listing_promotion_packages
  (code, name, description, price, duration_days, priority, is_featured, is_highlighted, is_urgent)
values
  ('ust_sira', 'Üst Sıra', 'İlanı sonuçlarda standart ilanların üzerinde gösterir.', 149, 7, 200, false, false, false),
  ('vitrin', 'Ana Sayfa Vitrini', 'İlanı ana sayfadaki özel vitrin bölümünde gösterir.', 299, 7, 400, true, false, false),
  ('renkli_cerceve', 'Dikkat Çeken İlan', 'İlan kartını renkli çerçeve ve özel arka planla vurgular.', 79, 7, 100, false, true, false),
  ('acil', 'Acil İlan', 'İlana belirgin Acil etiketi ekler ve sıralama avantajı sağlar.', 99, 3, 300, false, false, true),
  ('premium', 'Premium Paket', 'Vitrin, üst sıra, renkli çerçeve ve Acil özelliklerini birlikte sunar.', 399, 14, 500, true, true, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  duration_days = excluded.duration_days,
  priority = excluded.priority,
  is_featured = excluded.is_featured,
  is_highlighted = excluded.is_highlighted,
  is_urgent = excluded.is_urgent,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

create table if not exists public.listing_promotions (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (
    listing_type in ('listings', 'feed_listings', 'livestock_listings')
  ),
  listing_id uuid not null,
  owner_company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  package_code text not null references public.listing_promotion_packages(code) on update cascade,
  package_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  duration_days integer not null check (duration_days > 0),
  priority integer not null default 0,
  is_featured boolean not null default false,
  is_highlighted boolean not null default false,
  is_urgent boolean not null default false,
  payment_status text not null default 'beklemede' check (
    payment_status in ('beklemede', 'odendi', 'iptal', 'iade_edildi')
  ),
  status text not null default 'beklemede' check (
    status in ('beklemede', 'aktif', 'reddedildi', 'iptal', 'suresi_doldu')
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  admin_id uuid references auth.users(id) on delete set null,
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists listing_promotions_public_idx
  on public.listing_promotions (status, ends_at, priority desc);

create index if not exists listing_promotions_listing_idx
  on public.listing_promotions (listing_type, listing_id);

create index if not exists listing_promotions_owner_idx
  on public.listing_promotions (owner_company_id, created_at desc);

create unique index if not exists listing_promotions_one_open_request_idx
  on public.listing_promotions (listing_type, listing_id, package_code)
  where status in ('beklemede', 'aktif');

alter table public.listing_promotion_packages enable row level security;
alter table public.listing_promotions enable row level security;

drop policy if exists promotion_packages_public_select on public.listing_promotion_packages;
create policy promotion_packages_public_select
  on public.listing_promotion_packages
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists promotion_packages_admin_select on public.listing_promotion_packages;
create policy promotion_packages_admin_select
  on public.listing_promotion_packages
  for select
  to authenticated
  using (public.is_platform_admin());

drop policy if exists listing_promotions_public_active_select on public.listing_promotions;
create policy listing_promotions_public_active_select
  on public.listing_promotions
  for select
  to anon, authenticated
  using (
    status = 'aktif'
    and payment_status = 'odendi'
    and starts_at <= timezone('utc', now())
    and ends_at > timezone('utc', now())
  );

drop policy if exists listing_promotions_owner_select on public.listing_promotions;
create policy listing_promotions_owner_select
  on public.listing_promotions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.companies c
      where c.id = listing_promotions.owner_company_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists listing_promotions_admin_select on public.listing_promotions;
create policy listing_promotions_admin_select
  on public.listing_promotions
  for select
  to authenticated
  using (public.is_platform_admin());

grant select on public.listing_promotion_packages to anon, authenticated;
grant select on public.listing_promotions to anon, authenticated;
revoke insert, update, delete on public.listing_promotions from anon, authenticated;
revoke insert, update, delete on public.listing_promotion_packages from anon, authenticated;

create or replace function public.request_listing_promotion(
  target_listing_type text,
  target_listing_id uuid,
  target_package_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  listing_owner_company_id uuid;
  listing_status text;
  selected_package public.listing_promotion_packages%rowtype;
  created_promotion_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;

  if target_listing_type not in ('listings', 'feed_listings', 'livestock_listings') then
    raise exception 'Geçersiz ilan türü.';
  end if;

  select * into selected_package
  from public.listing_promotion_packages
  where code = target_package_code and is_active = true;

  if not found then
    raise exception 'Seçilen öne çıkarma paketi bulunamadı.';
  end if;

  execute format(
    'select company_id, status from public.%I where id = $1',
    target_listing_type
  )
  into listing_owner_company_id, listing_status
  using target_listing_id;

  if listing_owner_company_id is null then
    raise exception 'İlan bulunamadı.';
  end if;

  if listing_status is distinct from 'aktif' then
    raise exception 'Yalnızca aktif ilanlar öne çıkarılabilir.';
  end if;

  if not exists (
    select 1 from public.companies c
    where c.id = listing_owner_company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'
  ) then
    raise exception 'Bu ilan için işlem yapma yetkiniz bulunmuyor.';
  end if;

  insert into public.listing_promotions (
    listing_type,
    listing_id,
    owner_company_id,
    requested_by,
    package_code,
    package_name,
    amount,
    duration_days,
    priority,
    is_featured,
    is_highlighted,
    is_urgent
  ) values (
    target_listing_type,
    target_listing_id,
    listing_owner_company_id,
    auth.uid(),
    selected_package.code,
    selected_package.name,
    selected_package.price,
    selected_package.duration_days,
    selected_package.priority,
    selected_package.is_featured,
    selected_package.is_highlighted,
    selected_package.is_urgent
  )
  returning id into created_promotion_id;

  return created_promotion_id;
exception
  when unique_violation then
    raise exception 'Bu ilan için aynı pakette bekleyen veya aktif bir talep zaten var.';
end;
$function$;

create or replace function public.admin_review_listing_promotion(
  promotion_id uuid,
  decision text,
  review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_promotion public.listing_promotions%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Bu işlem için yönetici yetkisi gerekiyor.';
  end if;

  select * into target_promotion
  from public.listing_promotions
  where id = promotion_id
  for update;

  if not found then
    raise exception 'Öne çıkarma talebi bulunamadı.';
  end if;

  if target_promotion.status <> 'beklemede' then
    raise exception 'Yalnızca bekleyen talepler incelenebilir.';
  end if;

  if decision = 'onayla' then
    update public.listing_promotions set
      payment_status = 'odendi',
      status = 'aktif',
      starts_at = timezone('utc', now()),
      ends_at = timezone('utc', now()) + make_interval(days => duration_days),
      admin_id = auth.uid(),
      admin_note = nullif(trim(review_note), ''),
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = promotion_id;
  elsif decision = 'reddet' then
    update public.listing_promotions set
      payment_status = 'iptal',
      status = 'reddedildi',
      admin_id = auth.uid(),
      admin_note = nullif(trim(review_note), ''),
      reviewed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = promotion_id;
  else
    raise exception 'Geçersiz yönetici kararı.';
  end if;
end;
$function$;

grant execute on function public.request_listing_promotion(text, uuid, text) to authenticated;
grant execute on function public.admin_review_listing_promotion(uuid, text, text) to authenticated;

comment on table public.listing_promotions is
  'İlan vitrin, üst sıra, çerçeve ve acil paket talepleri.';

