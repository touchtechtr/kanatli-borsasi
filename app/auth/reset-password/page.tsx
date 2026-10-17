'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RECOVERY_MARKER } from '@/components/auth/PasswordRecoveryGuard'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [mode, setMode] = useState<'request' | 'update'>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const hasRecoveryIntent = () => {
      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      return (
        query.get('recovery') === '1' ||
        query.get('type') === 'recovery' ||
        hash.get('type') === 'recovery' ||
        window.sessionStorage.getItem(RECOVERY_MARKER) === '1'
      )
    }

    const checkRecoverySession = async () => {
      const recoveryIntent = hasRecoveryIntent()
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (recoveryIntent && session) {
        window.sessionStorage.setItem(RECOVERY_MARKER, '1')
        setMode('update')
      } else {
        setMode('request')
        if (recoveryIntent && !session) {
          setError('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bağlantı isteyin.')
        }
      }
    }

    void checkRecoverySession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.sessionStorage.setItem(RECOVERY_MARKER, '1')
        setError(null)
        setMode('update')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password?recovery=1`,
      })

    if (resetError) {
      setError('Sıfırlama e-postası gönderilemedi: ' + resetError.message)
    } else {
      setMessage(
        'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
      )
    }

    setLoading(false)
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (password.length < 8) {
      setError('Yeni şifreniz en az 8 karakter olmalıdır.')
      return
    }

    if (password !== passwordConfirm) {
      setError('Girdiğiniz şifreler birbiriyle eşleşmiyor.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    if (updateError) {
      setError('Şifre güncellenemedi: ' + updateError.message)
      setLoading(false)
      return
    }

    window.sessionStorage.removeItem(RECOVERY_MARKER)
    await supabase.auth.signOut()
    setMessage('Şifreniz başarıyla yenilendi. Yeni şifrenizle giriş yapabilirsiniz.')

    setTimeout(() => {
      router.replace('/auth')
    }, 2000)

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {mode === 'request' ? 'Şifremi Unuttum' : 'Yeni Şifre Oluştur'}
          </h1>

          <p className="text-sm text-slate-500 mt-2">
            {mode === 'request'
              ? 'Şifre sıfırlama bağlantısı almak için e-posta adresinizi girin.'
              : 'Hesabınız için yeni şifrenizi belirleyin.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg">
            {message}
          </div>
        )}

        {mode === 'request' ? (
          <form onSubmit={handleResetRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                E-posta Adresi
              </label>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@email.com"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
            >
              {loading ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Yeni Şifre
              </label>

              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                Yeni Şifre Tekrar
              </label>

              <input
                type="password"
                required
                minLength={8}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50"
            >
              {loading ? 'Güncelleniyor...' : 'Yeni Şifreyi Kaydet'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => router.push('/auth')}
          className="w-full mt-5 text-sm text-slate-600 hover:underline font-medium"
        >
          Giriş sayfasına dön
        </button>
      </div>
    </main>
  )
}