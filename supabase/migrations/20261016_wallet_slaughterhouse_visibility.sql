begin;

create or replace function public.get_wallet_dashboard(p_scope text default 'company')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  account_id uuid;
  selected_company uuid;
  wallet_name text;
  account_kind text;
  is_admin boolean:=public.is_platform_admin();
  has_company boolean:=false;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Bu işlem için giriş yapmalısınız.';
  end if;

  select c.id,c.name into selected_company,wallet_name
  from public.companies c
  where c.user_id=auth.uid()
  order by c.created_at
  limit 1;

  has_company:=selected_company is not null;

  if p_scope='platform' then
    if not is_admin then
      raise exception 'Platform cüzdanını yalnızca yöneticiler görüntüleyebilir.';
    end if;

    insert into public.wallet_accounts(company_id,account_type)
    values(null,'platform')
    on conflict do nothing;

    select id into account_id
    from public.wallet_accounts
    where account_type='platform';

    account_kind:='platform';
    wallet_name:='Platform Komisyon Cüzdanı';
    selected_company:=null;
  else
    if not has_company then
      if is_admin then
        insert into public.wallet_accounts(company_id,account_type)
        values(null,'platform')
        on conflict do nothing;

        select id into account_id
        from public.wallet_accounts
        where account_type='platform';

        account_kind:='platform';
        wallet_name:='Platform Komisyon Cüzdanı';
      else
        raise exception 'Cüzdan için firma kaydı bulunamadı.';
      end if;
    else
      insert into public.wallet_accounts(company_id,account_type)
      values(selected_company,'company')
      on conflict do nothing;

      select id into account_id
      from public.wallet_accounts
      where company_id=selected_company;

      account_kind:='company';
    end if;
  end if;

  select jsonb_build_object(
    'account_id',account_id,
    'account_type',account_kind,
    'company_id',selected_company,
    'name',wallet_name,
    'currency','TRY',
    'can_view_platform',is_admin,
    'has_company',has_company,
    'balance',coalesce(sum(
      case when wt.direction='credit' then wt.amount else -wt.amount end
    ) filter(where wt.status='posted'),0),
    'total_income',coalesce(sum(wt.amount) filter(
      where wt.direction='credit' and wt.status='posted'
    ),0),
    'total_expense',coalesce(sum(wt.amount) filter(
      where wt.direction='debit' and wt.status='posted'
    ),0),
    'pending_income',
      coalesce((
        select sum(p.seller_amount)
        from public.trade_payments p
        where p.seller_company_id=selected_company
          and p.status in ('odeme_bekliyor','odendi_havuzda')
      ),0)
      +
      coalesce((
        select sum(p.seller_amount)
        from public.slaughterhouse_payments p
        where p.seller_company_id=selected_company
          and p.status='serbest_birakilmaya_hazir'
      ),0),
    'pending_expense',
      coalesce((
        select sum(p.buyer_total)
        from public.trade_payments p
        where p.buyer_company_id=selected_company
          and p.status in ('odeme_bekliyor','odendi_havuzda')
      ),0)
      +
      coalesce((
        select sum(p.buyer_total)
        from public.slaughterhouse_payments p
        where p.buyer_company_id=selected_company
          and p.status='serbest_birakilmaya_hazir'
      ),0),
    'disputed_income',coalesce((
      select sum(p.seller_amount)
      from public.slaughterhouse_payments p
      where p.seller_company_id=selected_company
        and p.status='uyusmazlikta'
    ),0),
    'disputed_expense',coalesce((
      select sum(p.buyer_total)
      from public.slaughterhouse_payments p
      where p.buyer_company_id=selected_company
        and p.status='uyusmazlikta'
    ),0),
    'transactions',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',wt.id,
          'type',wt.transaction_type,
          'direction',wt.direction,
          'amount',wt.amount,
          'description',wt.description,
          'status',wt.status,
          'trade_offer_id',wt.trade_offer_id,
          'slaughterhouse_delivery_id',wt.slaughterhouse_delivery_id,
          'slaughterhouse_request_id',(
            select d.request_id
            from public.slaughterhouse_deliveries d
            where d.id=wt.slaughterhouse_delivery_id
          ),
          'source',case
            when wt.slaughterhouse_delivery_id is not null then 'slaughterhouse'
            when wt.trade_offer_id is not null then 'trade'
            else 'manual'
          end,
          'created_at',wt.created_at
        )
        order by wt.created_at desc
      ) filter(where wt.id is not null),
      '[]'::jsonb
    )
  ) into result
  from public.wallet_transactions wt
  where wt.wallet_account_id=account_id;

  return result;
end;
$$;

revoke all on function public.get_wallet_dashboard(text) from public,anon;
grant execute on function public.get_wallet_dashboard(text) to authenticated;

commit;
