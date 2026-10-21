begin;

create or replace function public.admin_trade_dispute_health()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;

  select jsonb_build_object(
    'checked_at', timezone('utc',now()),
    'open_disputes', (
      select count(*) from public.trade_delivery_disputes
      where status='acik'
    ),
    'allocation_mismatches', (
      select count(*) from public.trade_dispute_decisions
      where round(buyer_total,2) <> round(
        buyer_refund_amount + seller_payout_amount + platform_commission_amount,
        2
      )
    ),
    'closed_with_incomplete_settlement', (
      select count(*)
      from public.trade_delivery_disputes d
      left join public.trade_dispute_decisions x on x.dispute_id=d.id
      where d.status='kapatildi'
        and (
          x.id is null
          or x.status<>'tamamlandi'
          or (x.buyer_refund_amount>0 and not exists(
            select 1 from public.trade_dispute_settlement_orders o
            where o.decision_id=x.id and o.settlement_kind='buyer_refund' and o.status='tamamlandi'
          ))
          or (x.seller_payout_amount>0 and not exists(
            select 1 from public.trade_dispute_settlement_orders o
            where o.decision_id=x.id and o.settlement_kind='seller_payout' and o.status='tamamlandi'
          ))
        )
    ),
    'duplicate_completed_legs', (
      select count(*) from (
        select decision_id,settlement_kind
        from public.trade_dispute_settlement_orders
        where status='tamamlandi'
        group by decision_id,settlement_kind
        having count(*)>1
      ) duplicate_legs
    ),
    'settlement_fee_ledger_mismatches', (
      select count(*)
      from public.trade_dispute_decisions x
      where x.status='tamamlandi'
        and round(coalesce((
          select sum(o.transfer_fee)
          from public.trade_dispute_settlement_orders o
          where o.decision_id=x.id and o.status='tamamlandi'
        ),0),2) <> round(coalesce((
          select sum(w.amount)
          from public.wallet_transactions w
          where w.trade_dispute_decision_id=x.id
            and w.transaction_type='transfer_fee'
            and w.status='posted'
        ),0),2)
    ),
    'completed_state_mismatches', (
      select count(*)
      from public.trade_dispute_decisions x
      join public.trade_delivery_disputes d on d.id=x.dispute_id
      join public.trade_payments p on p.id=x.payment_id
      join public.trade_offers o on o.id=x.trade_offer_id
      where x.status='tamamlandi'
        and (
          d.status<>'kapatildi'
          or o.status<>'tamamlandi'
          or p.transfer_status<>'tamamlandi'
          or (x.seller_payout_amount>0 and p.status<>'saticiya_aktarildi')
          or (x.seller_payout_amount=0 and p.status<>'iade_edildi')
          or (x.buyer_refund_amount>0 and p.refunded_at is null)
          or (x.seller_payout_amount>0 and p.released_at is null)
        )
    ),
    'active_failed_settlements', (
      select count(distinct decision_id)
      from public.trade_dispute_settlement_orders
      where status='hata'
        and not exists(
          select 1
          from public.trade_dispute_settlement_orders completed
          where completed.decision_id=trade_dispute_settlement_orders.decision_id
            and completed.settlement_kind=trade_dispute_settlement_orders.settlement_kind
            and completed.status='tamamlandi'
        )
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_trade_dispute_health() from public,anon;
grant execute on function public.admin_trade_dispute_health() to authenticated;

notify pgrst,'reload schema';
commit;
