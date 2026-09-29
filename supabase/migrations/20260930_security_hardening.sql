-- Kanatlı Borsası güvenlik sıkılaştırması
-- Tarih: 2026-09-30
-- Bu migration:
-- 1. Kamusal firma görünümünü sınırlar.
-- 2. Özel firma bilgilerini yalnızca sahibine ve admine açar.
-- 3. Yalnızca aktif ilanları kamusal gösterir.
-- 4. Ekspertiz ve sözleşme işlemlerini onaylı firmalarla sınırlar.

begin;

-- =====================================================
-- Güvenli kamusal firma görünümü
-- =====================================================

create or replace view public.public_companies
with (security_barrier = true)
as
select
  id,
  name,
  role,
  city,
  website,
  status,
  created_at
from public.companies
where status = 'onaylandi'::company_status;

revoke all privileges
on table public.public_companies
from public;

grant select
on table public.public_companies
to anon, authenticated;

-- =====================================================
-- Companies
-- =====================================================

alter table public.companies
enable row level security;

drop policy if exists companies_select_public_approved
on public.companies;

drop policy if exists companies_select_approved_or_own
on public.companies;

drop policy if exists companies_select_own
on public.companies;

revoke select
on table public.companies
from anon;

grant select
on table public.companies
to authenticated;

create policy companies_select_own
on public.companies
for select
to authenticated
using (
  user_id = auth.uid()
);

-- Mevcut companies_select_admin_all politikası
-- adminlerin bütün firmaları görmesini sağlamaya devam eder.

-- =====================================================
-- Genel ilanlar
-- =====================================================

alter table public.listings
enable row level security;

drop policy if exists "Herkes ilanları okuyabilir"
on public.listings;

drop policy if exists "Listings are viewable by everyone."
on public.listings;

drop policy if exists listings_select_active_or_own
on public.listings;

create policy listings_select_active_or_own
on public.listings
for select
to public
using (
  status = 'aktif'
  or user_id = auth.uid()
);

-- =====================================================
-- Canlı hayvan ilanları
-- =====================================================

alter table public.livestock_listings
enable row level security;

drop policy if exists "Herkes canlı hayvan ilanlarını görebilir"
on public.livestock_listings;

drop policy if exists livestock_select_active_or_own
on public.livestock_listings;

create policy livestock_select_active_or_own
on public.livestock_listings
for select
to public
using (
  status = 'aktif'
  or user_id = auth.uid()
);

-- =====================================================
-- Ekspertiz talepleri
-- =====================================================

alter table public.expert_requests
enable row level security;

drop policy if exists "Oturum açanlar ekspertiz talebi oluşturabilir"
on public.expert_requests;

drop policy if exists "Kullanıcı kendi talebini güncelleyebilir/silebilir"
on public.expert_requests;

drop policy if exists "Herkes ekspertiz taleplerini okuyabilir"
on public.expert_requests;

drop policy if exists expert_select_open_or_own
on public.expert_requests;

drop policy if exists expert_insert_approved_company
on public.expert_requests;

drop policy if exists expert_update_own_approved
on public.expert_requests;

create policy expert_select_open_or_own
on public.expert_requests
for select
to public
using (
  status = 'beklemede'
  or user_id = auth.uid()
);

create policy expert_insert_approved_company
on public.expert_requests
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.companies c
    where c.id = expert_requests.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

create policy expert_update_own_approved
on public.expert_requests
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.companies c
    where c.id = expert_requests.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

-- =====================================================
-- Sözleşmeli üretim teklifleri
-- =====================================================

alter table public.contract_farming
enable row level security;

drop policy if exists "Firmalar kendi sözleşme tekliflerini yönetebilir"
on public.contract_farming;

drop policy if exists "Herkes sözleşmeli üretim tekliflerini okuyabilir"
on public.contract_farming;

drop policy if exists contract_select_active_or_own
on public.contract_farming;

drop policy if exists contract_insert_approved_company
on public.contract_farming;

drop policy if exists contract_update_own_approved
on public.contract_farming;

drop policy if exists contract_delete_own
on public.contract_farming;

create policy contract_select_active_or_own
on public.contract_farming
for select
to public
using (
  status = 'aktif'
  or exists (
    select 1
    from public.companies c
    where c.id = contract_farming.company_id
      and c.user_id = auth.uid()
  )
);

create policy contract_insert_approved_company
on public.contract_farming
for insert
to authenticated
with check (
  exists (
    select 1
    from public.companies c
    where c.id = contract_farming.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

create policy contract_update_own_approved
on public.contract_farming
for update
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = contract_farming.company_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = contract_farming.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

create policy contract_delete_own
on public.contract_farming
for delete
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = contract_farming.company_id
      and c.user_id = auth.uid()
  )
);

commit;