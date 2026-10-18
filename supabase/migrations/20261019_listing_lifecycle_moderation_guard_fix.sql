begin;

-- Teklif kabulü/iptali/tamamlanması sırasında trade_offers tetikleyicisi,
-- bağlı ilanı aynı işlem içinde günceller. Bu iç güncelleme moderasyon
-- korumasına takılmamalı; doğrudan kullanıcı durum değişiklikleri ise
-- mevcut kurallarla sınırlandırılmaya devam etmelidir.
create or replace function public.protect_listing_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  is_internal_lifecycle_change boolean := false;
begin
  if public.is_platform_admin() then
    return new;
  end if;

  -- Moderasyon alanları iç tetikleyiciler dahil hiçbir şirket kullanıcısı
  -- tarafından değiştirilemez.
  if new.moderation_status is distinct from old.moderation_status
     or new.moderation_reason is distinct from old.moderation_reason
     or new.risk_score is distinct from old.risk_score
     or new.risk_flags is distinct from old.risk_flags
     or new.moderated_by is distinct from old.moderated_by
     or new.moderated_at is distinct from old.moderated_at then
    raise exception 'İlan moderasyon alanlarını yalnızca yönetici değiştirebilir.';
  end if;

  if new.status is distinct from old.status then
    -- pg_trigger_depth() > 1 yalnızca başka bir veritabanı tetikleyicisinin
    -- bu ilan güncellemesini başlattığını gösterir. İzin verilen geçişler
    -- teklif yaşam döngüsünün ihtiyaç duyduğu kapalı listedir.
    is_internal_lifecycle_change :=
      pg_trigger_depth() > 1
      and (
        (old.status = 'aktif' and new.status = 'islemde')
        or (old.status = 'islemde' and new.status = 'aktif')
        or (old.status = 'islemde' and new.status in ('tamamlandi', 'satildi'))
      );

    if not is_internal_lifecycle_change
       and (
         old.moderation_status not in ('otomatik_onaylandi', 'onaylandi')
         or new.status not in ('aktif', 'pasif')
       ) then
      raise exception 'Bu ilan durumunu değiştirme yetkiniz yok.';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
