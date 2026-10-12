begin;

-- ============================================================
-- Çoklu firma faaliyetleri ve faaliyete özel belge yönetimi
-- Mevcut companies.role alanı geriye uyumluluk için korunur.
-- Yeni yetkilendirmelerin kaynağı company_activities tablosudur.
-- ============================================================

create table if not exists public.activity_types (
  code text primary key,
  segment text not null,
  name text not null,
  description text not null,
  requires_document boolean not null default true,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.activity_document_requirements (
  id uuid primary key default gen_random_uuid(),
  activity_code text not null references public.activity_types(code) on delete cascade,
  code text not null,
  name text not null,
  description text,
  required boolean not null default true,
  accepted_mime_types text[] not null default array['application/pdf','image/jpeg','image/png']::text[],
  max_file_size_mb integer not null default 10 check (max_file_size_mb between 1 and 25),
  sort_order integer not null default 100,
  unique(activity_code, code)
);

create table if not exists public.company_activity_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  activity_code text not null references public.activity_types(code) on delete restrict,
  status text not null default 'taslak' check (status in (
    'taslak','inceleme_bekliyor','duzeltme_istendi','onaylandi','reddedildi','iptal_edildi'
  )),
  applicant_note text,
  admin_note text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists company_activity_one_open_application_idx
  on public.company_activity_applications(company_id, activity_code)
  where status in ('taslak','inceleme_bekliyor','duzeltme_istendi');

create index if not exists company_activity_applications_status_idx
  on public.company_activity_applications(status, created_at desc);

create table if not exists public.company_activities (
  company_id uuid not null references public.companies(id) on delete cascade,
  activity_code text not null references public.activity_types(code) on delete restrict,
  status text not null default 'aktif' check (status in ('aktif','askida','suresi_doldu','kapatildi')),
  source_application_id uuid references public.company_activity_applications(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  suspension_reason text,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key(company_id, activity_code)
);

create index if not exists company_activities_activity_status_idx
  on public.company_activities(activity_code, status);

create table if not exists public.company_activity_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.company_activity_applications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  requirement_code text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size > 0),
  status text not null default 'inceleme_bekliyor' check (status in ('inceleme_bekliyor','kabul_edildi','reddedildi')),
  admin_note text,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  unique(application_id, requirement_code)
);

create table if not exists public.company_activity_review_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.company_activity_applications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  activity_code text not null references public.activity_types(code) on delete restrict,
  action text not null,
  old_status text,
  new_status text,
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Yönetilebilir faaliyet kataloğu. Yeni faaliyetler tabloya eklenebilir;
-- uygulama kodunda enum değişikliği gerektirmez.
insert into public.activity_types(code, segment, name, description, requires_document, sort_order) values
  ('animal_breeder','Canlı Hayvan','Hayvan Yetiştiricisi','Kanatlı, büyükbaş veya küçükbaş hayvan yetiştirir.',true,10),
  ('animal_seller','Canlı Hayvan','Canlı Hayvan Satıcısı','Onaylı canlı hayvan ilanı yayınlar.',true,20),
  ('animal_buyer','Canlı Hayvan','Canlı Hayvan Alıcısı / Tüccarı','Canlı hayvan ilanlarına ticari teklif verir.',true,30),
  ('poultry_breeder','Kanatlı','Kanatlı Yetiştiricisi','Etlik, yumurtacı veya damızlık kanatlı yetiştirir.',true,40),
  ('hatchery','Kanatlı','Kuluçkahane','Kuluçkalık yumurta ve kuluçka hizmeti sunar.',true,50),
  ('chick_producer','Kanatlı','Civciv / Piliç Üreticisi','Günlük civciv, yarka veya piliç satışı yapar.',true,60),
  ('egg_producer','Kanatlı','Yumurta Üreticisi','Sofralık veya kuluçkalık yumurta satışı yapar.',true,70),
  ('feed_producer','Yem ve Hammadde','Yem Üreticisi','Kendi tesisinde ürettiği yemleri satışa sunar.',true,100),
  ('feed_wholesaler','Yem ve Hammadde','Yem Toptancısı','Tonajlı yem ticareti ve bölgesel dağıtım yapar.',true,110),
  ('feed_retailer','Yem ve Hammadde','Yem Satıcısı / Bayisi','Çuvallı yem ve bölgesel perakende satış yapar.',true,120),
  ('raw_material_supplier','Yem ve Hammadde','Yem Hammaddesi Tedarikçisi','Mısır, arpa, soya, küspe ve katkı maddeleri satar.',true,130),
  ('feed_buyer','Yem ve Hammadde','Yem Alıcısı','Yem ihtiyacı ve alım talebi oluşturur.',false,140),
  ('ration_consultant','Yem ve Hammadde','Rasyon Danışmanı','Rasyon ve besleme danışmanlığı sunar.',true,150),
  ('contract_publisher','Üretim','Sözleşmeli Üretim Yayıncısı','Üretici arayan sözleşmeli üretim fırsatı yayınlar.',true,200),
  ('slaughterhouse_operator','İşleme ve Hizmet','Kesimhane / Mezbaha İşletmecisi','Kesim tesisi, tarife ve kapasite yönetir.',true,210),
  ('milk_collection','İşleme ve Hizmet','Süt Toplama Merkezi','Çiğ süt alım ve toplama talebi oluşturur.',true,220),
  ('dairy_processor','İşleme ve Hizmet','Mandıra / Süt Fabrikası','Süt tedarik ve işleme faaliyetleri yürütür.',true,230),
  ('expert_provider','Uzmanlık','Bağımsız Ekspertiz','Tarafsız değerleme ve uygunluk raporu düzenler.',true,300),
  ('veterinarian','Uzmanlık','Veteriner Hekim','Sağlık, aşı ve veteriner uygunluk raporu düzenler.',true,310),
  ('animal_logistics','Lojistik','Canlı Hayvan Nakliyecisi','Ruhsatlı canlı hayvan taşıma hizmeti sunar.',true,400),
  ('feed_logistics','Lojistik','Yem Nakliyecisi','Dökme veya çuvallı yem taşıma hizmeti sunar.',true,410)
