'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, LogIn, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { INITIAL_ACTIVITY_OPTIONS } from '@/constants/company'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [taxNo, setTaxNo] = useState('')
  const [role, setRole] = useState('ciftci')
  const [requestedActivities, setRequestedActivities] = useState<string[]>([
    'animal_breeder',
    'animal_seller',
    'feed_buyer',
  ])
  
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  

  const router = useRouter()

  
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        if (error.message === 'Email not confirmed') {
          setError(
            'E-posta adresiniz henüz onaylanmadı. Lütfen giriş yapmadan önce e-posta adresinize gönderilen bağlantıya tıklayarak hesabınızı onaylayın.'
          )
        } else if (error.message === 'Invalid login credentials') {
          setError('E-posta adresiniz veya şifreniz hatalı.')
        } else {
          setError(
            'Giriş işlemi başarısız oldu. Lütfen tekrar deneyin.'
          )
        }
      
        setLoading(false)
        return
      }
      
      const { data: platformAccess, error: profileError } = await supabase
        .rpc('get_my_platform_access')
      
      if (profileError) {
        setError(
          'Kullanıcı yetkisi kontrol edilemedi: ' +
            profileError.message
        )
        setLoading(false)
        return
      }
      
      setLoading(false)

      window.location.replace(
        platformAccess?.is_staff ? '/admin' : '/'
      )
      return
    } else {
      if (requestedActivities.length === 0) {
        setError('En az bir faaliyet alanı seçmelisiniz.')
        setLoading(false)
        return
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
            role: role,
            tax_no: taxNo,
            requested_activities: requestedActivities,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
      } else {
        alert(
          'Kayıt başarılı! E-posta adresinize gönderilen bağlantıya tıklayarak hesabınızı onayladıktan sonra giriş yapabilirsiniz.'
        )
        setIsLogin(true)
      }
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Ana sayfaya dön
        </Link>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {isLogin ? 'Borsa Paneline Giriş' : 'Yeni Hesap Oluştur'}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {isLogin ? 'Devam etmek için hesabınıza giriş yapın' : 'Bilgilerinizi girerek borsaya katılın'}
          </p>
        </div>

        <div className="mb-7 grid grid-cols-2 gap-3" role="tablist" aria-label="Hesap işlemi seçimi">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null) }}
            className={`rounded-2xl border p-4 text-left transition ${isLogin ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
          >
            <LogIn className={`h-5 w-5 ${isLogin ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="mt-3 block text-sm font-bold text-slate-900">Giriş Yap</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">Mevcut hesabınıza erişin.</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null) }}
            className={`rounded-2xl border p-4 text-left transition ${!isLogin ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
          >
            <UserPlus className={`h-5 w-5 ${!isLogin ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="mt-3 block text-sm font-bold text-slate-900">Kayıt Ol</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">Firma hesabınızı oluşturun.</span>
          </button>
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

              <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <legend className="px-1 text-xs font-semibold uppercase text-slate-600">
                  Faaliyet Alanları
                </legend>
                <p className="mb-3 text-xs leading-5 text-slate-500">
                  Birden fazla alan seçebilirsiniz. Firma onayından sonra her faaliyet için gerekli belgeleri profilinizden yükleyebilirsiniz.
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {INITIAL_ACTIVITY_OPTIONS.map((activity) => {
                    const checked = requestedActivities.includes(activity.code)
                    return (
                      <label key={activity.code} className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-emerald-300">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setRequestedActivities((current) => checked ? current.filter((code) => code !== activity.code) : [...current, activity.code])}
                          className="mt-1 h-4 w-4 accent-emerald-600"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-800">{activity.name}</span>
                          <span className="block text-xs text-slate-500">{activity.segment} · {activity.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                {requestedActivities.length === 0 && <p className="mt-2 text-xs font-medium text-red-600">En az bir faaliyet alanı seçin.</p>}
              </fieldset>

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
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Ana Firma Profili</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="ciftci">Çiftçi / Üretici</option>
                  <option value="tuccar">Tüccar / Alıcı</option>
                  <option value="entegre">Entegre Tesis</option>
                  <option value="tedarikci">Yem / Hammadde Tedarikçisi</option>
                  <option value="uzman">Ekspertiz / Veteriner</option>
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

          {isLogin && (
           <div className="text-right">
            <button
            type="button"
            onClick={() => router.push('/auth/reset-password')}
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
         >
            Şifremi Unuttum
         </button>
       </div>
      )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
          >
            {loading ? 'İşlem Yapılıyor...' : isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
          </button>
        </form>

        {!isLogin && <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/><p>Firma kaydınız yönetici incelemesinden sonra etkinleşir. Faaliyet belgelerinizi kayıt sonrasında profilinizden tamamlayabilirsiniz.</p></div>}
        </div>
      </div>
    </main>
  )
}
