-- Kanatlı Borsası içerik ve pazar güvenliği
-- Tarih: 2026-10-06

begin;

-- =====================================================
-- Yem ilanları
-- =====================================================

alter table public.feed_listings
enable row level security;

drop policy if exists "Herkes yem ilanlarını okuyabilir"
on public.feed_listings;

drop policy if exists "Kullanıcılar kendi yem ilanlarını ekleyebilir"
on public.feed_listings;

drop policy if exists "Kullanıcılar kendi yem ilanlarını güncelleyebilir"
on public.feed_listings;

drop policy if exists "Kullanıcılar kendi yem ilanlarını silebilir"
on public.feed_listings;

drop policy if exists feed_select_active_or_own
on public.feed_listings;

drop policy if exists feed_insert_approved_company
on public.feed_listings;

drop policy if exists feed_update_own_approved
on public.feed_listings;

drop policy if exists feed_delete_own
on public.feed_listings;

create policy feed_select_active_or_own
on public.feed_listings
for select
to public
using (
  status = 'aktif'
  or user_id = auth.uid()
);

create policy feed_insert_approved_company
on public.feed_listings
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'aktif'
  and exists (
    select 1
    from public.companies c
    where c.id = feed_listings.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

create policy feed_update_own_approved
on public.feed_listings
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
    where c.id = feed_listings.company_id
      and c.user_id = auth.uid()
      and c.status = 'onaylandi'::company_status
  )
);

create policy feed_delete_own
on public.feed_listings
for delete
to authenticated
using (
  user_id = auth.uid()
);

-- =====================================================
-- Kesimhaneler
-- =====================================================

alter table public.slaughterhouses
enable row level security;

drop policy if exists "Oturum açanlar kesimhane ekleyebilir"
on public.slaughterhouses;

drop policy if exists "Herkes kesimhaneleri okuyabilir"
on public.slaughterhouses;

drop policy if exists slaughterhouses_select_active_or_owner
on public.slaughterhouses;

create policy slaughterhouses_select_active_or_owner
on public.slaughterhouses
for select
to public
using (
  status = 'Aktif'

  or exists (
    select 1
    from public.companies c
    where c.id = slaughterhouses.company_id
      and c.user_id = auth.uid()
  )

  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

-- Kesimhane ekleme formu bulunmadığı için normal
-- kullanıcılara INSERT politikası verilmemektedir.

-- =====================================================
-- Sektör faaliyetleri
-- =====================================================

alter table public.association_activities
enable row level security;

drop policy if exists "Oturum açanlar faaliyet ekleyebilir"
on public.association_activities;

drop policy if exists association_activities_admin_manage
on public.association_activities;

create policy association_activities_admin_manage
on public.association_activities
for all
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

-- Mevcut herkese açık SELECT politikası korunmaktadır.

-- =====================================================
-- Teknik makaleler
-- =====================================================

alter table public.technical_articles
enable row level security;

drop policy if exists "Oturum açanlar makale ekleyebilir"
on public.technical_articles;

drop policy if exists technical_articles_admin_manage
on public.technical_articles;

create policy technical_articles_admin_manage
on public.technical_articles
for all
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

-- Mevcut herkese açık SELECT politikası korunmaktadır.

commit;
drop policy if exists slaughterhouses_select_active_or_owner
on public.slaughterhouses;

drop policy if exists slaughterhouses_select_active
on public.slaughterhouses;

drop policy if exists slaughterhouses_select_owner_or_admin
on public.slaughterhouses;

create policy slaughterhouses_select_active
on public.slaughterhouses
for select
to anon, authenticated
using (status = 'Aktif');

create policy slaughterhouses_select_owner_or_admin
on public.slaughterhouses
for select
to authenticated
using (
  exists (
    select 1
    from public.companies c
    where c.id = slaughterhouses.company_id
      and c.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);