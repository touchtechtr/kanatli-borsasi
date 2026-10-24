create or replace function public.get_my_logistics_delivery_parties()
returns table(delivery_id uuid,requester_name text,carrier_name text)
language sql
stable
security definer
set search_path=public
as $function$
  select d.id,requester.name,carrier.name
  from public.logistics_deliveries d
  join public.companies requester on requester.id=d.requester_company_id
  join public.companies carrier on carrier.id=d.carrier_company_id
  where auth.uid() is not null
    and public.can_access_logistics_delivery(d.id)
$function$;

revoke all on function public.get_my_logistics_delivery_parties() from public,anon;
grant execute on function public.get_my_logistics_delivery_parties() to authenticated;

