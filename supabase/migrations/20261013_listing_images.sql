begin;

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (listing_type in ('listings','feed_listings','livestock_listings')),
  listing_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  position integer not null default 0 check (position >= 0),
  is_primary boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists listing_images_listing_idx
  on public.listing_images(listing_type, listing_id, position);
create unique index if not exists listing_images_one_primary_idx
  on public.listing_images(listing_type, listing_id)
  where is_primary = true;

alter table public.listing_images enable row level security;

drop policy if exists listing_images_public_read on public.listing_images;
create policy listing_images_public_read on public.listing_images
for select to anon, authenticated using (true);

drop policy if exists listing_images_owner_insert on public.listing_images;
create policy listing_images_owner_insert on public.listing_images
for insert to authenticated with check (
  created_by = auth.uid()
  and (
    public.is_company_member(company_id, array['owner','manager','sales'])
    or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
  )
);

drop policy if exists listing_images_owner_update on public.listing_images;
create policy listing_images_owner_update on public.listing_images
for update to authenticated using (
  public.is_platform_admin()
  or public.is_company_member(company_id, array['owner','manager','sales'])
  or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
) with check (
  public.is_platform_admin()
  or public.is_company_member(company_id, array['owner','manager','sales'])
  or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
);

drop policy if exists listing_images_owner_delete on public.listing_images;
create policy listing_images_owner_delete on public.listing_images
for delete to authenticated using (
  public.is_platform_admin()
  or public.is_company_member(company_id, array['owner','manager','sales'])
  or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('listing-images','listing-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists listing_images_storage_insert on storage.objects;
create policy listing_images_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id='listing-images'
  and (
    public.is_company_member(((storage.foldername(name))[1])::uuid,array['owner','manager','sales'])
    or exists(select 1 from public.companies c where c.id=((storage.foldername(name))[1])::uuid and c.user_id=auth.uid())
  )
);

drop policy if exists listing_images_storage_update on storage.objects;
create policy listing_images_storage_update on storage.objects
for update to authenticated using (
  bucket_id='listing-images'
  and (
    public.is_company_member(((storage.foldername(name))[1])::uuid,array['owner','manager','sales'])
    or exists(select 1 from public.companies c where c.id=((storage.foldername(name))[1])::uuid and c.user_id=auth.uid())
  )
);

drop policy if exists listing_images_storage_delete on storage.objects;
create policy listing_images_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id='listing-images'
  and (
    public.is_platform_admin()
    or public.is_company_member(((storage.foldername(name))[1])::uuid,array['owner','manager','sales'])
    or exists(select 1 from public.companies c where c.id=((storage.foldername(name))[1])::uuid and c.user_id=auth.uid())
  )
);

grant select,insert,update,delete on public.listing_images to authenticated;
grant select on public.listing_images to anon;
notify pgrst, 'reload schema';
commit;
