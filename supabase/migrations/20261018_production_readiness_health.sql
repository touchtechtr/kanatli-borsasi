begin;

create or replace function public.admin_production_readiness_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  result jsonb;
  v_rls_disabled integer := 0;
  v_without_policy integer := 0;
  v_unsafe_definer integer := 0;
  v_anon_mutations integer := 0;
  v_stale_emails integer := 0;
  v_orphan_emails integer := 0;
  v_duplicate_emails integer := 0;
  v_stale_deliveries integer := 0;
  v_delivery_without_evidence integer := 0;
  v_accepted_without_delivery integer := 0;
  v_profiles_without_auth integer := 0;
  v_duplicate_tax_numbers integer := 0;
  v_logistics_stale_requests integer := 0;
  v_logistics_accepted_without_offer integer := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;

  select count(*)::integer
    into v_rls_disabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and c.relrowsecurity = false
    and c.relname not in ('spatial_ref_sys');

  select count(*)::integer
    into v_without_policy
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and c.relrowsecurity = true
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    );

  select count(*)::integer
    into v_unsafe_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg like 'search_path=%'
    );

  select count(distinct g.table_name)::integer
    into v_anon_mutations
  from information_schema.role_table_grants g
  join pg_class c on c.relname=g.table_name
  join pg_namespace n on n.oid=c.relnamespace and n.nspname=g.table_schema
  where g.table_schema = 'public'
    and g.grantee = 'anon'
    and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    and c.relkind in ('r','p')
    and c.relrowsecurity = false;

  if to_regclass('public.notification_email_outbox') is not null then
    execute $q$
      select count(*)::integer
      from public.notification_email_outbox
      where status in ('beklemede','hata')
        and created_at < timezone('utc',now()) - interval '30 minutes'
    $q$ into v_stale_emails;

    execute $q$
      select count(*)::integer
      from public.notification_email_outbox o
      where o.recipient_user_id is not null
        and not exists (select 1 from auth.users u where u.id=o.recipient_user_id)
    $q$ into v_orphan_emails;

    execute $q$
      select coalesce(sum(x.total-1),0)::integer
      from (
        select count(*) total
        from public.notification_email_outbox
        where status in ('beklemede','hata')
        group by recipient_user_id,subject,message
        having count(*) > 1
      ) x
    $q$ into v_duplicate_emails;
  end if;

  if to_regclass('public.slaughterhouse_deliveries') is not null then
    execute $q$
      select count(*)::integer
      from public.slaughterhouse_deliveries
      where status not in ('tamamlandi','iptal','reddedildi')
        and updated_at < timezone('utc',now()) - interval '7 days'
    $q$ into v_stale_deliveries;

    if to_regclass('public.slaughterhouse_delivery_evidence') is not null then
      execute $q$
        select count(*)::integer
        from public.slaughterhouse_deliveries d
        where d.status in ('teslim_onaylandi','tamamlandi')
          and not exists (
            select 1 from public.slaughterhouse_delivery_evidence e
            where e.delivery_id=d.id
          )
          and not exists (
            select 1 from public.slaughterhouse_purchase_requests r
            where r.id=d.request_id and r.title like '[SQL TEST]%'
          )
      $q$ into v_delivery_without_evidence;
    end if;
  end if;

  if to_regclass('public.slaughterhouse_purchase_offers') is not null
     and to_regclass('public.slaughterhouse_deliveries') is not null then
    execute $q$
      select count(*)::integer
      from public.slaughterhouse_purchase_offers o
      where o.status='kabul_edildi'
        and not exists (
          select 1 from public.slaughterhouse_deliveries d
          where d.offer_id=o.id
        )
    $q$ into v_accepted_without_delivery;
  end if;

  if to_regclass('public.profiles') is not null then
    execute $q$
      select count(*)::integer
      from public.profiles p
      where not exists (select 1 from auth.users u where u.id=p.id)
    $q$ into v_profiles_without_auth;
  end if;

  if to_regclass('public.companies') is not null then
    execute $q$
      select coalesce(sum(x.total-1),0)::integer
      from (
        select count(*) total
        from public.companies
        where nullif(trim(tax_no),'') is not null
        group by trim(tax_no)
        having count(*) > 1
      ) x
    $q$ into v_duplicate_tax_numbers;
  end if;

  if to_regclass('public.transport_requests') is not null then
    execute $q$
      select count(*)::integer
      from public.transport_requests
      where coalesce(to_jsonb(transport_requests)->>'status','') not in ('tamamlandi','iptal','reddedildi')
        and coalesce(
          nullif(to_jsonb(transport_requests)->>'updated_at','')::timestamptz,
          nullif(to_jsonb(transport_requests)->>'created_at','')::timestamptz
        ) < timezone('utc',now()) - interval '7 days'
    $q$ into v_logistics_stale_requests;

    if to_regclass('public.transport_offers') is not null then
      execute $q$
        select count(*)::integer
        from public.transport_requests r
        where coalesce(to_jsonb(r)->>'status','') in ('eslesme_yapildi','kabul_edildi','islemde')
          and not exists (
            select 1 from public.transport_offers o
            where (to_jsonb(o)->>'request_id') = (to_jsonb(r)->>'id')
              and coalesce(to_jsonb(o)->>'status','') in ('kabul_edildi','onaylandi')
          )
      $q$ into v_logistics_accepted_without_offer;
    end if;
  end if;

  result := jsonb_build_object(
    'checked_at', timezone('utc',now()),
    'security', jsonb_build_object(
      'rls_disabled_tables', v_rls_disabled,
      'rls_tables_without_policy', v_without_policy,
      'unsafe_security_definer_functions', v_unsafe_definer,
      'anonymous_mutation_grants', v_anon_mutations
    ),
    'communications', jsonb_build_object(
      'stale_email_queue', v_stale_emails,
      'orphan_email_recipients', v_orphan_emails,
      'duplicate_pending_emails', v_duplicate_emails
    ),
    'operations', jsonb_build_object(
      'stale_deliveries', v_stale_deliveries,
      'completed_delivery_without_evidence', v_delivery_without_evidence,
      'accepted_offer_without_delivery', v_accepted_without_delivery,
      'stale_transport_requests', v_logistics_stale_requests,
      'matched_transport_without_offer', v_logistics_accepted_without_offer
    ),
    'identity', jsonb_build_object(
      'profiles_without_auth_user', v_profiles_without_auth,
      'duplicate_company_tax_numbers', v_duplicate_tax_numbers
    )
  );

  return result;
end;
$function$;

revoke all on function public.admin_production_readiness_health() from public;
grant execute on function public.admin_production_readiness_health() to authenticated;

commit;
