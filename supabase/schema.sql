-- ============================================================
-- Kanatlı Borsası — Tam Veritabanı Şeması
-- ============================================================

-- Firma tipleri
create type public.user_role as enum ('ciftci', 'tuccar', 'tedarikci', 'admin');

-- Firmalar tablosu
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role public.user_role not null,
  tax_no text,
  phone text,
  city text,
  created_at timestamptz not null default now()
);

comment on table public.companies is 'Çiftçi, tüccar ve tedarikçi firmaları';

-- Kullanıcı profilleri (Supabase Auth kullanıcılarını firmalara bağlar)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  full_name text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'auth.users ile companies arasındaki bağlantı; her kullanıcı bir firmaya bağlanır';


-- ------------------------------------------------------------
-- İlanlar Tablosu (Canlı Borsa / Ürünler)
-- ------------------------------------------------------------
create table public.listings (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  category text not null, -- Örn: "Yem", "Canlı Hayvan", "Emtia"
  price numeric(12, 2) not null,
  unit text not null, -- Örn: "Kg", "Adet", "Ton"
  quantity numeric(12, 2) not null,
  city text not null,
  description text,
  status text check (status in ('aktif', 'pasif', 'satildi')) default 'aktif',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.listings is 'Çiftçilerin ve tedarikçilerin açtığı borsa ilanları';


-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.listings enable row level security;

-- Firmalar: herkes görebilir (borsada firma isimleri listelenecek)
create policy "companies_select_authenticated"
on public.companies for select
to authenticated
using (true);

-- Firmalar: sadece kendi firmasına bağlı kullanıcı günceller
create policy "companies_update_own"
on public.companies for update
to authenticated
using (
  id in (select company_id from public.profiles where id = auth.uid())
);

-- Profiller: kullanıcı sadece kendi profilini görür
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

-- Profiller: kullanıcı sadece kendi profilini günceller
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid());


-- İlan Politikaları
create policy "Listings are viewable by everyone." on public.listings
  for select using (true);

create policy "Authenticated users can insert listings." on public.listings
  for insert with check (auth.role() = 'authenticated');

create policy "Users can update own listings." on public.listings
  for update using (auth.uid() = user_id);

create policy "Users can delete own listings." on public.listings
  for delete using (auth.uid() = user_id);


-- ============================================================
-- Yeni kullanıcı kayıt olunca otomatik boş profil oluştur
-- ============================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();