begin;

create or replace function public.admin_update_listing_moderation_settings(
  p_manual_review_all boolean,
  p_duplicate_review_enabled boolean,
  p_duplicate_window_hours integer,
  p_new_company_review_enabled boolean,
  p_new_company_days integer,
  p_maximum_unit_price numeric,
  p_maximum_quantity numeric,
  p_blocked_words text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_words text[];
begin
  if not public.is_platform_admin() then
    raise exception 'Yönetici yetkisi gerekiyor.';
  end if;
  if p_duplicate_window_hours not between 1 and 720 then
    raise exception 'Mükerrer ilan süresi 1 ile 720 saat arasında olmalıdır.';
  end if;
  if p_new_company_days not between 1 and 365 then
    raise exception 'Yeni firma süresi 1 ile 365 gün arasında olmalıdır.';
  end if;
  if p_maximum_unit_price is not null and p_maximum_unit_price <= 0 then
    raise exception 'Fiyat üst sınırı sıfırdan büyük olmalıdır.';
  end if;
  if p_maximum_quantity is not null and p_maximum_quantity <= 0 then
    raise exception 'Miktar üst sınırı sıfırdan büyük olmalıdır.';
  end if;

  select coalesce(array_agg(distinct lower(trim(word))) filter (where length(trim(word)) > 0), '{}')
  into cleaned_words
  from unnest(coalesce(p_blocked_words, '{}'::text[])) as word;

  update public.listing_moderation_settings
  set manual_review_all = p_manual_review_all,
      duplicate_review_enabled = p_duplicate_review_enabled,
      duplicate_window_hours = p_duplicate_window_hours,
      new_company_review_enabled = p_new_company_review_enabled,
      new_company_days = p_new_company_days,
      maximum_unit_price = p_maximum_unit_price,
      maximum_quantity = p_maximum_quantity,
      blocked_words = cleaned_words,
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
  where id = true;
end;
$$;

revoke all on function public.admin_update_listing_moderation_settings(boolean, boolean, integer, boolean, integer, numeric, numeric, text[]) from public;
grant execute on function public.admin_update_listing_moderation_settings(boolean, boolean, integer, boolean, integer, numeric, numeric, text[]) to authenticated;

commit;
