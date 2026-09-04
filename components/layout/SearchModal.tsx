'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Listing {
  id: string
  title: string
  category: string
  quantity: number
  unit: string
  price: number
  city: string
  created_at: string
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

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const supabase = createClient()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)

  // Arama ve Filtre State'leri
  const [searchQuery, setSearchQuery] = useState('')
  const [filterListingType, setFilterListingType] = useState('all')
  const [filterDateRange, setFilterDateRange] = useState('all')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')
  const [filterFeedForm, setFilterFeedForm] = useState('all')
  const [filterPackaging, setFilterPackaging] = useState('all')
  const [filterLiveStockGroup, setFilterLiveStockGroup] = useState('all')
  const [filterLiveStockAge, setFilterLiveStockAge] = useState('all')

  // Modal açıldığında verileri asenkron ve bağımsız olarak çek
  useEffect(() => {
    if (isOpen) {
      fetchSearchData()
    }
  }, [isOpen])

  const fetchSearchData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('listings')
      .select(`id, title, category, quantity, unit, price, city, created_at, feed_form, packaging_type, companies ( name, role )`)
      .order('created_at', { ascending: false })
    setListings(data || [])
    setLoading(false)
  }

  // Filtreleme Mantığı
  const filteredResults = useMemo(() => {
    let result = listings;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const compName = getCompanyName(item.companies).toLowerCase();
        return item.title.toLowerCase().includes(q) || compName.includes(q) || item.category.toLowerCase().includes(q);
      });
    }

    if (filterListingType === 'yem') {
      result = result.filter(item => item.category.toLowerCase().includes('yem') || item.category.toLowerCase().includes('hammadde') || item.category.toLowerCase().includes('tahıl') || item.category.toLowerCase().includes('madde'));
      
      if (filterFeedForm !== 'all') {
        result = result.filter(item => item.feed_form?.toLowerCase() === filterFeedForm.toLowerCase());
      }
      if (filterPackaging !== 'all') {
        result = result.filter(item => item.packaging_type?.toLowerCase() === filterPackaging.toLowerCase());
      }
    } else if (filterListingType === 'hayvan') {
      result = result.filter(item => item.category.toLowerCase().includes('canlı') || item.category.toLowerCase().includes('hayvan') || item.title.toLowerCase().includes('baş'));
    }

    if (filterDateRange !== 'all') {
      const now = new Date().getTime();
      result = result.filter(item => {
        const itemDate = new Date(item.created_at).getTime();
        const diffHours = (now - itemDate) / (1000 * 60 * 60);
        if (filterDateRange === '24h') return diffHours <= 24;
        if (filterDateRange === 'week') return diffHours <= 24 * 7;
        if (filterDateRange === 'month') return diffHours <= 24 * 30;
        return true;
      });
    }

    if (filterMinPrice !== '') {
      const min = parseFloat(filterMinPrice);
      if (!isNaN(min)) result = result.filter(item => item.price >= min);
    }
    if (filterMaxPrice !== '') {
      const max = parseFloat(filterMaxPrice);
      if (!isNaN(max)) result = result.filter(item => item.price <= max);
    }

    return result;
  }, [listings, searchQuery, filterListingType, filterFeedForm, filterPackaging, filterDateRange, filterMinPrice, filterMaxPrice]);

  const getCompanyName = (comp: any) => {
    if (!comp) return 'Bilinmeyen Firma';
    if (Array.isArray(comp)) return comp[0]?.name || 'Bilinmeyen Firma';
    return comp.name;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-fadeIn my-auto overflow-hidden">
        
        {/* Modal Başlık */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Detaylı Pazar Arama ve Filtreleme</h3>
            <p className="text-[11px] text-slate-500">İstediğiniz kriterleri seçerek anında sonuçlara ulaşın.</p>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-200/70 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal İçerik (Kaydırılabilir Alan) */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          
          {/* Arama Kapsamı */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-600">Arama Kapsamı</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterListingType('all');
                  setFilterFeedForm('all');
                  setFilterPackaging('all');
                }}
                className={`py-2 px-2 rounded-xl font-medium border text-center transition-all ${
                  filterListingType === 'all' 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🌐 Tümü (Genel)
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterListingType('yem');
                }}
                className={`py-2 px-2 rounded-xl font-medium border text-center transition-all ${
                  filterListingType === 'yem' 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🌾 Yem & Hammadde
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterListingType('hayvan');
                  setFilterFeedForm('all');
                  setFilterPackaging('all');
                }}
                className={`py-2 px-2 rounded-xl font-medium border text-center transition-all ${
                  filterListingType === 'hayvan' 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                🐄 Canlı Hayvan
              </button>
            </div>
          </div>

          {/* Anahtar Kelime */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-600">Anahtar Kelime veya Firma Adı</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Örn: Broyler, Soya, Holştayn..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          {/* Yeme Özel Filtreler */}
          {filterListingType === 'yem' && (
            <div className="p-3.5 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-3 animate-fadeIn">
              <span className="font-semibold text-emerald-800 block">🌾 Yeme Özel Seçenekler</span>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Yem Formu</label>
                  <select 
                    value={filterFeedForm} 
                    onChange={(e) => setFilterFeedForm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="all">Tüm Formlar</option>
                    <option value="Pelet">Pelet</option>
                    <option value="Toz">Toz</option>
                    <option value="Granül">Granül</option>
                    <option value="Dökme">Dökme</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Ambalaj Tipi</label>
                  <select 
                    value={filterPackaging} 
                    onChange={(e) => setFilterPackaging(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="all">Tüm Ambalajlar</option>
                    <option value="50 Kg Çuval">50 Kg Çuval</option>
                    <option value="Big-Bag">Big-Bag</option>
                    <option value="Dökme Tır">Dökme Tır</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Canlı Hayvana Özel Filtreler */}
          {filterListingType === 'hayvan' && (
            <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-100 space-y-3 animate-fadeIn">
              <span className="font-semibold text-blue-800 block">🐄 Canlı Hayvan Seçenekleri</span>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Hayvan Grubu</label>
                  <select 
                    value={filterLiveStockGroup} 
                    onChange={(e) => setFilterLiveStockGroup(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">Tüm Gruplar</option>
                    <option value="Kanatlı">Kanatlı (Etlik/Yumurta)</option>
                    <option value="Küçükbaş">Küçükbaş (Koyun/Keçi)</option>
                    <option value="Büyükbaş">Büyükbaş (Düve/İnek)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Yaş / Dönem</label>
                  <select 
                    value={filterLiveStockAge} 
                    onChange={(e) => setFilterLiveStockAge(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">Farketmez</option>
                    <option value="Günlük/Civciv">Günlük / Hindi Çıkım</option>
                    <option value="Damızlık">Damızlık / Genç</option>
                    <option value="Besilik">Besilik Dönem</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Fiyat Aralığı */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-600">Birim Fiyat Aralığı (₺)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={filterMinPrice}
                onChange={(e) => setFilterMinPrice(e.target.value)}
                placeholder="Min Fiyat"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              <input
                type="number"
                value={filterMaxPrice}
                onChange={(e) => setFilterMaxPrice(e.target.value)}
                placeholder="Max Fiyat"
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Arama Sonuçları Listesi */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="font-bold text-slate-800 text-xs">Eşleşen Sonuçlar ({filteredResults.length})</h4>
            
            {loading ? (
              <div className="text-center py-6 text-slate-400">Yükleniyor...</div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Kriterlere uygun ilan bulunamadı.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {filteredResults.map(item => (
                  <div key={item.id} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/60 flex justify-between items-center transition-all">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">{item.category}</span>
                        <h5 className="font-semibold text-slate-900 text-xs">{item.title}</h5>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {getCompanyName(item.companies)} • <span className="text-emerald-700 font-medium">{item.city}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-600 text-xs">₺{item.price.toLocaleString('tr-TR')}</div>
                      <div className="text-[10px] text-slate-400">{item.quantity} {item.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Modal Alt Butonlar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterListingType('all');
              setFilterMinPrice('');
              setFilterMaxPrice('');
              setFilterFeedForm('all');
              setFilterPackaging('all');
            }}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-medium text-xs transition-all"
          >
            Filtreleri Temizle
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs shadow-sm transition-all"
          >
            Kapat / Tamam
          </button>
        </div>

      </div>
    </div>
  )
}