begin;

-- Finans kayıtlarında yalnızca tanımlı durum geçişlerine izin ver.
create or replace function public.guard_trade_payment_status_transition()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if not (
    (old.status='odeme_bekliyor' and new.status in ('odendi_havuzda','iptal'))
    or (old.status='odendi_havuzda' and new.status in ('saticiya_aktarildi','iade_edildi'))
  ) then
    raise exception 'Geçersiz ticari ödeme durum geçişi: % → %',old.status,new.status
      using errcode='23514',detail='trade_payment_invalid_transition';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trade_payment_status_transition_trigger on public.trade_payments;
create trigger guard_trade_payment_status_transition_trigger
before update of status on public.trade_payments
for each row execute function public.guard_trade_payment_status_transition();

create or replace function public.guard_slaughterhouse_payment_status_transition()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status is not distinct from old.status then return new; end if;

  if not (
    (old.status='serbest_birakilmaya_hazir' and new.status in ('serbest_birakildi','uyusmazlikta','iade_edildi','iptal'))
    or (old.status='uyusmazlikta' and new.status in ('serbest_birakildi','iade_edildi','iptal'))
  ) then
    raise exception 'Geçersiz kesimhane ödeme durum geçişi: % → %',old.status,new.status
      using errcode='23514',detail='slaughterhouse_payment_invalid_transition';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_slaughterhouse_payment_status_transition_trigger on public.slaughterhouse_payments;
create trigger guard_slaughterhouse_payment_status_transition_trigger
before update of status on public.slaughterhouse_payments
for each row execute function public.guard_slaughterhouse_payment_status_transition();

-- Yönetim ekranı için salt okunur bütünlük ve sağlık özeti.
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
        select count(*) from public.trade_payments p
        where p.status='saticiya_aktarildi'
          and 3<>(select count(*) from public.wallet_transactions w where w.trade_offer_id=p.trade_offer_id)
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
          and 3<>(select count(*) from public.wallet_transactions w where w.slaughterhouse_delivery_id=p.delivery_id)
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

revoke all on function public.guard_trade_payment_status_transition(),
  public.guard_slaughterhouse_payment_status_transition(),
  public.admin_system_integrity_health()
from public,anon;

revoke all on function public.guard_trade_payment_status_transition(),
  public.guard_slaughterhouse_payment_status_transition()
from authenticated;

grant execute on function public.admin_system_integrity_health() to authenticated;

commit;
