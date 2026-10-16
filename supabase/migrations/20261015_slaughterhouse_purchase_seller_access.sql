begin;

-- Talep, teklif ve teslimat tabloları birbirine bağlı RLS politikaları
-- kullandığı için kontrolü SECURITY DEFINER yardımcı fonksiyonunda yapar.
-- Böylece karşılıklı politika sorgularından kaynaklanabilecek sonsuz döngü
-- oluşmadan yalnızca işlemin gerçek taraflarına erişim verilir.
create or replace function public.can_access_slaughter_purchase_request(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.is_platform_admin()
    or exists(
      select 1
      from public.slaughterhouse_purchase_requests r
      join public.companies c on c.id=r.company_id
      where r.id=p_request_id
        and (
          c.user_id=auth.uid()
          or public.is_company_member(r.company_id,null)
        )
    )
    or exists(
      select 1
      from public.slaughterhouse_purchase_offers o
      join public.companies c on c.id=o.seller_company_id
      where o.request_id=p_request_id
        and (
          c.user_id=auth.uid()
          or public.is_company_member(o.seller_company_id,null)
        )
    )
    or exists(
      select 1
      from public.slaughterhouse_deliveries d
      where d.request_id=p_request_id
        and (
          public.is_company_member(d.buyer_company_id,null)
          or public.is_company_member(d.seller_company_id,null)
          or exists(
            select 1 from public.companies c
            where c.id in(d.buyer_company_id,d.seller_company_id)
              and c.user_id=auth.uid()
          )
        )
    );
$$;

drop policy if exists purchase_requests_select
  on public.slaughterhouse_purchase_requests;

create policy purchase_requests_select
on public.slaughterhouse_purchase_requests
for select
to authenticated
using(
  status='acik'
  or public.can_access_slaughter_purchase_request(id)
);

revoke all on function public.can_access_slaughter_purchase_request(uuid)
  from public,anon;
grant execute on function public.can_access_slaughter_purchase_request(uuid)
  to authenticated;

commit;
