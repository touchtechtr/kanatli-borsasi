'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface ExpertRequest {
  id: string
  service_type: string
  title: string
  description: string
  city: string
  status: string
  created_at: string
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

export default function ExpertizPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [requests, setRequests] = useState<ExpertRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [userCompanyId, setUserCompanyId] = useState<string>('')
  const [showForm, setShowForm] = useState(false)

  const serviceTypes = [
    'Yem Kalite & Hammadde Lab Analizi',
    'Kümes Havalandırma & İklimlendirme Denetimi',
    'Sürü Sağlığı & Biyogüvenlik Ekspertizi',
    'Rasyon ve Besleme Optimizasyonu',
    'Sözleşmeli Üretim Tesis Uygunluk Raporu'
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

      if (compData && compData.length > 0) {
        setCompanies(compData)
        setUserCompanyId(compData[0].id)
      }
    }

    await fetchRequests()
    setLoading(false)
  }

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('expert_requests')
      .select(`id, service_type, title, description, city, status, created_at, companies ( name, role )`)
      .order('created_at', { ascending: false })
    setRequests(data || [])
  }

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { router.push('/auth'); return; }
    if (!userCompanyId) { alert('Lütfen önce bir şirket profili seçin/oluşturun.'); router.push('/profil'); return; }

    const form = e.target as any
    const { error } = await supabase.from('expert_requests').insert([
      {
        company_id: userCompanyId,
        user_id: user.id,
        service_type: form.serviceType.value,
        title: form.title.value,
        description: form.description.value,
        city: form.city.value,
        status: 'beklemede'
      }
    ])

    if (error) {
      alert('Hata: ' + error.message)
    } else {
      setShowForm(false)
      fetchRequests()
    }
  }

  const getCompanyName = (comp: any) => {
    if (!comp) return 'Bilinmeyen Kurum';
    if (Array.isArray(comp)) return comp[0]?.name || 'Bilinmeyen Kurum';
    return comp.name;
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Üst Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/')} className="text-xs text-emerald-600 font-semibold hover:underline">
                ← Ana Sayfaya Dön
              </button>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">🔬 Ekspertiz & Saha Danışmanlık Ağı</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Yem kalitesi, kümes denetimleri ve bağımsız uzman raporlama merkezi.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={() => setShowForm(!showForm)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
              >
                {showForm ? '✕ Kapat' : '+ Ekspertiz / Rapor Talebi Aç'}
              </button>
            ) : (
              <button 
                onClick={() => router.push('/auth')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
              >
                Giriş Yap ve Talep Aç
              </button>
            )}
          </div>
        </div>

        {/* Bilgilendirme Banner */}
        <div className="bg-emerald-900 text-emerald-50 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-bold tracking-wider bg-emerald-800 px-3 py-1 rounded-full text-emerald-200">
              Güvenilir Ticaret Standardı
            </span>
            <h2 className="text-lg font-bold mt-2">Tarımda Riskleri Bağımsız Uzmanlarla Azaltın</h2>
            <p className="text-sm text-emerald-100 max-w-2xl">
              İster yem ham maddesi alırken laboratuvar analizi isteyin, ister yeni kuracağınız kümes için teknik uygunluk raporu alın. Sertifikalı uzmanlar kapınıza gelsin veya dijital denetim sağlasın.
            </p>
          </div>
          <div className="bg-emerald-800/80 p-4 rounded-xl border border-emerald-700 text-center min-w-[180px]">
            <div className="text-2xl font-black text-white">{requests.length}</div>
            <div className="text-xs text-emerald-200 mt-0.5">Aktif Talep & İnceleme</div>
          </div>
        </div>

        {/* Talep Formu */}
        {showForm && user && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Ekspertiz / Danışmanlık Talebi Oluştur</h2>
            <form onSubmit={handleCreateRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Hizmet Türü</label>
                <select name="serviceType" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50">
                  {serviceTypes.map(st => (<option key={st} value={st}>{st}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kurum / İşletmeniz</label>
                <select value={userCompanyId} onChange={(e) => setUserCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 font-medium">
                  {companies.map(comp => (<option key={comp.id} value={comp.id}>{comp.name} ({comp.role})</option>))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Talep Başlığı / Özeti</label>
                <input type="text" name="title" placeholder="Örn: 50 Ton Broyler Yemi Numune Analizi ve Protein Testi" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şehir / Tesis Konumu</label>
                <input type="text" name="city" defaultValue="Antalya" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Detaylı Açıklama / Beklentiler</label>
                <textarea name="description" rows={3} placeholder="İnceleme yapılması istenen detayları, parti numarasını veya kümes kapasitesini belirtin..." className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required></textarea>
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors">
                  Ekspertiz Talebini Yayınla
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Talepler Listesi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-lg">Sistemdeki Aktif Ekspertiz & İnceleme Talepleri</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
              Toplam: {requests.length}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Yükleniyor...</div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Henüz yayınlanmış bir ekspertiz talebi bulunmuyor.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((item) => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {item.service_type}
                      </span>
                      <span className="text-xs font-medium text-slate-500">🏢 {getCompanyName(item.companies)}</span>
                      <span className="text-xs text-slate-400">• 📍 {item.city}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                    <p className="text-sm text-slate-600 max-w-3xl">{item.description}</p>
                  </div>
                  <div className="text-right whitespace-nowrap flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      item.status === 'beklemede' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      {item.status === 'beklemede' ? '⏳ Uzman Bekliyor' : '✅ İnceleniyor'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.created_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}