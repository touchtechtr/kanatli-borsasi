begin;

alter table public.trade_delivery_disputes
  drop constraint if exists trade_delivery_disputes_status_check;
alter table public.trade_delivery_disputes
  add constraint trade_delivery_disputes_status_check
  check (status in ('acik','karar_verildi','aliciya_iade','saticiya_aktar','kismi_paylasim','kapatildi'));

create table if not exists public.trade_dispute_decisions (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null unique references public.trade_delivery_disputes(id) on delete restrict,
  trade_offer_id uuid not null unique references public.trade_offers(id) on delete restrict,
  payment_id uuid not null unique references public.trade_payments(id) on delete restrict,
  currency text not null default 'TRY' check (currency='TRY'),
  buyer_total numeric(18,2) not null check (buyer_total>=0),
  buyer_refund_amount numeric(18,2) not null check (buyer_refund_amount>=0),
  seller_payout_amount numeric(18,2) not null check (seller_payout_amount>=0),
  platform_commission_amount numeric(18,2) not null check (platform_commission_amount>=0),
  decision_type text not null check (decision_type in ('tam_iade','tam_satici','kismi_paylasim')),
  reason text not null check (length(trim(reason)) between 10 and 3000),
  status text not null default 'aktarim_bekliyor' check (status in ('aktarim_bekliyor','aktarim_suruyor','tamamlandi','iptal')),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  check (buyer_total=buyer_refund_amount+seller_payout_amount+platform_commission_amount)
);

create table if not exists public.trade_dispute_settlement_orders (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.trade_dispute_decisions(id) on delete restrict,
  dispute_id uuid not null references public.trade_delivery_disputes(id) on delete restrict,
  payment_id uuid not null references public.trade_payments(id) on delete restrict,
  trade_offer_id uuid not null references public.trade_offers(id) on delete restrict,
  settlement_kind text not null check (settlement_kind in ('buyer_refund','seller_payout')),
  recipient_company_id uuid not null references public.companies(id) on delete restrict,
  attempt_no integer not null check (attempt_no>0),
  priority integer not null default 0 check (priority between 0 and 100),
  provider text not null,
  currency text not null default 'TRY' check (currency='TRY'),
  gross_amount numeric(18,2) not null check (gross_amount>0),
  transfer_fee numeric(18,2) not null default 0 check (transfer_fee>=0),
  fee_payer text not null default 'platform' check (fee_payer in ('platform','recipient')),
  net_amount numeric(18,2) not null check (net_amount>=0),
  status text not null default 'emir_verildi' check (status in ('emir_verildi','isleniyor','tamamlandi','hata','iptal')),
  provider_reference text,
  failure_reason text,
  admin_note text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default timezone('utc',now()),
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  failed_by uuid references auth.users(id) on delete set null,
  failed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(decision_id,settlement_kind,attempt_no)
);

create unique index if not exists trade_dispute_settlement_one_active_idx
  on public.trade_dispute_settlement_orders(decision_id,settlement_kind)
  where status in ('emir_verildi','isleniyor');
create index if not exists trade_dispute_settlement_queue_idx
  on public.trade_dispute_settlement_orders(status,priority desc,requested_at);

create table if not exists public.trade_dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.trade_delivery_disputes(id) on delete restrict,
  decision_id uuid references public.trade_dispute_decisions(id) on delete restrict,
  settlement_order_id uuid references public.trade_dispute_settlement_orders(id) on delete restrict,
  event_type text not null check (event_type in ('uyusmazlik_acildi','karar_verildi','emir_verildi','isleme_alindi','hata','tamamlandi','dosya_kapatildi')),
  old_status text,
  new_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_reference text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  sequence_no bigint generated always as identity
);
create unique index if not exists trade_dispute_events_sequence_unique on public.trade_dispute_events(sequence_no);
create index if not exists trade_dispute_events_dispute_idx on public.trade_dispute_events(dispute_id,sequence_no);

