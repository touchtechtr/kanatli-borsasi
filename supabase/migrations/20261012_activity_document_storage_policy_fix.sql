begin;

-- Storage politikalarının companies RLS politikalarına takılmadan yalnızca
-- oturum sahibinin kendi firma klasörüne erişmesini sağlar.
create or replace function public.current_user_owns_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_owns_company(uuid) from public;
grant execute on function public.current_user_owns_company(uuid) to authenticated;

drop policy if exists company_activity_docs_owner_insert on storage.objects;
drop policy if exists company_activity_docs_owner_select on storage.objects;
drop policy if exists company_activity_docs_owner_update on storage.objects;
drop policy if exists company_activity_docs_owner_delete on storage.objects;

create policy company_activity_docs_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-activity-documents'
  and (storage.foldername(name))[1] is not null
  and public.current_user_owns_company(
    ((storage.foldername(name))[1])::uuid
  )
);

create policy company_activity_docs_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-activity-documents'
  and (
    public.is_platform_admin()
    or (
      (storage.foldername(name))[1] is not null
      and public.current_user_owns_company(
        ((storage.foldername(name))[1])::uuid
      )
    )
  )
);

create policy company_activity_docs_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-activity-documents'
  and (storage.foldername(name))[1] is not null
  and public.current_user_owns_company(
    ((storage.foldername(name))[1])::uuid
  )
)
with check (
  bucket_id = 'company-activity-documents'
  and (storage.foldername(name))[1] is not null
  and public.current_user_owns_company(
    ((storage.foldername(name))[1])::uuid
  )
);

create policy company_activity_docs_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-activity-documents'
  and (storage.foldername(name))[1] is not null
  and public.current_user_owns_company(
    ((storage.foldername(name))[1])::uuid
  )
);

commit;
