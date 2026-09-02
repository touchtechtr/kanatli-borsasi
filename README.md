# Kanatlı Borsası — Ana İskelet (Layout)

Next.js (App Router) + Tailwind CSS ile hazırlanmış B2B kanatlı hayvan borsası
platformu için ana iskelet.

## Dosya yapısı

```
app/
  layout.tsx        → Kök layout: Sidebar + TickerBar + main içerik alanını birleştirir
  page.tsx           → Örnek Anasayfa içeriği
  globals.css         → Tailwind direktifleri + temel stiller
components/
  layout/
    Sidebar.tsx       → Sol sabit menü (Anasayfa, Canlı Borsa, Çiftçi/Tüccar Paneli, Cüzdan)
    TickerBar.tsx      → Üstte kayan canlı fiyat şeridi
tailwind.config.ts   → Özel renk paleti (navy / tarim) ve marquee animasyonu
```

## Kurulum

Mevcut bir Next.js (App Router, TypeScript, Tailwind) projenizin içine bu
dosyaları kopyalayın, ardından ikon kütüphanesini kurun:

```bash
npm install lucide-react
```

Yeni bir proje ile başlıyorsanız:

```bash
npx create-next-app@latest kanatli-borsa --typescript --tailwind --app
cd kanatli-borsa
npm install lucide-react
# Bu paylaşımdaki dosyaları aynı klasör yoluyla üzerine kopyalayın
npm run dev
```

## Tasarım notları

- **Renkler**: `navy-950` (#050a17) ana sidebar/ticker zemini, `tarim-600`
  (#16a34a) marka vurgu rengi olarak `tailwind.config.ts` içinde tanımlı.
  İhtiyaca göre tonları (`navy-900`, `tarim-500` vb.) kullanabilirsiniz.
- **Ticker**: `TickerBar.tsx` içindeki `TICKER_DATA` şu an sabit örnek veri —
  gerçek kullanımda bir WebSocket/polling hook'una bağlayıp aynı bileşen
  yapısını koruyarak canlı veriyle değiştirebilirsiniz.
- **Aktif menü durumu**: `Sidebar.tsx`, `usePathname()` ile aktif rotayı
  algılayıp yeşil vurgu ve nokta göstergesi uyguluyor.
- **Mobil**: Sidebar şu an `md:` breakpoint'inde görünür (`hidden md:flex`).
  Mobil için bir hamburger + drawer eklemek isterseniz haber verin, aynı
  bileşen üzerine ekleyebiliriz.
- **Sayfalar**: `Çiftçi Paneli`, `Tüccar Paneli`, `Canlı Borsa`, `Finans/Cüzdan`
  linkleri `/ciftci-paneli`, `/tuccar-paneli`, `/borsa`, `/cuzdan` rotalarına
  işaret ediyor — bu klasörleri `app/` altında oluşturduğunuzda otomatik
  çalışacaklar.