alter table public.trade_dispute_decisions enable row level security;
alter table public.trade_dispute_settlement_orders enable row level security;
alter table public.trade_dispute_events enable row level security;

drop policy if exists trade_dispute_decisions_read on public.trade_dispute_decisions;
create policy trade_dispute_decisions_read on public.trade_dispute_decisions for select to authenticated using (
  public.is_platform_admin() or exists(
    select 1 from public.trade_offers o where o.id=trade_offer_id and (
      public.is_company_member(o.buyer_company_id,null) or public.is_company_member(o.seller_company_id,null)
      or exists(select 1 from public.companies c where c.id in(o.buyer_company_id,o.seller_company_id) and c.user_id=auth.uid())
    )
  )
);
drop policy if exists trade_dispute_settlement_orders_read on public.trade_dispute_settlement_orders;
create policy trade_dispute_settlement_orders_read on public.trade_dispute_settlement_orders for select to authenticated using (
  public.is_platform_admin() or exists(
    select 1 from public.trade_offers o where o.id=trade_offer_id and (
      public.is_company_member(o.buyer_company_id,null) or public.is_company_member(o.seller_company_id,null)
      or exists(select 1 from public.companies c where c.id in(o.buyer_company_id,o.seller_company_id) and c.user_id=auth.uid())
    )
  )
);
drop policy if exists trade_dispute_events_read on public.trade_dispute_events;
create policy trade_dispute_events_read on public.trade_dispute_events for select to authenticated using (
  public.is_platform_admin() or exists(
    select 1 from public.trade_delivery_disputes d join public.trade_offers o on o.id=d.trade_offer_id
    where d.id=dispute_id and (
      public.is_company_member(o.buyer_company_id,null) or public.is_company_member(o.seller_company_id,null)
      or exists(select 1 from public.companies c where c.id in(o.buyer_company_id,o.seller_company_id) and c.user_id=auth.uid())
    )
  )
);
grant select on public.trade_dispute_decisions,public.trade_dispute_settlement_orders,public.trade_dispute_events to authenticated;

alter table public.wallet_transactions drop constraint if exists wallet_transactions_transaction_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_transaction_type_check
check (transaction_type in ('sale_income','purchase_expense','platform_commission','buyer_refund','transfer_fee','adjustment'));

alter table public.wallet_transactions
  add column if not exists trade_dispute_decision_id uuid references public.trade_dispute_decisions(id) on delete restrict;

create unique index if not exists wallet_transactions_dispute_type_unique
  on public.wallet_transactions(trade_dispute_decision_id,transaction_type,wallet_account_id)
  where trade_dispute_decision_id is not null;

