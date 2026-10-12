begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, read_at)
  where read_at is null;

create table if not exists public.system_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  old_status text,
  new_status text,
  message text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.notifications enable row level security;
alter table public.system_activity_log enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated using (recipient_user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists activity_log_admin_select on public.system_activity_log;
create policy activity_log_admin_select on public.system_activity_log
for select to authenticated using (public.current_user_is_admin());

grant select, update on public.notifications to authenticated;
grant select on public.system_activity_log to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path = public
as $$
  update public.notifications set read_at = coalesce(read_at, timezone('utc', now()))
  where id = p_notification_id and recipient_user_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = public
as $$
  update public.notifications set read_at = timezone('utc', now())
  where recipient_user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.record_entity_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := to_jsonb(new);
  old_payload jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  entity_kind text := tg_argv[0];
  link_value text := tg_argv[1];
  owner_mode text := tg_argv[2];
  status_key text := coalesce(nullif(tg_argv[3], ''), 'status');
  entity_uuid uuid := nullif(payload ->> 'id', '')::uuid;
  owner_uuid uuid;
  company_uuid uuid;
  old_status text := old_payload ->> status_key;
  new_status text := payload ->> status_key;
  note_value text := coalesce(nullif(payload ->> 'admin_note', ''), nullif(payload ->> 'approval_note', ''));
  event_value text;
  title_value text;
  message_value text;
begin
  if tg_op = 'UPDATE' and new_status is not distinct from old_status then
    return new;
  end if;

  if owner_mode = 'user_id' then
    owner_uuid := nullif(payload ->> 'user_id', '')::uuid;
  elsif owner_mode = 'company_id' then
    company_uuid := nullif(payload ->> 'company_id', '')::uuid;
    select user_id into owner_uuid from public.companies where id = company_uuid;
  end if;

  if owner_uuid is null then return new; end if;

  event_value := case when tg_op = 'INSERT' then 'olusturuldu' else 'durum_degisti' end;
  title_value := entity_kind || case when tg_op = 'INSERT' then ' kaydınız alındı' else ' durumunuz güncellendi' end;
  message_value := case
    when tg_op = 'INSERT' then entity_kind || ' kaydınız sisteme alınmıştır. Durum: ' || coalesce(new_status, '—') || '.'
    else entity_kind || ' durumu “' || coalesce(old_status, '—') || '” değerinden “' || coalesce(new_status, '—') || '” değerine güncellendi.'
  end;
  if note_value is not null then message_value := message_value || ' Açıklama: ' || note_value; end if;

  insert into public.notifications (
    recipient_user_id, actor_user_id, entity_type, entity_id,
    event_type, title, message, link
  ) values (
    owner_uuid, auth.uid(), entity_kind, entity_uuid,
    event_value, title_value, message_value, link_value
  );

  insert into public.system_activity_log (
    actor_user_id, recipient_user_id, entity_type, entity_id,
    event_type, old_status, new_status, message
  ) values (
    auth.uid(), owner_uuid, entity_kind, entity_uuid,
    event_value, old_status, new_status, note_value
  );
  return new;
end;
$$;

do $$
declare item record;
begin
  for item in select * from (values
    ('companies', 'Firma başvurusu', '/profil', 'user_id', 'status'),
    ('listings', 'İlan', '/', 'user_id', 'status'),
    ('feed_listings', 'Yem ilanı', '/', 'user_id', 'status'),
    ('livestock_listings', 'Canlı hayvan ilanı', '/livestock', 'user_id', 'status'),
    ('contract_farming', 'Sözleşmeli üretim teklifi', '/sozlesme-yonetimi', 'company_id', 'status'),
    ('slaughterhouses', 'Kesimhane tesisi', '/kesimhane/tesis-basvurusu', 'company_id', 'status'),
    ('slaughter_appointments', 'Kesimhane randevusu', '/kesimhane', 'user_id', 'status'),
    ('expert_requests', 'Ekspertiz talebi', '/ekspertiz', 'user_id', 'status')
  ) as entries(table_name, entity_name, target_link, owner_mode, status_column)
  loop
    execute format('drop trigger if exists notify_%I_status on public.%I', item.table_name, item.table_name);
    execute format(
      'create trigger notify_%I_status after insert or update on public.%I for each row execute function public.record_entity_notification(%L,%L,%L,%L)',
      item.table_name, item.table_name, item.entity_name, item.target_link, item.owner_mode, item.status_column
    );
  end loop;
end $$;

create or replace function public.record_trade_offer_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
declare buyer_user uuid; seller_user uuid; note_value text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.admin_status is not distinct from old.admin_status then return new; end if;
  select user_id into buyer_user from public.companies where id = new.buyer_company_id;
  select user_id into seller_user from public.companies where id = new.seller_company_id;
  note_value := nullif(new.admin_note, '');
  insert into public.notifications(recipient_user_id, actor_user_id, entity_type, entity_id, event_type, title, message, link)
  select recipient, auth.uid(), 'Ticari teklif', new.id, 'durum_degisti', 'Ticari teklif güncellendi',
    '“' || new.product_title || '” teklifi güncellendi. Teklif durumu: ' || new.status || ', yönetim durumu: ' || new.admin_status || coalesce('. Açıklama: ' || note_value, '.'),
    '/tuccar-paneli'
  from (select buyer_user recipient union select seller_user) users where recipient is not null;
  return new;
end;
$$;

drop trigger if exists notify_trade_offers_status on public.trade_offers;
create trigger notify_trade_offers_status after insert or update on public.trade_offers
for each row execute function public.record_trade_offer_notification();

revoke all on function public.record_entity_notification() from public, anon, authenticated;
revoke all on function public.record_trade_offer_notification() from public, anon, authenticated;

commit;
