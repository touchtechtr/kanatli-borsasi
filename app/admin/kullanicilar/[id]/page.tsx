'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Building2, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
  role: string
  status: string
  city: string | null
  address: string | null
  website: string | null
  email: string | null
  phone: string | null
  tax_no: string | null
  created_at: string
}

type UserDetail = {
  id: string
  email: string | null
  full_name: string | null
  is_admin: boolean
  profile_created_at: string | null
  auth_created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  phone: string | null
  companies: Company[]
}

const dateText = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : '—'

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadUser = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErrorMessage(null)

    const [{ data, error }, { data: authData }] = await Promise.all([
      supabase.rpc('admin_get_user_detail', { p_user_id: id }),
      supabase.auth.getUser(),
    ])

    if (error) {
      setUser(null)
      setErrorMessage(`Kullanıcı yüklenemedi: ${error.message}`)
    } else {
      setUser(data as UserDetail)
      setCurrentUserId(authData.user?.id ?? null)
    }
    setLoading(false)
  }, [id, supabase])

  useEffect(() => { void loadUser() }, [loadUser])

  const changeAdminStatus = async () => {
    if (!user) return
    const nextValue = !user.is_admin
    const message = nextValue
      ? 'Bu kullanıcıya yönetici yetkisi vermek istiyor musunuz?'
      : 'Bu kullanıcının yönetici yetkisini kaldırmak istiyor musunuz?'

    if (!window.confirm(message)) return

    setActionLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    const { error } = await supabase.rpc('admin_set_user_admin', {
      p_user_id: user.id,
      p_is_admin: nextValue,
    })

    if (error) {
      setErrorMessage(`Yetki değiştirilemedi: ${error.message}`)
    } else {
      setSuccessMessage(nextValue ? 'Yönetici yetkisi verildi.' : 'Yönetici yetkisi kaldırıldı.')
      await loadUser()
    }
    setActionLoading(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Kullanıcı yükleniyor...</div>

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/kullanicilar" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Kullanıcılara dön</Link>
          <button type="button" onClick={() => void loadUser()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Yenile</button>
        </div>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
        {successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{successMessage}</div>}

        {user && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-slate-900">{user.full_name || 'İsimsiz kullanıcı'}</h1>
                    {user.is_admin && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700"><ShieldCheck className="h-3.5 w-3.5" /> Yönetici</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{user.email || 'E-posta bulunmuyor'}</p>
                  <p className="mt-1 break-all text-xs text-slate-400">{user.id}</p>
                </div>
                <button type="button" onClick={() => void changeAdminStatus()} disabled={actionLoading || (user.id === currentUserId && user.is_admin)} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${user.is_admin ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
                  {user.is_admin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {user.is_admin ? 'Yönetici yetkisini kaldır' : 'Yönetici yap'}
                </button>
              </div>
              {user.id === currentUserId && user.is_admin && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Güvenlik nedeniyle kendi yönetici yetkinizi kaldıramazsınız.</p>}

              <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Kayıt tarihi', dateText(user.auth_created_at)],
                  ['Son giriş', dateText(user.last_sign_in_at)],
                  ['E-posta doğrulama', dateText(user.email_confirmed_at)],
                  ['Telefon', user.phone || '—'],
                ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>)}
              </dl>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" /><h2 className="text-lg font-bold text-slate-900">Bağlı firmalar ({user.companies?.length ?? 0})</h2></div>
              {(user.companies ?? []).length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Bu kullanıcıya bağlı firma bulunmuyor.</div> : user.companies.map((company) => (
                <article key={company.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-bold text-slate-900">{company.name}</h3><p className="mt-1 text-sm text-slate-500">{company.role} · {company.status}</p></div>
                    <Link href="/admin/firmalar" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Firma yönetimine git</Link>
                  </div>
                  <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ['Şehir', company.city || '—'],
                      ['Telefon', company.phone || '—'],
                      ['E-posta', company.email || '—'],
                      ['Vergi no', company.tax_no || '—'],
                      ['Adres', company.address || '—'],
                      ['Web sitesi', company.website || '—'],
                    ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-700">{value}</dd></div>)}
                  </dl>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
