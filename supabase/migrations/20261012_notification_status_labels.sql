begin;

-- Veritabanındaki teknik durum kodlarını kullanıcıya gösterilecek Türkçe
-- karşılıklara çevirir. Bildirim üreticileri teknik kod kullansa bile hem
-- uygulama içi bildirim hem e-posta okunabilir kalır.
create or replace function public.format_notification_status_labels(
  p_text text
)
returns text
language sql
immutable
set search_path = public
as $$
  select
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(
                          replace(
                            replace(
                              replace(coalesce(p_text, ''),
                                'otomatik_onaylandi', 'Otomatik Onaylandı'),
                              'inceleme_bekliyor', 'İnceleme Bekliyor'),
                            'duzeltme_istendi', 'Düzeltme İstendi'),
                          'kabul_edildi', 'Kabul Edildi'),
                        'iptal_edildi', 'İptal Edildi'),
                      'suresi_doldu', 'Süresi Doldu'),
                    'onaylandi', 'Onaylandı'),
                  'reddedildi', 'Reddedildi'),
                'tamamlandi', 'Tamamlandı'),
              'kapatildi', 'Kapatıldı'),
            'beklemede', 'Beklemede'),
          'askida', 'Askıda'),
        'pasif', 'Pasif'),
      'aktif', 'Aktif');
$$;

create or replace function public.format_notification_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.title := public.format_notification_status_labels(new.title);
  new.message := public.format_notification_status_labels(new.message);
  return new;
end;
$$;

drop trigger if exists format_notification_before_insert_trigger
  on public.notifications;

create trigger format_notification_before_insert_trigger
before insert on public.notifications
for each row execute function public.format_notification_before_insert();

-- Henüz gönderilmemiş kuyruk kayıtlarını da düzeltir.
update public.notification_email_outbox
set
  subject = public.format_notification_status_labels(subject),
  title = public.format_notification_status_labels(title),
  message = public.format_notification_status_labels(message),
  updated_at = timezone('utc', now())
where status in ('beklemede', 'hata');

-- Uygulama içindeki mevcut bildirim geçmişini okunabilir hale getirir.
update public.notifications
set
  title = public.format_notification_status_labels(title),
  message = public.format_notification_status_labels(message);

revoke all on function public.format_notification_status_labels(text)
  from public;
grant execute on function public.format_notification_status_labels(text)
  to authenticated;

commit;