create or replace function public.admin_resolve_trade_dispute(
  p_dispute_id uuid,
  p_buyer_refund numeric,
  p_seller_payout numeric,
  p_platform_commission numeric,
  p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  dispute_row public.trade_delivery_disputes%rowtype;
  payment_row public.trade_payments%rowtype;
  decision_id uuid;
  decision_kind text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Gerekçeli karar en az 10 karakter olmalıdır.'; end if;
  if least(coalesce(p_buyer_refund,-1),coalesce(p_seller_payout,-1),coalesce(p_platform_commission,-1))<0 then
    raise exception 'Dağıtım tutarları negatif olamaz.';
  end if;

  select * into dispute_row from public.trade_delivery_disputes where id=p_dispute_id for update;
  if not found or dispute_row.status<>'acik' then raise exception 'Uyuşmazlık açık durumda değil.'; end if;
  select * into payment_row from public.trade_payments where trade_offer_id=dispute_row.trade_offer_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  if payment_row.transfer_status in ('emir_verildi','isleniyor','tamamlandi') then
    raise exception 'Aktif veya tamamlanmış normal aktarım bulunan dosyada karar verilemez.';
  end if;
  if round(coalesce(p_buyer_refund,0)+coalesce(p_seller_payout,0)+coalesce(p_platform_commission,0),2)<>round(payment_row.buyer_total,2) then
    raise exception 'Alıcı iadesi + satıcı ödemesi + platform komisyonu, havuz toplamına eşit olmalıdır.';
  end if;

  decision_kind:=case
    when p_buyer_refund=payment_row.buyer_total then 'tam_iade'
    when p_buyer_refund=0 and p_seller_payout>0 then 'tam_satici'
    else 'kismi_paylasim' end;

  insert into public.trade_dispute_decisions(
    dispute_id,trade_offer_id,payment_id,currency,buyer_total,buyer_refund_amount,
    seller_payout_amount,platform_commission_amount,decision_type,reason,decided_by
  ) values(
    dispute_row.id,dispute_row.trade_offer_id,payment_row.id,payment_row.currency,payment_row.buyer_total,
    round(p_buyer_refund,2),round(p_seller_payout,2),round(p_platform_commission,2),
    decision_kind,trim(p_reason),auth.uid()
  ) returning id into decision_id;

  update public.trade_delivery_disputes
  set status='karar_verildi',admin_note=trim(p_reason),resolved_by=auth.uid(),resolved_at=timezone('utc',now())
  where id=p_dispute_id;

  insert into public.trade_dispute_events(dispute_id,decision_id,event_type,old_status,new_status,actor_user_id,detail)
  values(p_dispute_id,decision_id,'karar_verildi','acik','karar_verildi',auth.uid(),
    jsonb_build_object('buyer_refund',round(p_buyer_refund,2),'seller_payout',round(p_seller_payout,2),'platform_commission',round(p_platform_commission,2),'decision_type',decision_kind,'reason',trim(p_reason)));

  return decision_id;
end; $$;

create or replace function public.admin_create_dispute_settlement_order(
  p_decision_id uuid,p_kind text,p_provider text default 'manuel',p_transfer_fee numeric default 0,
  p_fee_payer text default 'platform',p_priority integer default 0,p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  decision_row public.trade_dispute_decisions%rowtype;
  offer_row public.trade_offers%rowtype;
  target_amount numeric;
  target_company uuid;
  attempt_value integer;
  net_value numeric;
  order_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_kind not in ('buyer_refund','seller_payout') then raise exception 'Geçersiz ödeme ayağı.'; end if;
  if coalesce(p_transfer_fee,0)<0 then raise exception 'Aktarım masrafı negatif olamaz.'; end if;
  if p_fee_payer not in ('platform','recipient') then raise exception 'Geçersiz masraf tarafı.'; end if;
  if coalesce(p_priority,0) not between 0 and 100 then raise exception 'Öncelik 0–100 arasında olmalıdır.'; end if;

  select * into decision_row from public.trade_dispute_decisions where id=p_decision_id for update;
  if not found or decision_row.status not in ('aktarim_bekliyor','aktarim_suruyor') then raise exception 'Karar aktarım emrine uygun değil.'; end if;
  select * into offer_row from public.trade_offers where id=decision_row.trade_offer_id;
  target_amount:=case when p_kind='buyer_refund' then decision_row.buyer_refund_amount else decision_row.seller_payout_amount end;
  target_company:=case when p_kind='buyer_refund' then offer_row.buyer_company_id else offer_row.seller_company_id end;
  if target_amount<=0 then raise exception 'Bu karar için seçilen ödeme ayağında tutar bulunmuyor.'; end if;
  if exists(select 1 from public.trade_dispute_settlement_orders where decision_id=p_decision_id and settlement_kind=p_kind and status='tamamlandi') then raise exception 'Bu ödeme ayağı daha önce tamamlandı.'; end if;
  if exists(select 1 from public.trade_dispute_settlement_orders where decision_id=p_decision_id and settlement_kind=p_kind and status in ('emir_verildi','isleniyor')) then raise exception 'Bu ödeme ayağı için aktif emir var.'; end if;
  net_value:=target_amount-case when p_fee_payer='recipient' then coalesce(p_transfer_fee,0) else 0 end;
  if net_value<0 then raise exception 'Aktarım masrafı alıcı tutarından büyük olamaz.'; end if;
  select coalesce(max(attempt_no),0)+1 into attempt_value from public.trade_dispute_settlement_orders where decision_id=p_decision_id and settlement_kind=p_kind;

  insert into public.trade_dispute_settlement_orders(
    decision_id,dispute_id,payment_id,trade_offer_id,settlement_kind,recipient_company_id,attempt_no,
    priority,provider,currency,gross_amount,transfer_fee,fee_payer,net_amount,status,admin_note,requested_by
  ) values(
    decision_row.id,decision_row.dispute_id,decision_row.payment_id,decision_row.trade_offer_id,p_kind,target_company,
    attempt_value,coalesce(p_priority,0),coalesce(nullif(trim(p_provider),''),'manuel'),decision_row.currency,target_amount,
    coalesce(p_transfer_fee,0),p_fee_payer,net_value,'emir_verildi',nullif(trim(p_note),''),auth.uid()
  ) returning id into order_id;

  update public.trade_dispute_decisions set status='aktarim_suruyor' where id=p_decision_id;
  insert into public.trade_dispute_events(dispute_id,decision_id,settlement_order_id,event_type,old_status,new_status,actor_user_id,detail)
  values(decision_row.dispute_id,decision_row.id,order_id,'emir_verildi','beklemede','emir_verildi',auth.uid(),
    jsonb_build_object('kind',p_kind,'attempt',attempt_value,'provider',coalesce(nullif(trim(p_provider),''),'manuel'),'gross',target_amount,'fee',coalesce(p_transfer_fee,0),'fee_payer',p_fee_payer,'net',net_value,'priority',coalesce(p_priority,0)));
  return order_id;
end; $$;

create or replace function public.finalize_trade_dispute_decision(p_decision_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  d public.trade_dispute_decisions%rowtype;
  required_count integer:=0;
  completed_count integer:=0;
  final_dispute_status text;
begin
  select * into d from public.trade_dispute_decisions where id=p_decision_id for update;
  if not found or d.status='tamamlandi' then return; end if;
  required_count:=(case when d.buyer_refund_amount>0 then 1 else 0 end)+(case when d.seller_payout_amount>0 then 1 else 0 end);
  select count(distinct settlement_kind) into completed_count
  from public.trade_dispute_settlement_orders where decision_id=d.id and status='tamamlandi';
  if completed_count<>required_count then return; end if;

  final_dispute_status:=case when d.buyer_refund_amount=d.buyer_total then 'aliciya_iade'
    when d.buyer_refund_amount=0 then 'saticiya_aktar' else 'kismi_paylasim' end;
  update public.trade_dispute_decisions set status='tamamlandi',completed_at=timezone('utc',now()) where id=d.id;
  update public.trade_delivery_disputes set status=final_dispute_status where id=d.dispute_id;
  update public.trade_payments set
    status=case when d.seller_payout_amount>0 then 'saticiya_aktarildi' else 'iade_edildi' end,
    transfer_status='tamamlandi',
    released_at=case when d.seller_payout_amount>0 then timezone('utc',now()) else released_at end,
    refunded_at=case when d.buyer_refund_amount>0 then timezone('utc',now()) else refunded_at end,
    updated_at=timezone('utc',now())
  where id=d.payment_id;
  update public.trade_offers set status='tamamlandi',completed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=d.trade_offer_id;
  update public.trade_delivery_disputes set status='kapatildi' where id=d.dispute_id;
  insert into public.trade_dispute_events(dispute_id,decision_id,event_type,old_status,new_status,actor_user_id,detail)
  values(d.dispute_id,d.id,'dosya_kapatildi',final_dispute_status,'kapatildi',auth.uid(),jsonb_build_object('decision_type',d.decision_type));
end; $$;

create or replace function public.admin_process_dispute_settlement(
  p_order_id uuid,p_action text,p_reference text default null,p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare o public.trade_dispute_settlement_orders%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into o from public.trade_dispute_settlement_orders where id=p_order_id for update;
  if not found then raise exception 'Uyuşmazlık aktarım emri bulunamadı.'; end if;
  if p_action='isleme_al' then
    if o.status<>'emir_verildi' then raise exception 'Emir işleme alınmaya uygun değil.'; end if;
    update public.trade_dispute_settlement_orders set status='isleniyor',started_by=auth.uid(),started_at=timezone('utc',now()),provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),admin_note=coalesce(nullif(trim(p_note),''),admin_note),updated_at=timezone('utc',now()) where id=o.id;
    insert into public.trade_dispute_events(dispute_id,decision_id,settlement_order_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.dispute_id,o.decision_id,o.id,'isleme_alindi','emir_verildi','isleniyor',auth.uid(),nullif(trim(p_reference),''),jsonb_build_object('note',nullif(trim(p_note),'')));
  elsif p_action='tamamla' then
    if o.status<>'isleniyor' then raise exception 'Emir işleniyor durumunda değil.'; end if;
    if nullif(trim(coalesce(p_reference,o.provider_reference,'')),'') is null then raise exception 'Banka veya ödeme kuruluşu referansı zorunludur.'; end if;
    update public.trade_dispute_settlement_orders set status='tamamlandi',completed_by=auth.uid(),completed_at=timezone('utc',now()),provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),admin_note=coalesce(nullif(trim(p_note),''),admin_note),failure_reason=null,updated_at=timezone('utc',now()) where id=o.id;
    insert into public.trade_dispute_events(dispute_id,decision_id,settlement_order_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.dispute_id,o.decision_id,o.id,'tamamlandi','isleniyor','tamamlandi',auth.uid(),coalesce(nullif(trim(p_reference),''),o.provider_reference),jsonb_build_object('kind',o.settlement_kind,'gross',o.gross_amount,'fee',o.transfer_fee,'net',o.net_amount,'note',nullif(trim(p_note),'')));
    perform public.finalize_trade_dispute_decision(o.decision_id);
  elsif p_action='hata' then
    if o.status not in ('emir_verildi','isleniyor') then raise exception 'Emir hata kaydına uygun değil.'; end if;
    if length(trim(coalesce(p_note,'')))<5 then raise exception 'Hata açıklaması zorunludur.'; end if;
    update public.trade_dispute_settlement_orders set status='hata',failure_reason=trim(p_note),failed_by=auth.uid(),failed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=o.id;
    insert into public.trade_dispute_events(dispute_id,decision_id,settlement_order_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.dispute_id,o.decision_id,o.id,'hata',o.status,'hata',auth.uid(),o.provider_reference,jsonb_build_object('reason',trim(p_note)));
  else raise exception 'Geçersiz uyuşmazlık aktarım işlemi.'; end if;
end; $$;

create or replace function public.post_completed_trade_offer_to_wallets()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  buyer_wallet uuid; seller_wallet uuid; platform_wallet uuid;
  d public.trade_dispute_decisions%rowtype;
  platform_fee numeric:=0; buyer_fee numeric:=0; seller_fee numeric:=0;
begin
  if new.status<>'tamamlandi' or (tg_op='UPDATE' and old.status='tamamlandi') then return new; end if;
  insert into public.wallet_accounts(company_id,account_type) values(new.buyer_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type) values(new.seller_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type) values(null,'platform') on conflict do nothing;
  select id into buyer_wallet from public.wallet_accounts where company_id=new.buyer_company_id;
  select id into seller_wallet from public.wallet_accounts where company_id=new.seller_company_id;
  select id into platform_wallet from public.wallet_accounts where account_type='platform';
  select * into d from public.trade_dispute_decisions where trade_offer_id=new.id and status='tamamlandi';

  if found then
    select
      coalesce(sum(transfer_fee) filter(where fee_payer='platform'),0),
      coalesce(sum(transfer_fee) filter(where fee_payer='recipient' and settlement_kind='buyer_refund'),0),
      coalesce(sum(transfer_fee) filter(where fee_payer='recipient' and settlement_kind='seller_payout'),0)
    into platform_fee,buyer_fee,seller_fee
    from public.trade_dispute_settlement_orders where decision_id=d.id and status='tamamlandi';

    insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description)
    values(buyer_wallet,new.buyer_company_id,new.id,d.id,'purchase_expense','debit',d.buyer_total,new.product_title||' havuz ödemesi') on conflict do nothing;
    if d.buyer_refund_amount>0 then
      insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description)
      values(buyer_wallet,new.buyer_company_id,new.id,d.id,'buyer_refund','credit',d.buyer_refund_amount,new.product_title||' uyuşmazlık iadesi') on conflict do nothing;
    end if;
    if d.seller_payout_amount>0 then
      insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description)
      values(seller_wallet,new.seller_company_id,new.id,d.id,'sale_income','credit',d.seller_payout_amount,new.product_title||' uyuşmazlık satış ödemesi') on conflict do nothing;
    end if;
    if d.platform_commission_amount>0 then
      insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description)
      values(platform_wallet,null,new.id,d.id,'platform_commission','credit',d.platform_commission_amount,new.product_title||' uyuşmazlık komisyonu') on conflict do nothing;
    end if;
    if platform_fee>0 then insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description) values(platform_wallet,null,new.id,d.id,'transfer_fee','debit',platform_fee,new.product_title||' uyuşmazlık aktarım masrafı') on conflict do nothing; end if;
    if buyer_fee>0 then insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description) values(buyer_wallet,new.buyer_company_id,new.id,d.id,'transfer_fee','debit',buyer_fee,new.product_title||' iade aktarım masrafı') on conflict do nothing; end if;
    if seller_fee>0 then insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,trade_dispute_decision_id,transaction_type,direction,amount,description) values(seller_wallet,new.seller_company_id,new.id,d.id,'transfer_fee','debit',seller_fee,new.product_title||' satıcı aktarım masrafı') on conflict do nothing; end if;
  else
    insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,transaction_type,direction,amount,description) values(buyer_wallet,new.buyer_company_id,new.id,'purchase_expense','debit',new.total_amount,new.product_title||' alım ödemesi') on conflict do nothing;
    insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,transaction_type,direction,amount,description) values(seller_wallet,new.seller_company_id,new.id,'sale_income','credit',new.subtotal_amount,new.product_title||' satış geliri') on conflict do nothing;
    insert into public.wallet_transactions(wallet_account_id,company_id,trade_offer_id,transaction_type,direction,amount,description) values(platform_wallet,null,new.id,'platform_commission','credit',new.commission_amount,new.product_title||' platform komisyonu') on conflict do nothing;
  end if;
  return new;
