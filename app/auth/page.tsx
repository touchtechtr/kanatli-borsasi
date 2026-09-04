'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabaseClient'
// Veya: import { createClient } from '@/lib/supabase/client' /

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [taxNo, setTaxNo] = useState('')
  const [role, setRole] = useState('ciftci')
  
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  const router = useRouter()

  useEffect(() => {
    if (!isLogin) {
      fetchCompanies()
    }
  }, [isLogin])

  const fetchCompanies = async () => {
    const supabase = createClient()
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
    setError(null)
    setLoading(true)

    // Build hatasını önlemek için createClient fonksiyonu işlem anında (fonksiyon içinde) çağrılıyor
    const supabase = createClient()

    if (isLogin) {
      // Giriş İşlemi
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError('Giriş başarısız: ' + error.message)
        setLoading(false)
      } else {
        router.push('/')
        router.refresh()
      }
    } else {
      // Kayıt Olma İşlemi
      if (!selectedCompanyId) {
        setError('Lütfen bağlı olduğunuz firmayı seçin.')
        setLoading(false)
        return
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_id: selectedCompanyId,
            company_name: companyName,
            role: role,
            tax_no: taxNo,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
      } else {
        alert('Kayıt başarılı! Giriş yapabilirsiniz.')
        setIsLogin(true)
      }
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {isLogin ? 'Borsa Paneline Giriş' : 'Yeni Hesap Oluştur'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {isLogin ? 'Devam etmek için hesabınıza giriş yapın' : 'Bilgilerinizi girerek borsaya katılın'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Adınız Soyadınız"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Firma / Çiftlik Adı</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Firma Adı"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Vergi No / TC</label>
                <input
                  type="text"
                  required
                  value={taxNo}
                  onChange={(e) => setTaxNo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder="Vergi Numarası"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Rol Seçimi</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="ciftci">Çiftçi / Üretici</option>
                  <option value="tuccar">Tüccar / Alıcı</option>
                  <option value="entegre">Entegre Tesis</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">E-posta Adresi</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="ornek@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Şifre</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
          >
            {loading ? 'İşlem Yapılıyor...' : isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-slate-600 hover:underline font-medium"
          >
            {isLogin ? 'Hesabınız yok mu? Kayıt olun' : 'Zaten hesabınız var mı? Giriş yapın'}
          </button>
        </div>
      </div>
    </main>
  )
}