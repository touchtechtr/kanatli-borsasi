begin;

create table if not exists public.listing_moderation_settings (
  id boolean primary key default true check (id),
  manual_review_all boolean not null default false,
  duplicate_review_enabled boolean not null default true,
  duplicate_window_hours integer not null default 24 check (duplicate_window_hours between 1 and 720),
  new_company_review_enabled boolean not null default false,
  new_company_days integer not null default 7 check (new_company_days between 1 and 365),
  maximum_unit_price numeric null check (maximum_unit_price is null or maximum_unit_price > 0),
  maximum_quantity numeric null check (maximum_quantity is null or maximum_quantity > 0),
  blocked_words text[] not null default '{}',
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.listing_moderation_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.listing_moderation_settings enable row level security;

drop policy if exists listing_moderation_settings_admin_select on public.listing_moderation_settings;
create policy listing_moderation_settings_admin_select
on public.listing_moderation_settings for select to authenticated
using (public.is_platform_admin());

drop policy if exists listing_moderation_settings_admin_update on public.listing_moderation_settings;
create policy listing_moderation_settings_admin_update
on public.listing_moderation_settings for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create table if not exists public.listing_moderation_history (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (listing_type in ('listings', 'feed_listings', 'livestock_listings')),
  listing_id uuid not null,
  action text not null check (action in ('otomatik_onaylandi', 'inceleme_bekliyor', 'onaylandi', 'reddedildi')),
  reason text null,
  risk_score integer not null default 0,
  risk_flags jsonb not null default '[]'::jsonb,
  admin_id uuid null references auth.users(id),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists listing_moderation_history_listing_idx
on public.listing_moderation_history (listing_type, listing_id, created_at desc);

alter table public.listing_moderation_history enable row level security;

drop policy if exists listing_moderation_history_admin_select on public.listing_moderation_history;
create policy listing_moderation_history_admin_select
on public.listing_moderation_history for select to authenticated
using (public.is_platform_admin());

do $$
declare
  target_table text;
begin
  foreach target_table in array array['listings', 'feed_listings', 'livestock_listings'] loop
    execute format('alter table public.%I add column if not exists moderation_status text', target_table);
    execute format('alter table public.%I add column if not exists moderation_reason text', target_table);
    execute format('alter table public.%I add column if not exists risk_score integer not null default 0', target_table);
    execute format('alter table public.%I add column if not exists risk_flags jsonb not null default ''[]''::jsonb', target_table);
    execute format('alter table public.%I add column if not exists moderated_by uuid references auth.users(id)', target_table);
    execute format('alter table public.%I add column if not exists moderated_at timestamptz', target_table);

    execute format(
      'update public.%I set moderation_status = case when status = ''aktif'' then ''otomatik_onaylandi'' else ''onaylandi'' end where moderation_status is null',
      target_table
    );
    execute format('alter table public.%I alter column moderation_status set default ''otomatik_onaylandi''', target_table);
    execute format('alter table public.%I alter column moderation_status set not null', target_table);

    if not exists (
      select 1 from pg_constraint
      where conname = target_table || '_moderation_status_check'
        and conrelid = format('public.%I', target_table)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I check (moderation_status in (''otomatik_onaylandi'', ''inceleme_bekliyor'', ''onaylandi'', ''reddedildi''))',
        target_table,
        target_table || '_moderation_status_check'
      );
    end if;
  end loop;
end $$;

create or replace function public.evaluate_listing_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.listing_moderation_settings%rowtype;
  company_record public.companies%rowtype;
  flags jsonb := '[]'::jsonb;
  score integer := 0;
  duplicate_exists boolean := false;
  combined_text text;
  blocked_word text;
begin
  select * into settings from public.listing_moderation_settings where id = true;
  select * into company_record from public.companies where id = new.company_id;

  if company_record.id is null or company_record.user_id <> auth.uid() then
    raise exception 'İlan yalnızca kendi firmanız adına oluşturulabilir.';
  end if;
  if company_record.status <> 'onaylandi' then
    raise exception 'İlan oluşturmak için firmanızın onaylanması gerekir.';
  end if;
  if company_record.is_permanently_blocked
     or (company_record.blocked_until is not null and company_record.blocked_until > timezone('utc', now())) then
    raise exception 'Engelli firma ilan oluşturamaz.';
  end if;

  if settings.manual_review_all then
    flags := flags || jsonb_build_array('manual_review_all'); score := score + 100;
  end if;

  if settings.duplicate_review_enabled then
    execute format(
      'select exists (select 1 from public.%I where company_id = $1 and lower(trim(title)) = lower(trim($2)) and created_at >= timezone(''utc'', now()) - make_interval(hours => $3))',
      tg_table_name
    ) into duplicate_exists using new.company_id, new.title, settings.duplicate_window_hours;
    if duplicate_exists then
      flags := flags || jsonb_build_array('duplicate_recent_listing'); score := score + 40;
    end if;
  end if;

  if settings.maximum_unit_price is not null and new.price > settings.maximum_unit_price then
    flags := flags || jsonb_build_array('price_above_limit'); score := score + 35;
  end if;
  if settings.maximum_quantity is not null and new.quantity > settings.maximum_quantity then
    flags := flags || jsonb_build_array('quantity_above_limit'); score := score + 30;
  end if;
  if settings.new_company_review_enabled
     and company_record.created_at >= timezone('utc', now()) - make_interval(days => settings.new_company_days) then
    flags := flags || jsonb_build_array('new_company'); score := score + 25;
  end if;

  combined_text := lower(coalesce(new.title, '') || ' ' || coalesce(to_jsonb(new)->>'description', ''));
  foreach blocked_word in array settings.blocked_words loop
    if length(trim(blocked_word)) > 0 and combined_text like '%' || lower(trim(blocked_word)) || '%' then
      flags := flags || jsonb_build_array('blocked_word:' || trim(blocked_word)); score := score + 50;
    end if;
  end loop;

  new.risk_score := score;
  new.risk_flags := flags;
  new.moderated_by := null;
  new.moderated_at := null;
  new.moderation_reason := null;

  if jsonb_array_length(flags) > 0 then
    new.moderation_status := 'inceleme_bekliyor';
    new.status := 'beklemede';
  else
    new.moderation_status := 'otomatik_onaylandi';
    new.status := 'aktif';
  end if;
  return new;
end;
$$;

create or replace function public.record_listing_moderation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_moderation_history
    (listing_type, listing_id, action, reason, risk_score, risk_flags)
  values
    (tg_table_name, new.id, new.moderation_status, new.moderation_reason, new.risk_score, new.risk_flags);
  return new;
end;
$$;

create or replace function public.protect_listing_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_platform_admin() then
    return new;
  end if;

  if new.moderation_status is distinct from old.moderation_status
     or new.moderation_reason is distinct from old.moderation_reason
     or new.risk_score is distinct from old.risk_score
     or new.risk_flags is distinct from old.risk_flags
     or new.moderated_by is distinct from old.moderated_by
     or new.moderated_at is distinct from old.moderated_at then
    raise exception 'İlan moderasyon alanlarını yalnızca yönetici değiştirebilir.';
  end if;

  if new.status is distinct from old.status then
    if old.moderation_status not in ('otomatik_onaylandi', 'onaylandi')
       or new.status not in ('aktif', 'pasif') then
      raise exception 'Bu ilan durumunu değiştirme yetkiniz yok.';
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['listings', 'feed_listings', 'livestock_listings'] loop
    execute format('drop trigger if exists evaluate_listing_risk_trigger on public.%I', target_table);
    execute format('create trigger evaluate_listing_risk_trigger before insert on public.%I for each row execute function public.evaluate_listing_risk()', target_table);
    execute format('drop trigger if exists record_listing_moderation_insert_trigger on public.%I', target_table);
    execute format('create trigger record_listing_moderation_insert_trigger after insert on public.%I for each row execute function public.record_listing_moderation_insert()', target_table);
    execute format('drop trigger if exists protect_listing_moderation_fields_trigger on public.%I', target_table);
    execute format('create trigger protect_listing_moderation_fields_trigger before update on public.%I for each row execute function public.protect_listing_moderation_fields()', target_table);
  end loop;
end $$;

create or replace function public.admin_review_listing(
  target_listing_type text,
  target_listing_id uuid,
  decision text,
  review_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  if target_listing_type not in ('listings', 'feed_listings', 'livestock_listings') then raise exception 'Geçersiz ilan türü.'; end if;
  if decision not in ('onaylandi', 'reddedildi') then raise exception 'Geçersiz moderasyon kararı.'; end if;
  if decision = 'reddedildi' and nullif(trim(review_reason), '') is null then raise exception 'Ret nedeni zorunludur.'; end if;

  execute format('select moderation_status from public.%I where id = $1 for update', target_listing_type)
  into current_status using target_listing_id;
  if current_status is null then raise exception 'İlan bulunamadı.'; end if;
  if current_status <> 'inceleme_bekliyor' then raise exception 'Yalnızca inceleme bekleyen ilanlar karara bağlanabilir.'; end if;

  execute format(
    'update public.%I set moderation_status = $1, moderation_reason = $2, status = $3, moderated_by = auth.uid(), moderated_at = timezone(''utc'', now()) where id = $4',
    target_listing_type
  ) using decision, nullif(trim(review_reason), ''), case when decision = 'onaylandi' then 'aktif' else 'reddedildi' end, target_listing_id;

  insert into public.listing_moderation_history
    (listing_type, listing_id, action, reason, admin_id)
  values
    (target_listing_type, target_listing_id, decision, nullif(trim(review_reason), ''), auth.uid());
end;
$$;

revoke all on function public.admin_review_listing(text, uuid, text, text) from public;
grant execute on function public.admin_review_listing(text, uuid, text, text) to authenticated;

commit;