on conflict (code) do update set
  segment = excluded.segment,
  name = excluded.name,
  description = excluded.description,
  requires_document = excluded.requires_document,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

insert into public.activity_document_requirements(activity_code, code, name, description, required, sort_order) values
  ('animal_breeder','business_registration','İşletme tescil belgesi','Yetiştirici/işletme kayıt belgesi.',true,10),
  ('animal_seller','trade_authorization','Hayvan ticareti belgesi','Faaliyete uygun işletme veya ticaret belgesi.',true,10),
  ('animal_buyer','trade_authorization','Hayvan ticareti belgesi','Alım-satım faaliyetine uygun belge.',true,10),
  ('poultry_breeder','business_registration','Kanatlı işletme kayıt belgesi',null,true,10),
  ('hatchery','hatchery_license','Kuluçkahane çalışma izni',null,true,10),
  ('chick_producer','production_license','Üretim/işletme izin belgesi',null,true,10),
  ('egg_producer','business_registration','Yumurta işletme kayıt belgesi',null,true,10),
  ('feed_producer','production_license','Yem üretim izin belgesi',null,true,10),
  ('feed_producer','product_analysis','Güncel ürün analiz belgesi','En az bir ürüne ait güncel analiz.',true,20),
  ('feed_wholesaler','trade_registration','Ticaret/oda kayıt belgesi',null,true,10),
  ('feed_wholesaler','warehouse_document','Depo veya dağıtım yeri belgesi',null,true,20),
  ('feed_retailer','workplace_license','İşyeri açma/çalışma belgesi',null,true,10),
  ('raw_material_supplier','trade_registration','Ticaret/oda kayıt belgesi',null,true,10),
  ('ration_consultant','professional_certificate','Mesleki yeterlilik belgesi',null,true,10),
  ('contract_publisher','capacity_document','Üretim kapasitesi veya yetki belgesi',null,true,10),
  ('slaughterhouse_operator','operating_license','Kesimhane çalışma/onay belgesi',null,true,10),
  ('milk_collection','operating_license','Süt toplama işletme belgesi',null,true,10),
  ('dairy_processor','operating_license','Gıda işletmesi onay belgesi',null,true,10),
  ('expert_provider','professional_certificate','Ekspertiz mesleki yeterlilik belgesi',null,true,10),
  ('veterinarian','diploma_or_chamber','Diploma veya oda kayıt belgesi',null,true,10),
  ('animal_logistics','transport_license','Canlı hayvan taşıma yetki belgesi',null,true,10),
  ('feed_logistics','transport_license','Taşıma yetki belgesi',null,true,10)
