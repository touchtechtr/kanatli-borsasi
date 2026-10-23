begin;

alter table public.logistics_payments
  add column if not exists carrier_amount numeric(14,2),
  add column if not exists commission_rate numeric(7,4),
  add column if not exists commission_amount numeric(14,2),
  add column if not exists buyer_total numeric(14,2),
  add column if not exists transfer_status text not null default 'beklemede'
    check(transfer_status in ('beklemede','emir_verildi','isleniyor','tamamlandi','hata')),
  add column if not exists transfer_requested_at timestamptz,
  add column if not exists transfer_requested_by uuid references auth.users(id) on delete set null,
  add column if not exists transfer_started_at timestamptz,
  add column if not exists transfer_completed_at timestamptz,
  add column if not exists transfer_reference text,
  add column if not exists transfer_error text;

update public.logistics_payments
set carrier_amount=coalesce(carrier_amount,amount),
    commission_rate=coalesce(commission_rate,0),
    commission_amount=coalesce(commission_amount,0),
    buyer_total=coalesce(buyer_total,amount)
where carrier_amount is null or commission_rate is null
   or commission_amount is null or buyer_total is null;

alter table public.logistics_payments
  alter column carrier_amount set not null,
  alter column commission_rate set not null,
  alter column commission_amount set not null,
  alter column buyer_total set not null;

do $$ begin
  if not exists(
    select 1 from pg_constraint
    where conname='logistics_payment_amount_balance_check'
      and conrelid='public.logistics_payments'::regclass
  ) then
    alter table public.logistics_payments
      add constraint logistics_payment_amount_balance_check
      check(buyer_total=carrier_amount+commission_amount);
  end if;
end $$;

create table if not exists public.logistics_transfer_orders (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.logistics_payments(id) on delete restrict,
  delivery_id uuid not null references public.logistics_deliveries(id) on delete restrict,
  attempt_no integer not null check(attempt_no>0),
  priority integer not null default 0 check(priority between 0 and 100),
  provider text not null default 'manuel',
  currency text not null default 'TRY',
  buyer_total numeric(14,2) not null check(buyer_total>=0),
  carrier_gross_amount numeric(14,2) not null check(carrier_gross_amount>=0),
  platform_gross_commission numeric(14,2) not null check(platform_gross_commission>=0),
  transfer_fee numeric(14,2) not null default 0 check(transfer_fee>=0),
  fee_payer text not null default 'platform' check(fee_payer in ('platform','carrier')),
  carrier_net_amount numeric(14,2) not null check(carrier_net_amount>=0),
  platform_net_commission numeric(14,2) not null,
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
  unique(payment_id,attempt_no)
);

create unique index if not exists logistics_transfer_one_active_idx
  on public.logistics_transfer_orders(payment_id)
  where status in ('emir_verildi','isleniyor');
create index if not exists logistics_transfer_queue_idx
  on public.logistics_transfer_orders(status,priority desc,requested_at,attempt_no);

create table if not exists public.logistics_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.logistics_deliveries(id) on delete restrict,
  payment_id uuid references public.logistics_payments(id) on delete restrict,
  transfer_order_id uuid references public.logistics_transfer_orders(id) on delete restrict,
  event_type text not null,
  old_status text,
  new_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_reference text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  sequence_no bigint generated always as identity
);

create index if not exists logistics_delivery_events_file_idx
  on public.logistics_delivery_events(delivery_id,sequence_no);

alter table public.logistics_transfer_orders enable row level security;
alter table public.logistics_delivery_events enable row level security;

drop policy if exists logistics_transfer_orders_select on public.logistics_transfer_orders;
create policy logistics_transfer_orders_select
on public.logistics_transfer_orders for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

drop policy if exists logistics_delivery_events_select on public.logistics_delivery_events;
create policy logistics_delivery_events_select
on public.logistics_delivery_events for select to authenticated
using(public.can_access_logistics_delivery(delivery_id));

grant select on public.logistics_transfer_orders,public.logistics_delivery_events to authenticated;

