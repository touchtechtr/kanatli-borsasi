begin;

create or replace function public.assert_slaughterhouse_purchase_dates(
  p_delivery_start date,
  p_delivery_end date
)
returns void
language plpgsql
set search_path=public
as $$
declare
  local_today date := timezone('Europe/Istanbul', now())::date;
  latest_allowed date := (timezone('Europe/Istanbul', now())::date + interval '2 years')::date;
begin
  if p_delivery_start is null or p_delivery_end is null then
    raise exception 'Teslim başlangıç ve bitiş tarihleri zorunludur.';
  end if;
  if p_delivery_start < local_today then
    raise exception 'Teslim başlangıç tarihi bugünden önce olamaz.';
  end if;
  if p_delivery_start > latest_allowed or p_delivery_end > latest_allowed then
    raise exception 'Teslim tarihleri en fazla 2 yıl sonrası için belirlenebilir.';
  end if;
  if p_delivery_end < p_delivery_start then
    raise exception 'Teslim bitiş tarihi başlangıç tarihinden önce olamaz.';
  end if;
  if p_delivery_end - p_delivery_start > 365 then
    raise exception 'Teslimat dönemi en fazla 365 gün olabilir.';
  end if;
end;
$$;

create or replace function public.validate_slaughterhouse_purchase_dates_trigger()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  perform public.assert_slaughterhouse_purchase_dates(new.delivery_start,new.delivery_end);
  return new;
end;
$$;

drop trigger if exists validate_slaughterhouse_purchase_dates_trigger
  on public.slaughterhouse_purchase_requests;
create trigger validate_slaughterhouse_purchase_dates_trigger
before insert or update of delivery_start,delivery_end
on public.slaughterhouse_purchase_requests
for each row execute function public.validate_slaughterhouse_purchase_dates_trigger();

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

  -- Eski veya doğrudan SQL ile oluşturulmuş geçersiz kayıtlar da yayınlanamaz.
  if p_action='onayla' then
    perform public.assert_slaughterhouse_purchase_dates(
      request_row.delivery_start,
      request_row.delivery_end
    );
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

revoke all on function public.assert_slaughterhouse_purchase_dates(date,date) from public,anon;
grant execute on function public.assert_slaughterhouse_purchase_dates(date,date) to authenticated;
revoke all on function public.validate_slaughterhouse_purchase_dates_trigger() from public,anon,authenticated;
revoke all on function public.admin_review_slaughterhouse_purchase_request(uuid,text,text) from public,anon;
grant execute on function public.admin_review_slaughterhouse_purchase_request(uuid,text,text) to authenticated;

commit;
