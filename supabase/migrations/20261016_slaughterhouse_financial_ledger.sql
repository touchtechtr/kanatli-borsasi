begin;

create table if not exists public.slaughterhouse_payments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.slaughterhouse_deliveries(id) on delete restrict,
  request_id uuid not null references public.slaughterhouse_purchase_requests(id) on delete restrict,
  offer_id uuid not null references public.slaughterhouse_purchase_offers(id) on delete restrict,
  buyer_company_id uuid not null references public.companies(id) on delete restrict,
  seller_company_id uuid not null references public.companies(id) on delete restrict,
  product_title text not null,
  price_unit text not null check (price_unit in ('kg_canli','bas')),
  unit_price numeric(18,4) not null check (unit_price > 0),
  billable_quantity numeric(18,3) not null check (billable_quantity > 0),
  seller_amount numeric(18,2) not null check (seller_amount > 0),
  commission_rate numeric(7,4) not null check (commission_rate between 0 and 100),
  commission_amount numeric(18,2) not null check (commission_amount >= 0),
  buyer_total numeric(18,2) not null check (buyer_total > 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  status text not null default 'serbest_birakilmaya_hazir'
    check (status in ('serbest_birakilmaya_hazir','serbest_birakildi','uyusmazlikta','iade_edildi','iptal')),
  admin_note text,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create index if not exists slaughterhouse_payments_status_created_idx
  on public.slaughterhouse_payments(status,created_at desc);

alter table public.slaughterhouse_deliveries
  add column if not exists admin_resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.wallet_transactions
  add column if not exists slaughterhouse_delivery_id uuid
    references public.slaughterhouse_deliveries(id) on delete restrict;

create unique index if not exists wallet_transactions_slaughter_delivery_unique
  on public.wallet_transactions(slaughterhouse_delivery_id,transaction_type,wallet_account_id)
  where slaughterhouse_delivery_id is not null;

alter table public.slaughterhouse_payments enable row level security;

drop policy if exists slaughterhouse_payments_select on public.slaughterhouse_payments;
create policy slaughterhouse_payments_select on public.slaughterhouse_payments
for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_member(buyer_company_id,null)
  or public.is_company_member(seller_company_id,null)
  or exists (
    select 1 from public.companies c
    where c.id in (buyer_company_id,seller_company_id) and c.user_id=auth.uid()
  )
);

grant select on public.slaughterhouse_payments to authenticated;

