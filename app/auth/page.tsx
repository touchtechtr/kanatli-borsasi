'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState<'ciftci' | 'tuccar' | 'tedarikci'>('ciftci')
  const [taxNo, setTaxNo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        window.location.href = '/'
      }
    } else {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
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
        window.location.href = '/'
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-slate-900">Kanatlı Borsası</h2>
          <p className="mt-2 text-sm text-slate-600">
            {isLogin ? 'Hesabınıza giriş yapın' : 'Yeni bir kurumsal hesap oluşturun'}
          </p>
        </div>

        {/* Sekme Butonları */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            className={`w-1/2 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              isLogin
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setIsLogin(true)}
          >
            Giriş Yap
          </button>
          <button
            type="button"
            className={`w-1/2 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
              !isLogin
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setIsLogin(false)}
          >
            Kayıt Ol
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleAuth}>
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Ad Soyad</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                  placeholder="Ahmet Yılmaz"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Firma Ünvanı</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                  placeholder="Yılmazlar Tavukçuluk Ltd. Şti."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Rol / Sektör Türü</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                >
                  <option value="ciftci">Çiftçi / Üretici</option>
                  <option value="tuccar">Tüccar / Alıcı</option>
                  <option value="tedarikci">Tedarikçi (Yem/İlaç vb.)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Vergi Numarası (Opsiyonel)</label>
                <input
                  type="text"
                  value={taxNo}
                  onChange={(e) => setTaxNo(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
                  placeholder="1234567890"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">E-posta Adresi</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
              placeholder="ornek@mail.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Şifre</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-2.5 text-sm bg-slate-50"
              placeholder="••••••••"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'İşlem yapılıyor...' : isLogin ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}