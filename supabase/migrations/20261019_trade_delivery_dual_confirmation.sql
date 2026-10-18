begin;

create table if not exists public.trade_delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null references public.trade_offers(id) on delete cascade,
  party text not null check (party in ('seller','buyer')),
  company_id uuid not null references public.companies(id) on delete restrict,
  confirmed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default timezone('utc',now()),
  unique(trade_offer_id,party)
);

create table if not exists public.trade_delivery_disputes (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null references public.trade_offers(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  opened_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 10 and 2000),
  status text not null default 'acik' check (status in ('acik','aliciya_iade','saticiya_aktar','kapatildi')),
  admin_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);

create index if not exists trade_delivery_confirmations_offer_idx
  on public.trade_delivery_confirmations(trade_offer_id);
create index if not exists trade_delivery_disputes_offer_status_idx
  on public.trade_delivery_disputes(trade_offer_id,status);

alter table public.trade_delivery_confirmations enable row level security;
alter table public.trade_delivery_disputes enable row level security;

drop policy if exists trade_delivery_confirmations_read on public.trade_delivery_confirmations;
create policy trade_delivery_confirmations_read on public.trade_delivery_confirmations
for select to authenticated using (
  public.is_platform_admin()
  or exists (
    select 1 from public.trade_offers o
    where o.id=trade_offer_id
      and (
        public.is_company_member(o.buyer_company_id,null)
        or public.is_company_member(o.seller_company_id,null)
        or exists(select 1 from public.companies c where c.id in (o.buyer_company_id,o.seller_company_id) and c.user_id=auth.uid())
      )
  )
);

drop policy if exists trade_delivery_confirmations_insert on public.trade_delivery_confirmations;
create policy trade_delivery_confirmations_insert on public.trade_delivery_confirmations
for insert to authenticated with check (
  confirmed_by=auth.uid()
  and exists (
    select 1
    from public.trade_offers o
    join public.trade_payments p on p.trade_offer_id=o.id
    where o.id=trade_offer_id
      and o.status='kabul_edildi'
      and p.status='odendi_havuzda'
      and (
        (
          party='seller'
          and company_id=o.seller_company_id
          and (
            public.is_company_member(o.seller_company_id,array['owner','manager','sales'])
            or exists(select 1 from public.companies c where c.id=o.seller_company_id and c.user_id=auth.uid())
          )
        )
        or
        (
          party='buyer'
          and company_id=o.buyer_company_id
          and (
            public.is_company_member(o.buyer_company_id,array['owner','manager','purchasing'])
            or exists(select 1 from public.companies c where c.id=o.buyer_company_id and c.user_id=auth.uid())
          )
        )
      )
      and not exists (
        select 1 from public.trade_delivery_disputes d
        where d.trade_offer_id=o.id and d.status='acik'
      )
  )
);

drop policy if exists trade_delivery_disputes_read on public.trade_delivery_disputes;
create policy trade_delivery_disputes_read on public.trade_delivery_disputes
for select to authenticated using (
  public.is_platform_admin()
  or public.is_company_member(company_id,null)
  or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
  or exists (
    select 1 from public.trade_offers o
    where o.id=trade_offer_id
      and (
        public.is_company_member(o.buyer_company_id,null)
        or public.is_company_member(o.seller_company_id,null)
        or exists(select 1 from public.companies c where c.id in (o.buyer_company_id,o.seller_company_id) and c.user_id=auth.uid())
      )
  )
);

drop policy if exists trade_delivery_disputes_insert on public.trade_delivery_disputes;
create policy trade_delivery_disputes_insert on public.trade_delivery_disputes
for insert to authenticated with check (
  opened_by=auth.uid()
  and exists (
    select 1 from public.trade_offers o
    where o.id=trade_offer_id
      and o.status='kabul_edildi'
      and company_id in (o.buyer_company_id,o.seller_company_id)
      and (
        public.is_company_member(company_id,null)
        or exists(select 1 from public.companies c where c.id=company_id and c.user_id=auth.uid())
      )
  )
);

grant select,insert on public.trade_delivery_confirmations to authenticated;
grant select,insert on public.trade_delivery_disputes to authenticated;

create or replace function public.protect_trade_offer_completion()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='tamamlandi'
     and old.status is distinct from new.status
     and not public.is_platform_admin() then
    raise exception 'İşlemi yalnızca iki tarafın teslimat onayından sonra yönetici tamamlayabilir.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_trade_offer_completion_trigger on public.trade_offers;
