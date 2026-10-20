begin;

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_transaction_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_transaction_type_check
  check (transaction_type in (
    'sale_income',
    'purchase_expense',
    'platform_commission',
    'transfer_fee',
    'adjustment'
  ));

alter table public.wallet_transactions
  add column if not exists trade_transfer_order_id uuid
  references public.trade_transfer_orders(id) on delete restrict;

create unique index if not exists wallet_transactions_transfer_fee_unique
  on public.wallet_transactions(trade_transfer_order_id,transaction_type,wallet_account_id)
  where trade_transfer_order_id is not null and transaction_type='transfer_fee';

alter table public.trade_transfer_events
  add column if not exists sequence_no bigint generated always as identity;

create unique index if not exists trade_transfer_events_sequence_unique
  on public.trade_transfer_events(sequence_no);

create or replace function public.post_completed_trade_transfer_fee()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target_wallet uuid;
  target_company uuid;
  payment_title text;
begin
  if new.status<>'tamamlandi'
     or coalesce(new.transfer_fee,0)<=0
     or (tg_op='UPDATE' and old.status='tamamlandi') then
    return new;
  end if;

  select product_title into payment_title
  from public.trade_payments
  where id=new.payment_id;

  if new.fee_payer='seller' then
    select seller_company_id into target_company
    from public.trade_payments
    where id=new.payment_id;

    insert into public.wallet_accounts(company_id,account_type)
    values(target_company,'company')
    on conflict do nothing;

    select id into target_wallet
    from public.wallet_accounts
    where company_id=target_company;
  else
    target_company:=null;

    insert into public.wallet_accounts(company_id,account_type)
    values(null,'platform')
    on conflict do nothing;

    select id into target_wallet
    from public.wallet_accounts
    where account_type='platform';
  end if;

  insert into public.wallet_transactions(
    wallet_account_id,
    company_id,
    trade_offer_id,
    trade_transfer_order_id,
    transaction_type,
    direction,
    amount,
    description
  )
  values(
    target_wallet,
    target_company,
    new.trade_offer_id,
    new.id,
    'transfer_fee',
    'debit',
    new.transfer_fee,
    coalesce(payment_title,'Ticari işlem') || ' banka/aktarım masrafı'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trade_transfer_fee_wallet_posting
  on public.trade_transfer_orders;

create trigger trade_transfer_fee_wallet_posting
after insert or update of status
on public.trade_transfer_orders
for each row execute function public.post_completed_trade_transfer_fee();

-- Daha önce tamamlanmış aktarım emirlerindeki masrafları geriye dönük kaydet.
insert into public.wallet_accounts(company_id,account_type)
select distinct
  case when o.fee_payer='seller' then p.seller_company_id else null end,
  case when o.fee_payer='seller' then 'company' else 'platform' end
from public.trade_transfer_orders o
join public.trade_payments p on p.id=o.payment_id
where o.status='tamamlandi' and o.transfer_fee>0
on conflict do nothing;

insert into public.wallet_transactions(
  wallet_account_id,
  company_id,
  trade_offer_id,
  trade_transfer_order_id,
  transaction_type,
  direction,
  amount,
  description
)
select
  wa.id,
  case when o.fee_payer='seller' then p.seller_company_id else null end,
  o.trade_offer_id,
  o.id,
  'transfer_fee',
  'debit',
  o.transfer_fee,
  p.product_title || ' banka/aktarım masrafı'
from public.trade_transfer_orders o
join public.trade_payments p on p.id=o.payment_id
join public.wallet_accounts wa
  on (
    (o.fee_payer='seller' and wa.company_id=p.seller_company_id)
    or
    (o.fee_payer='platform' and wa.account_type='platform')
  )
where o.status='tamamlandi'
  and o.transfer_fee>0
  and not exists(
    select 1
    from public.wallet_transactions wt
    where wt.trade_transfer_order_id=o.id
      and wt.transaction_type='transfer_fee'
  );

revoke all on function public.post_completed_trade_transfer_fee()
from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