on conflict(activity_code, code) do update set
  name = excluded.name,
  description = excluded.description,
  required = excluded.required,
  sort_order = excluded.sort_order;

-- Mevcut onaylı firmaları kesintiye uğratmayan geriye uyumlu faaliyet aktarımı.
insert into public.company_activities(company_id, activity_code, status, activated_at)
select c.id, mapping.activity_code, 'aktif', coalesce(c.created_at, timezone('utc', now()))
from public.companies c
cross join lateral (
  select unnest(case c.role::text
    when 'ciftci' then array['animal_breeder','animal_seller','poultry_breeder','feed_buyer']
    when 'tuccar' then array['animal_buyer','feed_buyer']
    when 'tedarikci' then array['feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier']
    when 'entegre' then array['contract_publisher','slaughterhouse_operator','animal_buyer']
    when 'uzman' then array['expert_provider','veterinarian']
    else array[]::text[]
  end) activity_code
) mapping
where c.status::text = 'onaylandi'
on conflict(company_id, activity_code) do nothing;

create or replace function public.company_has_active_activity(p_company_id uuid, p_activity_code text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.company_activities ca
    join public.companies c on c.id = ca.company_id
    join public.activity_types at on at.code = ca.activity_code and at.enabled
    where ca.company_id = p_company_id
      and ca.activity_code = p_activity_code
      and ca.status = 'aktif'
      and (ca.expires_at is null or ca.expires_at > timezone('utc', now()))
      and c.status::text = 'onaylandi'
  );
$$;

create or replace function public.company_has_any_active_activity(p_company_id uuid, p_activity_codes text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from unnest(p_activity_codes) code
    where public.company_has_active_activity(p_company_id, code)
  );
$$;

revoke all on function public.company_has_active_activity(uuid,text) from public;
revoke all on function public.company_has_any_active_activity(uuid,text[]) from public;
grant execute on function public.company_has_active_activity(uuid,text) to anon, authenticated;
grant execute on function public.company_has_any_active_activity(uuid,text[]) to anon, authenticated;

-- RLS
alter table public.activity_types enable row level security;
alter table public.activity_document_requirements enable row level security;
alter table public.company_activity_applications enable row level security;
alter table public.company_activities enable row level security;
alter table public.company_activity_documents enable row level security;
alter table public.company_activity_review_history enable row level security;

drop policy if exists activity_types_public_read on public.activity_types;
drop policy if exists activity_requirements_authenticated_read on public.activity_document_requirements;
drop policy if exists company_activities_public_read on public.company_activities;
drop policy if exists company_activities_owner_admin_read on public.company_activities;
drop policy if exists activity_applications_owner_read on public.company_activity_applications;
drop policy if exists activity_documents_owner_read on public.company_activity_documents;
drop policy if exists activity_history_owner_read on public.company_activity_review_history;
create policy activity_types_public_read on public.activity_types for select to anon, authenticated using (enabled);
create policy activity_requirements_authenticated_read on public.activity_document_requirements for select to authenticated using (true);
create policy company_activities_public_read on public.company_activities for select to anon, authenticated using (status = 'aktif');
create policy company_activities_owner_admin_read on public.company_activities for select to authenticated using (public.is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
create policy activity_applications_owner_read on public.company_activity_applications for select to authenticated using (public.is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
create policy activity_documents_owner_read on public.company_activity_documents for select to authenticated using (public.is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));
create policy activity_history_owner_read on public.company_activity_review_history for select to authenticated using (public.is_platform_admin() or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid()));

grant select on public.activity_types, public.activity_document_requirements, public.company_activities to anon, authenticated;
grant select on public.company_activity_applications, public.company_activity_documents, public.company_activity_review_history to authenticated;

