begin;

alter table public.slaughterhouse_purchase_requests
  add column if not exists admin_note text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

alter table public.slaughterhouse_purchase_requests
  drop constraint if exists slaughterhouse_purchase_requests_status_check;

alter table public.slaughterhouse_purchase_requests
  add constraint slaughterhouse_purchase_requests_status_check
  check(status in ('taslak','inceleme_bekliyor','acik','eslesme_yapildi','kapali','reddedildi','iptal'));

alter table public.slaughterhouse_purchase_requests
  alter column status set default 'inceleme_bekliyor';

create or replace function public.create_slaughterhouse_purchase_request(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.companies;
  facility public.slaughterhouses;
  result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;
  if public.is_platform_admin() then
    raise exception 'Platform personeli ticari işlem başlatamaz.';
  end if;

  select * into c
  from public.companies
  where user_id=auth.uid() and status::text='onaylandi';

  if c.id is null then
    raise exception 'Onaylı şirket hesabı gerekiyor.';
  end if;

  if not public.company_has_any_active_activity(
    c.id,
    array['slaughterhouse_operator','slaughterhouse_buyer']
  ) then
    raise exception 'Kesimhane alım talebi için onaylı Kesimhane İşletmecisi veya Kesimhane Hayvan Alıcısı faaliyeti ve zorunlu belgeleri gerekiyor.';
  end if;

  if nullif(p_data->>'slaughterhouse_id','') is not null then
    select * into facility
    from public.slaughterhouses
    where id=(p_data->>'slaughterhouse_id')::uuid
      and company_id=c.id
      and status='Aktif';
  else
    select * into facility
    from public.slaughterhouses
    where company_id=c.id and status='Aktif'
    order by created_at desc
    limit 1;
  end if;

  if facility.id is null then
    raise exception 'Alım talebi açabilmek için şirketinize bağlı, yönetim tarafından onaylanmış aktif bir kesimhane tesisi bulunmalıdır.';
  end if;

  insert into public.slaughterhouse_purchase_requests(
    company_id,slaughterhouse_id,title,animal_type,breed,quantity_required,
    min_live_weight,max_live_weight,price_model,target_price,city,
    delivery_address,delivery_start,delivery_end,health_requirements,
    expert_required,transport_responsibility,payment_terms,description,
    status,created_by
  ) values(
    c.id,facility.id,p_data->>'title',p_data->>'animal_type',
    nullif(p_data->>'breed',''),(p_data->>'quantity_required')::integer,
    nullif(p_data->>'min_live_weight','')::numeric,
    nullif(p_data->>'max_live_weight','')::numeric,p_data->>'price_model',
    nullif(p_data->>'target_price','')::numeric,p_data->>'city',
    nullif(p_data->>'delivery_address',''),(p_data->>'delivery_start')::date,
    (p_data->>'delivery_end')::date,nullif(p_data->>'health_requirements',''),
    coalesce((p_data->>'expert_required')::boolean,false),
    coalesce(p_data->>'transport_responsibility','satici'),
    nullif(p_data->>'payment_terms',''),nullif(p_data->>'description',''),
    'inceleme_bekliyor',auth.uid()
  ) returning id into result_id;

  return result_id;
end;
$$;

create or replace function public.admin_review_slaughterhouse_purchase_request(
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  request_row public.slaughterhouse_purchase_requests;
  owner_user uuid;
  next_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;
  if p_action not in ('onayla','reddet') then
    raise exception 'Geçersiz yönetim işlemi.';
  end if;

  select * into request_row
  from public.slaughterhouse_purchase_requests
  where id=p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Alım talebi bulunamadı.';
  end if;
  if request_row.status<>'inceleme_bekliyor' then
    raise exception 'Yalnızca inceleme bekleyen talepler karara bağlanabilir.';
  end if;
  if nullif(btrim(coalesce(p_admin_note,'')),'') is null then
    raise exception 'Başvuru sahibine iletilecek yönetim açıklaması zorunludur.';
  end if;

  next_status:=case when p_action='onayla' then 'acik' else 'reddedildi' end;
  update public.slaughterhouse_purchase_requests
  set status=next_status,
      admin_note=btrim(p_admin_note),
      reviewed_by=auth.uid(),
      reviewed_at=timezone('utc',now()),
      updated_at=timezone('utc',now())
  where id=p_request_id;

  select c.user_id into owner_user
  from public.companies c
  where c.id=request_row.company_id;

  if owner_user is not null then
    insert into public.notifications(
      recipient_user_id,actor_user_id,entity_type,entity_id,event_type,
      title,message,link
    ) values(
      owner_user,auth.uid(),'Kesimhane alım talebi',request_row.id,
      'slaughterhouse_purchase_review',
      case when p_action='onayla' then 'Alım talebiniz yayınlandı' else 'Alım talebiniz reddedildi' end,
      request_row.title||' talebinin durumu: '||next_status||'. Açıklama: '||btrim(p_admin_note),
      '/kesimhane/alim-merkezi/'||request_row.id
    );
  end if;
end;
$$;

-- Yeni talep geldiğinde aktif yönetim personeline uygulama bildirimi gönderir.
create or replace function public.notify_admins_new_slaughterhouse_purchase_request()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
begin
  if new.status='inceleme_bekliyor' then
    insert into public.notifications(
      recipient_user_id,actor_user_id,entity_type,entity_id,event_type,
      title,message,link
    )
    select ps.user_id,new.created_by,'Kesimhane alım talebi',new.id,
      'slaughterhouse_purchase_review_required','Yeni kesimhane alım talebi',
      new.title||' yönetici incelemesi bekliyor.','/admin/kesimhane-alimlari'
    from public.platform_staff ps
    where ps.active=true and ps.user_id is distinct from new.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_admins_new_slaughterhouse_purchase_request_trigger
  on public.slaughterhouse_purchase_requests;
create trigger notify_admins_new_slaughterhouse_purchase_request_trigger
after insert on public.slaughterhouse_purchase_requests
for each row execute function public.notify_admins_new_slaughterhouse_purchase_request();

revoke all on function public.admin_review_slaughterhouse_purchase_request(uuid,text,text) from public,anon;
grant execute on function public.admin_review_slaughterhouse_purchase_request(uuid,text,text) to authenticated;
revoke all on function public.notify_admins_new_slaughterhouse_purchase_request() from public,anon,authenticated;

commit;
