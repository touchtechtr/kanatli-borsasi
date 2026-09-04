'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Company {
  id: string
  name: string
  role: string
}

interface ContractFarming {
  id: string
  company_id: string
  title: string
  region: string
  capacity_required: number
  model_type: string
  duration_months: number
  status: string
  companies: {
    name: string
    role: string
  } | {
    name: string
    role: string
  }[] | null
}

export default function ContractManagementPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [contracts, setContracts] = useState<ContractFarming[]>([])
  const [loading, setLoading] = useState(true)

  // Form Alanları
  const [title, setTitle] = useState('')
  const [region, setRegion] = useState('')
  const [capacity, setCapacity] = useState('')
  const [modelType, setModelType] = useState('')
  const [duration, setDuration] = useState('12')
  const [status, setStatus] = useState('aktif')

  useEffect(() => {
    setMounted(true)
    checkAuthAndFetch()
  }, [])

  const checkAuthAndFetch = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/auth')
      return
    }
    setUser(session.user)

    // Kullanıcının firmalarını çek
    const { data: compData } = await supabase
      .from('companies')
      .select('id, name, role')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true })

    if (compData && compData.length > 0) {
      setCompanies(compData)
      setSelectedCompanyId(compData[0].id)
    }

    await fetchContracts()
    setLoading(false)
  }

  const fetchContracts = async () => {
    const { data } = await supabase
      .from('contract_farming')
      .select(`id, company_id, title, region, capacity_required, model_type, duration_months, status, companies ( name, role )`)
      .order('created_at', { ascending: false })
    setContracts(data || [])
  }

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompanyId) {
      alert('Lütfen işlem yapacak bir firma seçin veya profilinizden firma oluşturun.')
      return
    }

    setLoading(true)
    const { error } = await supabase.from('contract_farming').insert([
      {
        company_id: selectedCompanyId,
        title,
        region,
        capacity_required: parseInt(capacity) || 0,
        model_type: modelType,
        duration_months: parseInt(duration) || 12,
        status
      }
    ])

    if (error) {
      alert('Hata: ' + error.message)
    } else {
      alert('Sözleşme teklifi başarıyla yayınlandı!')
      setTitle('')
      setRegion('')
      setCapacity('')
      setModelType('')
      fetchContracts()
    }
    setLoading(false)
  }

  const handleDeleteContract = async (id: string) => {
    if (!confirm('Bu sözleşme teklifini silmek istediğinize emin misiniz?')) return
    
    const { error } = await supabase.from('contract_farming').delete().eq('id', id)
    if (error) {
      alert('Silme hatası: ' + error.message)
    } else {
      fetchContracts()
    }
  }

  const getCompanyName = (comp: any) => {
    if (!comp) return 'Bilinmeyen Firma';
    if (Array.isArray(comp)) return comp[0]?.name || 'Bilinmeyen Firma';
    return comp.name;
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Üst Kısım / Geri Dön */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🤝 Sözleşmeli Üretim Yönetim Paneli</h1>
            <p className="text-sm text-slate-500 mt-1">Entegre tesisler için yeni sözleşme teklifleri oluşturun ve mevcut ilanları yönetin.</p>
          </div>
          <button 
            onClick={() => router.push('/')}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium text-sm transition-all"
          >
            ← Ana Sayfaya Dön
          </button>
        </div>

        {/* Yeni Sözleşme Ekleme Formu */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Sözleşme Teklifi Yayınla</h2>
          <form onSubmit={handleCreateContract} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kurumsal Firma</label>
              <select 
                value={selectedCompanyId} 
                onChange={(e) => setSelectedCompanyId(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 font-medium"
                required
              >
                {companies.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.name} ({comp.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sözleşme Başlığı</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="Örn: 50.000 Kapasiteli Broyler Üretimi" 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Bölge / Lokasyon</label>
              <input 
                type="text" 
                value={region} 
                onChange={(e) => setRegion(e.target.value)} 
                placeholder="Örn: Akdeniz / Antalya" 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Gerekli Kümes Kapasitesi (Adet)</label>
              <input 
                type="number" 
                value={capacity} 
                onChange={(e) => setCapacity(e.target.value)} 
                placeholder="Örn: 50000" 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Model / Destek Türü</label>
              <input 
                type="text" 
                value={modelType} 
                onChange={(e) => setModelType(e.target.value)} 
                placeholder="Örn: Tam Entegre (Yem + Piliç Desteği)" 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Sözleşme Süresi (Ay)</label>
              <input 
                type="number" 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)} 
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" 
                required 
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3 flex justify-end mt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-all shadow-sm"
              >
                {loading ? 'Yükleniyor...' : 'Sözleşme Teklifini Yayınla'}
              </button>
            </div>
          </form>
        </div>

        {/* Aktif Sözleşmeler Listesi ve Yönetim Tablosu */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-lg">Yayınlanan Tüm Sözleşme Teklifleri ({contracts.length})</h2>
          </div>

          <div className="divide-y divide-slate-100">
            {contracts.length === 0 ? (
              <div className="p-12 text-center text-slate-400">Sistemde kayıtlı sözleşme teklifi bulunmuyor.</div>
            ) : (
              contracts.map((item) => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
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

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Min. Kapasite</div>
                      <div className="font-semibold text-slate-800">{item.capacity_required.toLocaleString('tr-TR')} Adet</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Süre</div>
                      <div className="font-bold text-blue-600">{item.duration_months} Ay</div>
                    </div>
                    <button 
                      onClick={() => handleDeleteContract(item.id)}
                      className="bg-red-50 hover:bg-red-100 text-red-600 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors"
                    >
                      Kaldır
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </main>
  )
}