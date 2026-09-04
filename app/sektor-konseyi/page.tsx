'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Activity {
  id: string
  title: string
  category: string
  summary: string
  organizer: string
  event_date: string
  created_at: string
}

export default function SektorKonseyiPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')

  const categories = ['Tümü', 'Sektörel Rapor', 'Mevzuat Görüşü', 'Kongre & Zirve', 'Teknik Bülten']

  useEffect(() => {
    setMounted(true)
    initSession()
  }, [])

  const initSession = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setUser(session.user)

    const { data } = await supabase
      .from('association_activities')
      .select('*')
      .order('created_at', { ascending: false })
    
    setActivities(data || [])
    setLoading(false)
  }

  const filteredActivities = activities.filter(item => {
    if (selectedCategory === 'Tümü') return true;
    return item.category === selectedCategory;
  });

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
            <h1 className="text-2xl font-bold text-slate-900 mt-1">🏛️ Sektör Temsil ve Politika Merkezi</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Kanatlı eti ve yem sanayi stratejik raporları, mevzuat görüşleri ve kurumsal temsil merkezi.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/ekspertiz')}
              className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2.5 rounded-xl font-medium text-sm transition-all border border-emerald-200"
            >
              🔬 Ekspertiz Ağı
            </button>
            <button 
              onClick={() => router.push('/sozlesme-yonetimi')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
            >
              🤝 Sözleşme Paneli
            </button>
          </div>
        </div>

        {/* Vizyon Banner */}
        <div className="bg-slate-900 text-slate-50 p-6 md:p-8 rounded-2xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs uppercase font-bold tracking-wider bg-emerald-600 text-white px-3 py-1 rounded-full">
              Çatı Kuruluş Vizyonu
            </span>
            <h2 className="text-xl font-bold text-white mt-1">Sektörün Ortak Sesi ve Güvenilir Temsilcisi</h2>
            <p className="text-sm text-slate-300">
              Ülkemiz kanatlı ve yem sanayinin gelişimi, kamu-sanayi koordinasyonu, mevzuat uyumu ve uluslararası standartların takibi için ortak akıl üretiyoruz.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
              <div className="text-xl font-black text-emerald-400">21+</div>
              <div className="text-xs text-slate-400 mt-0.5">Entegre Temsil</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 text-center">
              <div className="text-xl font-black text-blue-400">100%</div>
              <div className="text-xs text-slate-400 mt-0.5">Şeffaf Rapor</div>
            </div>
          </div>
        </div>

        {/* Kategori Filtreleri */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Faaliyetler ve Raporlar Listesi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-lg">Kurumsal Bültenler ve Sektörel Bildirgeler</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
              Toplam: {filteredActivities.length}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Yükleniyor...</div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Bu kategoride henüz içerik bulunmuyor.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredActivities.map((item) => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {item.category}
                      </span>
                      <span className="text-xs font-medium text-slate-500">🏢 {item.organizer}</span>
                      {item.event_date && <span className="text-xs text-slate-400">• 📅 {item.event_date}</span>}
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                    <p className="text-sm text-slate-600 max-w-3xl">{item.summary}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <span className="inline-block bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold">
                      İncele / İndir
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