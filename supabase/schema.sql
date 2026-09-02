-- ============================================================
-- Kanatlı Borsası — Temel Şema (Firmalar + Kullanıcı Profilleri)
-- Bu dosyayı Supabase Dashboard > SQL Editor içine yapıştırıp
-- "Run" ile çalıştırın.
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

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;

-- Firmalar: giriş yapmış herkes görebilir (borsa ekranında firma adları görünecek)
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