end; $$;

create or replace function public.validate_trade_offer_update()
returns trigger language plpgsql security definer set search_path=public as $$
declare requester_is_admin boolean:=false; requester_is_buyer boolean:=false; requester_is_seller boolean:=false;
  delivery_confirmation_count integer:=0; payment_status_value text; resolved_dispute boolean:=false;
begin
  if auth.uid() is null then raise exception 'Bu işlem için giriş yapmalısınız.'; end if;
  requester_is_admin:=public.is_platform_admin();
  select exists(select 1 from public.companies c where c.id=old.buyer_company_id and (c.user_id=auth.uid() or public.is_company_member(c.id,array['owner','manager','purchasing']))) into requester_is_buyer;
  select exists(select 1 from public.companies c where c.id=old.seller_company_id and (c.user_id=auth.uid() or public.is_company_member(c.id,array['owner','manager','sales']))) into requester_is_seller;
  if new.listing_kind is distinct from old.listing_kind or new.listing_id is distinct from old.listing_id or new.buyer_company_id is distinct from old.buyer_company_id or new.seller_company_id is distinct from old.seller_company_id or new.created_by is distinct from old.created_by or new.product_title is distinct from old.product_title or new.offered_quantity is distinct from old.offered_quantity or new.unit is distinct from old.unit or new.offered_unit_price is distinct from old.offered_unit_price or new.message is distinct from old.message or new.seller_unit_price is distinct from old.seller_unit_price or new.commission_rate is distinct from old.commission_rate or new.commission_unit_amount is distinct from old.commission_unit_amount or new.buyer_unit_price is distinct from old.buyer_unit_price or new.subtotal_amount is distinct from old.subtotal_amount or new.commission_amount is distinct from old.commission_amount or new.total_amount is distinct from old.total_amount or new.created_at is distinct from old.created_at then raise exception 'Teklif ve komisyon bilgileri gönderildikten sonra değiştirilemez.'; end if;
  if new.admin_status is distinct from old.admin_status then
    if not requester_is_admin then raise exception 'Teklifin admin inceleme durumunu yalnızca yönetici değiştirebilir.'; end if;
    if old.admin_status<>'beklemede' or new.admin_status not in('onaylandi','reddedildi') then raise exception 'Geçersiz admin inceleme durumu geçişi.'; end if;
    new.admin_id:=auth.uid(); new.admin_reviewed_at:=timezone('utc',now());
    if new.admin_status='reddedildi' then new.status:='reddedildi'; new.responded_at:=timezone('utc',now()); end if;
  elsif new.admin_id is distinct from old.admin_id or new.admin_note is distinct from old.admin_note or new.admin_reviewed_at is distinct from old.admin_reviewed_at then raise exception 'Admin inceleme alanlarını yalnızca inceleme işlemi sırasında değiştirebilirsiniz.'; end if;
  if new.status is distinct from old.status and not(requester_is_admin and old.admin_status='beklemede' and new.admin_status='reddedildi' and new.status='reddedildi') then
    if requester_is_seller and old.admin_status='onaylandi' and old.status='beklemede' and new.status in('kabul_edildi','reddedildi') then new.responded_at:=timezone('utc',now());
    elsif requester_is_buyer and old.status='beklemede' and new.status='iptal_edildi' then null;
    elsif requester_is_admin and old.admin_status='onaylandi' and old.status='kabul_edildi' and new.status='tamamlandi' then
      select exists(select 1 from public.trade_dispute_decisions where trade_offer_id=old.id and status='tamamlandi') into resolved_dispute;
      if not resolved_dispute then
        select status into payment_status_value from public.trade_payments where trade_offer_id=old.id;
        if payment_status_value<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
        select count(distinct party) into delivery_confirmation_count from public.trade_delivery_confirmations where trade_offer_id=old.id;
        if delivery_confirmation_count<>2 then raise exception 'Satıcı ve alıcı teslimat onayları tamamlanmadı.'; end if;
        if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=old.id and status='acik') then raise exception 'Uyuşmazlık çözülmeden işlem tamamlanamaz.'; end if;
      end if;
      new.completed_at:=coalesce(new.completed_at,timezone('utc',now()));
    else raise exception 'Bu teklif durumu değişikliği için yetkiniz yok.'; end if;
  end if;
  new.updated_at:=timezone('utc',now()); return new;
end; $$;

grant execute on function public.admin_resolve_trade_dispute(uuid,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.admin_create_dispute_settlement_order(uuid,text,text,numeric,text,integer,text) to authenticated;
grant execute on function public.admin_process_dispute_settlement(uuid,text,text,text) to authenticated;
revoke all on function public.finalize_trade_dispute_decision(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
