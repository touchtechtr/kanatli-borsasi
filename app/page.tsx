'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Listing {
  id: string
  title: string
  type: 'satis' | 'satinalma'
  amount: string
  raw_price: number
  commission_rate: number
  company_id: string
  companies: {
    name: string
    type: string
  } | {
    name: string
    type: string
  }[] | null
}

interface Company {
  id: string
  name: string
  type: string
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('borsa')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [showForm, setShowForm] = useState(false)

  const [formCompanyId, setFormCompanyId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formType, setFormType] = useState<'satis' | 'satinalma'>('satis')
  const [formAmount, setFormAmount] = useState('')
  const [formRawPrice, setFormRawPrice] = useState('')

  const categories = [
    'Tümü',
    'Yem Çeşitleri',
    'Yumurta & Kuluçka',
    'Kümes Hayvanları',
    'Küçükbaş Hayvan',
    'Büyükbaş Hayvan',
    'Kesimlik / Canlı'
  ]

  useEffect(() => {
    setMounted(true)
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    
    const { data: listData, error: listError } = await supabase
      .from('listings')
      .select(`
        id,
        title,
        type,
        amount,
        raw_price,
        commission_rate,
        company_id,
        companies (
          name,
          type
        )
      `)
      .order('created_at', { ascending: false })

    if (listError) console.error('İlanlar çekilirken hata:', listError.message)
    else setListings(listData || [])

    const { data: compData, error: compError } = await supabase
      .from('companies')
      .select('id, name, type')
      .order('name', { ascending: true })

    if (compError) console.error('Firmalar çekilirken hata:', compError.message)
    else {
      setCompanies(compData || [])
      if (compData && compData.length > 0 && !formCompanyId) {
        setFormCompanyId(compData[0].id)
      }
    }

    setLoading(false)
  }

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCompanyId || !formTitle || !formAmount || !formRawPrice) {
      alert('Lütfen tüm alanları eksiksiz doldurun.')
      return
    }

    setLoading(true)
    const { error } = await supabase.from('listings').insert([
      {
        company_id: formCompanyId,
        title: formTitle,
        type: formType,
        amount: formAmount,
        raw_price: parseFloat(formRawPrice),
        commission_rate: 5.00
      }
    ])

    if (error) {
      alert('İlan eklenirken hata oluştu: ' + error.message)
    } else {
      setFormTitle('')
      setFormAmount('')
      setFormRawPrice('')
      setShowForm(false)
      fetchData()
    }
    setLoading(false)
  }

  const filteredListings = listings.filter(item => {
    if (selectedCategory === 'Tümü') return true;
    const title = item.title.toLowerCase();
    if (selectedCategory === 'Yem Çeşitleri') return title.includes('yem');
    if (selectedCategory === 'Yumurta & Kuluçka') return title.includes('yumurta');
    if (selectedCategory === 'Kümes Hayvanları') return title.includes('yarka') || title.includes('piliç') || title.includes('tavuk');
    if (selectedCategory === 'Küçükbaş Hayvan') return title.includes('koç') || title.includes('koyun') || title.includes('kuzu');
    if (selectedCategory === 'Büyükbaş Hayvan') return title.includes('sığır') || title.includes('düve') || title.includes('inek');
    return true;
  });

  const getCompanyName = (companies: Listing['companies']) => {
    if (!companies) return 'Bilinmeyen Firma';
    if (Array.isArray(companies)) return companies[0]?.name || 'Bilinmeyen Firma';
    return companies.name;
  };

  const getCompanyType = (companies: Listing['companies']) => {
    if (!companies) return '';
    if (Array.isArray(companies)) return companies[0]?.type || '';
    return companies.type;
  };

  // Hydration Uyuşmazlığını Engellemek İçin İlk Render'da Boş Dön
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">B2B Tarım ve Hayvancılık Borsası</h1>
            <p className="text-sm text-slate-500 mt-1">Yem, kümes hayvanları, küçükbaş, büyükbaş ve kuluçka borsa platformu.</p>
          </div>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
          >
            {showForm ? '✕ Formu Kapat' : '+ Yeni İlan Ekle'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Pazara Yeni İlan Gir</h2>
            <form onSubmit={handleCreateListing} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Firma Seçin</label>
                <select 
                  value={formCompanyId} 
                  onChange={(e) => setFormCompanyId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                >
                  {companies.map(comp => (
                    <option key={comp.id} value={comp.id}>{comp.name} ({comp.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">İlan Türü</label>
                <select 
                  value={formType} 
                  onChange={(e) => setFormType(e.target.value as 'satis' | 'satinalma')}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                >
                  <option value="satis">Arz (Satış İlanı)</option>
                  <option value="satinalma">Talep (Satın Alma)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">İlan Başlığı</label>
                <input 
                  type="text" 
                  value={formTitle} 
                  onChange={(e) => setFormTitle(e.target.value)} 
                  placeholder="Örn: Besi Yemi" 
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Miktar</label>
                <input 
                  type="text" 
                  value={formAmount} 
                  onChange={(e) => setFormAmount(e.target.value)} 
                  placeholder="Örn: 100 Ton" 
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Baz Fiyat (TL)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={formRawPrice} 
                  onChange={(e) => setFormRawPrice(e.target.value)} 
                  placeholder="Örn: 400" 
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                  required 
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="w-full bg-slate-900 text-white font-medium py-2.5 rounded-xl text-sm">
                  Yayınla
                </button>
              </div>
            </form>
          </div>
        )}

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
            <h2 className="font-bold text-slate-900">Aktif İlanlar ({filteredListings.length})</h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full font-semibold">Komisyon: %5</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Yükleniyor...</div>
          ) : filteredListings.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Aktif ilan bulunamadı.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredListings.map((item) => {
                const commissionPrice = item.raw_price * (1 + item.commission_rate / 100);
                return (
                  <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                          item.type === 'satis' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.type === 'satis' ? 'SATIŞ' : 'TALEP'}
                        </span>
                        <h3 className="font-bold text-slate-900">{item.title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Firma: <span className="font-medium text-slate-700">{getCompanyName(item.companies)}</span> ({getCompanyType(item.companies)})
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Miktar</div>
                        <div className="font-semibold text-slate-800">{item.amount}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Borsa Fiyatı</div>
                        <div className="font-bold text-emerald-600 text-lg">
                          ₺{commissionPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}