alter table public.wallet_transactions
  add column if not exists logistics_delivery_id uuid
    references public.logistics_deliveries(id) on delete restrict;

create unique index if not exists wallet_transactions_logistics_unique
  on public.wallet_transactions(logistics_delivery_id,transaction_type,wallet_account_id)
  where logistics_delivery_id is not null;

create or replace function public.accept_logistics_quote(p_quote_id uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  q public.logistics_quotes%rowtype;
  r public.logistics_requests%rowtype;
  delivery_id uuid;
  payment_id uuid;
  pickup_code_value text;
  delivery_code_value text;
  rate_value numeric(7,4);
  commission_value numeric(14,2);
  buyer_value numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Oturum gerekiyor.'; end if;

  select * into q from public.logistics_quotes where id=p_quote_id for update;
  if not found or q.status<>'beklemede' then raise exception 'Bekleyen teklif bulunamadı.'; end if;

  select * into r from public.logistics_requests where id=q.request_id for update;
  if not found or r.status<>'aktif' then raise exception 'Taşıma talebi aktif değil.'; end if;

  if not public.is_company_member(r.company_id,null)
     and not exists(select 1 from public.companies c where c.id=r.company_id and c.user_id=auth.uid()) then
    raise exception 'Bu taşıma teklifini kabul etme yetkiniz yok.';
  end if;

  if not exists(
    select 1 from public.logistics_vehicles v
    join public.logistics_vehicle_capabilities cap on cap.vehicle_id=v.id
    where v.id=q.vehicle_id and v.company_id=q.carrier_company_id
      and v.status='onaylandi' and cap.capability=r.cargo_type
  ) then raise exception 'Nakliyeci aracı artık bu taşıma için uygun değil.'; end if;

  update public.logistics_quotes set
    status=case when id=q.id then 'kabul_edildi' else 'reddedildi' end,
    updated_at=timezone('utc',now())
  where request_id=r.id and status='beklemede';

  update public.logistics_requests set status='eslesme_yapildi',
    updated_at=timezone('utc',now()) where id=r.id;

  pickup_code_value:=lpad((floor(random()*1000000))::int::text,6,'0');
  delivery_code_value:=lpad((floor(random()*1000000))::int::text,6,'0');

  select coalesce(trade_commission_rate,5) into rate_value
  from public.platform_settings where id=true;
  rate_value:=coalesce(rate_value,5);
  commission_value:=round(q.amount*rate_value/100,2);
  buyer_value:=q.amount+commission_value;

  insert into public.logistics_deliveries(
    request_id,quote_id,requester_company_id,carrier_company_id,vehicle_id,
    agreed_amount,currency,pickup_code,delivery_code
  ) values(
    r.id,q.id,r.company_id,q.carrier_company_id,q.vehicle_id,q.amount,q.currency,null,null
  ) returning id into delivery_id;

  insert into public.logistics_delivery_secrets(
    delivery_id,requester_company_id,pickup_code,delivery_code
  ) values(delivery_id,r.company_id,pickup_code_value,delivery_code_value);

  insert into public.logistics_payments(
    delivery_id,request_id,quote_id,requester_company_id,carrier_company_id,
    amount,currency,carrier_amount,commission_rate,commission_amount,buyer_total
  ) values(
    delivery_id,r.id,q.id,r.company_id,q.carrier_company_id,q.amount,q.currency,
    q.amount,rate_value,commission_value,buyer_value
  ) returning id into payment_id;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(
    delivery_id,payment_id,'eslesme_yapildi','aktif','odeme_bekliyor',auth.uid(),
    jsonb_build_object('request_id',r.id,'quote_id',q.id,'carrier_amount',q.amount,
      'commission_rate',rate_value,'commission_amount',commission_value,'buyer_total',buyer_value)
  );

  return delivery_id;
end;
$$;

create or replace function public.admin_create_logistics_transfer_order(
  p_payment_id uuid,p_provider text default 'manuel',p_transfer_fee numeric default 0,
  p_fee_payer text default 'platform',p_priority integer default 0,p_note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  p public.logistics_payments%rowtype;
  d public.logistics_deliveries%rowtype;
  attempt_value integer;
  order_id uuid;
  carrier_net numeric(14,2);
  platform_net numeric(14,2);
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if coalesce(p_transfer_fee,0)<0 then raise exception 'Aktarım masrafı negatif olamaz.'; end if;
  if p_fee_payer not in ('platform','carrier') then raise exception 'Geçersiz masraf tarafı.'; end if;
  if coalesce(p_priority,0) not between 0 and 100 then raise exception 'Öncelik 0–100 arasında olmalıdır.'; end if;

  select * into p from public.logistics_payments where id=p_payment_id for update;
  if not found or p.status<>'havuzda' then raise exception 'Nakliye ödemesi güvenli havuzda değil.'; end if;
  if p.transfer_status not in ('beklemede','hata') then
    raise exception 'Bu ödeme için aktif veya tamamlanmış aktarım süreci bulunuyor.';
  end if;

  select * into d from public.logistics_deliveries where id=p.delivery_id for update;
  if not found or d.status<>'teslim_onaylandi'
     or d.payment_status<>'serbest_birakilmaya_hazir' then
    raise exception 'Taşıma teslimatı aktarım için hazır değil.';
  end if;
  if d.disputed_at is not null then
    raise exception 'Uyuşmazlık çözülmeden normal aktarım emri verilemez.';
  end if;
  if exists(select 1 from public.logistics_transfer_orders
    where payment_id=p.id and status in ('emir_verildi','isleniyor')) then
    raise exception 'İkinci aktif aktarım emri oluşturulamaz.';
  end if;

  carrier_net:=p.carrier_amount-case when p_fee_payer='carrier' then coalesce(p_transfer_fee,0) else 0 end;
  platform_net:=p.commission_amount-case when p_fee_payer='platform' then coalesce(p_transfer_fee,0) else 0 end;
  if carrier_net<0 then raise exception 'Aktarım masrafı nakliyeci alacağından büyük olamaz.'; end if;

  select coalesce(max(attempt_no),0)+1 into attempt_value
  from public.logistics_transfer_orders where payment_id=p.id;

  insert into public.logistics_transfer_orders(
    payment_id,delivery_id,attempt_no,priority,provider,currency,buyer_total,
    carrier_gross_amount,platform_gross_commission,transfer_fee,fee_payer,
    carrier_net_amount,platform_net_commission,status,admin_note,requested_by
  ) values(
    p.id,p.delivery_id,attempt_value,coalesce(p_priority,0),
    coalesce(nullif(trim(p_provider),''),'manuel'),p.currency,p.buyer_total,
    p.carrier_amount,p.commission_amount,coalesce(p_transfer_fee,0),p_fee_payer,
    carrier_net,platform_net,'emir_verildi',nullif(trim(p_note),''),auth.uid()
  ) returning id into order_id;

  update public.logistics_payments set
    transfer_status='emir_verildi',transfer_requested_at=timezone('utc',now()),
    transfer_requested_by=auth.uid(),transfer_started_at=null,
    transfer_completed_at=null,transfer_error=null,
    admin_note=coalesce(nullif(trim(p_note),''),admin_note),
    updated_at=timezone('utc',now())
  where id=p.id;

  insert into public.logistics_delivery_events(
    delivery_id,payment_id,transfer_order_id,event_type,old_status,new_status,
    actor_user_id,detail
  ) values(
    p.delivery_id,p.id,order_id,'aktarim_emri_verildi',p.transfer_status,
    'emir_verildi',auth.uid(),
    jsonb_build_object('provider',coalesce(nullif(trim(p_provider),''),'manuel'),
      'fee_payer',p_fee_payer,'priority',coalesce(p_priority,0),
      'transfer_fee',coalesce(p_transfer_fee,0),'attempt_no',attempt_value)
  );

  return order_id;
end;
$$;

create or replace function public.post_logistics_payment_to_wallets(
  p_payment_id uuid,p_transfer_order_id uuid
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  p public.logistics_payments%rowtype;
  o public.logistics_transfer_orders%rowtype;
  requester_wallet uuid;
  carrier_wallet uuid;
  platform_wallet uuid;
  fee_wallet uuid;
begin
  select * into p from public.logistics_payments where id=p_payment_id for update;
  select * into o from public.logistics_transfer_orders
    where id=p_transfer_order_id and payment_id=p.id for update;
  if p.id is null or o.id is null then raise exception 'Aktarım muhasebe kaydı bulunamadı.'; end if;

  insert into public.wallet_accounts(company_id,account_type)
  values(p.requester_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type)
  values(p.carrier_company_id,'company') on conflict do nothing;
  insert into public.wallet_accounts(company_id,account_type)
  values(null,'platform') on conflict do nothing;

  select id into requester_wallet from public.wallet_accounts
    where company_id=p.requester_company_id;
  select id into carrier_wallet from public.wallet_accounts
    where company_id=p.carrier_company_id;
  select id into platform_wallet from public.wallet_accounts
    where account_type='platform';

  insert into public.wallet_transactions(
    wallet_account_id,company_id,logistics_delivery_id,
    transaction_type,direction,amount,description
  ) values(
    requester_wallet,p.requester_company_id,p.delivery_id,
    'logistics_expense','debit',p.buyer_total,'Nakliye hizmet bedeli'
  ) on conflict do nothing;

  insert into public.wallet_transactions(
    wallet_account_id,company_id,logistics_delivery_id,
    transaction_type,direction,amount,description
  ) values(
    carrier_wallet,p.carrier_company_id,p.delivery_id,
    'logistics_income','credit',p.carrier_amount,'Nakliye hizmet geliri'
  ) on conflict do nothing;

  if p.commission_amount>0 then
    insert into public.wallet_transactions(
      wallet_account_id,company_id,logistics_delivery_id,
      transaction_type,direction,amount,description
    ) values(
      platform_wallet,null,p.delivery_id,
      'logistics_commission','credit',p.commission_amount,'Nakliye platform komisyonu'
    ) on conflict do nothing;
  end if;

  if o.transfer_fee>0 then
    fee_wallet:=case when o.fee_payer='carrier' then carrier_wallet else platform_wallet end;
    insert into public.wallet_transactions(
      wallet_account_id,company_id,logistics_delivery_id,
      transaction_type,direction,amount,description
    ) values(
      fee_wallet,case when o.fee_payer='carrier' then p.carrier_company_id else null end,
      p.delivery_id,'logistics_transfer_fee','debit',o.transfer_fee,
      'Nakliye banka/aktarım masrafı'
    ) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.admin_process_logistics_transfer(
  p_payment_id uuid,p_action text,p_reference text default null,p_note text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  p public.logistics_payments%rowtype;
  d public.logistics_deliveries%rowtype;
  o public.logistics_transfer_orders%rowtype;
  reference_value text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;

  select * into p from public.logistics_payments where id=p_payment_id for update;
  if not found or p.status<>'havuzda' then raise exception 'Nakliye ödemesi güvenli havuzda değil.'; end if;
  select * into d from public.logistics_deliveries where id=p.delivery_id for update;
  select * into o from public.logistics_transfer_orders
    where payment_id=p.id and status in ('emir_verildi','isleniyor')
    order by attempt_no desc limit 1 for update;
  if not found then raise exception 'Aktif aktarım emri bulunamadı.'; end if;

  if p_action='isleme_al' then
    if o.status<>'emir_verildi' then raise exception 'Aktarım emri işleme alınmaya uygun değil.'; end if;
    update public.logistics_transfer_orders set
      status='isleniyor',started_by=auth.uid(),started_at=timezone('utc',now()),
      provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),
      admin_note=coalesce(nullif(trim(p_note),''),admin_note),
      updated_at=timezone('utc',now())
    where id=o.id;
    update public.logistics_payments set
      transfer_status='isleniyor',transfer_started_at=timezone('utc',now()),
      transfer_reference=coalesce(nullif(trim(p_reference),''),transfer_reference),
      updated_at=timezone('utc',now())
    where id=p.id;
    insert into public.logistics_delivery_events(
      delivery_id,payment_id,transfer_order_id,event_type,old_status,new_status,
      actor_user_id,provider_reference,detail
    ) values(
      p.delivery_id,p.id,o.id,'aktarim_isleme_alindi','emir_verildi','isleniyor',
      auth.uid(),nullif(trim(p_reference),''),jsonb_build_object('note',nullif(trim(p_note),''))
    );

  elsif p_action='tamamla' then
    if o.status<>'isleniyor' then raise exception 'Aktarım henüz işleniyor durumunda değil.'; end if;
    reference_value:=coalesce(nullif(trim(p_reference),''),o.provider_reference);
    if reference_value is null then raise exception 'Banka/sağlayıcı referansı zorunludur.'; end if;
    if d.status<>'teslim_onaylandi' or d.disputed_at is not null then
      raise exception 'Taşıma dosyası normal aktarım ile tamamlanamaz.';
    end if;

    update public.logistics_transfer_orders set
      status='tamamlandi',completed_by=auth.uid(),completed_at=timezone('utc',now()),
      provider_reference=reference_value,failure_reason=null,
      admin_note=coalesce(nullif(trim(p_note),''),admin_note),
      updated_at=timezone('utc',now())
    where id=o.id;

    update public.logistics_payments set
      status='serbest_birakildi',transfer_status='tamamlandi',
      payment_reference=reference_value,released_at=timezone('utc',now()),
      released_by=auth.uid(),transfer_completed_at=timezone('utc',now()),
      transfer_reference=reference_value,transfer_error=null,
      updated_at=timezone('utc',now())
    where id=p.id;

    update public.logistics_deliveries set
      status='tamamlandi',payment_status='serbest_birakildi',
      completed_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where id=p.delivery_id;

    update public.logistics_requests set
      status='tamamlandi',updated_at=timezone('utc',now())
    where id=p.request_id;

    perform public.post_logistics_payment_to_wallets(p.id,o.id);

    insert into public.logistics_delivery_events(
      delivery_id,payment_id,transfer_order_id,event_type,old_status,new_status,
      actor_user_id,provider_reference,detail
    ) values(
      p.delivery_id,p.id,o.id,'aktarim_tamamlandi','isleniyor','tamamlandi',
      auth.uid(),reference_value,
      jsonb_build_object('carrier_net',o.carrier_net_amount,
        'platform_net_commission',o.platform_net_commission,
        'transfer_fee',o.transfer_fee,'note',nullif(trim(p_note),''))
    );

  elsif p_action='hata' then
    if nullif(trim(coalesce(p_note,'')),'') is null then
      raise exception 'Aktarım hata açıklaması zorunludur.';
    end if;
    update public.logistics_transfer_orders set
      status='hata',failure_reason=trim(p_note),failed_by=auth.uid(),
      failed_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where id=o.id;
    update public.logistics_payments set
      transfer_status='hata',transfer_error=trim(p_note),
      admin_note=trim(p_note),updated_at=timezone('utc',now())
    where id=p.id;
    insert into public.logistics_delivery_events(
      delivery_id,payment_id,transfer_order_id,event_type,old_status,new_status,
      actor_user_id,provider_reference,detail
    ) values(
      p.delivery_id,p.id,o.id,'aktarim_hatasi',o.status,'hata',
      auth.uid(),o.provider_reference,jsonb_build_object('reason',trim(p_note))
    );
  else
    raise exception 'Geçersiz aktarım işlemi.';
  end if;
end;
$$;

create or replace function public.admin_review_logistics_payment(
  p_delivery_id uuid,p_action text,p_reference text default null,p_note text default null
)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_deliveries%rowtype;
  p public.logistics_payments%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if p_action not in ('havuz_onayla','aktarim_emri','iade') then
    raise exception 'Geçersiz ödeme işlemi.';
  end if;

  select * into d from public.logistics_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'Taşıma dosyası bulunamadı.'; end if;
  select * into p from public.logistics_payments where delivery_id=d.id for update;

  if p_action='havuz_onayla' then
    if d.status<>'odeme_bekliyor' or d.payment_status<>'odeme_bekliyor' then
      raise exception 'Ödeme havuza alınmaya uygun değil.';
    end if;
    update public.logistics_payments set
      status='havuzda',payment_reference=p_reference,admin_note=p_note,
      held_at=timezone('utc',now()),held_by=auth.uid(),updated_at=timezone('utc',now())
    where id=p.id;
    update public.logistics_deliveries set
      status='yukleme_bekliyor',payment_status='havuzda',
      updated_at=timezone('utc',now()) where id=d.id;
    insert into public.logistics_delivery_events(
      delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,
      provider_reference,detail
    ) values(
      d.id,p.id,'odeme_havuza_alindi','odeme_bekliyor','havuzda',auth.uid(),
      nullif(trim(p_reference),''),jsonb_build_object('note',nullif(trim(p_note),''))
    );

  elsif p_action='aktarim_emri' then
    perform public.admin_create_logistics_transfer_order(
      p.id,'manuel',0,'platform',0,p_note
    );

  else
    if d.payment_status not in ('havuzda','serbest_birakilmaya_hazir') then
      raise exception 'İade edilebilir havuz ödemesi bulunmuyor.';
    end if;
    update public.logistics_payments set
      status='iade_edildi',payment_reference=coalesce(p_reference,payment_reference),
      admin_note=p_note,refunded_at=timezone('utc',now()),refunded_by=auth.uid(),
      transfer_status='tamamlandi',transfer_completed_at=timezone('utc',now()),
      updated_at=timezone('utc',now())
    where id=p.id;
    update public.logistics_deliveries set
      status='iptal',payment_status='iade_edildi',
      completed_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where id=d.id;
    update public.logistics_requests set
      status='iptal',updated_at=timezone('utc',now()) where id=d.request_id;
    insert into public.logistics_delivery_events(
      delivery_id,payment_id,event_type,old_status,new_status,actor_user_id,
      provider_reference,detail
    ) values(
      d.id,p.id,'odeme_iade_edildi',d.payment_status,'iade_edildi',auth.uid(),
      nullif(trim(p_reference),''),jsonb_build_object('note',nullif(trim(p_note),''))
    );
  end if;
end;
$$;

create or replace function public.notify_logistics_delivery_event()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare
  d public.logistics_deliveries%rowtype;
  r public.logistics_requests%rowtype;
  requester_user uuid;
  carrier_user uuid;
  recipient uuid;
  title_value text;
  message_value text;
  event_link text:='/profil/lojistik';
begin
  select * into d from public.logistics_deliveries where id=new.delivery_id;
  if not found then return new; end if;
  select * into r from public.logistics_requests where id=d.request_id;
  select user_id into requester_user from public.companies where id=d.requester_company_id;
  select user_id into carrier_user from public.companies where id=d.carrier_company_id;

  title_value:=case new.event_type
    when 'eslesme_yapildi' then 'Nakliye teklifi kabul edildi'
    when 'odeme_havuza_alindi' then 'Nakliye ödemesi güvenli havuzda'
    when 'aktarim_emri_verildi' then 'Nakliyeci ödeme emri oluşturuldu'
    when 'aktarim_isleme_alindi' then 'Nakliyeci ödemesi işleme alındı'
    when 'aktarim_hatasi' then 'Nakliyeci ödemesinde hata oluştu'
    when 'aktarim_tamamlandi' then 'Nakliyeci ödemesi tamamlandı'
    when 'odeme_iade_edildi' then 'Nakliye ödemesi iade edildi'
    else 'Nakliye dosyası güncellendi'
  end;

  message_value:='“'||coalesce(r.title,'Nakliye işlemi')||'” · '||
    case new.event_type
      when 'eslesme_yapildi' then 'Taşıma teklifi kabul edildi ve ödeme dosyası oluşturuldu.'
      when 'odeme_havuza_alindi' then 'Ödeme güvenli havuza alındı. Yükleme süreci başlatılabilir.'
      when 'aktarim_emri_verildi' then 'Teslimat sonrası nakliyeci ödeme emri oluşturuldu.'
      when 'aktarim_isleme_alindi' then 'Nakliyeci ödemesi banka/ödeme kuruluşu tarafından işleniyor.'
      when 'aktarim_hatasi' then 'Aktarım tamamlanamadı. Para güvenli durumda ve yeniden deneme yapılabilir.'
      when 'aktarim_tamamlandi' then 'Nakliyeci ödemesi başarıyla tamamlandı.'
      when 'odeme_iade_edildi' then 'Güvenli havuzdaki ödeme talep sahibine iade edildi.'
      else 'Nakliye dosyasının durumu güncellendi.'
    end;

  for recipient in
    select distinct user_id from (
      values(requester_user),(carrier_user)
    ) recipients(user_id)
    where user_id is not null
  loop
    insert into public.notifications(
      recipient_user_id,actor_user_id,entity_type,entity_id,
      event_type,title,message,link
    ) values(
      recipient,new.actor_user_id,'Lojistik teslimatı',new.delivery_id,
      new.event_type,title_value,message_value,event_link
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_logistics_delivery_event_trigger
  on public.logistics_delivery_events;
create trigger notify_logistics_delivery_event_trigger
after insert on public.logistics_delivery_events
for each row execute function public.notify_logistics_delivery_event();

insert into public.logistics_transfer_orders(
  payment_id,delivery_id,attempt_no,provider,currency,buyer_total,
  carrier_gross_amount,platform_gross_commission,transfer_fee,fee_payer,
  carrier_net_amount,platform_net_commission,status,provider_reference,
  requested_by,requested_at,started_by,started_at,completed_by,completed_at
)
select
  p.id,p.delivery_id,1,'gecmis_kayit',p.currency,p.buyer_total,
  p.carrier_amount,p.commission_amount,0,'platform',
  p.carrier_amount,p.commission_amount,'tamamlandi',p.payment_reference,
  coalesce(p.released_by,p.held_by),coalesce(p.held_at,p.created_at),
  coalesce(p.released_by,p.held_by),coalesce(p.held_at,p.created_at),
  coalesce(p.released_by,p.held_by),coalesce(p.released_at,p.updated_at)
from public.logistics_payments p
where p.status='serbest_birakildi'
  and coalesce(p.released_by,p.held_by) is not null
  and not exists(select 1 from public.logistics_transfer_orders o where o.payment_id=p.id);

update public.logistics_payments p
set transfer_status='tamamlandi',
    transfer_requested_at=coalesce(transfer_requested_at,p.held_at,p.created_at),
    transfer_started_at=coalesce(transfer_started_at,p.held_at,p.created_at),
    transfer_completed_at=coalesce(transfer_completed_at,p.released_at,p.updated_at),
    transfer_reference=coalesce(transfer_reference,p.payment_reference)
where p.status='serbest_birakildi';

do $$
declare x record;
begin
  for x in
    select p.id as payment_id,o.id as order_id
    from public.logistics_payments p
    join public.logistics_transfer_orders o on o.payment_id=p.id and o.status='tamamlandi'
    where p.status='serbest_birakildi'
  loop
    perform public.post_logistics_payment_to_wallets(x.payment_id,x.order_id);
  end loop;
end $$;

revoke all on function public.post_logistics_payment_to_wallets(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.notify_logistics_delivery_event()
  from public,anon,authenticated;
grant execute on function public.admin_create_logistics_transfer_order(uuid,text,numeric,text,integer,text)
  to authenticated;
grant execute on function public.admin_process_logistics_transfer(uuid,text,text,text)
  to authenticated;
grant execute on function public.admin_review_logistics_payment(uuid,text,text,text)
  to authenticated;

notify pgrst,'reload schema';
commit;
