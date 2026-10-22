begin;

create or replace function public.notify_trade_dispute_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  offer_row public.trade_offers%rowtype;
  dispute_row public.trade_delivery_disputes%rowtype;
  buyer_user uuid;
  seller_user uuid;
  recipient uuid;
  title_value text;
  message_value text;
  kind_label text;
  event_link text := '/profil/teklifler';
  case_code text;
begin
  select * into dispute_row
  from public.trade_delivery_disputes
  where id=new.dispute_id;

  if not found then return new; end if;

  case_code:=upper(left(new.dispute_id::text,8));

  select * into offer_row
  from public.trade_offers
  where id=dispute_row.trade_offer_id;

  if not found then return new; end if;

  select user_id into buyer_user from public.companies where id=offer_row.buyer_company_id;
  select user_id into seller_user from public.companies where id=offer_row.seller_company_id;

  kind_label:=case new.detail->>'kind'
    when 'buyer_refund' then 'alıcı iadesi'
    when 'seller_payout' then 'satıcı ödemesi'
    else 'para aktarımı'
  end;

  title_value:=(case new.event_type
    when 'uyusmazlik_acildi' then 'Ticari uyuşmazlık açıldı'
    when 'karar_verildi' then 'Uyuşmazlık kararı verildi'
    when 'emir_verildi' then 'Uyuşmazlık aktarım emri oluşturuldu'
    when 'isleme_alindi' then 'Uyuşmazlık aktarımı işleme alındı'
    when 'hata' then 'Uyuşmazlık aktarımında hata oluştu'
    when 'tamamlandi' then 'Uyuşmazlık aktarımı tamamlandı'
    when 'dosya_kapatildi' then 'Uyuşmazlık dosyası kapatıldı'
    else 'Uyuşmazlık dosyası güncellendi'
  end)||' · Dosya #'||case_code;

  message_value:='Dosya #'||case_code||' · '||(case new.event_type
    when 'uyusmazlik_acildi' then
      '“'||offer_row.product_title||'” işlemi için uyuşmazlık dosyası açıldı. Para güvenli havuzda korunuyor. Gerekçe: '||dispute_row.reason
    when 'karar_verildi' then
      '“'||offer_row.product_title||'” uyuşmazlığı için yönetim gerekçeli karar verdi. Dağılım ve aktarım sürecini teklif ekranından takip edebilirsiniz.'
    when 'emir_verildi' then
      '“'||offer_row.product_title||'” dosyasında '||kind_label||' için aktarım emri oluşturuldu.'
    when 'isleme_alindi' then
      '“'||offer_row.product_title||'” dosyasındaki '||kind_label||' işleme alındı.'
    when 'hata' then
      '“'||offer_row.product_title||'” dosyasındaki '||kind_label||' tamamlanamadı. Para güvenli durumda; yönetim yeniden aktarım başlatabilir. Hata: '||coalesce(new.detail->>'reason','Açıklama bulunmuyor.')
    when 'tamamlandi' then
      '“'||offer_row.product_title||'” dosyasındaki '||kind_label||' başarıyla tamamlandı.'
    when 'dosya_kapatildi' then
      '“'||offer_row.product_title||'” uyuşmazlık dosyası gerekli aktarımlar tamamlandıktan sonra kapatıldı.'
    else
      '“'||offer_row.product_title||'” uyuşmazlık dosyası güncellendi.'
  end);

  for recipient in
    select distinct user_id
    from (
      values (buyer_user),(seller_user)
    ) as recipients(user_id)
    where user_id is not null
  loop
    insert into public.notifications(
      recipient_user_id,actor_user_id,entity_type,entity_id,
      event_type,title,message,link
    ) values(
      recipient,new.actor_user_id,'Ticari uyuşmazlık',new.dispute_id,
      new.event_type,title_value,message_value,event_link
    );

    insert into public.system_activity_log(
      actor_user_id,recipient_user_id,entity_type,entity_id,
      event_type,old_status,new_status,message
    ) values(
      new.actor_user_id,recipient,'Ticari uyuşmazlık',new.dispute_id,
      new.event_type,new.old_status,new.new_status,message_value
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_trade_dispute_event_trigger
  on public.trade_dispute_events;
create trigger notify_trade_dispute_event_trigger
after insert on public.trade_dispute_events
for each row execute function public.notify_trade_dispute_event();

create or replace function public.record_trade_dispute_open_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.trade_dispute_events(
    dispute_id,event_type,old_status,new_status,actor_user_id,detail
  ) values(
    new.id,'uyusmazlik_acildi',null,new.status,new.opened_by,
    jsonb_build_object('reason',new.reason,'company_id',new.company_id)
  );
  return new;
end;
$$;

drop trigger if exists record_trade_dispute_open_event_trigger
  on public.trade_delivery_disputes;
create trigger record_trade_dispute_open_event_trigger
after insert on public.trade_delivery_disputes
for each row execute function public.record_trade_dispute_open_event();

revoke all on function public.notify_trade_dispute_event(),
  public.record_trade_dispute_open_event()
from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