-- Başvuru RPC'leri: tabloya doğrudan yazma verilmez.
create or replace function public.start_company_activity_application(p_activity_code text, p_note text default null)
returns public.company_activity_applications language plpgsql security definer set search_path = public
as $$
declare company_row public.companies; result public.company_activity_applications;
begin
  if auth.uid() is null then raise exception 'Bu işlem için giriş yapmalısınız.'; end if;
  select * into company_row from public.companies where user_id=auth.uid();
  if company_row.id is null then raise exception 'Firma kaydı bulunamadı.'; end if;
  if company_row.status::text <> 'onaylandi' then raise exception 'Yeni faaliyet başvurusu için firmanız onaylanmış olmalıdır.'; end if;
  if not exists(select 1 from public.activity_types where code=p_activity_code and enabled) then raise exception 'Geçersiz veya kapalı faaliyet.'; end if;
  if public.company_has_active_activity(company_row.id,p_activity_code) then raise exception 'Bu faaliyet zaten aktiftir.'; end if;
  select * into result from public.company_activity_applications
    where company_id=company_row.id and activity_code=p_activity_code and status in ('taslak','inceleme_bekliyor','duzeltme_istendi')
    order by created_at desc limit 1;
  if result.id is null then
    insert into public.company_activity_applications(company_id,activity_code,applicant_note,created_by)
    values(company_row.id,p_activity_code,nullif(btrim(coalesce(p_note,'')),''),auth.uid()) returning * into result;
  end if;
  return result;
end; $$;

create or replace function public.register_company_activity_document(
  p_application_id uuid, p_requirement_code text, p_storage_path text,
  p_original_name text, p_mime_type text, p_file_size bigint
)
returns public.company_activity_documents language plpgsql security definer set search_path = public
as $$
declare app_row public.company_activity_applications; result public.company_activity_documents;
begin
  select a.* into app_row from public.company_activity_applications a join public.companies c on c.id=a.company_id
  where a.id=p_application_id and c.user_id=auth.uid();
  if app_row.id is null then raise exception 'Başvuru bulunamadı.'; end if;
  if app_row.status not in ('taslak','duzeltme_istendi') then raise exception 'Bu başvuruya belge eklenemez.'; end if;
  if not exists(select 1 from public.activity_document_requirements where activity_code=app_row.activity_code and code=p_requirement_code) then raise exception 'Geçersiz belge türü.'; end if;
  if p_storage_path not like app_row.company_id::text || '/' || app_row.id::text || '/%' then raise exception 'Geçersiz belge yolu.'; end if;
  insert into public.company_activity_documents(application_id,company_id,requirement_code,storage_path,original_name,mime_type,file_size,uploaded_by)
  values(app_row.id,app_row.company_id,p_requirement_code,p_storage_path,p_original_name,p_mime_type,p_file_size,auth.uid())
  on conflict(application_id,requirement_code) do update set storage_path=excluded.storage_path, original_name=excluded.original_name,
    mime_type=excluded.mime_type,file_size=excluded.file_size,status='inceleme_bekliyor',admin_note=null,uploaded_by=auth.uid(),created_at=timezone('utc',now())
  returning * into result;
  return result;
end; $$;

create or replace function public.submit_company_activity_application(p_application_id uuid, p_note text default null)
returns public.company_activity_applications language plpgsql security definer set search_path = public
as $$
declare result public.company_activity_applications;
begin
  select a.* into result from public.company_activity_applications a join public.companies c on c.id=a.company_id
  where a.id=p_application_id and c.user_id=auth.uid();
  if result.id is null then raise exception 'Başvuru bulunamadı.'; end if;
  if result.status not in ('taslak','duzeltme_istendi') then raise exception 'Başvuru gönderime açık değil.'; end if;
  if exists(
    select 1 from public.activity_document_requirements r
    where r.activity_code=result.activity_code and r.required
      and not exists(select 1 from public.company_activity_documents d where d.application_id=result.id and d.requirement_code=r.code)
  ) then raise exception 'Zorunlu belgelerin tamamını yüklemelisiniz.'; end if;
  update public.company_activity_applications set status='inceleme_bekliyor', applicant_note=coalesce(nullif(btrim(coalesce(p_note,'')),''),applicant_note),
    submitted_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=result.id returning * into result;
  insert into public.company_activity_review_history(application_id,company_id,activity_code,action,old_status,new_status,note,actor_user_id)
  values(result.id,result.company_id,result.activity_code,'basvuru_gonderildi','taslak','inceleme_bekliyor',result.applicant_note,auth.uid());
  return result;
end; $$;

