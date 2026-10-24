create or replace function public.get_my_logistics_request_quotes()
returns table(
  request_id uuid,title text,request_status text,cargo_type text,
  origin_city text,destination_city text,pickup_date date,
  quantity numeric,quantity_unit text,quote_id uuid,quote_status text,
  amount numeric,currency text,message text,carrier_name text,
  vehicle_plate text,vehicle_type text,quote_created_at timestamptz
)
language sql
stable
security definer
set search_path=public
as $function$
  select r.id,r.title,r.status,r.cargo_type,r.origin_city,r.destination_city,
    r.pickup_date,r.quantity,r.quantity_unit,q.id,q.status,q.amount,q.currency,
    q.message,carrier.name,v.plate,v.vehicle_type,q.created_at
  from public.logistics_requests r
  join public.companies owner on owner.id=r.company_id
  left join public.logistics_quotes q on q.request_id=r.id
  left join public.companies carrier on carrier.id=q.carrier_company_id
  left join public.logistics_vehicles v on v.id=q.vehicle_id
  where auth.uid() is not null
    and (owner.user_id=auth.uid() or public.is_company_member(r.company_id,null))
  order by r.created_at desc,q.created_at desc
$function$;

revoke all on function public.get_my_logistics_request_quotes() from public,anon;
grant execute on function public.get_my_logistics_request_quotes() to authenticated;

