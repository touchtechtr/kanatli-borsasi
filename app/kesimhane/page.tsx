'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Slaughterhouse {
  id: string
  name: string
  city: string
  daily_capacity: number
  species: string
  status: string
}

interface Appointment {
  id: string
  flock_size: number
  appointment_date: string
  status: string
  notes: string
  slaughterhouses: {
    name: string
    city: string
  } | {
    name: string
    city: string
  }[] | null
  companies: {
    name: string
  } | {
    name: string
  }[] | null
}

interface Company {
  id: string
  name: string
  role: string
}

export default function KesimhanePage() {
  const router = useRouter()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [slaughterhouses, setSlaughterhouses] = useState<Slaughterhouse[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [userCompanyId, setUserCompanyId] = useState<string>('')
  const [showAppointmentForm, setShowAppointmentForm] = useState(false)
  const [selectedHouse, setSelectedHouse] = useState<string>('')

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

    await fetchData()
    setLoading(false)
  }

  const fetchData = async () => {
    const { data: houseData } = await supabase
      .from('slaughterhouses')
      .select('*')
      .order('name', { ascending: true })
    setSlaughterhouses(houseData || [])

    if (houseData && houseData.length > 0) {
      setSelectedHouse(houseData[0].id)
    }

    const { data: appData } = await supabase
      .from('slaughter_appointments')
      .select(`id, flock_size, appointment_date, status, notes, slaughterhouses ( name, city ), companies ( name )`)
      .order('appointment_date', { ascending: true })
    setAppointments(appData || [])
  }

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) { router.push('/auth'); return; }
    if (!userCompanyId) { alert('Lütfen önce bir şirket profili seçin/oluşturun.'); router.push('/profil'); return; }

    const form = e.target as any
    const { error } = await supabase.from('slaughter_appointments').insert([
      {
        slaughterhouse_id: selectedHouse,
        user_id: user.id,
        company_id: userCompanyId,
        flock_size: parseInt(form.flockSize.value),
        appointment_date: form.appointmentDate.value,
        notes: form.notes.value,
        status: 'Onay Bekliyor'
      }
    ])

    if (error) {
      alert('Hata: ' + error.message)
    } else {
      setShowAppointmentForm(false)
      fetchData()
      alert('Kesim randevunuz başarıyla oluşturuldu!')
    }
  }

  const getHouseName = (house: any) => {
    if (!house) return 'Bilinmeyen Tesis';
    if (Array.isArray(house)) return `${house[0]?.name} (${house[0]?.city})`;
    return `${house.name} (${house.city})`;
  };

  const getCompanyName = (comp: any) => {
    if (!comp) return 'Bilinmeyen Çiftlik';
    if (Array.isArray(comp)) return comp[0]?.name || 'Bilinmeyen Çiftlik';
    return comp.name;
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Üst Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <button onClick={() => router.push('/')} className="text-xs text-emerald-600 font-semibold hover:underline">
              ← Ana Sayfaya Dön
            </button>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">🏭 ESK Tarzı Kesimhane Kapasiteleri & Randevu Merkezi</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Bölgesel kombina kesim kapasiteleri, karkas planlama ve dijital randevu yönetimi.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={() => setShowAppointmentForm(!showAppointmentForm)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
              >
                {showAppointmentForm ? '✕ Kapat' : '+ Kesim Randevusu Al'}
              </button>
            ) : (
              <button 
                onClick={() => router.push('/auth')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
              >
                Giriş Yap ve Randevu Al
              </button>
            )}
          </div>
        </div>

        {/* Randevu Formu */}
        {showAppointmentForm && user && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Yeni Kesim Randevusu Oluştur</h2>
            <form onSubmit={handleCreateAppointment} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kesimhane / Kombina Seçimi</label>
                <select value={selectedHouse} onChange={(e) => setSelectedHouse(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50">
                  {slaughterhouses.map(h => (<option key={h.id} value={h.id}>{h.name} - {h.city} (Günlük: {h.daily_capacity.toLocaleString()} Adet)</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Başvuran İşletme / Çiftlik</label>
                <select value={userCompanyId} onChange={(e) => setUserCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50 font-medium">
                  {companies.map(comp => (<option key={comp.id} value={comp.id}>{comp.name} ({comp.role})</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Kesime Gelecek Sürü / Hayvan Adeti</label>
                <input type="number" name="flockSize" placeholder="Örn: 5000" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Planlanan Kesim Tarihi</label>
                <input type="date" name="appointmentDate" className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notlar / Canlı Ağırlık Bilgisi</label>
                <textarea name="notes" rows={2} placeholder="Ortalama canlı ağırlık, nakliye detayları vb. notları ekleyin..." className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"></textarea>
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors">
                  Kesim Randevusu Talebini Gönder
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Kesimhane Kapasiteleri Listesi */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Bölgesel Kesimhane ve Kombina Kapasiteleri</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {slaughterhouses.map((house) => (
              <div key={house.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-md">{house.species}</span>
                    <span className="text-xs text-emerald-600 font-bold">● {house.status}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mt-2">{house.name}</h3>
                  <p className="text-xs text-slate-500">📍 {house.city}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Günlük Kapasite</div>
                    <div className="text-lg font-extrabold text-slate-900">{house.daily_capacity.toLocaleString('tr-TR')} Adet</div>
                  </div>
                  <button 
                    onClick={() => { setSelectedHouse(house.id); setShowAppointmentForm(true); }}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  >
                    Randevu Al
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Aktif Randevular Tablosu */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-lg">Sistemdeki Kesim Randevuları ve Planlama Havuzu</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
              Toplam: {appointments.length}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Yükleniyor...</div>
          ) : appointments.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Aktif kesim randevusu bulunmuyor.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((item) => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-100">
                        {getHouseName(item.slaughterhouses)}
                      </span>
                      <span className="text-xs font-medium text-slate-600">🏢 {getCompanyName(item.companies)}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm">Kesim Miktarı: <span className="text-emerald-600">{item.flock_size.toLocaleString()} Adet Piliç</span></h3>
                    {item.notes && <p className="text-xs text-slate-500">Not: {item.notes}</p>}
                  </div>
                  <div className="text-right whitespace-nowrap flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                      📅 {item.appointment_date} ({item.status})
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