begin;

create table if not exists public.trade_transfer_orders (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.trade_payments(id) on delete restrict,
  trade_offer_id uuid not null references public.trade_offers(id) on delete restrict,
  attempt_no integer not null check (attempt_no>0),
  priority integer not null default 0 check (priority between 0 and 100),
  provider text not null default 'manuel',
  currency text not null default 'TRY',
  buyer_total numeric not null check (buyer_total>=0),
  seller_gross_amount numeric not null check (seller_gross_amount>=0),
  platform_gross_commission numeric not null check (platform_gross_commission>=0),
  transfer_fee numeric not null default 0 check (transfer_fee>=0),
  fee_payer text not null default 'platform' check (fee_payer in ('platform','seller')),
  seller_net_amount numeric not null check (seller_net_amount>=0),
  platform_net_commission numeric not null,
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
  unique(payment_id,attempt_no)
);

create unique index if not exists trade_transfer_orders_one_active_idx on public.trade_transfer_orders(payment_id) where status in ('emir_verildi','isleniyor');
create index if not exists trade_transfer_orders_queue_idx on public.trade_transfer_orders(status,priority desc,requested_at,attempt_no);

create table if not exists public.trade_transfer_events (
  id uuid primary key default gen_random_uuid(),
  transfer_order_id uuid not null references public.trade_transfer_orders(id) on delete restrict,
  payment_id uuid not null references public.trade_payments(id) on delete restrict,
  event_type text not null check (event_type in ('emir_verildi','isleme_alindi','tamamlandi','hata','iptal','not_eklendi')),
  old_status text,
  new_status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  provider_reference text,
  transfer_fee numeric,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);
create index if not exists trade_transfer_events_order_idx on public.trade_transfer_events(transfer_order_id,created_at);

alter table public.trade_transfer_orders enable row level security;
alter table public.trade_transfer_events enable row level security;

drop policy if exists trade_transfer_orders_read on public.trade_transfer_orders;
create policy trade_transfer_orders_read on public.trade_transfer_orders for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.trade_payments p where p.id=payment_id and (
      public.is_company_member(p.buyer_company_id,null) or public.is_company_member(p.seller_company_id,null)
      or exists(select 1 from public.companies c where c.id in (p.buyer_company_id,p.seller_company_id) and c.user_id=auth.uid())
    )
  )
);

drop policy if exists trade_transfer_events_read on public.trade_transfer_events;
create policy trade_transfer_events_read on public.trade_transfer_events for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.trade_transfer_orders o
    join public.trade_payments p on p.id=o.payment_id
    where o.id=transfer_order_id and (
      public.is_company_member(p.buyer_company_id,null) or public.is_company_member(p.seller_company_id,null)
      or exists(select 1 from public.companies c where c.id in (p.buyer_company_id,p.seller_company_id) and c.user_id=auth.uid())
    )
  )
);

grant select on public.trade_transfer_orders,public.trade_transfer_events to authenticated;