create or replace function public.ensure_slaughterhouse_payment(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.slaughterhouse_deliveries;
  o public.slaughterhouse_purchase_offers;
  r public.slaughterhouse_purchase_requests;
  rate numeric(7,4);
  quantity_value numeric(18,3);
  seller_value numeric(18,2);
  commission_value numeric(18,2);
  result_id uuid;
  initial_status text;
begin
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Teslimat bulunamadı.'; end if;

  select * into o from public.slaughterhouse_purchase_offers where id=d.offer_id;
  select * into r from public.slaughterhouse_purchase_requests where id=d.request_id;

  quantity_value := case
    when o.price_unit='bas' then d.delivered_quantity::numeric
    else d.total_live_weight
  end;
  if coalesce(quantity_value,0)<=0 then
    raise exception 'Ödeme hesabı için teslim edilen miktar veya canlı ağırlık eksik.';
  end if;

  select coalesce(ps.trade_commission_rate,5) into rate
  from public.platform_settings ps where ps.id=true;
  rate:=coalesce(rate,5);
  seller_value:=round(o.unit_price*quantity_value,2);
  commission_value:=round(seller_value*rate/100,2);
  initial_status:=case
    when d.status='tamamlandi' and d.payment_status='serbest_birakildi' then 'serbest_birakildi'
    when d.status='uyusmazlik' then 'uyusmazlikta'
    else 'serbest_birakilmaya_hazir'
  end;

  insert into public.slaughterhouse_payments(
    delivery_id,request_id,offer_id,buyer_company_id,seller_company_id,
    product_title,price_unit,unit_price,billable_quantity,seller_amount,
    commission_rate,commission_amount,buyer_total,status,released_at,released_by
  ) values (
    d.id,d.request_id,d.offer_id,d.buyer_company_id,d.seller_company_id,
    r.title,o.price_unit,o.unit_price,quantity_value,seller_value,
    rate,commission_value,seller_value+commission_value,initial_status,
    case when initial_status='serbest_birakildi' then d.payment_released_at end,
    case when initial_status='serbest_birakildi' then d.payment_released_by end
  )
  on conflict(delivery_id) do update set
    billable_quantity=excluded.billable_quantity,
    seller_amount=excluded.seller_amount,
    commission_amount=excluded.commission_amount,
    buyer_total=excluded.buyer_total,
    updated_at=timezone('utc',now())
  where public.slaughterhouse_payments.status not in ('serbest_birakildi','iade_edildi','iptal')
  returning id into result_id;

  if result_id is null then
    select id into result_id from public.slaughterhouse_payments where delivery_id=d.id;
  end if;
  return result_id;
end;
$$;

create or replace function public.post_slaughterhouse_payment_to_wallets(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  payment public.slaughterhouse_payments;
  buyer_wallet uuid;
  seller_wallet uuid;
  platform_wallet uuid;
begin
  perform public.ensure_slaughterhouse_payment(p_delivery_id);
  select * into payment from public.slaughterhouse_payments
    where delivery_id=p_delivery_id for update;

  if payment.status in ('iade_edildi','iptal') then
    raise exception 'İade veya iptal edilmiş ödeme cüzdana aktarılamaz.';
  end if;

  insert into public.wallet_accounts(company_id,account_type)
  values(payment.buyer_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type)
  values(payment.seller_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type)
  values(null,'platform') on conflict do nothing;

  select id into buyer_wallet from public.wallet_accounts where company_id=payment.buyer_company_id;
  select id into seller_wallet from public.wallet_accounts where company_id=payment.seller_company_id;
  select id into platform_wallet from public.wallet_accounts where account_type='platform';

  insert into public.wallet_transactions(
    wallet_account_id,company_id,slaughterhouse_delivery_id,
    transaction_type,direction,amount,description
  ) values (
    buyer_wallet,payment.buyer_company_id,payment.delivery_id,
    'purchase_expense','debit',payment.buyer_total,
    payment.product_title||' kesimhane alım ödemesi'
  ) on conflict do nothing;

  insert into public.wallet_transactions(
    wallet_account_id,company_id,slaughterhouse_delivery_id,
    transaction_type,direction,amount,description
  ) values (
    seller_wallet,payment.seller_company_id,payment.delivery_id,
    'sale_income','credit',payment.seller_amount,
    payment.product_title||' kesimhane satış geliri'
  ) on conflict do nothing;

  insert into public.wallet_transactions(
    wallet_account_id,company_id,slaughterhouse_delivery_id,
    transaction_type,direction,amount,description
  ) values (
    platform_wallet,null,payment.delivery_id,
    'platform_commission','credit',payment.commission_amount,
    payment.product_title||' kesimhane platform komisyonu'
  ) on conflict do nothing;

  update public.slaughterhouse_payments set
    status='serbest_birakildi',released_at=coalesce(released_at,timezone('utc',now())),
    released_by=coalesce(released_by,auth.uid()),updated_at=timezone('utc',now())
  where id=payment.id;

  update public.slaughterhouse_deliveries set
    status='tamamlandi',payment_status='serbest_birakildi',
    payment_released_at=coalesce(payment_released_at,timezone('utc',now())),
    payment_released_by=coalesce(payment_released_by,auth.uid()),updated_at=timezone('utc',now())
  where id=p_delivery_id;
end;
$$;

create or replace function public.seller_confirm_slaughterhouse_delivery(p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.slaughterhouse_deliveries;
begin
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if not exists(select 1 from public.companies c where c.id=d.seller_company_id and c.user_id=auth.uid()) then raise exception 'Satıcı şirket yetkisi gerekiyor.'; end if;
  if d.status<>'alici_onayladi' then raise exception 'Önce alıcı teslimatı onaylamalıdır.'; end if;
  update public.slaughterhouse_deliveries set seller_confirmed_at=timezone('utc',now()),seller_confirmed_by=auth.uid(),status='teslim_onaylandi',payment_status='serbest_birakilmaya_hazir',updated_at=timezone('utc',now()) where id=d.id;
  perform public.ensure_slaughterhouse_payment(d.id);
end; $$;

create or replace function public.dispute_slaughterhouse_delivery(p_delivery_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_access_slaughter_delivery(p_delivery_id) or public.is_platform_admin() then raise exception 'Uyuşmazlık açma yetkiniz yok.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Uyuşmazlık açıklaması zorunludur.'; end if;
  update public.slaughterhouse_deliveries set status='uyusmazlik',payment_status='uyusmazlikta_bekletiliyor',dispute_reason=btrim(p_reason),disputed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_delivery_id and status not in('tamamlandi','iptal');
  if not found then raise exception 'Tamamlanmış veya iptal edilmiş teslimatta uyuşmazlık açılamaz.'; end if;
  update public.slaughterhouse_payments set status='uyusmazlikta',updated_at=timezone('utc',now()) where delivery_id=p_delivery_id and status='serbest_birakilmaya_hazir';
end; $$;

create or replace function public.admin_release_slaughterhouse_payment(p_delivery_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d public.slaughterhouse_deliveries;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if d.status<>'teslim_onaylandi' or d.payment_status<>'serbest_birakilmaya_hazir' then raise exception 'Ödeme serbest bırakılmaya hazır değil.'; end if;
  if d.disputed_at is not null then raise exception 'Uyuşmazlık bulunan teslimat normal ödeme akışından tamamlanamaz.'; end if;
  perform public.post_slaughterhouse_payment_to_wallets(d.id);
end; $$;

create or replace function public.admin_resolve_slaughterhouse_dispute(
  p_delivery_id uuid,p_action text,p_admin_note text
)
returns void language plpgsql security definer set search_path=public as $$
declare d public.slaughterhouse_deliveries;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_action not in ('saticiya_aktar','aliciya_iade') then raise exception 'Geçersiz uyuşmazlık kararı.'; end if;
  if nullif(btrim(p_admin_note),'') is null then raise exception 'Yönetim karar açıklaması zorunludur.'; end if;
  select * into d from public.slaughterhouse_deliveries where id=p_delivery_id for update;
  if d.status<>'uyusmazlik' or d.payment_status<>'uyusmazlikta_bekletiliyor' then raise exception 'Bu teslimat açık bir uyuşmazlık dosyası değildir.'; end if;

  perform public.ensure_slaughterhouse_payment(d.id);
  if p_action='saticiya_aktar' then
    update public.slaughterhouse_deliveries set
      status='teslim_onaylandi',payment_status='serbest_birakilmaya_hazir',
      admin_resolution_note=btrim(p_admin_note),resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),updated_at=timezone('utc',now()) where id=d.id;
    update public.slaughterhouse_payments set
      status='serbest_birakilmaya_hazir',admin_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),resolved_by=auth.uid(),updated_at=timezone('utc',now())
    where delivery_id=d.id;
    perform public.post_slaughterhouse_payment_to_wallets(d.id);
  else
    update public.slaughterhouse_deliveries set
      status='iptal',payment_status='iade_edildi',admin_resolution_note=btrim(p_admin_note),
      resolved_at=timezone('utc',now()),resolved_by=auth.uid(),updated_at=timezone('utc',now())
    where id=d.id;
    update public.slaughterhouse_payments set
      status='iade_edildi',admin_note=btrim(p_admin_note),resolved_at=timezone('utc',now()),
      resolved_by=auth.uid(),updated_at=timezone('utc',now()) where delivery_id=d.id;
  end if;
end; $$;

revoke all on function public.ensure_slaughterhouse_payment(uuid),public.post_slaughterhouse_payment_to_wallets(uuid) from public,anon,authenticated;
revoke all on function public.admin_resolve_slaughterhouse_dispute(uuid,text,text) from public,anon;
grant execute on function public.admin_resolve_slaughterhouse_dispute(uuid,text,text) to authenticated;

do $$
declare delivery_row record;
begin
  for delivery_row in
    select id,status from public.slaughterhouse_deliveries
    where delivered_quantity is not null and (total_live_weight is not null or delivered_quantity>0)
      and status in ('teslim_onaylandi','uyusmazlik','tamamlandi')
  loop
    perform public.ensure_slaughterhouse_payment(delivery_row.id);
    if delivery_row.status='tamamlandi' then
      perform public.post_slaughterhouse_payment_to_wallets(delivery_row.id);
    end if;
  end loop;
end $$;

do $$ begin
  if to_regprocedure('public.record_platform_audit_event()') is not null then
    drop trigger if exists platform_audit_trigger on public.slaughterhouse_payments;
    create trigger platform_audit_trigger after insert or update or delete on public.slaughterhouse_payments
      for each row execute function public.record_platform_audit_event();
  end if;
end $$;

commit;
