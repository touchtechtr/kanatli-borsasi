'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Company {
  id: string
  name: string
  role: string
  city: string
  tax_no: string
  phone: string
  address: string
  website: string
  status: 'beklemede' | 'onaylandi' | 'reddedildi'
  rejection_count: number
  last_rejection_reason: string | null
  blocked_until: string | null
  is_permanently_blocked: boolean
}

interface RejectionHistory {
  id: string
  reason: string | null
  created_at: string
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [rejectionHistory, setRejectionHistory] = useState<RejectionHistory[]>([])
  
  // Form alanları (İletişim ve Şirket detayları)
  const [formData, setFormData] = useState({
    name: '',
    role: 'ciftci',
    city: 'Antalya',
    tax_no: '',
    phone: '',
    address: '',
    website: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/auth')
      return
    }

    setUser(session.user)

    const { data: compData } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (compData) {
      const { data: historyData } = await supabase
        .from('company_moderation_history')
        .select('id, reason, created_at')
       .eq('company_id', compData.id)
       .eq('action', 'reddedildi')
       .order('created_at', { ascending: false })

setRejectionHistory(historyData || [])
      setCompany(compData)
      setFormData({
        name: compData.name || '',
        role: compData.role || 'Çiftçi / Yetiştirici',
        city: compData.city || 'Antalya',
        tax_no: compData.tax_no || '',
        phone: compData.phone || '',
        address: compData.address || '',
        website: compData.website || ''
      })
    }
    setLoading(false)
  }

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    const payload = {
      user_id: user.id,
      name: formData.name,
      role: formData.role,
      city: formData.city,
      tax_no: formData.tax_no,
      phone: formData.phone,
      address: formData.address,
      website: formData.website
    }