create or replace function public.admin_review_company_activity(p_application_id uuid,p_action text,p_note text default null)
returns public.company_activity_applications language plpgsql security definer set search_path = public
as $$
declare result public.company_activity_applications; old_value text; owner_user uuid; activity_name text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select a.* into result
  from public.company_activity_applications a
  where a.id=p_application_id
  for update;
  if result.id is not null then
    select c.user_id into owner_user
    from public.companies c
    where c.id=result.company_id;
  end if;
  if result.id is null then raise exception 'Başvuru bulunamadı.'; end if;
  if owner_user=auth.uid() then raise exception 'Yönetici kendi firmasının faaliyet başvurusunu sonuçlandıramaz.'; end if;
  if result.status<>'inceleme_bekliyor' then raise exception 'Yalnızca inceleme bekleyen başvuru sonuçlandırılabilir.'; end if;
  if p_action not in ('onayla','reddet','duzeltme_iste') then raise exception 'Geçersiz işlem.'; end if;
  if p_action<>'onayla' and nullif(btrim(coalesce(p_note,'')),'') is null then raise exception 'Açıklama zorunludur.'; end if;
  old_value:=result.status;
  update public.company_activity_applications set status=case p_action when 'onayla' then 'onaylandi' when 'reddet' then 'reddedildi' else 'duzeltme_istendi' end,
    admin_note=nullif(btrim(coalesce(p_note,'')),''),reviewed_by=auth.uid(),reviewed_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where id=result.id returning * into result;
  if p_action='onayla' then
    insert into public.company_activities(company_id,activity_code,status,source_application_id,approved_by,activated_at,updated_at)
    values(result.company_id,result.activity_code,'aktif',result.id,auth.uid(),timezone('utc',now()),timezone('utc',now()))
    on conflict(company_id,activity_code) do update set status='aktif',source_application_id=excluded.source_application_id,
      approved_by=auth.uid(),activated_at=timezone('utc',now()),expires_at=null,suspension_reason=null,updated_at=timezone('utc',now());
    update public.company_activity_documents set status='kabul_edildi',reviewed_at=timezone('utc',now()) where application_id=result.id;
  elsif p_action='reddet' then
    update public.company_activity_documents set status='reddedildi',admin_note=result.admin_note,reviewed_at=timezone('utc',now()) where application_id=result.id;
  end if;
  insert into public.company_activity_review_history(application_id,company_id,activity_code,action,old_status,new_status,note,actor_user_id)
  values(result.id,result.company_id,result.activity_code,p_action,old_value,result.status,result.admin_note,auth.uid());
  select name into activity_name from public.activity_types where code=result.activity_code;
  insert into public.notifications(recipient_user_id,actor_user_id,entity_type,entity_id,event_type,title,message,link)
  values(owner_user,auth.uid(),'Firma faaliyeti',result.id,p_action,'Faaliyet başvurunuz güncellendi',
    activity_name||' başvurunuzun durumu: '||result.status||coalesce('. Açıklama: '||result.admin_note,'.'),'/profil/faaliyetler');
  return result;
end; $$;

create or replace function public.admin_set_company_activity_status(p_company_id uuid,p_activity_code text,p_status text,p_reason text default null)
returns public.company_activities language plpgsql security definer set search_path = public
as $$
declare result public.company_activities; owner_user uuid; activity_name text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_status not in ('aktif','askida','suresi_doldu','kapatildi') then raise exception 'Geçersiz faaliyet durumu.'; end if;
  if p_status<>'aktif' and nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Durum değişikliği gerekçesi zorunludur.'; end if;
  select user_id into owner_user from public.companies where id=p_company_id;
  if owner_user=auth.uid() then raise exception 'Yönetici kendi firmasının faaliyet durumunu değiştiremez.'; end if;
  update public.company_activities set status=p_status,suspension_reason=case when p_status='aktif' then null else btrim(p_reason) end,
    updated_at=timezone('utc',now()) where company_id=p_company_id and activity_code=p_activity_code returning * into result;
  if result.company_id is null then raise exception 'Firma faaliyeti bulunamadı.'; end if;
  select name into activity_name from public.activity_types where code=p_activity_code;
  insert into public.notifications(recipient_user_id,actor_user_id,entity_type,event_type,title,message,link)
  values(owner_user,auth.uid(),'Firma faaliyeti','durum_degisti','Faaliyet durumunuz güncellendi',activity_name||' faaliyeti: '||p_status||coalesce('. Açıklama: '||p_reason,'.'),'/profil/faaliyetler');
  return result;
