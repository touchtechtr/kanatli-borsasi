begin;

alter table public.slaughterhouse_purchase_offers
  drop constraint if exists slaughterhouse_purchase_offers_status_check;
alter table public.slaughterhouse_purchase_offers
  add constraint slaughterhouse_purchase_offers_status_check
  check (status in ('beklemede','kabul_edildi','reddedildi','geri_cekildi','teslim_edilemedi'));

create or replace function public.admin_resolve_slaughterhouse_dispute(
  p_delivery_id uuid,
  p_action text,
  p_admin_note text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.slaughterhouse_deliveries;
  request_end date;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;
  if p_action not in ('saticiya_aktar','aliciya_iade','aliciya_iade_yeniden_yayinla') then
    raise exception 'Geçersiz uyuşmazlık kararı.';
  end if;
  if nullif(btrim(p_admin_note),'') is null then
    raise exception 'Yönetim karar açıklaması zorunludur.';
  end if;

  select * into d
  from public.slaughterhouse_deliveries
  where id=p_delivery_id
  for update;

  if d.id is null then raise exception 'Teslimat bulunamadı.'; end if;
  if d.status<>'uyusmazlik' or d.payment_status<>'uyusmazlikta_bekletiliyor' then
    raise exception 'Bu teslimat açık bir uyuşmazlık dosyası değildir.';
  end if;

  if p_action='aliciya_iade_yeniden_yayinla' then
    select delivery_end into request_end
    from public.slaughterhouse_purchase_requests
    where id=d.request_id
    for update;
    if request_end < current_date then
      raise exception 'Talebin teslim tarihleri geçmiş. Tarihleri güncelleyip yeni talep oluşturun.';
    end if;
  end if;

  perform public.ensure_slaughterhouse_payment(d.id);

  if p_action='saticiya_aktar' then
    update public.slaughterhouse_deliveries set
      status='teslim_onaylandi',
      payment_status='serbest_birakilmaya_hazir',
      admin_resolution_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),
      updated_at=timezone('utc',now())
    where id=d.id;

    update public.slaughterhouse_payments set
      status='serbest_birakilmaya_hazir',
      admin_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),
      updated_at=timezone('utc',now())
    where delivery_id=d.id;

    perform public.post_slaughterhouse_payment_to_wallets(d.id);
  else
    update public.slaughterhouse_deliveries set
      status='iptal',
      payment_status='iade_edildi',
      admin_resolution_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),
      updated_at=timezone('utc',now())
    where id=d.id;

    update public.slaughterhouse_payments set
      status='iade_edildi',
      admin_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),
      updated_at=timezone('utc',now())
    where delivery_id=d.id;

    update public.slaughterhouse_purchase_offers
    set status='teslim_edilemedi',updated_at=timezone('utc',now())
    where id=d.offer_id;

    if p_action='aliciya_iade_yeniden_yayinla' then
      update public.slaughterhouse_purchase_offers
      set status='beklemede',updated_at=timezone('utc',now())
      where request_id=d.request_id
        and id<>d.offer_id
        and status='reddedildi'
        and proposed_delivery_date>=current_date;

      update public.slaughterhouse_purchase_requests
      set status='acik',updated_at=timezone('utc',now())
      where id=d.request_id;
    else
      update public.slaughterhouse_purchase_requests
      set status='iptal',updated_at=timezone('utc',now())
      where id=d.request_id;
    end if;
  end if;
end;
$$;

revoke all on function public.admin_resolve_slaughterhouse_dispute(uuid,text,text) from public,anon;
grant execute on function public.admin_resolve_slaughterhouse_dispute(uuid,text,text) to authenticated;

create or replace view public.public_slaughterhouse_purchase_requests
with (security_invoker=false)
as
select id,title,animal_type,quantity_required,target_price,city,delivery_start,delivery_end,company_id,created_at
from public.slaughterhouse_purchase_requests
where status='acik';

revoke all on public.public_slaughterhouse_purchase_requests from public;
grant select on public.public_slaughterhouse_purchase_requests to anon,authenticated;

commit;
