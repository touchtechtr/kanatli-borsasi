begin;

create or replace function public.admin_logistics_finance_health()
returns jsonb
language plpgsql
security definer
stable
set search_path=public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;

  return jsonb_build_object(
    'checked_at',timezone('utc',now()),
    'payment_amount_mismatches',(
      select count(*) from public.logistics_payments p
      where p.buyer_total<>p.carrier_amount+p.commission_amount
    ),
    'completed_without_payment',(
      select count(*) from public.logistics_deliveries d
      where d.status='tamamlandi'
        and not exists(select 1 from public.logistics_payments p where p.delivery_id=d.id)
    ),
    'released_without_complete_ledger',(
      select count(*) from public.logistics_payments p
      where p.status='serbest_birakildi' and (
        not exists(
          select 1 from public.wallet_transactions wt
          where wt.logistics_delivery_id=p.delivery_id
            and wt.transaction_type='purchase_expense'
            and wt.direction='debit' and wt.amount=p.buyer_total
            and wt.company_id=p.requester_company_id
        )
        or not exists(
          select 1 from public.wallet_transactions wt
          where wt.logistics_delivery_id=p.delivery_id
            and wt.transaction_type='sale_income'
            and wt.direction='credit' and wt.amount=p.carrier_amount
            and wt.company_id=p.carrier_company_id
        )
        or (
          p.commission_amount>0 and not exists(
            select 1 from public.wallet_transactions wt
            where wt.logistics_delivery_id=p.delivery_id
              and wt.transaction_type='platform_commission'
              and wt.direction='credit' and wt.amount=p.commission_amount
              and wt.company_id is null
          )
        )
      )
    ),
    'duplicate_completed_transfers',(
      select count(*) from (
        select payment_id
        from public.logistics_transfer_orders
        where status='tamamlandi'
        group by payment_id having count(*)>1
      ) x
    ),
    'active_failed_transfers',(
      select count(*) from public.logistics_payments p
      where p.status='havuzda' and p.transfer_status='hata'
        and not exists(
          select 1 from public.logistics_transfer_orders o
          where o.payment_id=p.id and o.status in ('emir_verildi','isleniyor','tamamlandi')
        )
    ),
    'completed_state_mismatches',(
      select count(*) from public.logistics_payments p
      join public.logistics_deliveries d on d.id=p.delivery_id
      join public.logistics_requests r on r.id=p.request_id
      where
        (p.status='serbest_birakildi' and (
          p.transfer_status<>'tamamlandi' or d.status<>'tamamlandi'
          or d.payment_status<>'serbest_birakildi' or r.status<>'tamamlandi'
        ))
        or
        (d.status='tamamlandi' and p.status<>'serbest_birakildi')
    ),
    'transfer_fee_ledger_mismatches',(
      select count(*) from (
        select p.delivery_id,
          coalesce((
            select sum(o.transfer_fee)
            from public.logistics_transfer_orders o
            where o.payment_id=p.id and o.status='tamamlandi'
          ),0) completed_fee,
          coalesce((
            select sum(wt.amount)
            from public.wallet_transactions wt
            where wt.logistics_delivery_id=p.delivery_id
              and wt.transaction_type='transfer_fee'
              and wt.direction='debit'
          ),0) ledger_fee
        from public.logistics_payments p
        where p.status='serbest_birakildi'
      ) x where x.completed_fee<>x.ledger_fee
    ),
    'legacy_plaintext_codes',(
      select count(*) from public.logistics_deliveries
      where pickup_code is not null or delivery_code is not null
    ),
    'missing_or_mismatched_secrets',(
      select count(*) from public.logistics_deliveries d
      left join public.logistics_delivery_secrets s on s.delivery_id=d.id
      where s.delivery_id is null or s.requester_company_id<>d.requester_company_id
    )
  );
end;
$$;

revoke all on function public.admin_logistics_finance_health() from public,anon;
grant execute on function public.admin_logistics_finance_health() to authenticated;

notify pgrst,'reload schema';
commit;
