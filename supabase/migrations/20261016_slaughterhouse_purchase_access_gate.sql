begin;

create or replace function public.get_my_slaughterhouse_purchase_access()
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  company_row public.companies;
  activity_ok boolean := false;
  facility_count integer := 0;
  staff_account boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'authenticated',false,
      'allowed',false,
      'reason','Bu işlem için giriş yapmalısınız.'
    );
  end if;

  staff_account := public.is_platform_admin();
  if staff_account then
    return jsonb_build_object(
      'authenticated',true,
      'allowed',false,
      'is_platform_staff',true,
      'reason','Platform personeli ticari işlem başlatamaz. Şirket işlemleri için ayrı şirket hesabı kullanın.'
    );
  end if;

  select * into company_row
  from public.companies
  where user_id=auth.uid()
  order by created_at desc
  limit 1;

  if company_row.id is null then
    return jsonb_build_object(
      'authenticated',true,
      'allowed',false,
      'has_company',false,
      'reason','Bu hesapla bağlantılı şirket bulunamadı.'
    );
  end if;

  activity_ok := public.company_has_any_active_activity(
    company_row.id,
    array['slaughterhouse_operator','slaughterhouse_buyer']
  );

  select count(*)::integer into facility_count
  from public.slaughterhouses s
  where s.company_id=company_row.id
    and s.status='Aktif';

  return jsonb_build_object(
    'authenticated',true,
    'allowed',(
      company_row.status::text='onaylandi'
      and activity_ok
      and facility_count>0
    ),
    'is_platform_staff',false,
    'has_company',true,
    'company_id',company_row.id,
    'company_name',company_row.name,
    'company_status',company_row.status::text,
    'has_required_activity',activity_ok,
    'active_facility_count',facility_count,
    'reason',case
      when company_row.status::text<>'onaylandi' then 'Şirket hesabınız henüz onaylanmamış.'
      when not activity_ok then 'Kesimhane İşletmecisi veya Kesimhane Hayvan Alıcısı faaliyet yetkisi gerekiyor.'
      when facility_count=0 then 'Şirketinize bağlı yönetim onaylı aktif bir kesimhane tesisi gerekiyor.'
      else null
    end
  );
end;
$$;

revoke all on function public.get_my_slaughterhouse_purchase_access() from public,anon;
grant execute on function public.get_my_slaughterhouse_purchase_access() to authenticated;

commit;