create trigger protect_trade_offer_completion_trigger
before update of status on public.trade_offers
for each row execute function public.protect_trade_offer_completion();

create or replace function public.confirm_trade_delivery(
  p_offer_id uuid,
  p_party text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  offer_row public.trade_offers%rowtype;
  company_value uuid;
  payment_status_value text;
begin
  if auth.uid() is null then raise exception 'Oturum açmanız gerekiyor.'; end if;
  if p_party not in ('seller','buyer') then raise exception 'Geçersiz teslimat tarafı.'; end if;

  select * into offer_row from public.trade_offers where id=p_offer_id for update;
  if not found then raise exception 'Teklif bulunamadı.'; end if;
  if offer_row.status<>'kabul_edildi' then raise exception 'Yalnızca kabul edilmiş işlem onaylanabilir.'; end if;
  if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=p_offer_id and status='acik') then
    raise exception 'Uyuşmazlıktaki işlem onaylanamaz.';
  end if;

  select status into payment_status_value from public.trade_payments where trade_offer_id=p_offer_id for update;
  if payment_status_value<>'odendi_havuzda' then
    raise exception 'Teslimat onayından önce ödeme güvenli havuza alınmalıdır.';
  end if;

  company_value := case when p_party='seller' then offer_row.seller_company_id else offer_row.buyer_company_id end;
  if not public.is_company_member(company_value,null)
     and not exists(select 1 from public.companies c where c.id=company_value and c.user_id=auth.uid()) then
    raise exception 'Bu işlem için teslimat onayı verme yetkiniz yok.';
  end if;

  insert into public.trade_delivery_confirmations(trade_offer_id,party,company_id,confirmed_by)
  values(p_offer_id,p_party,company_value,auth.uid())
  on conflict(trade_offer_id,party) do nothing;
end;
$$;

create or replace function public.dispute_trade_delivery(p_offer_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  offer_row public.trade_offers%rowtype;
  company_value uuid;
begin
  if auth.uid() is null then raise exception 'Oturum açmanız gerekiyor.'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Uyuşmazlık açıklaması en az 10 karakter olmalıdır.'; end if;
  select * into offer_row from public.trade_offers where id=p_offer_id for update;
  if not found or offer_row.status<>'kabul_edildi' then raise exception 'Bu işlem uyuşmazlığa açılamaz.'; end if;

  select c.id into company_value from public.companies c
  where c.id in (offer_row.buyer_company_id,offer_row.seller_company_id)
    and (c.user_id=auth.uid() or public.is_company_member(c.id,null))
  limit 1;
  if company_value is null then raise exception 'Bu işlem için uyuşmazlık açma yetkiniz yok.'; end if;

  if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=p_offer_id and status='acik') then
    raise exception 'Bu işlem için açık bir uyuşmazlık zaten bulunuyor.';
  end if;

  insert into public.trade_delivery_disputes(trade_offer_id,company_id,opened_by,reason)
  values(p_offer_id,company_value,auth.uid(),trim(p_reason));
end;
$$;

create or replace function public.admin_release_trade_payment(p_payment_id uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  payment_row public.trade_payments%rowtype;
  offer_row public.trade_offers%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select * into payment_row from public.trade_payments where id=p_payment_id for update;
  if not found or payment_row.status<>'odendi_havuzda' then raise exception 'Ödeme güvenli havuzda değil.'; end if;
  select * into offer_row from public.trade_offers where id=payment_row.trade_offer_id for update;
  if offer_row.status<>'kabul_edildi' then raise exception 'Teklif aktarım için uygun değil.'; end if;
  if exists(select 1 from public.trade_delivery_disputes where trade_offer_id=offer_row.id and status='acik') then
    raise exception 'Uyuşmazlık çözülmeden ödeme aktarılamaz.';
  end if;
  if (select count(distinct party) from public.trade_delivery_confirmations where trade_offer_id=offer_row.id)<>2 then
    raise exception 'Satıcı ve alıcı teslimat onayları tamamlanmadı.';
  end if;

  update public.trade_payments set admin_note=nullif(trim(p_note),''),reviewed_by=auth.uid(),updated_at=timezone('utc',now())
  where id=p_payment_id;
  update public.trade_offers set status='tamamlandi',completed_at=timezone('utc',now()),updated_at=timezone('utc',now())
  where id=offer_row.id;
end;
$$;

grant execute on function public.confirm_trade_delivery(uuid,text) to authenticated;
grant execute on function public.dispute_trade_delivery(uuid,text) to authenticated;
grant execute on function public.admin_release_trade_payment(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