create or replace function public.admin_create_trade_transfer_order(
  p_payment_id uuid,p_provider text default 'manuel',p_transfer_fee numeric default 0,
  p_fee_payer text default 'platform',p_priority integer default 0,p_note text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare payment_row public.trade_payments%rowtype; offer_row public.trade_offers%rowtype;
  attempt_value integer; order_id uuid; seller_net numeric; platform_net numeric;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if coalesce(p_transfer_fee,0)<0 then raise exception 'Aktarım masrafı negatif olamaz.'; end if;
  if p_fee_payer not in ('platform','seller') then raise exception 'Geçersiz masraf tarafı.'; end if;
  if coalesce(p_priority,0) not between 0 and 100 then raise exception 'Öncelik 0–100 arasında olmalıdır.'; end if;
  select * into payment_row from public.trade_payments where id=p_payment_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  if payment_row.transfer_status not in ('beklemede','hata') then raise exception 'Bu ödeme için aktif bir aktarım süreci bulunuyor.'; end if;
  if exists(select 1 from public.trade_transfer_orders where payment_id=p_payment_id and status in ('emir_verildi','isleniyor')) then raise exception 'İkinci aktif aktarım emri oluşturulamaz.'; end if;
  select * into offer_row from public.trade_offers where id=payment_row.trade_offer_id for update;
  if offer_row.status<>'kabul_edildi' then raise exception 'Teklif aktarım için uygun değil.'; end if;
  if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=offer_row.id and status='acik') then raise exception 'Uyuşmazlık çözülmeden aktarım emri verilemez.'; end if;
  if (select count(distinct party) from public.trade_delivery_confirmations where trade_offer_id=offer_row.id)<>2 then raise exception 'Satıcı ve alıcı teslimat onayları tamamlanmadı.'; end if;
  seller_net:=payment_row.seller_amount-case when p_fee_payer='seller' then coalesce(p_transfer_fee,0) else 0 end;
  platform_net:=payment_row.commission_amount-case when p_fee_payer='platform' then coalesce(p_transfer_fee,0) else 0 end;
  if seller_net<0 then raise exception 'Aktarım masrafı satıcı alacağından büyük olamaz.'; end if;
  select coalesce(max(attempt_no),0)+1 into attempt_value from public.trade_transfer_orders where payment_id=p_payment_id;
  insert into public.trade_transfer_orders(payment_id,trade_offer_id,attempt_no,priority,provider,currency,buyer_total,seller_gross_amount,platform_gross_commission,transfer_fee,fee_payer,seller_net_amount,platform_net_commission,status,admin_note,requested_by)
  values(payment_row.id,payment_row.trade_offer_id,attempt_value,coalesce(p_priority,0),coalesce(nullif(trim(p_provider),''),'manuel'),payment_row.currency,payment_row.buyer_total,payment_row.seller_amount,payment_row.commission_amount,coalesce(p_transfer_fee,0),p_fee_payer,seller_net,platform_net,'emir_verildi',nullif(trim(p_note),''),auth.uid()) returning id into order_id;
  insert into public.trade_transfer_events(transfer_order_id,payment_id,event_type,old_status,new_status,actor_user_id,transfer_fee,detail)
  values(order_id,p_payment_id,'emir_verildi',payment_row.transfer_status,'emir_verildi',auth.uid(),coalesce(p_transfer_fee,0),jsonb_build_object('provider',coalesce(nullif(trim(p_provider),''),'manuel'),'fee_payer',p_fee_payer,'priority',coalesce(p_priority,0)));
  update public.trade_payments set transfer_status='emir_verildi',transfer_requested_at=timezone('utc',now()),transfer_requested_by=auth.uid(),transfer_started_at=null,transfer_completed_at=null,transfer_error=null,admin_note=coalesce(nullif(trim(p_note),''),admin_note),reviewed_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_payment_id;
  return order_id;
end; $$;

create or replace function public.admin_release_trade_payment(p_payment_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
begin perform public.admin_create_trade_transfer_order(p_payment_id,'manuel',0,'platform',0,p_note); end; $$;

create or replace function public.admin_process_trade_transfer(p_payment_id uuid,p_action text,p_reference text default null,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare payment_row public.trade_payments%rowtype; offer_row public.trade_offers%rowtype; order_row public.trade_transfer_orders%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into payment_row from public.trade_payments where id=p_payment_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  select * into offer_row from public.trade_offers where id=payment_row.trade_offer_id for update;
  select * into order_row from public.trade_transfer_orders where payment_id=p_payment_id and status in ('emir_verildi','isleniyor') order by attempt_no desc limit 1 for update;
  if not found then raise exception 'Aktif aktarım emri bulunamadı.'; end if;
  if p_action='isleme_al' then
    if order_row.status<>'emir_verildi' then raise exception 'Aktarım emri işleme alınmaya uygun değil.'; end if;
    update public.trade_transfer_orders set status='isleniyor',started_by=auth.uid(),started_at=timezone('utc',now()),provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),admin_note=coalesce(nullif(trim(p_note),''),admin_note),updated_at=timezone('utc',now()) where id=order_row.id;
    insert into public.trade_transfer_events(transfer_order_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail) values(order_row.id,p_payment_id,'isleme_alindi','emir_verildi','isleniyor',auth.uid(),nullif(trim(p_reference),''),jsonb_build_object('note',nullif(trim(p_note),'')));
    update public.trade_payments set transfer_status='isleniyor',transfer_started_at=timezone('utc',now()),transfer_reference=coalesce(nullif(trim(p_reference),''),transfer_reference),updated_at=timezone('utc',now()) where id=p_payment_id;
  elsif p_action='tamamla' then
    if order_row.status<>'isleniyor' then raise exception 'Aktarım henüz işleniyor durumunda değil.'; end if;
    if nullif(trim(coalesce(p_reference,order_row.provider_reference,'')),'') is null then raise exception 'İşlem referansı zorunludur.'; end if;
    if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=offer_row.id and status='acik') then raise exception 'Uyuşmazlık çözülmeden aktarım tamamlanamaz.'; end if;
    update public.trade_offers set status='tamamlandi',completed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=offer_row.id;
    update public.trade_transfer_orders set status='tamamlandi',completed_by=auth.uid(),completed_at=timezone('utc',now()),provider_reference=coalesce(nullif(trim(p_reference),''),provider_reference),admin_note=coalesce(nullif(trim(p_note),''),admin_note),failure_reason=null,updated_at=timezone('utc',now()) where id=order_row.id;
    insert into public.trade_transfer_events(transfer_order_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,transfer_fee,detail) values(order_row.id,p_payment_id,'tamamlandi','isleniyor','tamamlandi',auth.uid(),coalesce(nullif(trim(p_reference),''),order_row.provider_reference),order_row.transfer_fee,jsonb_build_object('seller_net',order_row.seller_net_amount,'platform_net_commission',order_row.platform_net_commission,'note',nullif(trim(p_note),'')));
    update public.trade_payments set transfer_status='tamamlandi',transfer_completed_at=timezone('utc',now()),transfer_reference=coalesce(nullif(trim(p_reference),''),transfer_reference),transfer_error=null,updated_at=timezone('utc',now()) where id=p_payment_id;
  elsif p_action='hata' then
    if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'Aktarım hatası açıklaması zorunludur.'; end if;
    update public.trade_transfer_orders set status='hata',failure_reason=trim(p_note),failed_by=auth.uid(),failed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=order_row.id;
    insert into public.trade_transfer_events(transfer_order_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,detail) values(order_row.id,p_payment_id,'hata',order_row.status,'hata',auth.uid(),order_row.provider_reference,jsonb_build_object('reason',trim(p_note)));
    update public.trade_payments set transfer_status='hata',transfer_error=trim(p_note),admin_note=trim(p_note),reviewed_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_payment_id;
  else raise exception 'Geçersiz aktarım işlemi.'; end if;