end; $$;

revoke all on function public.start_company_activity_application(text,text) from public;
revoke all on function public.register_company_activity_document(uuid,text,text,text,text,bigint) from public;
revoke all on function public.submit_company_activity_application(uuid,text) from public;
revoke all on function public.admin_review_company_activity(uuid,text,text) from public;
revoke all on function public.admin_set_company_activity_status(uuid,text,text,text) from public;
grant execute on function public.start_company_activity_application(text,text), public.register_company_activity_document(uuid,text,text,text,text,bigint), public.submit_company_activity_application(uuid,text), public.admin_review_company_activity(uuid,text,text), public.admin_set_company_activity_status(uuid,text,text,text) to authenticated;

-- Özel belge kovası. Dosyalar public değildir.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('company-activity-documents','company-activity-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists company_activity_docs_owner_insert on storage.objects;
drop policy if exists company_activity_docs_owner_select on storage.objects;
drop policy if exists company_activity_docs_owner_update on storage.objects;
create policy company_activity_docs_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id='company-activity-documents' and exists(select 1 from public.companies c where c.user_id=auth.uid() and c.id::text=(storage.foldername(name))[1])
);
create policy company_activity_docs_owner_select on storage.objects for select to authenticated using (
  bucket_id='company-activity-documents' and (public.is_platform_admin() or exists(select 1 from public.companies c where c.user_id=auth.uid() and c.id::text=(storage.foldername(name))[1]))
);
create policy company_activity_docs_owner_update on storage.objects for update to authenticated using (
  bucket_id='company-activity-documents' and exists(select 1 from public.companies c where c.user_id=auth.uid() and c.id::text=(storage.foldername(name))[1])
) with check (bucket_id='company-activity-documents');

