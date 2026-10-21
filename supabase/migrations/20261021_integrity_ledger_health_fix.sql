begin;

create or replace function public.admin_system_integrity_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;

  select jsonb_build_object(
    'checked_at',timezone('utc',now()),
    'authorization',jsonb_build_object(
      'enabled_operation_rules',(select count(*) from public.company_operation_rules where enabled),
      'companies_without_owner',(select count(*) from public.companies where user_id is null),
      'approved_companies_without_activity',(
        select count(*) from public.companies c
        where c.status::text='onaylandi'
          and not exists(
            select 1 from public.company_activities ca
            where ca.company_id=c.id and ca.status='aktif'
          )
      ),
      'active_staff_with_company',(
        select count(*) from public.platform_staff ps
        join public.companies c on c.user_id=ps.user_id
        where ps.active
      )
    ),
    'trade_finance',jsonb_build_object(
      'accepted_offers_without_payment',(
        select count(*) from public.trade_offers o
        where o.status in ('kabul_edildi','tamamlandi')
          and not exists(select 1 from public.trade_payments p where p.trade_offer_id=o.id)
      ),
      'released_payments_without_complete_ledger',(
        select count(*)
        from public.trade_payments p
        left join public.trade_dispute_decisions d
          on d.payment_id=p.id and d.status='tamamlandi'
        where p.status in ('saticiya_aktarildi','iade_edildi')
          and (
            not exists(
              select 1 from public.wallet_transactions w
              where w.trade_offer_id=p.trade_offer_id
                and w.transaction_type='purchase_expense'
                and w.status='posted'
            )
            or (
              d.id is null and (
                not exists(
                  select 1 from public.wallet_transactions w
                  where w.trade_offer_id=p.trade_offer_id
                    and w.transaction_type='sale_income'
                    and w.status='posted'
                )
                or not exists(
                  select 1 from public.wallet_transactions w
                  where w.trade_offer_id=p.trade_offer_id
                    and w.transaction_type='platform_commission'
                    and w.status='posted'
                )
              )
            )
            or (
              d.id is not null and (
                (d.buyer_refund_amount>0 and not exists(
                  select 1 from public.wallet_transactions w
                  where w.trade_dispute_decision_id=d.id
                    and w.transaction_type='buyer_refund'
                    and w.status='posted'
                ))
                or (d.seller_payout_amount>0 and not exists(
                  select 1 from public.wallet_transactions w
                  where w.trade_dispute_decision_id=d.id
                    and w.transaction_type='sale_income'
                    and w.status='posted'
                ))
                or (d.platform_commission_amount>0 and not exists(
                  select 1 from public.wallet_transactions w
                  where w.trade_dispute_decision_id=d.id
                    and w.transaction_type='platform_commission'
                    and w.status='posted'
                ))
              )
            )
          )
      ),
      'amount_mismatches',(
        select count(*) from public.trade_payments p
        where round(p.seller_amount+p.commission_amount,2)<>round(p.buyer_total,2)
      )
    ),
    'slaughterhouse_finance',jsonb_build_object(
      'completed_deliveries_without_payment',(
        select count(*) from public.slaughterhouse_deliveries d
        where d.status='tamamlandi'
          and not exists(select 1 from public.slaughterhouse_payments p where p.delivery_id=d.id)
      ),
      'released_payments_without_complete_ledger',(
        select count(*) from public.slaughterhouse_payments p
        where p.status='serbest_birakildi'
          and (
            not exists(
              select 1 from public.wallet_transactions w
              where w.slaughterhouse_delivery_id=p.delivery_id
                and w.transaction_type='purchase_expense'
                and w.status='posted'
            )
            or not exists(
              select 1 from public.wallet_transactions w
              where w.slaughterhouse_delivery_id=p.delivery_id
                and w.transaction_type='sale_income'
                and w.status='posted'
            )
            or not exists(
              select 1 from public.wallet_transactions w
              where w.slaughterhouse_delivery_id=p.delivery_id
                and w.transaction_type='platform_commission'
                and w.status='posted'
            )
          )
      ),
      'amount_mismatches',(
        select count(*) from public.slaughterhouse_payments p
        where round(p.seller_amount+p.commission_amount,2)<>round(p.buyer_total,2)
      ),
      'ready_deliveries_with_dispute',(
        select count(*) from public.slaughterhouse_deliveries d
        where d.payment_status='serbest_birakilmaya_hazir' and d.disputed_at is not null
      )
    ),
    'email_queue',jsonb_build_object(
      'pending',(select count(*) from public.notification_email_outbox where status='beklemede'),
      'failed',(select count(*) from public.notification_email_outbox where status='hata'),
      'permanently_failed',(select count(*) from public.notification_email_outbox where status='hata' and attempt_count>=4)
    ),
    'required_guards',jsonb_build_object(
      'trade_payment_transition',to_regprocedure('public.guard_trade_payment_status_transition()') is not null,
      'slaughterhouse_payment_transition',to_regprocedure('public.guard_slaughterhouse_payment_status_transition()') is not null,
      'operation_access',to_regprocedure('public.get_company_operation_access(uuid,text)') is not null,
      'operation_assertion',to_regprocedure('public.assert_company_operation_access(uuid,text)') is not null
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_system_integrity_health() from public,anon;
grant execute on function public.admin_system_integrity_health() to authenticated;

notify pgrst,'reload schema';
commit;
