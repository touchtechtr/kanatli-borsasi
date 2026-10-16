# Kesimhane Alım Merkezi kurulumu

1. Paket içeriğini proje kök dizinine çıkarın ve mevcut dosyaların üzerine yazılmasına izin verin.
2. Supabase SQL Editor içinde `supabase/migrations/20261015_slaughterhouse_purchase_center.sql` dosyasının tamamını bir kez çalıştırın.
3. Geliştirme sunucusunu yeniden başlatın veya `npm run build` çalıştırın.

## Yeni ekranlar

- `/kesimhane/alim-merkezi`: Açık toplu alım talepleri
- `/kesimhane/alim-talebi/yeni`: Yeni alım talebi
- `/kesimhane/alim-merkezi/[id]`: Teklif, eşleşme, teslim ve kanıt akışı
- `/admin/kesimhane-alimlari`: Yönetim denetimi, uyuşmazlık ve ödeme serbest bırakma

## Kanıt seçenekleri

Teslimatta fotoğraf (JPG/PNG/WebP), video (MP4/WebM) ve PDF/tartım belgesi yüklenebilir. Dosya başına üst sınır 100 MB'dir. Kanıtlar özel Supabase Storage alanında tutulur ve yalnızca işlem tarafları ile platform yöneticileri erişebilir.

## Önemli ödeme notu

Bu paket ödeme durumunu güvenli biçimde kaydeder ve yöneticinin teslimat sonrası ödemeyi serbest bırakmasını sağlar. Gerçek banka/ödeme kuruluşu para transferi için ayrıca lisanslı ödeme sağlayıcısı entegrasyonu gerekir.
