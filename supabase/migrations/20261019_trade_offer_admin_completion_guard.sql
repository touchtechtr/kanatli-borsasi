begin;

create or replace function public.validate_trade_offer_update()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  requester_is_admin boolean := false;
  requester_is_buyer boolean := false;
  requester_is_seller boolean := false;
  delivery_confirmation_count integer := 0;
  payment_status_value text;
begin
  if auth.uid() is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;

  requester_is_admin := public.is_platform_admin();

  select exists (
    select 1 from public.companies c
    where c.id=old.buyer_company_id
      and (
        c.user_id=auth.uid()
        or public.is_company_member(c.id,array['owner','manager','purchasing'])
      )
  ) into requester_is_buyer;

  select exists (
    select 1 from public.companies c
    where c.id=old.seller_company_id
      and (
        c.user_id=auth.uid()
        or public.is_company_member(c.id,array['owner','manager','sales'])
      )
  ) into requester_is_seller;

  if new.listing_kind is distinct from old.listing_kind
     or new.listing_id is distinct from old.listing_id
     or new.buyer_company_id is distinct from old.buyer_company_id
     or new.seller_company_id is distinct from old.seller_company_id
     or new.created_by is distinct from old.created_by
     or new.product_title is distinct from old.product_title
     or new.offered_quantity is distinct from old.offered_quantity
     or new.unit is distinct from old.unit
     or new.offered_unit_price is distinct from old.offered_unit_price
     or new.message is distinct from old.message
     or new.seller_unit_price is distinct from old.seller_unit_price
     or new.commission_rate is distinct from old.commission_rate
     or new.commission_unit_amount is distinct from old.commission_unit_amount
     or new.buyer_unit_price is distinct from old.buyer_unit_price
     or new.subtotal_amount is distinct from old.subtotal_amount
     or new.commission_amount is distinct from old.commission_amount
     or new.total_amount is distinct from old.total_amount
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Teklif ve komisyon bilgileri gönderildikten sonra değiştirilemez.';
  end if;

  if new.admin_status is distinct from old.admin_status then
    if not requester_is_admin then
      raise exception 'Teklifin admin inceleme durumunu yalnızca yönetici değiştirebilir.';
    end if;

    if old.admin_status<>'beklemede'
       or new.admin_status not in ('onaylandi','reddedildi') then
      raise exception 'Geçersiz admin inceleme durumu geçişi.';
    end if;

    new.admin_id := auth.uid();
    new.admin_reviewed_at := timezone('utc',now());

    if new.admin_status='reddedildi' then
      new.status := 'reddedildi';
      new.responded_at := timezone('utc',now());
    end if;
  elsif new.admin_id is distinct from old.admin_id
     or new.admin_note is distinct from old.admin_note
     or new.admin_reviewed_at is distinct from old.admin_reviewed_at
  then
    -- Ödeme serbest bırakma sırasında admin notunun güncellenmesi trade_payments
    -- üzerinde yapılır; teklif inceleme alanları sonradan değiştirilemez.
    raise exception 'Admin inceleme alanlarını yalnızca inceleme işlemi sırasında değiştirebilirsiniz.';
  end if;

  if new.status is distinct from old.status
     and not (
       requester_is_admin
       and old.admin_status='beklemede'
       and new.admin_status='reddedildi'
       and new.status='reddedildi'
     )
  then
    if requester_is_seller
       and old.admin_status='onaylandi'
       and old.status='beklemede'
       and new.status in ('kabul_edildi','reddedildi') then
      new.responded_at := timezone('utc',now());

    elsif requester_is_buyer
       and old.status='beklemede'
       and new.status='iptal_edildi' then
      null;

    elsif requester_is_admin
       and old.admin_status='onaylandi'
       and old.status='kabul_edildi'
       and new.status='tamamlandi' then
      select status into payment_status_value
      from public.trade_payments
      where trade_offer_id=old.id;

      if payment_status_value<>'odendi_havuzda' then
        raise exception 'Ödeme güvenli havuzda değil.';
      end if;

      select count(distinct party) into delivery_confirmation_count
      from public.trade_delivery_confirmations
      where trade_offer_id=old.id;

      if delivery_confirmation_count<>2 then
        raise exception 'Satıcı ve alıcı teslimat onayları tamamlanmadı.';
      end if;

      if exists (
        select 1 from public.trade_delivery_disputes
        where trade_offer_id=old.id and status='acik'
      ) then
        raise exception 'Uyuşmazlık çözülmeden işlem tamamlanamaz.';
      end if;

      new.completed_at := coalesce(new.completed_at,timezone('utc',now()));

    else
      raise exception 'Bu teklif durumu değişikliği için yetkiniz yok.';
    end if;
  end if;

  new.updated_at := timezone('utc',now());
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
