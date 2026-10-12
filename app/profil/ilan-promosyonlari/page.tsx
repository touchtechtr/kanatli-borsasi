'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Crown,
  Package,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ListingType = 'listings' | 'feed_listings' | 'livestock_listings'

type OwnListing = {
  key: string
  id: string
  type: ListingType
  typeLabel: string
  title: string
  city: string
  price: number
}

type PromotionPackage = {
  code: string
  name: string
  description: string
  price: number
  duration_days: number
  is_featured: boolean
  is_highlighted: boolean
  is_urgent: boolean
}

type Promotion = {
  id: string
  listing_type: ListingType
  listing_id: string
  package_name: string
  amount: number
  duration_days: number
  payment_status: string
  status: string
  starts_at: string | null
  ends_at: string | null
  admin_note: string | null
  created_at: string
}

const statusLabels: Record<string, string> = {
  beklemede: 'Ödeme / yönetim onayı bekliyor',
  aktif: 'Aktif',
  reddedildi: 'Reddedildi',
  iptal: 'İptal edildi',
  suresi_doldu: 'Süresi doldu',
}

export default function ListingPromotionsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [listings, setListings] = useState<OwnListing[]>([])
  const [packages, setPackages] = useState<PromotionPackage[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [selectedListingKey, setSelectedListingKey] = useState('')
  const [selectedPackageCode, setSelectedPackageCode] = useState('')

  const loadData = async () => {
    setLoading(true)
    setErrorMessage(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.replace('/auth')
      return
    }

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)

    if (companyError) {
      setErrorMessage('Firma bilgileri yüklenemedi: ' + companyError.message)
      setLoading(false)
      return
    }

    const companyIds = (companyData ?? []).map((company) => company.id)

    if (companyIds.length === 0) {
      setListings([])
      setErrorMessage('Öne çıkarılabilecek bir firma ilanı bulunamadı.')
      setLoading(false)
      return
    }

    const [generalResult, feedResult, livestockResult, packageResult, promotionResult] =
      await Promise.all([
        supabase.from('listings').select('id, title, city, price').in('company_id', companyIds).eq('status', 'aktif'),
        supabase.from('feed_listings').select('id, title, city, price').in('company_id', companyIds).eq('status', 'aktif'),
        supabase.from('livestock_listings').select('id, title, city, price').in('company_id', companyIds).eq('status', 'aktif'),
        supabase.from('listing_promotion_packages').select('code, name, description, price, duration_days, is_featured, is_highlighted, is_urgent').eq('is_active', true).order('price'),
        supabase.from('listing_promotions').select('id, listing_type, listing_id, package_name, amount, duration_days, payment_status, status, starts_at, ends_at, admin_note, created_at').in('owner_company_id', companyIds).order('created_at', { ascending: false }),
      ])

    const firstError = [generalResult.error, feedResult.error, livestockResult.error, packageResult.error, promotionResult.error].find(Boolean)
    if (firstError) setErrorMessage('Öne çıkarma bilgileri yüklenemedi: ' + firstError.message)

    const ownListings: OwnListing[] = [
      ...(generalResult.data ?? []).map((item) => ({ ...item, key: `listings:${item.id}`, type: 'listings' as const, typeLabel: 'Genel / Yem' })),
      ...(feedResult.data ?? []).map((item) => ({ ...item, key: `feed_listings:${item.id}`, type: 'feed_listings' as const, typeLabel: 'Yem ilanı' })),
      ...(livestockResult.data ?? []).map((item) => ({ ...item, key: `livestock_listings:${item.id}`, type: 'livestock_listings' as const, typeLabel: 'Canlı hayvan' })),
    ]

    setListings(ownListings)
    setPackages((packageResult.data ?? []) as PromotionPackage[])
    setPromotions((promotionResult.data ?? []) as Promotion[])
    const params = new URLSearchParams(window.location.search)
    const requestedType = params.get('type')
    const requestedId = params.get('id')
    const requestedKey = requestedType && requestedId
      ? `${requestedType}:${requestedId}`
      : ''
    const validRequestedKey = ownListings.some((listing) => listing.key === requestedKey)
      ? requestedKey
      : ''

    setSelectedListingKey((current) => current || validRequestedKey || ownListings[0]?.key || '')
    setSelectedPackageCode((current) => current || packageResult.data?.[0]?.code || '')
    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [supabase])

  const selectedListing = listings.find((listing) => listing.key === selectedListingKey)
  const selectedPackage = packages.find((item) => item.code === selectedPackageCode)

  const submitRequest = async () => {
    if (!selectedListing || !selectedPackage) return

    const confirmed = window.confirm(
      `${selectedListing.title} ilanı için ${selectedPackage.name} paketini ${selectedPackage.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} bedelle talep etmek istiyor musunuz?`
    )
    if (!confirmed) return

    setSubmitting(true)

    const requestPayload = {
      target_listing_type: selectedListing.type,
      target_listing_id: selectedListing.id,
      target_package_code: selectedPackage.code,
    }

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError || !session) {
        alert('Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.')
        window.location.replace('/auth')
        return
      }

      let result = await supabase.rpc(
        'request_listing_promotion',
        requestPayload
      )

      // Süresi yaklaşan erişim belirteçlerinde oturumu bir kez yenileyip
      // isteği güvenli biçimde tekrarlarız.
      if (
        result.error &&
        ['PGRST301', '401', 'JWT expired'].some((value) =>
          `${result.error?.code || ''} ${result.error?.message || ''}`.includes(value)
        )
      ) {
        const { error: refreshError } =
          await supabase.auth.refreshSession()

        if (!refreshError) {
          result = await supabase.rpc(
            'request_listing_promotion',
            requestPayload
          )
        }
      }

      if (result.error) {
        alert('Talep oluşturulamadı: ' + result.error.message)
        return
      }

      alert(
        'Öne çıkarma talebiniz oluşturuldu. Ödeme doğrulaması ve yönetim onayından sonra etkinleşecektir.'
      )
      await loadData()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Bilinmeyen bağlantı hatası'

      console.error('Öne çıkarma talebi gönderilemedi:', requestError)
      alert(
        `Talep Supabase sunucusuna ulaştırılamadı: ${message}. İnternet bağlantınızı kontrol edip sayfayı yenileyerek tekrar deneyin.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <Link href="/profil/ilanlarim" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> İlanlarıma dön</Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-amber-600">İlan görünürlüğü</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-900">İlanını Öne Çıkar</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">İlanınıza vitrin, üst sıra, dikkat çeken çerçeve veya Acil etiketi ekleyin. Gerçek ödeme sağlayıcısı bağlanana kadar talepler yönetim onayıyla etkinleştirilir.</p>
        </div>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-extrabold text-slate-900">1. İlanını seç</h2>
            {loading ? <p className="mt-4 text-sm text-slate-400">İlanlar yükleniyor…</p> : listings.length === 0 ? <div className="mt-4 rounded-xl bg-slate-50 p-5 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm text-slate-500">Aktif ilanınız bulunmuyor.</p></div> : <div className="mt-4 space-y-2">{listings.map((listing) => <button key={listing.key} type="button" onClick={() => setSelectedListingKey(listing.key)} className={`w-full rounded-xl border p-3 text-left transition ${selectedListingKey === listing.key ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:bg-slate-50'}`}><span className="text-[10px] font-bold uppercase text-slate-400">{listing.typeLabel}</span><p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">{listing.title}</p><p className="mt-1 text-xs text-slate-500">{listing.city} · {Number(listing.price).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p></button>)}</div>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-extrabold text-slate-900">2. Paketi seç</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{packages.map((item) => <button key={item.code} type="button" onClick={() => setSelectedPackageCode(item.code)} className={`relative rounded-xl border p-4 text-left transition ${selectedPackageCode === item.code ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 hover:bg-slate-50'}`}>{item.code === 'premium' && <span className="absolute right-3 top-3 rounded-full bg-slate-900 px-2 py-1 text-[9px] font-bold text-white">EN AVANTAJLI</span>}<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">{item.is_featured ? <Crown className="h-5 w-5" /> : item.is_urgent ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</div><h3 className="mt-3 font-extrabold text-slate-900">{item.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{item.description}</p><div className="mt-3 flex items-end justify-between"><p className="text-lg font-extrabold text-emerald-700">{Number(item.price).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p><span className="text-xs font-semibold text-slate-400">{item.duration_days} gün</span></div></button>)}</div>
            <button type="button" onClick={() => void submitRequest()} disabled={!selectedListing || !selectedPackage || submitting} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Talep oluşturuluyor…' : 'Öne çıkarma talebi oluştur'}</button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Geçmiş</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">Öne çıkarma taleplerim</h2></div><Clock3 className="h-5 w-5 text-slate-400" /></div>
          <div className="mt-4 divide-y divide-slate-100">{promotions.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Henüz talep oluşturmadınız.</p> : promotions.map((promotion) => { const listing = listings.find((item) => item.id === promotion.listing_id && item.type === promotion.listing_type); return <div key={promotion.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"><div><p className="text-sm font-bold text-slate-900">{listing?.title || 'İlan'}</p><p className="mt-1 text-xs text-slate-500">{promotion.package_name} · {promotion.duration_days} gün</p>{promotion.admin_note && <p className="mt-1 text-xs text-red-600">Yönetim notu: {promotion.admin_note}</p>}</div><p className="text-sm font-extrabold text-slate-900">{Number(promotion.amount).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p><span className={`inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${promotion.status === 'aktif' ? 'bg-emerald-100 text-emerald-700' : promotion.status === 'beklemede' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{promotion.status === 'aktif' && <CheckCircle2 className="h-3.5 w-3.5" />}{statusLabels[promotion.status] || promotion.status}</span></div> })}</div>
        </section>
      </div>
    </main>
  )
}

