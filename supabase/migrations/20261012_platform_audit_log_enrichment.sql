begin;

create or replace function public.record_platform_audit_event()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
declare
  current_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  actor_uuid uuid := auth.uid();
  subject_uuid uuid;
  company_uuid uuid;
  entity_uuid uuid;
  actor_mail text;
  subject_mail text;
  company_label text;
  module_label text;
  title_value text;
  old_state text;
  new_state text;
  action_value text;
  summary_value text;
begin
  entity_uuid := nullif(current_data ->> 'id', '')::uuid;

  if tg_table_name = 'companies' then
    company_uuid := entity_uuid;
  else
    company_uuid := nullif(coalesce(
      current_data ->> 'company_id',
      current_data ->> 'owner_company_id',
      current_data ->> 'buyer_company_id',
      current_data ->> 'seller_company_id'
    ), '')::uuid;
  end if;

  subject_uuid := nullif(coalesce(
    current_data ->> 'user_id',
    current_data ->> 'created_by',
    current_data ->> 'requested_by'
  ), '')::uuid;

  if company_uuid is not null then
    select c.name, coalesce(subject_uuid, c.user_id)
      into company_label, subject_uuid
    from public.companies c
    where c.id = company_uuid;
  end if;

  select u.email into actor_mail from auth.users u where u.id = actor_uuid;
  select u.email into subject_mail from auth.users u where u.id = subject_uuid;

  module_label := case tg_table_name
    when 'companies' then 'Firmalar'
    when 'company_activity_applications' then 'Faaliyet başvuruları'
    when 'company_activity_documents' then 'Faaliyet belgeleri'
    when 'company_activities' then 'Firma faaliyetleri'
    when 'listings' then 'Genel ilanlar'
    when 'feed_listings' then 'Yem ilanları'
    when 'livestock_listings' then 'Canlı hayvan ilanları'
    when 'trade_offers' then 'Ticari teklifler'
    when 'contract_farming' then 'Sözleşmeli üretim'
    when 'slaughterhouses' then 'Kesimhaneler'
    when 'slaughter_appointments' then 'Kesimhane randevuları'
    when 'expert_requests' then 'Ekspertiz talepleri'
    when 'listing_promotions' then 'İlan öne çıkarma'
    when 'wallet_accounts' then 'Cüzdan hesapları'
    when 'wallet_transactions' then 'Cüzdan hareketleri'
    else tg_table_name
  end;

  title_value := coalesce(
    nullif(current_data ->> 'title',''),
    nullif(current_data ->> 'product_title',''),
    nullif(current_data ->> 'package_name',''),
    nullif(current_data ->> 'name',''),
    nullif(current_data ->> 'service_type',''),
    nullif(current_data ->> 'type',''),
    entity_uuid::text
  );
  old_state := coalesce(previous_data ->> 'moderation_status', previous_data ->> 'admin_status', previous_data ->> 'status');
  new_state := coalesce(current_data ->> 'moderation_status', current_data ->> 'admin_status', current_data ->> 'status');
  action_value := case
    when tg_op = 'INSERT' then 'Oluşturuldu'
    when tg_op = 'DELETE' then 'Silindi'
    when new_state is distinct from old_state then 'Durum değişti'
    else 'Güncellendi'
  end;
  summary_value := module_label || coalesce(' · ' || title_value, '') || ' · ' || action_value;
  if new_state is distinct from old_state then
    summary_value := summary_value || ' (' || coalesce(old_state, '—') || ' → ' || coalesce(new_state, '—') || ')';
  end if;

  insert into public.platform_audit_log(
    actor_user_id, actor_email, subject_user_id, subject_email,
    company_id, company_name, module, source_table, entity_id,
    operation, action, record_title, summary, old_status, new_status, details
  ) values (
    actor_uuid, actor_mail, subject_uuid, subject_mail,
    company_uuid, company_label, module_label, tg_table_name, entity_uuid,
    tg_op, action_value, title_value, summary_value, old_state, new_state,
    jsonb_build_object('onceki', previous_data, 'sonraki', current_data)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Daha önce eksik şirket bilgisiyle kaydedilmiş öne çıkarma hareketlerini düzeltir.
update public.platform_audit_log audit
set company_id = promotion.owner_company_id,
    company_name = company.name,
    subject_user_id = promotion.requested_by,
    subject_email = owner_user.email,
    record_title = promotion.package_name,
    summary = 'İlan öne çıkarma · ' || promotion.package_name || ' · ' || audit.action
from public.listing_promotions promotion
join public.companies company on company.id = promotion.owner_company_id
left join auth.users owner_user on owner_user.id = promotion.requested_by
where audit.source_table = 'listing_promotions'
  and audit.entity_id = promotion.id
  and (
    audit.company_id is null
    or audit.subject_user_id is null
    or audit.record_title = audit.entity_id::text
  );

revoke all on function public.record_platform_audit_event() from public, anon, authenticated;

commit;
