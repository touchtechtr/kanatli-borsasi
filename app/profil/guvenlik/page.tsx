'use client'

import { useEffect, useMemo, useState } from 'react'
import { LogOut, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SecurityPage() {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')) }, [supabase])
  const resetPassword = async () => { if (!email) return; const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` }); setMessage(error ? error.message : 'Şifre yenileme bağlantısı e-posta adresinize gönderildi.') }
  return <main className="space-y-5"><header><p className="text-sm font-semibold text-emerald-600">Hesap merkezi</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Güvenlik</h1><p className="mt-1 text-sm text-slate-500">Oturumunuzu ve şifre işlemlerinizi yönetin.</p></header>{message && <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{message}</div>}<section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Mail className="h-6 w-6 text-emerald-600" /><h2 className="mt-4 font-bold text-slate-900">E-posta hesabı</h2><p className="mt-1 text-sm text-slate-500">{email || 'Yükleniyor…'}</p><button onClick={() => void resetPassword()} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">Şifre yenileme bağlantısı gönder</button></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><ShieldCheck className="h-6 w-6 text-violet-600" /><h2 className="mt-4 font-bold text-slate-900">Oturum güvenliği</h2><p className="mt-1 text-sm text-slate-500">Ortak cihazlarda işiniz bittiğinde hesabınızdan çıkış yapın.</p><button onClick={async () => { await supabase.auth.signOut(); window.location.replace('/auth') }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700"><LogOut className="h-4 w-4" />Çıkış yap</button></div></section></main>
}
