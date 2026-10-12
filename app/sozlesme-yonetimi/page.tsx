'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Company {
  id: string
  name: string
  role: string
  status: 'beklemede' | 'onaylandi' | 'reddedildi'
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
  const [ownedCompanyIds, setOwnedCompanyIds] = useState<string[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [contracts, setContracts] = useState<ContractFarming[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Form Alanları
  const [title, setTitle] = useState('')
  const [region, setRegion] = useState('')
  const [capacity, setCapacity] = useState('')
  const [modelType, setModelType] = useState('')
  const [duration, setDuration] = useState('12')

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
    const { data: compData, error: companyError } = await supabase
      .from('companies')
      .select('id, name, role, status')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true })

    if (companyError) {
      setLoadError(
        `Firma bilgileriniz yüklenemedi: ${companyError.message}`
      )
    }

    if (compData && compData.length > 0) {
      setOwnedCompanyIds(compData.map((company) => company.id))

      const companyIds = compData.map((company) => company.id)
      const { data: activityData, error: activityError } = await supabase
        .from('company_activities')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('activity_code', 'contract_publisher')
        .eq('status', 'aktif')

      if (activityError) {
        setLoadError(`Faaliyet yetkileri yüklenemedi: ${activityError.message}`)
      }

      const eligibleIds = new Set((activityData ?? []).map((item) => item.company_id))
      const eligibleCompanies = compData.filter(
        (company) => eligibleIds.has(company.id) && company.status === 'onaylandi'
      )

      setCompanies(eligibleCompanies)
      setSelectedCompanyId(eligibleCompanies[0]?.id ?? '')
    }

    await fetchContracts()
    setLoading(false)
  }

  const fetchContracts = async () => {
    setLoadError(null)

    const {
      data: contractData,
      error: contractError,
    } = await supabase
      .from('contract_farming')
      .select(
        'id, company_id, title, region, capacity_required, model_type, duration_months, status'
      )
      .order('created_at', { ascending: false })

    if (contractError) {
      const message =
        `Sözleşme teklifleri yüklenemedi: ${contractError.message}` +
        ` | Kod: ${contractError.code || 'yok'}`

      console.error(message)
      setLoadError(message)
      setContracts([])
      return
    }

    const companyIds = [
      ...new Set(
        (contractData ?? [])
          .map((contract) => contract.company_id)
          .filter(
            (companyId): companyId is string =>
              Boolean(companyId)
          )
      ),
    ]

    const {
      data: publicCompanies,
      error: publicCompanyError,
    } =
      companyIds.length > 0
        ? await supabase
            .from('public_companies')
            .select('id, name, role')
            .in('id', companyIds)
        : {
            data: [],
            error: null,
          }

    if (publicCompanyError) {
      const message =
        `Sözleşme firma bilgileri yüklenemedi: ${publicCompanyError.message}` +
        ` | Kod: ${publicCompanyError.code || 'yok'}`

      console.error(message)
      setLoadError(message)
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

    const safeContracts = (contractData ?? []).map(
      (contract) => ({
        ...contract,
        companies:
          companyMap.get(contract.company_id) ?? null,
      })
    )

    setContracts(safeContracts as ContractFarming[])
  }

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompanyId) {
      alert('Lütfen işlem yapacak bir firma seçin veya profilinizden firma oluşturun.')
      return
    }

    const selectedCompany = companies.find(
      (company) => company.id === selectedCompanyId
    )

    if (!selectedCompany) {
      alert('Seçilen firma bulunamadı.')
      return
    }

    if (selectedCompany.status !== 'onaylandi') {
      alert(
        selectedCompany.status === 'reddedildi'
          ? 'Firma başvurunuz reddedildiği için sözleşme teklifi yayınlayamazsınız. Lütfen firma bilgilerinizi düzeltip yeniden incelemeye gönderin.'
          : 'Sözleşme teklifi yayınlamak için firmanızın yönetici tarafından onaylanması gerekiyor.'
      )
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
        status: 'beklemede'
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
      await fetchContracts()
    }
    setLoading(false)
  }

  const handleDeleteContract = async (id: string) => {
    if (!confirm('Bu sözleşme teklifini silmek istediğinize emin misiniz?')) return
    
    const { error } = await supabase.from('contract_farming').delete().eq('id', id)
    if (error) {
      alert('Silme hatası: ' + error.message)
    } else {
      await fetchContracts()
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

        {loadError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {/* Yeni Sözleşme Ekleme Formu */}
        {companies.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="font-bold text-amber-900">
              Onaylı entegre tesis gerekli
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              Sözleşmeli üretim teklifi yalnızca yönetici tarafından
              onaylanmış entegre tesis firmaları tarafından oluşturulabilir.
            </p>
          </div>
        ) : (
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
        )}

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
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                        item.status === 'aktif'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : item.status === 'beklemede'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : item.status === 'reddedildi'
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {item.status === 'beklemede'
                          ? 'Onay bekliyor'
                          : item.status === 'tamamlandi'
                            ? 'Tamamlandı'
                            : item.status.charAt(0).toLocaleUpperCase('tr-TR') + item.status.slice(1)}
                      </span>
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
                    {ownedCompanyIds.includes(item.company_id) &&
                      ['beklemede', 'pasif', 'reddedildi'].includes(item.status) && (
                        <button
                          onClick={() => handleDeleteContract(item.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors"
                        >
                          Kaldır
                        </button>
                      )}
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
