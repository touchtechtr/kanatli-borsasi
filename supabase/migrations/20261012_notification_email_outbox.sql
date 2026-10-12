begin;

create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  title text not null,
  message text not null,
  link text,
  status text not null default 'beklemede' check (status in ('beklemede','gonderildi','hata')),
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notification_email_outbox_status_idx
  on public.notification_email_outbox(status, created_at);

alter table public.notification_email_outbox enable row level security;

drop policy if exists notification_email_outbox_admin_select on public.notification_email_outbox;
drop policy if exists notification_email_outbox_admin_update on public.notification_email_outbox;

create policy notification_email_outbox_admin_select
on public.notification_email_outbox for select to authenticated
using (public.is_platform_admin());

create policy notification_email_outbox_admin_update
on public.notification_email_outbox for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select, update on public.notification_email_outbox to authenticated;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_email text;
begin
  select u.email into target_email
  from auth.users u
  where u.id = new.recipient_user_id;

  if nullif(btrim(coalesce(target_email, '')), '') is null then
    return new;
  end if;

  insert into public.notification_email_outbox(
    notification_id,
    recipient_user_id,
    recipient_email,
    subject,
    title,
    message,
    link
  ) values (
    new.id,
    new.recipient_user_id,
    target_email,
    new.title,
    new.title,
    new.message,
    new.link
  )
  on conflict(notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists queue_notification_email_trigger on public.notifications;
create trigger queue_notification_email_trigger
after insert on public.notifications
for each row execute function public.queue_notification_email();

commit;
