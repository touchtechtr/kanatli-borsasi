begin;

-- Ortak yaşam döngüsü alanları: mevcut veriyi silmeden üç ilan kaynağına eklenir.
do $$
declare t text;
begin
  foreach t in array array['listings','feed_listings','livestock_listings'] loop
    execute format('alter table public.%I add column if not exists initial_quantity numeric',t);
    execute format('alter table public.%I add column if not exists reserved_quantity numeric not null default 0',t);
    execute format('alter table public.%I add column if not exists sold_quantity numeric not null default 0',t);
    execute format('alter table public.%I add column if not exists expires_at timestamptz',t);
    execute format('alter table public.%I add column if not exists closed_at timestamptz',t);
    execute format('update public.%I set initial_quantity=quantity where initial_quantity is null',t);

    execute format('alter table public.%I drop constraint if exists %I',t,t||'_status_check');
    execute format(
      'alter table public.%I add constraint %I check (status in (''aktif'',''pasif'',''beklemede'',''reddedildi'',''islemde'',''satildi'',''tamamlandi'',''iptal'',''suresi_doldu''))',
      t,t||'_status_check'
    );

    execute format('alter table public.%I drop constraint if exists %I',t,t||'_lifecycle_quantity_check');
    execute format(
      'alter table public.%I add constraint %I check (initial_quantity>0 and reserved_quantity>=0 and sold_quantity>=0 and quantity>=0)',
      t,t||'_lifecycle_quantity_check'
    );
    execute format('create index if not exists %I on public.%I(status,expires_at)',t||'_lifecycle_status_expiry_idx',t);
  end loop;
end $$;

-- Teklif kabul edildiğinde ilanı rezerve eder; tamamlanınca kalan miktarı yeniden yayına alır.
create or replace function public.sync_listing_lifecycle_from_trade_offer()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  table_name_value text;
  available_quantity numeric;
  accepted_quantity numeric;
begin
  if new.status is not distinct from old.status then return new; end if;

  table_name_value:=case new.listing_kind
    when 'listing' then 'listings'
    when 'feed' then 'feed_listings'
    when 'livestock' then 'livestock_listings'
    else null
  end;
  if table_name_value is null then return new; end if;

  if new.status='kabul_edildi' then
    execute format('select quantity from public.%I where id=$1 for update',table_name_value)
      into available_quantity using new.listing_id;
    if available_quantity is null then raise exception 'İlan bulunamadı.'; end if;
    if new.offered_quantity>available_quantity then
      raise exception 'Teklif miktarı ilanın kalan miktarını aşıyor.';
    end if;

    execute format(
      'update public.%I set reserved_quantity=$1,status=''islemde''%s where id=$2',
      table_name_value,
      case when table_name_value in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
    ) using new.offered_quantity,new.listing_id;

    update public.trade_offers
    set status='reddedildi',responded_at=coalesce(responded_at,timezone('utc',now())),updated_at=timezone('utc',now())
    where listing_kind=new.listing_kind and listing_id=new.listing_id
      and id<>new.id and status='beklemede';

  elsif new.status='tamamlandi' and old.status='kabul_edildi' then
    execute format(
      'update public.%I set quantity=greatest(quantity-$1,0),reserved_quantity=0,sold_quantity=sold_quantity+$1,status=case when quantity-$1>0 then ''aktif'' else ''tamamlandi'' end,closed_at=case when quantity-$1>0 then null else timezone(''utc'',now()) end%s where id=$2',
      table_name_value,
      case when table_name_value in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
    ) using new.offered_quantity,new.listing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_listing_lifecycle_from_trade_offer_trigger on public.trade_offers;
create trigger sync_listing_lifecycle_from_trade_offer_trigger
after update of status on public.trade_offers
for each row execute function public.sync_listing_lifecycle_from_trade_offer();

