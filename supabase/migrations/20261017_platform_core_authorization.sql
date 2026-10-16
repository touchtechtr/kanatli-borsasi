begin;

create table if not exists public.company_operation_rules (
  operation_code text primary key,
  name text not null,
  description text,
  required_activity_codes text[] not null default '{}',
  requires_approved_company boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc',now())
);

insert into public.company_operation_rules(operation_code,name,description,required_activity_codes) values
('create_livestock_listing','Canlı hayvan ilanı oluşturma','Canlı hayvan satış ilanı yayınlama yetkisi.',array['animal_breeder','animal_seller','poultry_breeder','hatchery','chick_producer','egg_producer']),
('create_feed_listing','Yem ve hammadde ilanı oluşturma','Yem veya hammadde satış ilanı yayınlama yetkisi.',array['feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier']),
('create_agri_listing','Zirai girdi ilanı oluşturma','Zirai girdi ve tarım malzemesi ilanı yayınlama yetkisi.',array['agricultural_input_supplier']),
('bid_livestock','Canlı hayvan teklifi','Canlı hayvan ilanına teklif verme yetkisi.',array['animal_buyer']),
('bid_feed','Yem teklifi','Yem ve hammadde ilanına teklif verme yetkisi.',array['feed_buyer','animal_buyer']),
('provide_expertise','Ekspertiz hizmeti','Bağımsız ekspertiz veya veteriner hizmeti verme yetkisi.',array['expert_provider','veterinarian']),
('publish_contract','Sözleşmeli üretim yayınlama','Sözleşmeli üretim fırsatı yayınlama yetkisi.',array['contract_publisher']),
('manage_slaughterhouse','Kesimhane tesisi yönetme','Kesimhane tesisi ve kapasitesi yönetme yetkisi.',array['slaughterhouse_operator']),
('create_slaughterhouse_purchase','Kesimhane toplu alım talebi','Kesimhane adına toplu hayvan alım talebi yayınlama yetkisi.',array['slaughterhouse_operator','slaughterhouse_buyer']),
('bid_slaughterhouse_purchase','Kesimhane alımına teklif','Kesimhane toplu alım talebine satış teklifi verme yetkisi.',array['animal_breeder','animal_seller'])
on conflict(operation_code) do update set
  name=excluded.name,
  description=excluded.description,
  required_activity_codes=excluded.required_activity_codes,
  requires_approved_company=excluded.requires_approved_company,
  enabled=excluded.enabled,
  updated_at=timezone('utc',now());

alter table public.company_operation_rules enable row level security;
drop policy if exists company_operation_rules_read on public.company_operation_rules;
create policy company_operation_rules_read
on public.company_operation_rules for select
to authenticated
using(true);
grant select on public.company_operation_rules to authenticated;

create or replace function public.get_company_operation_access(
  p_company_id uuid,
  p_operation_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  company_row public.companies;
  rule_row public.company_operation_rules;
  owns_company boolean := false;
  activity_allowed boolean := false;
  denial_code text := null;
  denial_message text := null;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed',false,'code','authentication_required','message','Bu işlem için giriş yapmalısınız.');
  end if;

  if public.is_platform_admin() then
    return jsonb_build_object('allowed',false,'code','platform_staff_commerce_blocked','message','Platform personeli ticari işlem yapamaz. Ayrı bir şirket hesabı kullanın.');
  end if;

  select * into company_row from public.companies where id=p_company_id;
  if company_row.id is null then
    return jsonb_build_object('allowed',false,'code','company_not_found','message','Şirket bulunamadı.');
  end if;

  owns_company :=
    company_row.user_id=auth.uid()
    or coalesce(public.is_company_member(p_company_id,null),false);

  if not owns_company then
    return jsonb_build_object('allowed',false,'code','company_access_denied','message','Bu şirket adına işlem yapma yetkiniz yok.');
  end if;

  select * into rule_row
  from public.company_operation_rules
  where operation_code=p_operation_code and enabled;

  if rule_row.operation_code is null then
    return jsonb_build_object('allowed',false,'code','operation_not_configured','message','Bu işlem için yetki kuralı tanımlanmamış.');
  end if;

  if rule_row.requires_approved_company and company_row.status::text<>'onaylandi' then
    denial_code := 'company_not_approved';
    denial_message := 'Bu işlem için şirketinizin onaylanmış olması gerekir.';
  elsif coalesce(array_length(rule_row.required_activity_codes,1),0)>0 then
    activity_allowed := public.company_has_any_active_activity(p_company_id,rule_row.required_activity_codes);
    if not activity_allowed then
      denial_code := 'activity_required';
      denial_message := 'Bu işlem için gerekli onaylı faaliyet yetkiniz bulunmuyor.';
    end if;
  else
    activity_allowed := true;
  end if;

  if denial_code is not null then
    return jsonb_build_object(
      'allowed',false,
      'code',denial_code,
      'message',denial_message,
      'operation',p_operation_code,
      'company_id',p_company_id,
      'required_activities',to_jsonb(rule_row.required_activity_codes)
    );
  end if;

  return jsonb_build_object(
    'allowed',true,
    'code','allowed',
    'message','İşlem yetkisi doğrulandı.',
    'operation',p_operation_code,
    'company_id',p_company_id,
    'required_activities',to_jsonb(rule_row.required_activity_codes)
  );
end;
$$;

create or replace function public.assert_company_operation_access(
  p_company_id uuid,
  p_operation_code text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  result:=public.get_company_operation_access(p_company_id,p_operation_code);
  if not coalesce((result->>'allowed')::boolean,false) then
    raise exception '%',coalesce(result->>'message','İşlem yetkiniz bulunmuyor.')
      using errcode='42501',
      detail=coalesce(result->>'code','access_denied');
  end if;
end;
$$;

revoke all on function public.get_company_operation_access(uuid,text),public.assert_company_operation_access(uuid,text) from public,anon;
grant execute on function public.get_company_operation_access(uuid,text),public.assert_company_operation_access(uuid,text) to authenticated;

create or replace function public.admin_platform_core_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;

  select jsonb_build_object(
    'checked_at',timezone('utc',now()),
    'companies_without_owner',(select count(*) from public.companies where user_id is null),
    'profiles_without_company',(select count(*) from public.profiles p where p.company_id is null and not coalesce(p.is_admin,false)),
    'active_staff_with_company',(
      select count(*)
      from public.platform_staff ps
      join public.companies c on c.user_id=ps.user_id
      where ps.active
    ),
    'companies_without_active_activity',(
      select count(*)
      from public.companies c
      where c.status::text='onaylandi'
        and not exists(select 1 from public.company_activities ca where ca.company_id=c.id and ca.status='aktif')
    ),
    'operation_rule_count',(select count(*) from public.company_operation_rules where enabled),
    'required_functions',jsonb_build_object(
      'platform_admin',to_regprocedure('public.is_platform_admin()') is not null,
      'company_member',to_regprocedure('public.is_company_member(uuid,text[])') is not null,
      'company_conflict',to_regprocedure('public.companies_have_conflict(uuid,uuid)') is not null,
      'activity_check',to_regprocedure('public.company_has_any_active_activity(uuid,text[])') is not null
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_platform_core_health() from public,anon;
grant execute on function public.admin_platform_core_health() to authenticated;

commit;