end; $$;

insert into public.trade_transfer_orders(payment_id,trade_offer_id,attempt_no,provider,currency,buyer_total,seller_gross_amount,platform_gross_commission,transfer_fee,fee_payer,seller_net_amount,platform_net_commission,status,provider_reference,requested_by,requested_at,started_by,started_at,completed_by,completed_at)
select p.id,p.trade_offer_id,1,'gecmis_kayit',p.currency,p.buyer_total,p.seller_amount,p.commission_amount,0,'platform',p.seller_amount,p.commission_amount,'tamamlandi',p.payment_reference,coalesce(p.reviewed_by,o.admin_id),coalesce(p.paid_at,p.created_at),coalesce(p.reviewed_by,o.admin_id),coalesce(p.paid_at,p.created_at),coalesce(p.reviewed_by,o.admin_id),coalesce(p.released_at,p.updated_at)
from public.trade_payments p join public.trade_offers o on o.id=p.trade_offer_id
where p.status='saticiya_aktarildi' and coalesce(p.reviewed_by,o.admin_id) is not null and not exists(select 1 from public.trade_transfer_orders x where x.payment_id=p.id);

insert into public.trade_transfer_events(transfer_order_id,payment_id,event_type,old_status,new_status,actor_user_id,provider_reference,transfer_fee,detail,created_at)
select o.id,o.payment_id,'tamamlandi','isleniyor','tamamlandi',o.completed_by,o.provider_reference,o.transfer_fee,jsonb_build_object('source','historical_backfill'),o.completed_at
from public.trade_transfer_orders o where o.status='tamamlandi' and not exists(select 1 from public.trade_transfer_events e where e.transfer_order_id=o.id);

create or replace function public.admin_trade_transfer_summary()
returns jsonb language sql security definer stable set search_path=public as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'queued_count',(select count(*) from public.trade_transfer_orders where status='emir_verildi'),
    'processing_count',(select count(*) from public.trade_transfer_orders where status='isleniyor'),
    'failed_count',(select count(*) from public.trade_transfer_orders where status='hata'),
    'completed_count',(select count(*) from public.trade_transfer_orders where status='tamamlandi'),
    'seller_gross_total',(select coalesce(sum(seller_gross_amount),0) from public.trade_transfer_orders where status='tamamlandi'),
    'seller_net_total',(select coalesce(sum(seller_net_amount),0) from public.trade_transfer_orders where status='tamamlandi'),
    'gross_commission_total',(select coalesce(sum(platform_gross_commission),0) from public.trade_transfer_orders where status='tamamlandi'),
    'net_commission_total',(select coalesce(sum(platform_net_commission),0) from public.trade_transfer_orders where status='tamamlandi'),
    'transfer_fee_total',(select coalesce(sum(transfer_fee),0) from public.trade_transfer_orders where status='tamamlandi')
  ) else null::jsonb end;
$$;

grant execute on function public.admin_create_trade_transfer_order(uuid,text,numeric,text,integer,text) to authenticated;
grant execute on function public.admin_release_trade_payment(uuid,text) to authenticated;
grant execute on function public.admin_process_trade_transfer(uuid,text,text,text) to authenticated;
grant execute on function public.admin_trade_transfer_summary() to authenticated;
notify pgrst,'reload schema';
commit;