    const { error } = await supabase
      .from('companies')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      alert('Kayıt hatası: ' + error.message)
    } else {
      alert('İşletme ve iletişim bilgileriniz başarıyla güncellendi!')
      fetchUserData()
    }
    setSaving(false)
  }

  const handleRequestReview = async () => {
    if (!company || !user) return
  
    if (company.is_permanently_blocked) {
      alert('Firmanız kalıcı olarak engellendi. Yöneticiyle iletişime geçmelisiniz.')
      return
    }
  
    if (
      company.blocked_until &&
      new Date(company.blocked_until).getTime() > Date.now()
    ) {
      alert(
        'Engel süresi dolmadan yeniden inceleme talebi gönderemezsiniz.'
      )
      return
    }
  
    const confirmed = window.confirm(
      'Firma bilgilerinizi güncellediğinizden emin misiniz? Yeniden inceleme talebi gönderilsin mi?'
    )
  
    if (!confirmed) return
  
    setSaving(true)
  
    const { data, error } = await supabase.rpc(
      'request_company_review'
    )
  
    if (error) {
      alert('İnceleme talebi gönderilemedi: ' + error.message)
    } else {
      alert(data || 'Firmanız yeniden incelemeye gönderildi.')
      await fetchUserData()
    }
  
    setSaving(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Yükleniyor...</div>
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Üst Bar */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <button onClick={() => router.push('/')} className="text-xs text-emerald-600 font-semibold hover:underline">
              ← Ana Sayfaya Dön
            </button>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">🏢 İşletme ve Ticaret Merkezi</h1>
            <p className="text-sm text-slate-500 mt-0.5">Kurumsal kimlik, iletişim bilgileri ve geçmiş ticari faaliyetler.</p>
          </div>
          <button 
            onClick={async () => { await supabase.auth.signOut(); router.push('/auth'); }}
            className="bg-red-50 text-red-700 hover:bg-red-100 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-red-200"
          >
            Çıkış Yap
          </button>
        </div>

        {/* Şirket Durumu ve Uyarı Kutusu */}
{company && (
  <div
    className={`p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
      company.status === 'onaylandi'
        ? 'bg-emerald-50/50 border-emerald-200'
        : company.status === 'reddedildi'
          ? 'bg-red-50/50 border-red-200'
          : 'bg-amber-50/50 border-amber-200'
    }`}
  >
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-md uppercase ${
            company.status === 'onaylandi'
              ? 'bg-emerald-100 text-emerald-800'
              : company.status === 'reddedildi'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {company.status === 'onaylandi'
            ? '✓ Onaylı İşletme — Aktif Ticaret Yetkisi'
            : company.status === 'reddedildi'
              ? '✕ Firma Başvurusu Reddedildi'
              : '⏳ Admin Onayı Bekliyor — Alım/Satım Kısıtlı'}
        </span>

        {company.rejection_count > 0 && (
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
              company.rejection_count >= 5
                ? 'bg-red-100 text-red-800 border-red-300'
                : company.rejection_count >= 3
                  ? 'bg-orange-100 text-orange-800 border-orange-300'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            ⚠ {company.rejection_count} Ret
          </span>
        )}

        {company.is_permanently_blocked && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-md border bg-red-100 text-red-800 border-red-300">
            ⛔ Kalıcı Engelli
          </span>
        )}

        {!company.is_permanently_blocked &&
          company.blocked_until &&
          new Date(company.blocked_until).getTime() > Date.now() && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-md border bg-orange-100 text-orange-800 border-orange-300">
              ⏳ Geçici Engelli
            </span>
          )}
      </div>

      <h2 className="text-lg font-bold text-slate-900">
        {company.name}
      </h2>

      <p className="text-xs text-slate-600">
        Rol: {company.role} | Şehir: {company.city}
        {company.phone && ` | Tel: ${company.phone}`}
      </p>
    </div>

    {company.status === 'beklemede' && (
  <div className="text-xs bg-amber-100 text-amber-900 px-4 py-3 rounded-xl border border-amber-200 font-medium max-w-sm space-y-3">
    <p>
      ⚠️ Hesabınız inceleniyor. Admin onayından sonra borsa
      üzerinden ilan açıp alım/satım yapabileceksiniz.
    </p>

    {rejectionHistory.length > 0 && (
      <div className="border-t border-amber-300 pt-3">
        <p className="font-bold">
          Önceki ret geçmişi:
        </p>

        <div className="mt-2 space-y-2">
          {rejectionHistory.map((item, index) => (
            <div
              key={item.id}
              className="rounded-lg border border-amber-300 bg-white/60 px-3 py-2"
            >
              <p>
                {index + 1}.{' '}
                {item.reason || 'Ret nedeni belirtilmemiş.'}
              </p>

              <p className="mt-1 text-[11px] text-amber-700">
                {new Date(item.created_at).toLocaleString('tr-TR')}
              </p>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
)}

    {company.status === 'reddedildi' && (
      <div className="text-xs bg-red-100 text-red-900 px-4 py-3 rounded-xl border border-red-200 font-medium max-w-sm space-y-2">
        <p>
          Başvurunuz onaylanmadı.
        </p>

        <div>
  <strong>Ret nedenleri:</strong>

  {rejectionHistory.length > 0 ? (
    <div className="mt-2 space-y-2">
      {rejectionHistory.map((item, index) => (
        <div
          key={item.id}
          className="rounded-lg border border-red-200 bg-white/60 px-3 py-2"
        >
          <p>
            {index + 1}. {item.reason || 'Ret nedeni belirtilmemiş.'}
          </p>

          <p className="mt-1 text-[11px] text-red-700">
            {new Date(item.created_at).toLocaleString('tr-TR')}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="mt-1">
      {company.last_rejection_reason || 'Ret nedeni belirtilmemiş.'}
    </p>
  )}
</div>

        {company.blocked_until &&
          !company.is_permanently_blocked && (
            <p>
              <strong>Engel bitişi:</strong>{' '}
              {new Date(company.blocked_until).toLocaleString(
                'tr-TR'
              )}
            </p>
          )}

        {company.is_permanently_blocked && (
          <p>
            Bu firma kalıcı olarak engellenmiştir. Yeniden inceleme
            için platform yönetimiyle iletişime geçin.
          </p>
        )}
        
        {!company.is_permanently_blocked &&
          (!company.blocked_until ||
            new Date(company.blocked_until).getTime() <= Date.now()) && (
            <div className="space-y-3 pt-2">
              <p>
                Firma bilgilerinizi düzelttikten sonra yeniden inceleme
                talebi gönderebilirsiniz.
              </p>
        
              <button
                type="button"
                onClick={handleRequestReview}
                disabled={saving}
                className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? 'Gönderiliyor...'
                  : 'Yeniden İncelemeye Gönder'}
              </button>
            </div>
          )}
      </div>
    )}
  </div>
)}

        {/* Ticari Geçmiş ve Alım/Satım Geçmişi Alanı (Gelecekte dolacak yapı) */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <h2 className="text-base font-bold text-slate-900">📦 Geçmiş Ticari Faaliyetler & İlanlarım</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-2xl font-black text-slate-900">0</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Aktif Borsa İlanı</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-2xl font-black text-slate-900">0</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Tamamlanan Sözleşme</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-2xl font-black text-slate-900">0</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Kesim Randevusu</div>
            </div>
          </div>
        </div>

        {/* Şirket Bilgileri Düzenleme Formu */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-4">
            {company ? 'Kurumsal ve İletişim Bilgilerini Güncelle' : 'Şirket / Çiftlik Profili Oluştur'}
          </h2>

          <form onSubmit={handleSaveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şirket / Çiftlik Unvanı</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="Örn: Akdeniz Broyler Üretim A.Ş." 
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-medium"
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Faaliyet Rolü</label>
              <select 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})}
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 font-medium"
              >
                <option value="ciftci">Çiftçi / Yetiştirici</option>
                <option value="tuccar">Tüccar / Alıcı</option>
                <option value="tedarikci">Yem Fabrikası / Tedarikçi</option>
                <option value="entegre">Entegre Tesis / Kesimhane</option>
                <option value="uzman">Bağımsız Uzman / Veteriner</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Telefon Numarası</label>
              <input 
                type="text" 
                value={formData.phone} 
                onChange={e => setFormData({...formData, phone: e.target.value})} 
                placeholder="05XX XXX XX XX" 
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şehir</label>
              <input 
                type="text" 
                value={formData.city} 
                onChange={e => setFormData({...formData, city: e.target.value})} 
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50"
                required 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Vergi Numarası</label>
              <input 
                type="text" 
                value={formData.tax_no} 
                onChange={e => setFormData({...formData, tax_no: e.target.value})} 
                placeholder="Vergi numaranız..." 
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50" 
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Web Sitesi (Varsa)</label>
              <input 
                type="text" 
                value={formData.website} 
                onChange={e => setFormData({...formData, website: e.target.value})} 
                placeholder="https://..." 
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50" 
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Açık Adres</label>
              <textarea 
                value={formData.address} 
                onChange={e => setFormData({...formData, address: e.target.value})} 
                placeholder="Kümes veya işletme açık adresi..." 
                rows={2}
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50" 
              />
            </div>

            <div className="md:col-span-2 pt-2">
              <button 
                type="submit" 
                disabled={saving}
                className="w-full bg-slate-900 text-white font-medium py-3 rounded-xl text-sm hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Kurumsal Bilgileri Kaydet / Güncelle'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </main>
  )
}