-- Süresi dolmuş, işlemde olmayan ilanları güvenli şekilde kapatır.
create or replace function public.expire_marketplace_listings()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare t text; affected integer; total_affected integer:=0;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  foreach t in array array['listings','feed_listings','livestock_listings'] loop
    execute format(
      'update public.%I set status=''suresi_doldu'',closed_at=timezone(''utc'',now())%s where status=''aktif'' and expires_at is not null and expires_at<=timezone(''utc'',now())',
      t,
      case when t in ('feed_listings','livestock_listings') then ',updated_at=timezone(''utc'',now())' else '' end
    );
    get diagnostics affected=row_count;
    total_affected:=total_affected+affected;
  end loop;
  return jsonb_build_object('expired_count',total_affected,'processed_at',timezone('utc',now()));
end;
$$;

-- Üç kaynağı ortak, salt okunur yaşam döngüsü görünümünde birleştirir.
create or replace view public.marketplace_listing_lifecycle
with (security_invoker=true)
as
select 'listings'::text listing_type,id,company_id,title,status,moderation_status,
       initial_quantity,quantity remaining_quantity,reserved_quantity,sold_quantity,
       unit,expires_at,closed_at,created_at
from public.listings
union all
select 'feed_listings',id,company_id,title,status,moderation_status,
       initial_quantity,quantity,reserved_quantity,sold_quantity,
       unit,expires_at,closed_at,created_at
from public.feed_listings
union all
select 'livestock_listings',id,company_id,title,status,moderation_status,
       initial_quantity,quantity,reserved_quantity,sold_quantity,
       unit,expires_at,closed_at,created_at
from public.livestock_listings;

grant select on public.marketplace_listing_lifecycle to authenticated;

-- Yaşam döngüsü kontrollerini mevcut sistem sağlığı çıktısına ekler.
create or replace function public.admin_listing_lifecycle_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  return jsonb_build_object(
    'checked_at',timezone('utc',now()),
    'active_with_no_remaining_quantity',(
      select count(*) from public.marketplace_listing_lifecycle
      where status='aktif' and remaining_quantity<=0
    ),
    'expired_but_active',(
      select count(*) from public.marketplace_listing_lifecycle
      where status='aktif' and expires_at is not null and expires_at<=timezone('utc',now())
    ),
    'in_progress_without_accepted_offer',(
      select count(*) from public.marketplace_listing_lifecycle l
      where l.status='islemde' and not exists(
        select 1 from public.trade_offers o
        where o.listing_id=l.id
          and o.listing_kind=case l.listing_type when 'listings' then 'listing' when 'feed_listings' then 'feed' else 'livestock' end
          and o.status='kabul_edildi'
      )
    ),
    'accepted_offer_listing_not_in_progress',(
      select count(*) from public.trade_offers o
      where o.status='kabul_edildi' and not exists(
        select 1 from public.marketplace_listing_lifecycle l
        where l.id=o.listing_id
          and l.listing_type=case o.listing_kind when 'listing' then 'listings' when 'feed' then 'feed_listings' else 'livestock_listings' end
          and l.status='islemde'
      )
    ),
    'completed_with_remaining_quantity',(
      select count(*) from public.marketplace_listing_lifecycle
      where status in ('satildi','tamamlandi') and remaining_quantity>0
    ),
    'invalid_quantity_balance',(
      select count(*) from public.marketplace_listing_lifecycle
      where initial_quantity < remaining_quantity+sold_quantity
         or reserved_quantity>remaining_quantity
    ),
    'multiple_accepted_offers',(
      select count(*) from (
        select listing_kind,listing_id
        from public.trade_offers
        where status='kabul_edildi'
        group by listing_kind,listing_id
        having count(*)>1
      ) duplicated
    )
  );
end;
$$;

revoke all on function public.sync_listing_lifecycle_from_trade_offer(),
  public.expire_marketplace_listings(),
  public.admin_listing_lifecycle_health()
from public,anon;

revoke all on function public.sync_listing_lifecycle_from_trade_offer() from authenticated;
grant execute on function public.expire_marketplace_listings(),public.admin_listing_lifecycle_health() to authenticated;

notify pgrst,'reload schema';
commit;
