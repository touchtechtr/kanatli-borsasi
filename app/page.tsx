'use client'

import { Suspense, useState, useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'

import { useRouter, useSearchParams } from 'next/navigation'

import Sparkline from '@/components/Sparkline';

import SearchModal from '@/components/layout/SearchModal'

import {
  BadgeDollarSign,
  Building2,
  CalendarDays,
  MapPin,
  Package,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'

interface Listing {

  id: string

  title: string

  category: string

  quantity: number

  unit: string

  price: number

  city: string

  created_at: string

  company_id: string

  user_id: string

  feed_form?: string

  packaging_type?: string

  companies: {

    name: string

    role: string

  } | {

    name: string

    role: string

  }[] | null

}

interface Company {

  id: string

  name: string

  role: string

  status: 'beklemede' | 'onaylandi' | 'reddedildi'

}

interface MarketPrice {

  id: string

  item_name: string

  category: string

  price: number

  unit: string

  exchange_source: string

  change_rate: number

  price_history?: number[]

}

interface AssociationBulletin {

  id: string

  association_name: string

  title: string

  summary: string

  category: string

  report_date: string

}

interface ContractFarming {

  id: string

  title: string

  region: string

  capacity_required: number

  model_type: string

  duration_months: number

  companies: {

    name: string

    role: string

  } | {

    name: string

    role: string

  }[] | null

}

function HomeContent() {

  const router = useRouter()

  const searchParams = useSearchParams()

  const supabase = createClient()

  const [mounted, setMounted] = useState(false)

  const [listings, setListings] = useState<Listing[]>([])

  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([])

  const [bulletins, setBulletins] = useState<AssociationBulletin[]>([])

  const [contracts, setContracts] = useState<ContractFarming[]>([])

  const [companies, setCompanies] = useState<Company[]>([])

  const [loading, setLoading] = useState(true)

  const [user, setUser] = useState<any>(null)

  const [userCompanyId, setUserCompanyId] = useState<string>('')

  const [userCompanyName, setUserCompanyName] = useState<string>('')

  const [activeTab, setActiveTab] = useState<'borsa' | 'birlikler' | 'sozlesmeli' | 'ilanlarim'>('borsa')

  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')

  // Arama Modalı Açık/Kapalı Durumu (URL'deki 'modal=search' parametresiyle de senkronize)

  const isSearchModalOpen = searchParams.get('modal') === 'search'

  // Yem Formu State'leri (İlan verme için)

  const [showListingTypeModal, setShowListingTypeModal] = useState(false)

  const [showForm, setShowForm] = useState(false)

  const [formTitle, setFormTitle] = useState('')

  const [formCategory, setFormCategory] = useState('Broyler (Etlik) Yemleri')

  const [formQuantity, setFormQuantity] = useState('')

  const [formUnit, setFormUnit] = useState('Ton / Çuval')

  const [formPrice, setFormPrice] = useState('')

  const [formCity, setFormCity] = useState('Antalya')

  const [selectedOfferListing, setSelectedOfferListing] =
    useState<Listing | null>(null)

  const [offerQuantity, setOfferQuantity] = useState('')

  const [offerPrice, setOfferPrice] = useState('')

  const [offerMessage, setOfferMessage] = useState('')

  const [offerSubmitting, setOfferSubmitting] = useState(false)

  const categories = [

    'Tümü',

    'Broyler (Etlik) Yemleri',

    'Yumurta Tavuğu Yemleri',

    'Hammadde & Tahıllar',

    'Katkı Maddeleri'

  ]

  useEffect(() => {

    setMounted(true)

    initSessionAndData()

  }, [])

  const initSessionAndData = async () => {

    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {

      setUser(session.user)

      const { data: compData } = await supabase

        .from('companies')

        .select('id, name, role, status')

        .eq('user_id', session.user.id)

        .order('name', { ascending: true })

      if (compData && compData.length > 0) {

        setCompanies(compData)

        setUserCompanyId(compData[0].id)

        setUserCompanyName(compData[0].name)

      }

    }

    await fetchData()

    setLoading(false)

  }

  const fetchData = async () => {

    const { data: listData, error: listingsError } =
  await supabase
    .from('listings')
    .select(
      'id, title, category, quantity, unit, price, city, created_at, company_id, user_id'
    )
    .eq('status', 'aktif')
    .order('created_at', { ascending: false })

if (listingsError) {
  console.error(
    'İlanlar yüklenemedi:',
    listingsError.message
  )
  setListings([])
} else {
  const companyIds = [
    ...new Set(
      (listData ?? [])
        .map((listing) => listing.company_id)
        .filter(Boolean)
    ),
  ]

  const {
    data: publicCompanies,
    error: publicCompaniesError,
  } =
    companyIds.length > 0
      ? await supabase
          .from('public_companies')
          .select('id, name, role')
          .in('id', companyIds)
      : { data: [], error: null }

  if (publicCompaniesError) {
    console.error(
      'İlan firma bilgileri yüklenemedi:',
      publicCompaniesError.message
    )
  }

  const companyMap = new Map(
    (publicCompanies ?? []).map((company) => [
      company.id,
      {
        name: company.name,
        role: company.role,
      },
    ])
  )

  const safeListings = (listData ?? []).map(
    (listing) => ({
      ...listing,
      companies:
        companyMap.get(listing.company_id) ?? null,
    })
  )

  setListings(safeListings as Listing[])
}

    const { data: priceData } = await supabase

      .from('market_prices')

      .select('*')

      .order('item_name', { ascending: true })

    setMarketPrices(priceData || [])

    const { data: bulletinData } = await supabase

      .from('association_bulletins')

      .select('*')

      .order('report_date', { ascending: false })

    setBulletins(bulletinData || [])

    const { data: contractData } = await supabase

      .from('contract_farming')

      .select(`id, title, region, capacity_required, model_type, duration_months, companies ( name, role )`)

      .order('created_at', { ascending: false })

    setContracts(contractData || [])

  }

  const handleCreateListing = async (e: React.FormEvent) => {

    e.preventDefault()

    if (!user) { router.push('/auth'); return; }

    if (!userCompanyId) { router.push('/profil'); return; }

    setLoading(true)

    const { error } = await supabase.from('listings').insert([

      {

        company_id: userCompanyId,

        user_id: user.id,

        title: formTitle,

        category: formCategory,

        quantity: parseFloat(formQuantity || '0'),

        unit: formUnit,

        price: parseFloat(formPrice || '0'),

        city: formCity,

        status: 'aktif'

      }

    ])

    if (error) {

      alert('Hata: ' + error.message);

    } else {

      setShowForm(false);

      setFormTitle('');

      setFormQuantity('');

      setFormPrice('');

      fetchData();

    }

    setLoading(false)

  }

  const handleDeleteListing = async (id: string) => {

    if (!confirm('İlanı silmek istediğinize emin misiniz?')) return

    await supabase.from('listings').delete().eq('id', id)

    fetchData()

  }

  const openOfferModal = (listing: Listing) => {
    if (!user) {
      router.push('/auth')
      return
    }

    const buyerCompany = companies.find(
      (company) => company.id === userCompanyId
    )

    if (!buyerCompany) {
      alert(
        'Teklif göndermek için önce firma profilinizi oluşturmalısınız.'
      )
      router.push('/profil')
      return
    }

    if (buyerCompany.role !== 'tuccar') {
      alert(
        'Yalnızca tüccar hesabına sahip firmalar teklif gönderebilir.'
      )
      return
    }

    if (buyerCompany.status !== 'onaylandi') {
      alert(
        buyerCompany.status === 'reddedildi'
          ? 'Firma başvurunuz reddedildiği için teklif gönderemezsiniz.'
          : 'Teklif göndermek için firmanızın yönetici tarafından onaylanması gerekiyor.'
      )
      return
    }

    if (listing.company_id === buyerCompany.id) {
      alert('Kendi ilanınıza teklif gönderemezsiniz.')
      return
    }

    setSelectedOfferListing(listing)
    setOfferQuantity(String(listing.quantity))
    setOfferPrice(String(listing.price))
    setOfferMessage('')
  }

  const closeOfferModal = () => {
    if (offerSubmitting) return

    setSelectedOfferListing(null)
    setOfferQuantity('')
    setOfferPrice('')
    setOfferMessage('')
  }

  const handleCreateOffer = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!selectedOfferListing || !userCompanyId) return

    const quantity = Number(offerQuantity)
    const price = Number(offerPrice)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert('Geçerli bir teklif miktarı girin.')
      return
    }

    if (quantity > selectedOfferListing.quantity) {
      alert(
        `Teklif miktarı ilan miktarını (${selectedOfferListing.quantity} ${selectedOfferListing.unit}) aşamaz.`
      )
      return
    }

    if (!Number.isFinite(price) || price <= 0) {
      alert('Geçerli bir birim fiyat girin.')
      return
    }

    setOfferSubmitting(true)

    const { error } = await supabase.from('trade_offers').insert({
      listing_kind: 'listing',
      listing_id: selectedOfferListing.id,
      buyer_company_id: userCompanyId,
      offered_quantity: quantity,
      offered_unit_price: price,
      message: offerMessage.trim() || null,
    })

    if (error) {
      alert('Teklif gönderilemedi: ' + error.message)
    } else {
      alert('Teklifiniz ilan sahibi firmaya gönderildi.')
      setSelectedOfferListing(null)
      setOfferQuantity('')
      setOfferPrice('')
      setOfferMessage('')
    }

    setOfferSubmitting(false)
  }

  // Kategoriye Göre Ana Sayfa İlan Filtrelemesi

  const displayedListings = listings.filter(item => {

    if (activeTab === 'ilanlarim') {

      if (!user) return false;

      return item.user_id === user.id;

    }

    if (selectedCategory !== 'Tümü') {

      return item.category === selectedCategory;

    }

    return true;

  });

  const getCompanyName = (comp: any) => {

    if (!comp) return 'Bilinmeyen Firma';

    if (Array.isArray(comp)) return comp[0]?.name || 'Bilinmeyen Firma';

    return comp.name;

  };

  const getCompanyRole = (comp: any) => {

    if (!comp) return '';

    if (Array.isArray(comp)) return comp[0]?.role || '';

    return comp.role;

  };

  if (!mounted) return null;

  return (

    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 relative">

      <div className="max-w-6xl mx-auto space-y-8">

        {/* Üst Bilgi ve Butonlar */}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">

          <div>

            <h1 className="text-2xl font-bold text-slate-900">Kanatlı Borsası & Tarım Ticaret Ağı</h1>

            <p className="text-sm text-slate-500 mt-1">

              {user ? (

                <span className="text-emerald-700 font-medium">

                  🟢 Oturum Açık: {user.email} {userCompanyName && `(${userCompanyName})`}

                </span>

              ) : (

                'Canlı hayvan, yem ve fabrika çıkış fiyatları buluşma noktası.'

              )}

            </p>

          </div>

          <div className="flex items-center gap-3 flex-wrap">

            <button

              onClick={() => router.push('/livestock')}

              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center gap-2"

            >

              🐄 Canlı Hayvan Borsası

            </button>

            {user ? (

              <>

                <button

                  onClick={() => setShowListingTypeModal(true)}

                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"

                >

                  + Yeni İlan Ver

                </button>

                <button

                  onClick={() => router.push('/profil')}

                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"

                >

                  Hesabım

                </button>

                <button

                  onClick={async () => { await supabase.auth.signOut(); window.location.href = '/'; }}

                  className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2.5 rounded-xl font-medium text-sm transition-all"

                >

                  Çıkış

                </button>

              </>

            ) : (

              <button

                onClick={() => router.push('/auth')}

                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"

              >

                Giriş Yap / Kayıt Ol

              </button>

            )}

          </div>

        </div>

        {/* İlan Türü Seçim Modalı */}

        {showListingTypeModal && (

          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">

            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-xl animate-fadeIn">

              <div className="flex justify-between items-center">

                <h3 className="text-lg font-bold text-slate-900">Ne Tür İlan Vermek İstiyorsunuz?</h3>

                <button

                  onClick={() => setShowListingTypeModal(false)}

                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"

                >

                  ✕

                </button>

              </div>

              <div className="grid grid-cols-1 gap-4">

                <button

                  onClick={() => {

                    setShowListingTypeModal(false);

                    router.push('/livestock/new');

                  }}

                  className="p-4 border-2 border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl text-left transition-all flex items-center gap-4 group"

                >

                  <span className="text-3xl">🐄</span>

                  <div>

                    <h4 className="font-bold text-emerald-900 group-hover:text-emerald-700">Canlı Hayvan İlanı</h4>

                    <p className="text-xs text-emerald-700/80 mt-0.5">Kanatlı, küçükbaş veya büyükbaş canlı hayvan, ırk ve baş bilgisi girişi.</p>

                  </div>

                </button>

                <button

                  onClick={() => {

                    setShowListingTypeModal(false);

                    setShowForm(true);

                  }}

                  className="p-4 border-2 border-slate-200 hover:border-slate-400 bg-white rounded-xl text-left transition-all flex items-center gap-4 group"

                >

                  <span className="text-3xl">🌾</span>

                  <div>

                    <h4 className="font-bold text-slate-800 group-hover:text-slate-900">Yem & Diğer Ürün İlanı</h4>

                    <p className="text-xs text-slate-500 mt-0.5">Etlik/yumurta yemleri, hammaddeler, tahıllar ve tarımsal girdiler.</p>

                  </div>

                </button>

              </div>

            </div>

          </div>

        )}

        {/* Üst Menü Arama Tetikleyicisi */}

        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 rounded-2xl shadow-md border border-slate-800 text-white space-y-3">

          <div className="max-w-xl">

            <h2 className="text-lg font-bold tracking-tight">Pazarda Arama Yapın</h2>

            <p className="text-xs text-slate-300 mt-0.5">İstediğiniz yem, hammadde, canlı hayvan veya firma adına anında ulaşın.</p>

          </div>

          <div className="relative group pt-1">

            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-400 text-lg">

              🔍

            </div>

            <input

              type="text"

              readOnly

              onClick={() => router.push('/?modal=search')}

              placeholder="Tüm ilanlar, yem, canlı hayvan veya firma adı arayın (Tıklayın)..."

              className="w-full pl-12 pr-16 py-4 bg-white text-slate-900 placeholder:text-slate-400 rounded-xl text-sm font-medium shadow-inner cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-500/35 transition-all"

            />

            <button

              onClick={() => router.push('/?modal=search')}

              className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-2 rounded-lg font-medium transition-all"

            >

              Filtreler ⚙️

            </button>

          </div>

        </div>

        {/* Harici Arama Modalı */}

        <SearchModal isOpen={isSearchModalOpen} onClose={() => router.push('/')} />

        {/* Yem / Diğer Ürün İlan Formu */}

        {showForm && user && (

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200 space-y-4">

            <div className="flex justify-between items-center">

              <h2 className="text-lg font-bold text-slate-900">Yem & Diğer Ürün İlan Formu</h2>

              <button onClick={() => setShowForm(false)} className="text-xs text-slate-400 hover:text-slate-600">Kapat ✕</button>

            </div>

            <form onSubmit={handleCreateListing} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kurumsal Firma</label>

                <select value={userCompanyId} onChange={(e) => setUserCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 font-medium">

                  {companies.map(comp => (<option key={comp.id} value={comp.id}>{comp.name} ({comp.role})</option>))}

                </select>

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kategori</label>

                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50">

                  {categories.filter(c => c !== 'Tümü').map(cat => (<option key={cat} value={cat}>{cat}</option>))}

                </select>

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">İlan Başlığı</label>

                <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Örn: 25 Ton Dökme Broyler Geliştirme Yemi" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Miktar</label>

                <input type="number" step="0.01" value={formQuantity} onChange={(e) => setFormQuantity(e.target.value)} placeholder="Örn: 25" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Birim</label>

                <input type="text" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} placeholder="Ton / Çuval / Kg" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Birim Fiyat (TL)</label>

                <input type="number" step="0.01" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="Örn: 12500" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />

              </div>

              <div>

                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şehir / Konum</label>

                <input type="text" value={formCity} onChange={(e) => setFormCity(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />

              </div>

              <div className="flex items-end lg:col-span-2">

                <button type="submit" className="w-full bg-slate-900 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-slate-800 shadow-sm">Yem İlanını Yayınla</button>

              </div>

            </form>

          </div>

        )}

        {/* Günlük Fabrika Çıkış Fiyatları */}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">

          <div className="flex justify-between items-center">

            <div>

              <h2 className="font-bold text-slate-900 text-lg">Fabrika Çıkış & Piyasa Referans Fiyatları</h2>

              <p className="text-xs text-slate-500">Tarım Kredi Yem ve Bölgesel Borsa Bültenleri</p>

            </div>

            <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-3 py-1 rounded-full border border-emerald-100">

              Canlı Akış

            </span>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">

            {marketPrices.map((item) => (

              <div key={item.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between space-y-3">

                <div>

                  <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{item.exchange_source}</span>

                  <h3 className="font-bold text-slate-800 text-xs mt-1">{item.item_name}</h3>

                </div>

                <div className="flex justify-between items-end">

                  <div>

                    <span className="text-base font-extrabold text-slate-900">₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>

                    <span className="text-[10px] text-slate-400 ml-1">/ {item.unit}</span>

                  </div>

                  <span className={`text-[10px] font-semibold ${item.change_rate >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>

                    {item.change_rate >= 0 ? `+${item.change_rate}%` : `${item.change_rate}%`}

                  </span>

                </div>

                {/* 7 Günlük Gerçek Veritabanı Verisiyle Çalışan Grafik Alanı */}

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">

                  <span className="text-[10px] text-slate-400 font-medium">Son 7 Gün</span>

                  <Sparkline

                    data={item.price_history && item.price_history.length > 0 ? item.price_history : [item.price]}

                    width={90}

                    height={25}

                  />

                </div>

              </div>

            ))}

          </div>

        </div>

        {/* Ana Sekmeler */}

        <div className="flex border-b border-slate-200 gap-6 overflow-x-auto">

          <button

            onClick={() => setActiveTab('borsa')}

            className={`pb-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${

              activeTab === 'borsa' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'

            }`}

          >

            Yem & Hammadde Borsası

          </button>

          <button

            onClick={() => setActiveTab('sozlesmeli')}

            className={`pb-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${

              activeTab === 'sozlesmeli' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'

            }`}

          >

            🤝 Sözleşmeli Üretim Paneli ({contracts.length})

          </button>

          <button

            onClick={() => setActiveTab('birlikler')}

            className={`pb-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${

              activeTab === 'birlikler' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'

            }`}

          >

            Üretici Birlikleri & Raporlar ({bulletins.length})

          </button>

          {user && (

            <button

              onClick={() => setActiveTab('ilanlarim')}

              className={`pb-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${

                activeTab === 'ilanlarim' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'

              }`}

            >

              İşlem Geçmişim ({listings.filter(i => i.user_id === user?.id).length})

            </button>

          )}

        </div>

        {/* 1. SEKME: YEM & HAMMADDE BORSA PAZARI */}

        {activeTab === 'borsa' && (

          <div className="space-y-4">

            <div className="flex items-center gap-2 overflow-x-auto pb-2">

              {categories.map((cat) => (

                <button

                  key={cat}

                  onClick={() => setSelectedCategory(cat)}

                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${

                    selectedCategory === cat ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'

                  }`}

                >

                  {cat}

                </button>

              ))}

            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

              <div className="p-6 border-b border-slate-100 flex justify-between items-center">

                <h2 className="font-bold text-slate-900">

                  Aktif Yem & Hammadde İlanları ({displayedListings.length})

                </h2>

              </div>

              {loading ? (

                <div className="p-12 text-center text-slate-400">Yükleniyor...</div>

              ) : displayedListings.length === 0 ? (

                <div className="p-12 text-center">
                  <Package className="mx-auto h-10 w-10 text-slate-300" />
                  <h3 className="mt-3 font-semibold text-slate-700">
                    Bu kategoride ilan bulunamadı
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Farklı bir kategori seçebilir veya yeni ilan oluşturabilirsiniz.
                  </p>
                </div>

              ) : (

                <div className="divide-y divide-slate-100">

                  {displayedListings.map((item) => (

                    <article
                      key={item.id}
                      className="p-5 md:p-6 transition-colors hover:bg-slate-50/70"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              {item.category}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                              Aktif ilan
                            </span>
                          </div>

                          <h3 className="text-base font-bold text-slate-900 md:text-lg">
                            {item.title}
                          </h3>

                          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              {getCompanyName(item.companies)}
                              {getCompanyRole(item.companies) &&
                                ` (${getCompanyRole(item.companies)})`}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5" />
                              {item.city}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays className="h-3.5 w-3.5" />
                              {new Date(item.created_at).toLocaleDateString('tr-TR')}
                            </span>
                          </div>
                        </div>

                        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center lg:w-auto">
                          <div className="grid flex-1 grid-cols-2 gap-3 sm:flex sm:flex-none">
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:min-w-28">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Miktar
                              </div>
                              <div className="mt-1 font-semibold text-slate-800">
                                {Number(item.quantity).toLocaleString('tr-TR')} {item.unit}
                              </div>
                            </div>

                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:min-w-32">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">
                                Birim fiyat
                              </div>
                              <div className="mt-1 text-lg font-extrabold text-emerald-700">
                                {Number(item.price).toLocaleString('tr-TR', {
                                  style: 'currency',
                                  currency: 'TRY',
                                })}
                              </div>
                            </div>
                          </div>

                          {item.company_id === userCompanyId && user ? (
                            <span className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-xs font-semibold text-blue-700">
                              Kendi ilanınız
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openOfferModal(item)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              <Send className="h-4 w-4" />
                              Teklif Ver
                            </button>
                          )}
                        </div>
                      </div>
                    </article>

                  ))}

                </div>

              )}

            </div>

          </div>

        )}

        {/* 2. SEKME: SÖZLEŞMELİ ÜRETİM PANELI */}

        {activeTab === 'sozlesmeli' && (

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            <div className="p-6 border-b border-slate-100">

              <h2 className="font-bold text-slate-900 text-lg">Entegre Tesis & Çiftlik Sözleşme Ağları</h2>

            </div>

            <div className="divide-y divide-slate-100">

              {contracts.length === 0 ? (

                <div className="p-12 text-center text-slate-400">Aktif sözleşme teklifi bulunmuyor.</div>

              ) : (

                contracts.map((item) => (

                  <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

                    <div className="space-y-1">

                      <div className="flex items-center gap-2">

                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">

                          {getCompanyName(item.companies)}

                        </span>

                        <span className="text-xs text-slate-400">• {item.region}</span>

                      </div>

                      <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>

                      <p className="text-sm text-slate-600">Model: <span className="font-medium text-slate-800">{item.model_type}</span></p>

                    </div>

                    <div className="flex items-center gap-6 text-right">

                      <div>

                        <div className="text-xs text-slate-400">Min. Kapasite</div>

                        <div className="font-semibold text-slate-800">{item.capacity_required.toLocaleString('tr-TR')} Baş/Adet</div>

                      </div>

                      <div>

                        <div className="text-xs text-slate-400">Süre</div>

                        <div className="font-bold text-blue-600">{item.duration_months} Ay</div>

                      </div>

                    </div>

                  </div>

                ))

              )}

            </div>

          </div>

        )}

        {/* 3. SEKME: BİRLİK BÜLTENLERİ */}

        {activeTab === 'birlikler' && (

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            <div className="p-6 border-b border-slate-100">

              <h2 className="font-bold text-slate-900 text-lg">BESD-BİR, YUM-BİR ve Kırmızı Et Üreticileri Birlikleri Raporları</h2>

            </div>

            <div className="divide-y divide-slate-100">

              {bulletins.map((item) => (

                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

                  <div className="space-y-1">

                    <div className="flex items-center gap-2">

                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{item.association_name}</span>

                      <span className="text-xs text-slate-400">• {item.category}</span>

                    </div>

                    <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>

                    <p className="text-sm text-slate-600 max-w-3xl">{item.summary}</p>

                  </div>

                  <div className="text-right whitespace-nowrap">

                    <div className="text-xs text-slate-400">Yayın Tarihi</div>

                    <div className="text-sm font-medium text-slate-700">{item.report_date}</div>

                  </div>

                </div>

              ))}

            </div>

          </div>

        )}

        {/* 4. SEKME: İŞLEM GEÇMİŞİM */}

        {activeTab === 'ilanlarim' && user && (

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            <div className="p-6 border-b border-slate-100 flex justify-between items-center">

              <h2 className="font-bold text-slate-900">İşlem Geçmişim ve İlanlarım</h2>

            </div>

            {displayedListings.length === 0 ? (

              <div className="p-12 text-center text-slate-400">Henüz verdiğiniz bir yem/ürün ilanı bulunmuyor.</div>

            ) : (

              <div className="divide-y divide-slate-100">

                {displayedListings.map((item) => (

                  <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">

                    <div className="space-y-1">

                      <div className="flex items-center gap-2">

                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700">

                          {item.category}

                        </span>

                        <h3 className="font-bold text-slate-900">{item.title}</h3>

                      </div>

                      <p className="text-xs text-slate-500">

                        Firma: <span className="font-medium text-slate-700">{getCompanyName(item.companies)}</span> • Şehir: {item.city}

                      </p>

                    </div>

                    <div className="flex items-center gap-6">

                      <div className="text-right">

                        <div className="text-xs text-slate-400">Miktar</div>

                        <div className="font-semibold text-slate-800">{item.quantity} {item.unit}</div>

                      </div>

                      <div className="text-right">

                        <div className="text-xs text-slate-400">Birim Fiyat</div>

                        <div className="font-bold text-emerald-600 text-lg">

                          ₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

                        </div>

                      </div>

                      <button

                        onClick={() => handleDeleteListing(item.id)}

                        className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"

                      >

                        Sil

                      </button>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        )}

        {selectedOfferListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <ShieldCheck className="h-4 w-4" />
                    Güvenli ticari teklif
                  </div>
                  <h2 className="mt-2 text-xl font-bold">
                    {selectedOfferListing.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    {getCompanyName(selectedOfferListing.companies)} ·{' '}
                    {selectedOfferListing.city}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeOfferModal}
                  disabled={offerSubmitting}
                  aria-label="Teklif penceresini kapat"
                  className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateOffer} className="space-y-5 p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      İlan miktarı
                    </div>
                    <div className="mt-1 font-bold text-slate-800">
                      {Number(selectedOfferListing.quantity).toLocaleString('tr-TR')}{' '}
                      {selectedOfferListing.unit}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                      İlan fiyatı
                    </div>
                    <div className="mt-1 font-bold text-emerald-700">
                      {Number(selectedOfferListing.price).toLocaleString('tr-TR', {
                        style: 'currency',
                        currency: 'TRY',
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Teklif miktarı
                    </label>
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="0.01"
                        max={selectedOfferListing.quantity}
                        step="0.01"
                        required
                        value={offerQuantity}
                        onChange={(event) => setOfferQuantity(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-14 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        {selectedOfferListing.unit}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Teklif edilen birim fiyat
                    </label>
                    <div className="relative">
                      <BadgeDollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={offerPrice}
                        onChange={(event) => setOfferPrice(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-12 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        TL
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Satıcıya not
                  </label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={offerMessage}
                    onChange={(event) => setOfferMessage(event.target.value)}
                    placeholder="Teslimat, ödeme veya ürünle ilgili kısa notunuzu yazabilirsiniz."
                    className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-400">
                    {offerMessage.length}/500
                  </p>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700">
                  Teklif gönderildiğinde ilan sahibi firma kabul, ret veya daha sonra işlem tamamlama seçeneklerini kullanabilir.
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeOfferModal}
                    disabled={offerSubmitting}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                  >
                    Vazgeç
                  </button>

                  <button
                    type="submit"
                    disabled={offerSubmitting}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {offerSubmitting ? 'Gönderiliyor...' : 'Teklifi Gönder'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>

    </main>

  )

}

export default function Home() {

  return (

    <Suspense fallback={null}>

      <HomeContent />

    </Suspense>

  )

}
