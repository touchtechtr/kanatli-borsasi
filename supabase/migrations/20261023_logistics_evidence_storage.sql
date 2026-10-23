begin;

-- Teslimat kanıtlarında fotoğraf ve tutanağın yanında gerçek video dosyaları da
-- kullanılabilsin. Araç belgeleri aynı özel kovada tutulduğu için erişim modeli
-- değişmez; yalnız izin verilen dosya türleri ve üst sınır genişletilir.
update storage.buckets
set
  public=false,
  file_size_limit=104857600,
  allowed_mime_types=array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
where id='logistics-documents';

commit;
