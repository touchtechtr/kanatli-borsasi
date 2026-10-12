# Profil ve şirket cüzdanı kurulumu

1. Paketteki `app` ve `components` klasörlerini proje köküne kopyalayın.
2. Supabase SQL Editor içinde `supabase/migrations/20261010_company_wallets.sql` dosyasını çalıştırın.
3. `npm run build` komutunu çalıştırın.
4. Şirket ve yönetici hesaplarıyla `/profil` ve `/cuzdan` sayfalarını kontrol edin.

## Sistem davranışı

- Her şirket için ayrı bir cüzdan oluşturulur.
- Tamamlanan teklif alıcıya gider, satıcıya gelir olarak kaydedilir.
- Platform komisyonu yönetici hesabındaki platform cüzdanına işlenir.
- Daha önce tamamlanmış teklifler kurulum sırasında tekrarsız biçimde aktarılır.
- Bu sürüm finansal kayıt defteridir. Bankaya para yatırma/çekme işlemleri için ayrıca ödeme kuruluşu entegrasyonu gerekir.
