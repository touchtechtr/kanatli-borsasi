begin;

alter table public.trade_payments
  add column if not exists transfer_status text not null default 'beklemede'
    check (transfer_status in ('beklemede','emir_verildi','isleniyor','tamamlandi','hata')),
  add column if not exists transfer_requested_at timestamptz,
  add column if not exists transfer_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists transfer_started_at timestamptz,
  add column if not exists transfer_completed_at timestamptz,
  add column if not exists transfer_reference text,
  add column if not exists transfer_error text;

create or replace function public.admin_release_trade_payment(p_payment_id uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  payment_row public.trade_payments%rowtype;
  offer_row public.trade_offers%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into payment_row from public.trade_payments where id=p_payment_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  if payment_row.transfer_status not in ('beklemede','hata') then raise exception 'Bu ödeme için aktarım emri daha önce oluşturulmuş.'; end if;

  select * into offer_row from public.trade_offers where id=payment_row.trade_offer_id for update;
  if offer_row.status<>'kabul_edildi' then raise exception 'Teklif aktarım için uygun değil.'; end if;
  if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=offer_row.id and status='acik') then
    raise exception 'Uyuşmazlık çözülmeden aktarım emri verilemez.';
  end if;
  if (select count(distinct party) from public.trade_delivery_confirmations where trade_offer_id=offer_row.id)<>2 then
    raise exception 'Satıcı ve alıcı teslimat onayları tamamlanmadı.';
  end if;

  update public.trade_payments
  set transfer_status='emir_verildi',
      transfer_requested_at=timezone('utc',now()),
      transfer_requested_by=auth.uid(),
      transfer_started_at=null,
      transfer_completed_at=null,
      transfer_error=null,
      admin_note=coalesce(nullif(trim(p_note),''),admin_note),
      reviewed_by=auth.uid(),
      updated_at=timezone('utc',now())
  where id=p_payment_id;
end;
$$;

create or replace function public.admin_process_trade_transfer(
  p_payment_id uuid,
  p_action text,
  p_reference text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  payment_row public.trade_payments%rowtype;
  offer_row public.trade_offers%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into payment_row from public.trade_payments where id=p_payment_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  select * into offer_row from public.trade_offers where id=payment_row.trade_offer_id for update;

  if p_action='isleme_al' then
    if payment_row.transfer_status<>'emir_verildi' then raise exception 'Aktarım emri işleme alınmaya uygun değil.'; end if;
    update public.trade_payments
    set transfer_status='isleniyor',
        transfer_started_at=timezone('utc',now()),
        transfer_reference=coalesce(nullif(trim(p_reference),''),transfer_reference),
        admin_note=coalesce(nullif(trim(p_note),''),admin_note),
        reviewed_by=auth.uid(),
        updated_at=timezone('utc',now())
    where id=p_payment_id;

  elsif p_action='tamamla' then
    if payment_row.transfer_status<>'isleniyor' then raise exception 'Aktarım henüz işleniyor durumunda değil.'; end if;
    if nullif(trim(coalesce(p_reference,payment_row.transfer_reference,'')),'') is null then
      raise exception 'Banka veya ödeme kuruluşu referansı zorunludur.';
    end if;
    if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=offer_row.id and status='acik') then
      raise exception 'Uyuşmazlık çözülmeden aktarım tamamlanamaz.';
    end if;

    update public.trade_offers
    set status='tamamlandi',
        completed_at=timezone('utc',now()),
        updated_at=timezone('utc',now())
    where id=offer_row.id;

    update public.trade_payments
    set transfer_status='tamamlandi',
        transfer_completed_at=timezone('utc',now()),
        transfer_reference=coalesce(nullif(trim(p_reference),''),transfer_reference),
        transfer_error=null,
        admin_note=coalesce(nullif(trim(p_note),''),admin_note),
        reviewed_by=auth.uid(),
        updated_at=timezone('utc',now())
    where id=p_payment_id;

  elsif p_action='hata' then
    if payment_row.transfer_status not in ('emir_verildi','isleniyor') then raise exception 'Bu aktarım hata durumuna alınamaz.'; end if;
    if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Aktarım hatası açıklaması zorunludur.'; end if;
    update public.trade_payments
    set transfer_status='hata',
        transfer_error=trim(p_note),
        admin_note=trim(p_note),
        reviewed_by=auth.uid(),
        updated_at=timezone('utc',now())
    where id=p_payment_id;
  else
    raise exception 'Geçersiz aktarım işlemi.';
  end if;
end;
$$;

-- Eski tamamlanmış kayıtları yeni süreç göstergesiyle uyumlu hale getir.
update public.trade_payments
set transfer_status='tamamlandi',
    transfer_requested_at=coalesce(transfer_requested_at,released_at,updated_at),
    transfer_started_at=coalesce(transfer_started_at,released_at,updated_at),
    transfer_completed_at=coalesce(transfer_completed_at,released_at,updated_at)
where status='saticiya_aktarildi' and transfer_status='beklemede';

grant execute on function public.admin_release_trade_payment(uuid,text) to authenticated;
grant execute on function public.admin_process_trade_transfer(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
