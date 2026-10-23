begin;

create table if not exists public.logistics_disputes (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.logistics_deliveries(id) on delete restrict,
  payment_id uuid not null unique references public.logistics_payments(id) on delete restrict,
  request_id uuid not null references public.logistics_requests(id) on delete restrict,
  requester_company_id uuid not null references public.companies(id) on delete restrict,
  carrier_company_id uuid not null references public.companies(id) on delete restrict,
  reason text not null check(char_length(trim(reason))>=10),
  status text not null default 'acik' check(status in ('acik','karar_verildi','aktarim_suruyor','kapatildi')),
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default timezone('utc',now()),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  admin_note text,
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.logistics_dispute_decisions (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null unique references public.logistics_disputes(id) on delete restrict,
  delivery_id uuid not null unique references public.logistics_deliveries(id) on delete restrict,
  payment_id uuid not null unique references public.logistics_payments(id) on delete restrict,
  decision_type text not null check(decision_type in ('tam_iade','nakliyeciye_tam_odeme','kismi_paylasim')),
  buyer_total numeric(14,2) not null check(buyer_total>0),
  buyer_refund_amount numeric(14,2) not null check(buyer_refund_amount>=0),
  carrier_payout_amount numeric(14,2) not null check(carrier_payout_amount>=0),
  platform_commission_amount numeric(14,2) not null check(platform_commission_amount>=0),
  currency text not null default 'TRY',
  reason text not null check(char_length(trim(reason))>=10),
  status text not null default 'aktarim_bekliyor'
    check(status in ('aktarim_bekliyor','aktarim_suruyor','tamamlandi')),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default timezone('utc',now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  check(buyer_total=buyer_refund_amount+carrier_payout_amount+platform_commission_amount)
);

create table if not exists public.logistics_dispute_transfers (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.logistics_dispute_decisions(id) on delete restrict,
  dispute_id uuid not null references public.logistics_disputes(id) on delete restrict,
  delivery_id uuid not null references public.logistics_deliveries(id) on delete restrict,
  payment_id uuid not null references public.logistics_payments(id) on delete restrict,
  leg_type text not null check(leg_type in ('buyer_refund','carrier_payout')),
  attempt_no integer not null check(attempt_no>0),
  priority integer not null default 0 check(priority between 0 and 100),
  provider text not null default 'manuel',
  currency text not null default 'TRY',
  gross_amount numeric(14,2) not null check(gross_amount>0),
  transfer_fee numeric(14,2) not null default 0 check(transfer_fee>=0),
  fee_payer text not null default 'platform' check(fee_payer in ('platform','recipient')),
  net_amount numeric(14,2) not null check(net_amount>=0),
  status text not null default 'emir_verildi'
    check(status in ('emir_verildi','isleniyor','tamamlandi','hata','iptal')),
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
  unique(decision_id,leg_type,attempt_no)
);

create unique index if not exists logistics_dispute_transfer_one_active_idx
  on public.logistics_dispute_transfers(decision_id,leg_type)
  where status in ('emir_verildi','isleniyor');
create index if not exists logistics_dispute_status_idx on public.logistics_disputes(status,opened_at desc);
create index if not exists logistics_dispute_transfer_queue_idx
  on public.logistics_dispute_transfers(status,priority desc,requested_at);

alter table public.logistics_disputes enable row level security;
alter table public.logistics_dispute_decisions enable row level security;
alter table public.logistics_dispute_transfers enable row level security;

drop policy if exists logistics_disputes_select on public.logistics_disputes;
create policy logistics_disputes_select on public.logistics_disputes for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

drop policy if exists logistics_dispute_decisions_select on public.logistics_dispute_decisions;
create policy logistics_dispute_decisions_select on public.logistics_dispute_decisions for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

drop policy if exists logistics_dispute_transfers_select on public.logistics_dispute_transfers;
create policy logistics_dispute_transfers_select on public.logistics_dispute_transfers for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

grant select on public.logistics_disputes,public.logistics_dispute_decisions,
  public.logistics_dispute_transfers to authenticated;

create or replace function public.dispute_logistics_delivery(p_delivery_id uuid,p_reason text)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_deliveries%rowtype;
  p public.logistics_payments%rowtype;
  dispute_id uuid;
begin
  if length(trim(coalesce(p_reason,'')))<10 then
    raise exception 'Uyuşmazlık açıklaması en az 10 karakter olmalıdır.';
  end if;
  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found or d.status not in ('yukleme_bekliyor','tasimada','teslim_onayi_bekliyor','teslim_onaylandi') then
    raise exception 'Bu taşıma dosyası uyuşmazlığa açılamaz.';
  end if;
  if public.is_platform_admin() or not public.can_access_logistics_delivery(d.id) then
    raise exception 'Uyuşmazlık açma yetkiniz yok.';
  end if;
  select * into p from public.logistics_payments where delivery_id=d.id for update;
  if p.status<>'havuzda' then raise exception 'Uyuşmazlık için ödeme güvenli havuzda olmalıdır.'; end if;
  if exists(select 1 from public.logistics_transfer_orders where payment_id=p.id and status in ('emir_verildi','isleniyor','tamamlandi')) then
    raise exception 'Normal ödeme aktarımı başlamış dosya uyuşmazlığa açılamaz.';
  end if;

  insert into public.logistics_disputes(
    delivery_id,payment_id,request_id,requester_company_id,carrier_company_id,
    reason,opened_by
  ) values(
    d.id,p.id,d.request_id,d.requester_company_id,d.carrier_company_id,
    trim(p_reason),auth.uid()
  ) returning id into dispute_id;

  update public.logistics_deliveries set status='uyusmazlik',
    dispute_reason=trim(p_reason),disputed_at=timezone('utc',now()),
    disputed_by=auth.uid(),updated_at=timezone('utc',now())
  where id=d.id;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(d.id,p.id,'uyusmazlik_acildi',d.status,'uyusmazlik',auth.uid(),
    jsonb_build_object('dispute_id',dispute_id,'reason',trim(p_reason)));

  return dispute_id;
end;
$$;

create or replace function public.admin_resolve_logistics_dispute(
  p_dispute_id uuid,p_buyer_refund numeric,p_carrier_payout numeric,
  p_platform_commission numeric,p_reason text
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  x public.logistics_disputes%rowtype;
  p public.logistics_payments%rowtype;
  decision_id uuid;
  decision_type_value text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Gerekçeli karar en az 10 karakter olmalıdır.'; end if;
  select * into x from public.logistics_disputes where id=p_dispute_id for update;
  if not found or x.status<>'acik' then raise exception 'Uyuşmazlık açık durumda değil.'; end if;
  select * into p from public.logistics_payments where id=x.payment_id for update;
  if p.status<>'havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  if coalesce(p_buyer_refund,-1)<0 or coalesce(p_carrier_payout,-1)<0 or coalesce(p_platform_commission,-1)<0 then
    raise exception 'Karar tutarları negatif olamaz.';
  end if;
  if p_buyer_refund>p.buyer_total or p_carrier_payout>p.carrier_amount
     or p_platform_commission>p.commission_amount then
    raise exception 'Karar tutarları ödeme bileşenlerinin üst sınırını aşamaz.';
  end if;
  if p_buyer_refund=0 and p_carrier_payout=0 then
    raise exception 'En az bir alıcı iadesi veya nakliyeci ödemesi bulunmalıdır.';
  end if;
  if round(p_buyer_refund+p_carrier_payout+p_platform_commission,2)<>round(p.buyer_total,2) then
    raise exception 'İade, nakliyeci ödemesi ve komisyon toplamı havuz tutarına eşit olmalıdır.';
  end if;
  decision_type_value:=case
    when p_buyer_refund=p.buyer_total and p_carrier_payout=0 and p_platform_commission=0 then 'tam_iade'
    when p_buyer_refund=0 and p_carrier_payout=p.carrier_amount and p_platform_commission=p.commission_amount then 'nakliyeciye_tam_odeme'
    else 'kismi_paylasim' end;

  insert into public.logistics_dispute_decisions(
    dispute_id,delivery_id,payment_id,decision_type,buyer_total,buyer_refund_amount,
    carrier_payout_amount,platform_commission_amount,currency,reason,decided_by
  ) values(
    x.id,x.delivery_id,x.payment_id,decision_type_value,p.buyer_total,p_buyer_refund,
    p_carrier_payout,p_platform_commission,p.currency,trim(p_reason),auth.uid()
  ) returning id into decision_id;

  update public.logistics_disputes set status='karar_verildi',resolved_by=auth.uid(),
    resolved_at=timezone('utc',now()),admin_note=trim(p_reason),updated_at=timezone('utc',now())
  where id=x.id;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(x.delivery_id,x.payment_id,'uyusmazlik_karari','acik','karar_verildi',auth.uid(),
    jsonb_build_object('dispute_id',x.id,'decision_id',decision_id,
      'decision_type',decision_type_value,'buyer_refund',p_buyer_refund,
      'carrier_payout',p_carrier_payout,'platform_commission',p_platform_commission,
      'reason',trim(p_reason)));

  return decision_id;
end;
$$;

create or replace function public.admin_create_logistics_dispute_transfer(
  p_decision_id uuid,p_leg_type text,p_provider text default 'manuel',
  p_transfer_fee numeric default 0,p_fee_payer text default 'platform',
  p_priority integer default 0,p_note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_dispute_decisions%rowtype;
  x public.logistics_disputes%rowtype;
  gross_value numeric(14,2);
  net_value numeric(14,2);
  attempt_value integer;
  order_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_leg_type not in ('buyer_refund','carrier_payout') then raise exception 'Geçersiz aktarım ayağı.'; end if;
  if p_fee_payer not in ('platform','recipient') then raise exception 'Geçersiz masraf tarafı.'; end if;
  if coalesce(p_transfer_fee,0)<0 then raise exception 'Aktarım masrafı negatif olamaz.'; end if;
  if coalesce(p_priority,0) not between 0 and 100 then raise exception 'Öncelik 0–100 arasında olmalıdır.'; end if;
  select * into d from public.logistics_dispute_decisions where id=p_decision_id for update;
  if not found or d.status not in ('aktarim_bekliyor','aktarim_suruyor') then raise exception 'Karar aktarım emrine uygun değil.'; end if;
  select * into x from public.logistics_disputes where id=d.dispute_id for update;
  gross_value:=case when p_leg_type='buyer_refund' then d.buyer_refund_amount else d.carrier_payout_amount end;
  if gross_value<=0 then raise exception 'Bu karar için seçilen aktarım ayağı bulunmuyor.'; end if;
  if exists(select 1 from public.logistics_dispute_transfers
    where decision_id=d.id and leg_type=p_leg_type and status='tamamlandi') then
    raise exception 'Bu aktarım ayağı daha önce tamamlandı.';
  end if;
  if exists(select 1 from public.logistics_dispute_transfers
    where decision_id=d.id and leg_type=p_leg_type and status in ('emir_verildi','isleniyor')) then
    raise exception 'Bu aktarım ayağı için aktif emir bulunuyor.';
  end if;
  net_value:=gross_value-case when p_fee_payer='recipient' then coalesce(p_transfer_fee,0) else 0 end;
  if net_value<0 then raise exception 'Aktarım masrafı brüt tutardan büyük olamaz.'; end if;
  select coalesce(max(attempt_no),0)+1 into attempt_value
  from public.logistics_dispute_transfers where decision_id=d.id and leg_type=p_leg_type;

  insert into public.logistics_dispute_transfers(
    decision_id,dispute_id,delivery_id,payment_id,leg_type,attempt_no,priority,
    provider,currency,gross_amount,transfer_fee,fee_payer,net_amount,admin_note,requested_by
  ) values(
    d.id,d.dispute_id,d.delivery_id,d.payment_id,p_leg_type,attempt_value,
    coalesce(p_priority,0),coalesce(nullif(trim(p_provider),''),'manuel'),d.currency,
    gross_value,coalesce(p_transfer_fee,0),p_fee_payer,net_value,
    nullif(trim(p_note),''),auth.uid()
  ) returning id into order_id;

  update public.logistics_dispute_decisions set status='aktarim_suruyor',
    updated_at=timezone('utc',now()) where id=d.id;
  update public.logistics_disputes set status='aktarim_suruyor',
    updated_at=timezone('utc',now()) where id=x.id;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(d.delivery_id,d.payment_id,'uyusmazlik_aktarim_emri','beklemede','emir_verildi',auth.uid(),
    jsonb_build_object('dispute_id',d.dispute_id,'decision_id',d.id,'transfer_id',order_id,
      'leg_type',p_leg_type,'provider',coalesce(nullif(trim(p_provider),''),'manuel'),
      'transfer_fee',coalesce(p_transfer_fee,0),'fee_payer',p_fee_payer,
      'attempt_no',attempt_value,'priority',coalesce(p_priority,0)));

  return order_id;
end;
$$;

create or replace function public.finalize_logistics_dispute(p_decision_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_dispute_decisions%rowtype;
  x public.logistics_disputes%rowtype;
  p public.logistics_payments%rowtype;
  requester_wallet uuid;
  carrier_wallet uuid;
  platform_wallet uuid;
  platform_fee numeric(14,2);
  requester_fee numeric(14,2);
  carrier_fee numeric(14,2);
begin
  select * into d from public.logistics_dispute_decisions where id=p_decision_id for update;
  if not found or d.status='tamamlandi' then return false; end if;
  if d.buyer_refund_amount>0 and not exists(select 1 from public.logistics_dispute_transfers
    where decision_id=d.id and leg_type='buyer_refund' and status='tamamlandi') then return false; end if;
  if d.carrier_payout_amount>0 and not exists(select 1 from public.logistics_dispute_transfers
    where decision_id=d.id and leg_type='carrier_payout' and status='tamamlandi') then return false; end if;
  select * into x from public.logistics_disputes where id=d.dispute_id for update;
  select * into p from public.logistics_payments where id=d.payment_id for update;

  insert into public.wallet_accounts(company_id,account_type) values(x.requester_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type) values(x.carrier_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type) values(null,'platform') on conflict do nothing;
  select id into requester_wallet from public.wallet_accounts where company_id=x.requester_company_id;
  select id into carrier_wallet from public.wallet_accounts where company_id=x.carrier_company_id;
  select id into platform_wallet from public.wallet_accounts where account_type='platform';

  insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
  values(requester_wallet,x.requester_company_id,d.delivery_id,'purchase_expense','debit',d.buyer_total,'Nakliye uyuşmazlığı havuz ödemesi')
  on conflict do nothing;
  if d.buyer_refund_amount>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(requester_wallet,x.requester_company_id,d.delivery_id,'buyer_refund','credit',d.buyer_refund_amount,'Nakliye uyuşmazlığı alıcı iadesi')
    on conflict do nothing;
  end if;
  if d.carrier_payout_amount>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(carrier_wallet,x.carrier_company_id,d.delivery_id,'sale_income','credit',d.carrier_payout_amount,'Nakliye uyuşmazlığı taşıma geliri')
    on conflict do nothing;
  end if;
  if d.platform_commission_amount>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(platform_wallet,null,d.delivery_id,'platform_commission','credit',d.platform_commission_amount,'Nakliye uyuşmazlığı platform komisyonu')
    on conflict do nothing;
  end if;
  select
    coalesce(sum(transfer_fee) filter(where fee_payer='platform'),0),
    coalesce(sum(transfer_fee) filter(where fee_payer='recipient' and leg_type='buyer_refund'),0),
    coalesce(sum(transfer_fee) filter(where fee_payer='recipient' and leg_type='carrier_payout'),0)
  into platform_fee,requester_fee,carrier_fee
  from public.logistics_dispute_transfers
  where decision_id=d.id and status='tamamlandi';

  if platform_fee>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(platform_wallet,null,d.delivery_id,'transfer_fee','debit',platform_fee,'Nakliye uyuşmazlığı platform aktarım masrafı')
    on conflict do nothing;
  end if;
  if requester_fee>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(requester_wallet,x.requester_company_id,d.delivery_id,'transfer_fee','debit',requester_fee,'Nakliye uyuşmazlığı alıcı iade masrafı')
    on conflict do nothing;
  end if;
  if carrier_fee>0 then
    insert into public.wallet_transactions(wallet_account_id,company_id,logistics_delivery_id,transaction_type,direction,amount,description)
    values(carrier_wallet,x.carrier_company_id,d.delivery_id,'transfer_fee','debit',carrier_fee,'Nakliye uyuşmazlığı nakliyeci aktarım masrafı')
    on conflict do nothing;
  end if;

  update public.logistics_dispute_decisions set status='tamamlandi',
    completed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=d.id;
  update public.logistics_disputes set status='kapatildi',closed_at=timezone('utc',now()),
    updated_at=timezone('utc',now()) where id=x.id;
  update public.logistics_payments set
    status=case when d.carrier_payout_amount>0 then 'serbest_birakildi' else 'iade_edildi' end,
    transfer_status='tamamlandi',transfer_completed_at=timezone('utc',now()),
    released_at=case when d.carrier_payout_amount>0 then timezone('utc',now()) else released_at end,
    refunded_at=case when d.buyer_refund_amount>0 then timezone('utc',now()) else refunded_at end,
    released_by=case when d.carrier_payout_amount>0 then auth.uid() else released_by end,
    refunded_by=case when d.buyer_refund_amount>0 then auth.uid() else refunded_by end,
    updated_at=timezone('utc',now())
  where id=p.id;
  update public.logistics_deliveries set
    status=case when d.carrier_payout_amount>0 then 'tamamlandi' else 'iptal' end,
    payment_status=case when d.carrier_payout_amount>0 then 'serbest_birakildi' else 'iade_edildi' end,
    completed_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where id=d.delivery_id;
  update public.logistics_requests set
    status=case when d.carrier_payout_amount>0 then 'tamamlandi' else 'aktif' end,
    updated_at=timezone('utc',now()) where id=x.request_id;
  if d.carrier_payout_amount=0 then
    update public.logistics_quotes set status='reddedildi',updated_at=timezone('utc',now())
    where id=(select quote_id from public.logistics_deliveries where id=d.delivery_id);
  end if;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(d.delivery_id,d.payment_id,'uyusmazlik_dosyasi_kapatildi',d.decision_type,'kapatildi',auth.uid(),
    jsonb_build_object('dispute_id',d.dispute_id,'decision_id',d.id,
      'buyer_refund',d.buyer_refund_amount,'carrier_payout',d.carrier_payout_amount,
      'platform_commission',d.platform_commission_amount));
  return true;
end;
$$;

create or replace function public.admin_process_logistics_dispute_transfer(
  p_transfer_id uuid,p_action text,p_reference text default null,p_note text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  o public.logistics_dispute_transfers%rowtype;
  reference_value text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into o from public.logistics_dispute_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Uyuşmazlık aktarım emri bulunamadı.'; end if;
  if p_action='isleme_al' then
    if o.status<>'emir_verildi' then raise exception 'Aktarım emri işleme alınmaya uygun değil.'; end if;
    update public.logistics_dispute_transfers set status='isleniyor',
      started_by=auth.uid(),started_at=timezone('utc',now()),
      provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),
      admin_note=coalesce(nullif(trim(p_note),''),admin_note),updated_at=timezone('utc',now())
    where id=o.id;
    insert into public.logistics_delivery_events(delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.delivery_id,o.payment_id,'uyusmazlik_aktarimi_isleme_alindi','emir_verildi','isleniyor',auth.uid(),
      nullif(trim(p_reference),''),jsonb_build_object('transfer_id',o.id,'leg_type',o.leg_type,'note',nullif(trim(p_note),'')));
  elsif p_action='tamamla' then
    if o.status<>'isleniyor' then raise exception 'Aktarım işleniyor durumunda değil.'; end if;
    reference_value:=coalesce(nullif(trim(p_reference),''),o.provider_reference);
    if reference_value is null then raise exception 'Banka/sağlayıcı referansı zorunludur.'; end if;
    update public.logistics_dispute_transfers set status='tamamlandi',
      completed_by=auth.uid(),completed_at=timezone('utc',now()),provider_reference=reference_value,
      failure_reason=null,admin_note=coalesce(nullif(trim(p_note),''),admin_note),updated_at=timezone('utc',now())
    where id=o.id;
    insert into public.logistics_delivery_events(delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.delivery_id,o.payment_id,'uyusmazlik_aktarimi_tamamlandi','isleniyor','tamamlandi',auth.uid(),
      reference_value,jsonb_build_object('transfer_id',o.id,'leg_type',o.leg_type,'gross',o.gross_amount,
        'net',o.net_amount,'transfer_fee',o.transfer_fee,'note',nullif(trim(p_note),'')));
    perform public.finalize_logistics_dispute(o.decision_id);
  elsif p_action='hata' then
    if o.status not in ('emir_verildi','isleniyor') then raise exception 'Aktarım hata durumuna alınamaz.'; end if;
    if length(trim(coalesce(p_note,'')))<5 then raise exception 'Aktarım hata açıklaması zorunludur.'; end if;
    update public.logistics_dispute_transfers set status='hata',failure_reason=trim(p_note),
      failed_by=auth.uid(),failed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=o.id;
    insert into public.logistics_delivery_events(delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail)
    values(o.delivery_id,o.payment_id,'uyusmazlik_aktarim_hatasi',o.status,'hata',auth.uid(),
      o.provider_reference,jsonb_build_object('transfer_id',o.id,'leg_type',o.leg_type,'reason',trim(p_note)));
  else
    raise exception 'Geçersiz aktarım işlemi.';
  end if;
end;
$$;

create or replace function public.admin_logistics_dispute_health()
returns jsonb language plpgsql security definer stable set search_path=public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  return jsonb_build_object(
    'checked_at',timezone('utc',now()),
    'open_disputes',(select count(*) from public.logistics_disputes where status='acik'),
    'allocation_mismatches',(select count(*) from public.logistics_dispute_decisions
      where buyer_total<>buyer_refund_amount+carrier_payout_amount+platform_commission_amount),
    'closed_with_incomplete_settlement',(select count(*) from public.logistics_disputes x
      join public.logistics_dispute_decisions d on d.dispute_id=x.id
      where x.status='kapatildi' and (
        (d.buyer_refund_amount>0 and not exists(select 1 from public.logistics_dispute_transfers t where t.decision_id=d.id and t.leg_type='buyer_refund' and t.status='tamamlandi'))
        or (d.carrier_payout_amount>0 and not exists(select 1 from public.logistics_dispute_transfers t where t.decision_id=d.id and t.leg_type='carrier_payout' and t.status='tamamlandi'))
      )),
    'duplicate_completed_legs',(select count(*) from (
      select decision_id,leg_type from public.logistics_dispute_transfers where status='tamamlandi'
      group by decision_id,leg_type having count(*)>1) q),
    'active_failed_settlements',(select count(*) from public.logistics_dispute_decisions d
      where d.status='aktarim_suruyor' and exists(select 1 from public.logistics_dispute_transfers t where t.decision_id=d.id and t.status='hata')
      and not exists(select 1 from public.logistics_dispute_transfers t where t.decision_id=d.id and t.status in ('emir_verildi','isleniyor'))),
    'completed_state_mismatches',(select count(*) from public.logistics_dispute_decisions d
      join public.logistics_disputes x on x.id=d.dispute_id
      join public.logistics_payments p on p.id=d.payment_id
      where d.status='tamamlandi' and (x.status<>'kapatildi' or p.transfer_status<>'tamamlandi'))
  );
end;
$$;

revoke all on function public.dispute_logistics_delivery(uuid,text) from public,anon;
revoke all on function public.admin_resolve_logistics_dispute(uuid,numeric,numeric,numeric,text) from public,anon;
revoke all on function public.admin_create_logistics_dispute_transfer(uuid,text,text,numeric,text,integer,text) from public,anon;
revoke all on function public.admin_process_logistics_dispute_transfer(uuid,text,text,text) from public,anon;
revoke all on function public.finalize_logistics_dispute(uuid) from public,anon,authenticated;
revoke all on function public.admin_logistics_dispute_health() from public,anon;
grant execute on function public.dispute_logistics_delivery(uuid,text) to authenticated;
grant execute on function public.admin_resolve_logistics_dispute(uuid,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.admin_create_logistics_dispute_transfer(uuid,text,text,numeric,text,integer,text) to authenticated;
grant execute on function public.admin_process_logistics_dispute_transfer(uuid,text,text,text) to authenticated;
grant execute on function public.admin_logistics_dispute_health() to authenticated;

notify pgrst,'reload schema';
commit;
