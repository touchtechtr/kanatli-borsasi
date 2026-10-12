begin;

create table if not exists public.admin_audit_read_state (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_audit_read_state enable row level security;
drop policy if exists admin_audit_read_state_own_select on public.admin_audit_read_state;
create policy admin_audit_read_state_own_select on public.admin_audit_read_state
for select to authenticated using (admin_user_id = auth.uid() and public.is_platform_admin());
grant select on public.admin_audit_read_state to authenticated;

create or replace function public.admin_sidebar_counts()
returns jsonb language plpgsql security definer set search_path = public, auth
as $$
declare result jsonb; last_seen timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  select coalesce(s.last_seen_at, '-infinity'::timestamptz) into last_seen
  from public.admin_audit_read_state s where s.admin_user_id = auth.uid();
  last_seen := coalesce(last_seen, '-infinity'::timestamptz);

  select jsonb_build_object(
    '/admin/hareket-kayitlari', jsonb_build_array(jsonb_build_object('value',(select count(*) from public.platform_audit_log where occurred_at > last_seen),'tone','red')),
    '/admin/firmalar', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.companies where status::text='reddedildi'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.companies where status::text='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.companies where status::text='onaylandi'),'tone','green')),
    '/admin/faaliyetler', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.company_activity_applications where status in ('reddedildi','duzeltme_istendi')),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.company_activity_applications where status in ('taslak','inceleme_bekliyor')),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.company_activities where status='aktif'),'tone','green')),
    '/admin/ilanlar', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from (select status from public.listings union all select status from public.feed_listings union all select status from public.livestock_listings) x where status in ('reddedildi','pasif')),'tone','red'),
      jsonb_build_object('value',(select count(*) from (select status from public.listings union all select status from public.feed_listings union all select status from public.livestock_listings) x where status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from (select status from public.listings union all select status from public.feed_listings union all select status from public.livestock_listings) x where status='aktif'),'tone','green')),
    '/admin/ilan-promosyonlari', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.listing_promotions where status in ('reddedildi','iptal')),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.listing_promotions where status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.listing_promotions where status='aktif'),'tone','green')),
    '/admin/teklifler', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.trade_offers where admin_status='reddedildi'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.trade_offers where admin_status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.trade_offers where admin_status='onaylandi'),'tone','green')),
    '/admin/randevular', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.slaughter_appointments where lower(status) like 'redd%'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.slaughter_appointments where lower(status) like '%bekl%'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.slaughter_appointments where lower(status) like 'onay%'),'tone','green')),
    '/admin/ekspertiz', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.expert_requests where status='reddedildi'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.expert_requests where status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.expert_requests where status='onaylandi'),'tone','green')),
    '/admin/kullanicilar', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from auth.users where email_confirmed_at is null),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from auth.users where email_confirmed_at is not null),'tone','green')),
    '/admin/sozlesmeler', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.contract_farming where status='reddedildi'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.contract_farming where status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.contract_farming where status='aktif'),'tone','green')),
    '/admin/kesimhaneler', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.slaughterhouses where lower(status)='reddedildi'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.slaughterhouses where lower(status)='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.slaughterhouses where lower(status)='aktif'),'tone','green')),
    '/admin/eposta-kuyrugu', jsonb_build_array(
      jsonb_build_object('value',(select count(*) from public.notification_email_outbox where status='hata'),'tone','red'),
      jsonb_build_object('value',(select count(*) from public.notification_email_outbox where status='beklemede'),'tone','yellow'),
      jsonb_build_object('value',(select count(*) from public.notification_email_outbox where status='gonderildi'),'tone','green'))
  ) into result;
  return result;
end; $$;

create or replace function public.admin_mark_audit_seen()
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  insert into public.admin_audit_read_state(admin_user_id,last_seen_at,updated_at)
  values(auth.uid(),timezone('utc',now()),timezone('utc',now()))
  on conflict(admin_user_id) do update set last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at;
end; $$;

create or replace function public.admin_retry_email(p_outbox_id uuid)
returns void language plpgsql security definer set search_path = public
as $$ begin
  if not public.is_platform_admin() then raise exception 'Yönetici yetkisi gerekiyor.'; end if;
  update public.notification_email_outbox set status='beklemede',attempt_count=0,last_error=null,updated_at=timezone('utc',now()) where id=p_outbox_id;
  if not found then raise exception 'E-posta kaydı bulunamadı.'; end if;
end; $$;

revoke all on function public.admin_sidebar_counts() from public,anon;
revoke all on function public.admin_mark_audit_seen() from public,anon;
revoke all on function public.admin_retry_email(uuid) from public,anon;
grant execute on function public.admin_sidebar_counts() to authenticated;
grant execute on function public.admin_mark_audit_seen() to authenticated;
grant execute on function public.admin_retry_email(uuid) to authenticated;

commit;
