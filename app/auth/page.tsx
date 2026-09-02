'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

interface Company {
  id: string
  name: string
  type: string
}

export default function AuthPage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, type')
      .order('name', { ascending: true })

    if (error) {
      console.error('Firmalar yüklenemedi:', error.message)
    } else if (data && data.length > 0) {
      setCompanies(data)
      setSelectedCompanyId(data[0].id)
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    if (isLogin) {
      // Giriş İşlemi
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setErrorMsg('Giriş başarısız: ' + error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } else {
      // Kayıt Olma İşlemi
      if (!selectedCompanyId) {
        setErrorMsg('Lütfen bağlı olduğunuz firmayı seçin.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_id: selectedCompanyId,
          },
        },
      })

      if (error) {
        setErrorMsg('Kayıt oluşturulamadı: ' + error.message)
      } else {
        // Eğer profil tablosu tetikleyici ile doluyorsa direkt yönlendiriyoruz
        alert('Kayıt başarılı! Giriş yapabilirsiniz.')
        setIsLogin(true)
      }
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {isLogin ? 'Borsa Paneline Giriş' : 'Yeni Hesap Oluştur'}
          </h1>
          <p className="text-sm text-slate-500">
            {isLogin ? 'Devam etmek için hesabınıza giriş yapın' : 'Bilgilerinizi girerek borsaya katılın'}
          </p>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 text-xs p-3 rounded-xl border border-red-100 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Ad Soyad</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:border-slate-400"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">E-Posta Adresi</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@firma.com"
              className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:border-slate-400"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:border-slate-400"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Bağlı Olduğunuz Firma</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50 focus:outline-none focus:border-slate-400"
              >
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.name} ({comp.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl text-sm transition-all shadow-sm disabled:opacity-50"
          >
            {loading ? 'İşlem yapılıyor...' : isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        </form>

        <div className="text-center pt-2">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            {isLogin ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten hesabınız var mı? Giriş yapın'}
          </button>
        </div>
      </div>
    </main>
  )
}