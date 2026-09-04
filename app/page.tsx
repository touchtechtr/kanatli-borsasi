'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Sparkline from '@/components/Sparkline';
import SearchModal from '@/components/layout/SearchModal'

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

export default function Home() {
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
        .select('id, name, role')
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
    const { data: listData } = await supabase
      .from('listings')
      .select(`id, title, category, quantity, unit, price, city, created_at, company_id, user_id, companies ( name, role )`)
      .order('created_at', { ascending: false })
    setListings(listData || [])

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
                <div className="p-12 text-center text-slate-400">Bu kategoride ilan bulunamadı.</div>
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
                          Firma: <span className="font-medium text-slate-700">{getCompanyName(item.companies)}</span> ({getCompanyRole(item.companies)}) • Şehir: <span className="font-semibold text-emerald-700">{item.city}</span> • Tarih: {new Date(item.created_at).toLocaleDateString('tr-TR')}
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
                      </div>
                    </div>
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

      </div>
    </main>
  )
}