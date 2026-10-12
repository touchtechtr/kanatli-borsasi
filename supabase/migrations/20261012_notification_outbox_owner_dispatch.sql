begin;

-- Kullanıcı kendi adına oluşturulmuş hazır e-posta kayıtlarını gönderebilir.
-- Yönetici politikaları genel kuyruğu yönetmeye devam eder.
drop policy if exists notification_email_outbox_owner_select
  on public.notification_email_outbox;
drop policy if exists notification_email_outbox_owner_update
  on public.notification_email_outbox;

create policy notification_email_outbox_owner_select
on public.notification_email_outbox
for select
to authenticated
using (recipient_user_id = auth.uid());

create policy notification_email_outbox_owner_update
on public.notification_email_outbox
for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

commit;
