begin;

alter table public.trade_dispute_decisions
  drop constraint if exists trade_dispute_decisions_external_allocation_check;
alter table public.trade_dispute_decisions
  add constraint trade_dispute_decisions_external_allocation_check
  check (buyer_refund_amount+seller_payout_amount>0);

create or replace function public.sync_listing_lifecycle_from_trade_offer()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  table_name_value text;
  available_quantity numeric;
  dispute_seller_payout numeric;
  is_full_dispute_refund boolean:=false;
begin
  if new.status is not distinct from old.status then return new; end if;

  table_name_value:=case new.listing_kind
    when 'listing' then 'listings'
    when 'feed' then 'feed_listings'
    when 'livestock' then 'livestock_listings'
    else null
  end;
  if table_name_value is null then return new; end if;

  if new.status='kabul_edildi' then
    execute format('select quantity from public.%I where id=$1 for update',table_name_value)
      into available_quantity using new.listing_id;
    if available_quantity is null then raise exception 'İlan bulunamadı.'; end if;
    if new.offered_quantity>available_quantity then
      raise exception 'Teklif miktarı ilanın kalan miktarını aşıyor.';
    end if;

    execute format(
      'update public.%I set reserved_quantity=$1,status=''islemde''%s where id=$2',
      table_name_value,
      case when table_name_value in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
    ) using new.offered_quantity,new.listing_id;

    update public.trade_offers
    set status='reddedildi',responded_at=coalesce(responded_at,timezone('utc',now())),updated_at=timezone('utc',now())
    where listing_kind=new.listing_kind and listing_id=new.listing_id
      and id<>new.id and status='beklemede';

  elsif new.status='tamamlandi' and old.status='kabul_edildi' then
    select d.seller_payout_amount into dispute_seller_payout
    from public.trade_dispute_decisions d
    where d.trade_offer_id=new.id and d.status='tamamlandi';

    is_full_dispute_refund:=found and coalesce(dispute_seller_payout,0)=0;

    if is_full_dispute_refund then
      execute format(
        'update public.%I set reserved_quantity=0,status=''aktif'',closed_at=null%s where id=$1',
        table_name_value,
        case when table_name_value in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
      ) using new.listing_id;
    else
      execute format(
        'update public.%I set quantity=greatest(quantity-$1,0),reserved_quantity=0,sold_quantity=sold_quantity+$1,status=case when quantity-$1>0 then ''aktif'' else ''tamamlandi'' end,closed_at=case when quantity-$1>0 then null else timezone(''utc'',now()) end%s where id=$2',
        table_name_value,
        case when table_name_value in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
      ) using new.offered_quantity,new.listing_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_listing_lifecycle_from_trade_offer()
from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
