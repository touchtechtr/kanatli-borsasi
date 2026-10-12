begin;

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  account_type text not null default 'company' check (account_type in ('company', 'platform')),
  currency text not null default 'TRY' check (currency = 'TRY'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (account_type = 'company' and company_id is not null)
    or (account_type = 'platform' and company_id is null)
  )
);

create unique index if not exists wallet_accounts_company_unique
  on public.wallet_accounts(company_id) where company_id is not null;
create unique index if not exists wallet_accounts_platform_unique
  on public.wallet_accounts(account_type) where account_type = 'platform';

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.wallet_accounts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  trade_offer_id uuid references public.trade_offers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('sale_income', 'purchase_expense', 'platform_commission', 'adjustment')),
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(18,2) not null check (amount >= 0),
  description text not null,
  status text not null default 'posted' check (status in ('pending', 'posted', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists wallet_transactions_offer_type_unique
  on public.wallet_transactions(trade_offer_id, transaction_type, wallet_account_id)
  where trade_offer_id is not null;
create index if not exists wallet_transactions_account_created_idx
  on public.wallet_transactions(wallet_account_id, created_at desc);

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists wallet_accounts_owner_select on public.wallet_accounts;
create policy wallet_accounts_owner_select on public.wallet_accounts
for select to authenticated using (
  public.current_user_is_admin()
  or exists (
    select 1 from public.companies company
    where company.id = wallet_accounts.company_id and company.user_id = auth.uid()
  )
);

drop policy if exists wallet_transactions_owner_select on public.wallet_transactions;
create policy wallet_transactions_owner_select on public.wallet_transactions
for select to authenticated using (
  public.current_user_is_admin()
  or exists (
    select 1 from public.companies company
    where company.id = wallet_transactions.company_id and company.user_id = auth.uid()
  )
);

grant select on public.wallet_accounts, public.wallet_transactions to authenticated;

create or replace function public.post_completed_trade_offer_to_wallets()
returns trigger language plpgsql security definer set search_path = public
as $$
declare buyer_wallet uuid; seller_wallet uuid; platform_wallet uuid;
begin
  if new.status <> 'tamamlandi' or (tg_op = 'UPDATE' and old.status = 'tamamlandi') then return new; end if;

  insert into public.wallet_accounts(company_id, account_type)
  values (new.buyer_company_id, 'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id, account_type)
  values (new.seller_company_id, 'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id, account_type)
  values (null, 'platform') on conflict do nothing;

  select id into buyer_wallet from public.wallet_accounts where company_id = new.buyer_company_id;
  select id into seller_wallet from public.wallet_accounts where company_id = new.seller_company_id;
  select id into platform_wallet from public.wallet_accounts where account_type = 'platform';

  insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
  values (buyer_wallet, new.buyer_company_id, new.id, 'purchase_expense', 'debit', new.total_amount, new.product_title || ' alım ödemesi')
  on conflict do nothing;

  insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
  values (seller_wallet, new.seller_company_id, new.id, 'sale_income', 'credit', new.subtotal_amount, new.product_title || ' satış geliri')
  on conflict do nothing;

  insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
  values (platform_wallet, null, new.id, 'platform_commission', 'credit', new.commission_amount, new.product_title || ' platform komisyonu')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trade_offer_wallet_posting on public.trade_offers;
create trigger trade_offer_wallet_posting after update of status on public.trade_offers
for each row execute function public.post_completed_trade_offer_to_wallets();

create or replace function public.get_my_wallet()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare account_id uuid; selected_company uuid; account_kind text; wallet_name text; result jsonb;
begin
  if auth.uid() is null then raise exception 'Bu işlem için giriş yapmalısınız.'; end if;
  if public.current_user_is_admin() then
    insert into public.wallet_accounts(company_id, account_type) values (null, 'platform') on conflict do nothing;
    select id into account_id from public.wallet_accounts where account_type = 'platform';
    account_kind := 'platform'; wallet_name := 'Platform Komisyon Cüzdanı';
  else
    select id, name into selected_company, wallet_name from public.companies where user_id = auth.uid() limit 1;
    if selected_company is null then raise exception 'Cüzdan için firma kaydı bulunamadı.'; end if;
    insert into public.wallet_accounts(company_id, account_type) values (selected_company, 'company') on conflict do nothing;
    select id into account_id from public.wallet_accounts where company_id = selected_company;
    account_kind := 'company';
  end if;

  select jsonb_build_object(
    'account_id', account_id,
    'account_type', account_kind,
    'company_id', selected_company,
    'name', wallet_name,
    'currency', 'TRY',
    'balance', coalesce(sum(case when direction = 'credit' then amount else -amount end) filter (where status = 'posted'), 0),
    'total_income', coalesce(sum(amount) filter (where direction = 'credit' and status = 'posted'), 0),
    'total_expense', coalesce(sum(amount) filter (where direction = 'debit' and status = 'posted'), 0),
    'transactions', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'type', transaction_type, 'direction', direction, 'amount', amount,
      'description', description, 'status', status, 'trade_offer_id', trade_offer_id,
      'created_at', created_at
    ) order by created_at desc) filter (where id is not null), '[]'::jsonb)
  ) into result
  from public.wallet_transactions where wallet_account_id = account_id;
  return result;
end;
$$;

revoke all on function public.get_my_wallet() from public, anon;
grant execute on function public.get_my_wallet() to authenticated;
revoke all on function public.post_completed_trade_offer_to_wallets() from public, anon, authenticated;

-- Mevcut tamamlanmış teklifleri güvenli ve tekrarsız biçimde aktar.
insert into public.wallet_accounts(company_id, account_type)
select buyer_company_id, 'company' from public.trade_offers where status = 'tamamlandi'
union select seller_company_id, 'company' from public.trade_offers where status = 'tamamlandi'
on conflict do nothing;
insert into public.wallet_accounts(company_id, account_type) values (null, 'platform') on conflict do nothing;

insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
select wallet.id, offer.buyer_company_id, offer.id, 'purchase_expense', 'debit', offer.total_amount, offer.product_title || ' alım ödemesi'
from public.trade_offers offer join public.wallet_accounts wallet on wallet.company_id = offer.buyer_company_id
where offer.status = 'tamamlandi' on conflict do nothing;
insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
select wallet.id, offer.seller_company_id, offer.id, 'sale_income', 'credit', offer.subtotal_amount, offer.product_title || ' satış geliri'
from public.trade_offers offer join public.wallet_accounts wallet on wallet.company_id = offer.seller_company_id
where offer.status = 'tamamlandi' on conflict do nothing;
insert into public.wallet_transactions(wallet_account_id, company_id, trade_offer_id, transaction_type, direction, amount, description)
select wallet.id, null, offer.id, 'platform_commission', 'credit', offer.commission_amount, offer.product_title || ' platform komisyonu'
from public.trade_offers offer join public.wallet_accounts wallet on wallet.account_type = 'platform'
where offer.status = 'tamamlandi' on conflict do nothing;

commit;