-- Çıkar çatışması: aynı şirket, aynı kullanıcı veya aynı doğrulanabilir vergi kimliği.
create or replace function public.companies_have_conflict(p_first uuid,p_second uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select case when p_first is null or p_second is null then false else exists(
    select 1 from public.companies a join public.companies b on b.id=p_second
    where a.id=p_first and (
      a.id=b.id or (a.user_id is not null and a.user_id=b.user_id) or
      (length(regexp_replace(coalesce(a.tax_no,''),'[^0-9]','','g'))>=8 and regexp_replace(a.tax_no,'[^0-9]','','g')=regexp_replace(coalesce(b.tax_no,''),'[^0-9]','','g'))
    )
  ) end;
$$;
revoke all on function public.companies_have_conflict(uuid,uuid) from public;
grant execute on function public.companies_have_conflict(uuid,uuid) to authenticated;

create or replace function public.enforce_trade_offer_activity_and_conflict()
returns trigger language plpgsql security definer set search_path=public
as $$
declare allowed boolean;
begin
  if public.companies_have_conflict(new.buyer_company_id,new.seller_company_id) then raise exception 'Kendi firmanızın veya bağlantılı bir firmanın ilanına teklif veremezsiniz.'; end if;
  allowed := case new.listing_kind
    when 'livestock' then public.company_has_active_activity(new.buyer_company_id,'animal_buyer')
    when 'feed' then public.company_has_any_active_activity(new.buyer_company_id,array['feed_buyer','animal_buyer'])
    else public.company_has_any_active_activity(new.buyer_company_id,array['animal_buyer','feed_buyer']) end;
  if not allowed then raise exception 'Bu teklif türü için onaylı alıcı faaliyetiniz bulunmuyor.'; end if;
  return new;
end; $$;
drop trigger if exists enforce_trade_offer_activity_and_conflict_trigger on public.trade_offers;
create trigger enforce_trade_offer_activity_and_conflict_trigger before insert on public.trade_offers for each row execute function public.enforce_trade_offer_activity_and_conflict();

create or replace function public.enforce_expert_assignment_conflict()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.assigned_expert_company_id is not null then
    if public.companies_have_conflict(new.company_id,new.assigned_expert_company_id) then raise exception 'Firma kendi talebine veya bağlantılı firmasına bağımsız ekspertiz hizmeti veremez.'; end if;
    if not public.company_has_any_active_activity(new.assigned_expert_company_id,array['expert_provider','veterinarian']) then raise exception 'Seçilen firmanın aktif ekspertiz veya veteriner faaliyeti bulunmuyor.'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists enforce_expert_assignment_conflict_trigger on public.expert_requests;
create trigger enforce_expert_assignment_conflict_trigger before insert or update of assigned_expert_company_id on public.expert_requests for each row execute function public.enforce_expert_assignment_conflict();

-- Yeni ticari kayıtlar yalnızca ilgili aktif faaliyetle açılabilir.
-- SQL editörü/service role ile yapılan bakım işlemleri auth.uid() null olduğunda etkilenmez.
create or replace function public.enforce_company_activity_for_business_record()
returns trigger language plpgsql security definer set search_path=public
as $$
declare required_codes text[]; record_company uuid; owner_user uuid;
begin
  if auth.uid() is null or public.is_platform_admin() then return new; end if;
  record_company := new.company_id;
  select user_id into owner_user from public.companies where id=record_company;
  if owner_user is distinct from auth.uid() then raise exception 'Bu firma adına işlem yapma yetkiniz yok.'; end if;
  required_codes := case tg_table_name
    when 'feed_listings' then array['feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier']
    when 'livestock_listings' then array['animal_breeder','animal_seller','poultry_breeder','hatchery','chick_producer','egg_producer']
    when 'listings' then array['animal_seller','feed_producer','feed_wholesaler','feed_retailer','raw_material_supplier','egg_producer']
    when 'contract_farming' then array['contract_publisher']
    when 'slaughterhouses' then array['slaughterhouse_operator']
    else array[]::text[] end;
  if coalesce(array_length(required_codes,1),0)>0 and not public.company_has_any_active_activity(record_company,required_codes) then
    raise exception 'Bu kayıt için gerekli onaylı faaliyet yetkiniz bulunmuyor.';
  end if;
  return new;
end; $$;

drop trigger if exists enforce_listing_company_activity on public.listings;
create trigger enforce_listing_company_activity before insert or update of company_id on public.listings for each row execute function public.enforce_company_activity_for_business_record();
drop trigger if exists enforce_feed_listing_company_activity on public.feed_listings;
create trigger enforce_feed_listing_company_activity before insert or update of company_id on public.feed_listings for each row execute function public.enforce_company_activity_for_business_record();
drop trigger if exists enforce_livestock_listing_company_activity on public.livestock_listings;
create trigger enforce_livestock_listing_company_activity before insert or update of company_id on public.livestock_listings for each row execute function public.enforce_company_activity_for_business_record();
drop trigger if exists enforce_contract_company_activity on public.contract_farming;
create trigger enforce_contract_company_activity before insert or update of company_id on public.contract_farming for each row execute function public.enforce_company_activity_for_business_record();
drop trigger if exists enforce_slaughterhouse_company_activity on public.slaughterhouses;
create trigger enforce_slaughterhouse_company_activity before insert or update of company_id on public.slaughterhouses for each row execute function public.enforce_company_activity_for_business_record();

-- Yeni firma kaydında seçilen ilk faaliyetleri taslak başvuruya dönüştürür.
create or replace function public.seed_company_activity_applications()
returns trigger language plpgsql security definer set search_path=public
as $$
declare codes text[]; selected_code text;
begin
  select array(select jsonb_array_elements_text(coalesce(raw_user_meta_data->'requested_activities','[]'::jsonb))) into codes from auth.users where id=new.user_id;
  if coalesce(array_length(codes,1),0)=0 then
    codes := case new.role::text
      when 'ciftci' then array['animal_breeder','animal_seller','feed_buyer']
      when 'tuccar' then array['animal_buyer']
      when 'tedarikci' then array['feed_wholesaler','feed_retailer','raw_material_supplier']
      when 'entegre' then array['contract_publisher','slaughterhouse_operator']
      when 'uzman' then array['expert_provider','veterinarian'] else array[]::text[] end;
  end if;
  foreach selected_code in array codes loop
    if exists(select 1 from public.activity_types where code=selected_code and enabled) then
      insert into public.company_activity_applications(company_id,activity_code,status,created_by)
      values(new.id,selected_code,'taslak',new.user_id) on conflict do nothing;
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists seed_company_activity_applications_trigger on public.companies;
create trigger seed_company_activity_applications_trigger after insert on public.companies for each row execute function public.seed_company_activity_applications();

commit;
