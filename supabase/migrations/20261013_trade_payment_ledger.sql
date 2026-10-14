begin;

create table if not exists public.trade_payments (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null unique references public.trade_offers(id) on delete restrict,
  buyer_company_id uuid not null references public.companies(id) on delete restrict,
  seller_company_id uuid not null references public.companies(id) on delete restrict,
  product_title text not null,
  seller_amount numeric(18,2) not null check (seller_amount >= 0),
  commission_amount numeric(18,2) not null check (commission_amount >= 0),
  buyer_total numeric(18,2) not null check (buyer_total >= 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  status text not null default 'odeme_bekliyor' check (status in ('odeme_bekliyor','odendi_havuzda','saticiya_aktarildi','iade_edildi','iptal')),
  payment_reference text,
  admin_note text,
  paid_at timestamptz,
  released_at timestamptz,
  refunded_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);
create index if not exists trade_payments_status_created_idx on public.trade_payments(status,created_at desc);
create index if not exists trade_payments_buyer_idx on public.trade_payments(buyer_company_id,created_at desc);
create index if not exists trade_payments_seller_idx on public.trade_payments(seller_company_id,created_at desc);

alter table public.trade_payments enable row level security;
drop policy if exists trade_payments_participant_select on public.trade_payments;
create policy trade_payments_participant_select on public.trade_payments for select to authenticated using (
  public.is_platform_admin() or exists(select 1 from public.companies c where c.user_id=auth.uid() and c.id in (buyer_company_id,seller_company_id))
);
grant select on public.trade_payments to authenticated;

create or replace function public.sync_trade_payment()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.status='kabul_edildi' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.trade_payments(trade_offer_id,buyer_company_id,seller_company_id,product_title,seller_amount,commission_amount,buyer_total)
    values(new.id,new.buyer_company_id,new.seller_company_id,new.product_title,new.subtotal_amount,new.commission_amount,new.total_amount)
    on conflict(trade_offer_id) do nothing;
  elsif new.status in ('reddedildi','iptal_edildi') then
    update public.trade_payments set status='iptal',updated_at=timezone('utc',now())
    where trade_offer_id=new.id and status='odeme_bekliyor';
  elsif new.status='tamamlandi' then
    update public.trade_payments set status='saticiya_aktarildi',released_at=timezone('utc',now()),updated_at=timezone('utc',now())
    where trade_offer_id=new.id and status='odendi_havuzda';
  end if;
  return new;
end; $$;
drop trigger if exists sync_trade_payment_trigger on public.trade_offers;
create trigger sync_trade_payment_trigger after insert or update of status on public.trade_offers for each row execute function public.sync_trade_payment();

insert into public.trade_payments(trade_offer_id,buyer_company_id,seller_company_id,product_title,seller_amount,commission_amount,buyer_total,status,paid_at,released_at)
select id,buyer_company_id,seller_company_id,product_title,subtotal_amount,commission_amount,total_amount,
  case when status='tamamlandi' then 'saticiya_aktarildi' else 'odeme_bekliyor' end,
  case when status='tamamlandi' then coalesce(completed_at,updated_at) end,
  case when status='tamamlandi' then coalesce(completed_at,updated_at) end
from public.trade_offers where status in ('kabul_edildi','tamamlandi') on conflict(trade_offer_id) do nothing;

create or replace function public.admin_review_trade_payment(p_payment_id uuid,p_action text,p_reference text default null,p_note text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare row_data public.trade_payments; buyer_user uuid; seller_user uuid;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into row_data from public.trade_payments where id=p_payment_id for update;
  if not found then raise exception 'Ödeme kaydı bulunamadı.'; end if;
  if p_action='odeme_onayla' and row_data.status='odeme_bekliyor' then
    update public.trade_payments set status='odendi_havuzda',payment_reference=nullif(trim(p_reference),''),admin_note=nullif(trim(p_note),''),paid_at=timezone('utc',now()),reviewed_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_payment_id;
  elsif p_action='iade' and row_data.status='odendi_havuzda' then
    update public.trade_payments set status='iade_edildi',admin_note=nullif(trim(p_note),''),refunded_at=timezone('utc',now()),reviewed_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_payment_id;
  elsif p_action='iptal' and row_data.status='odeme_bekliyor' then
    update public.trade_payments set status='iptal',admin_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),updated_at=timezone('utc',now()) where id=p_payment_id;
  else raise exception 'Bu ödeme için geçersiz durum geçişi.'; end if;
  select user_id into buyer_user from public.companies where id=row_data.buyer_company_id;
  select user_id into seller_user from public.companies where id=row_data.seller_company_id;
  insert into public.notifications(recipient_user_id,actor_user_id,entity_type,entity_id,event_type,title,message,link)
  select uid,auth.uid(),'Ticari ödeme',p_payment_id,'payment_status','Ödeme durumu güncellendi',row_data.product_title||' işleminin ödeme durumu güncellendi.','/profil/cuzdan'
  from (values(buyer_user),(seller_user)) u(uid) where uid is not null;
end; $$;

create or replace function public.admin_finance_summary()
returns jsonb language plpgsql security definer set search_path=public
as $$ begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  return jsonb_build_object(
    'awaiting_count',(select count(*) from public.trade_payments where status='odeme_bekliyor'),
    'awaiting_total',(select coalesce(sum(buyer_total),0) from public.trade_payments where status='odeme_bekliyor'),
    'escrow_count',(select count(*) from public.trade_payments where status='odendi_havuzda'),
    'escrow_total',(select coalesce(sum(buyer_total),0) from public.trade_payments where status='odendi_havuzda'),
    'released_total',(select coalesce(sum(seller_amount),0) from public.trade_payments where status='saticiya_aktarildi'),
    'commission_total',(select coalesce(sum(commission_amount),0) from public.trade_payments where status='saticiya_aktarildi'),
    'refunded_total',(select coalesce(sum(buyer_total),0) from public.trade_payments where status='iade_edildi')
  );
end; $$;

revoke all on function public.sync_trade_payment() from public,anon,authenticated;
revoke all on function public.admin_review_trade_payment(uuid,text,text,text) from public,anon;
revoke all on function public.admin_finance_summary() from public,anon;
grant execute on function public.admin_review_trade_payment(uuid,text,text,text) to authenticated;
grant execute on function public.admin_finance_summary() to authenticated;

do $$ begin
  if to_regprocedure('public.record_platform_audit_event()') is not null then
    drop trigger if exists platform_audit_trigger on public.trade_payments;
    create trigger platform_audit_trigger after insert or update or delete on public.trade_payments for each row execute function public.record_platform_audit_event();
  end if;
end $$;

commit;
