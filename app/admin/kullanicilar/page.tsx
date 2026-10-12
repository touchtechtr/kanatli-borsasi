'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
  role: string
  status: string
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  tax_no: string | null
  website: string | null
  created_at: string
}

type AdminUser = {
  user_id: string
  email: string | null
  full_name: string | null
  is_admin: boolean
  profile_created_at: string | null
  auth_created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  companies: Company[] | null
}

const roleLabel = (role: string) => ({
  ciftci: 'Çiftçi',
  tuccar: 'Tüccar',
  tedarikci: 'Tedarikçi',
  entegre: 'Entegre tesis',
  uzman: 'Uzman',
  admin: 'Yönetici',
}[role] ?? role)

const statusLabel = (status: string) => ({
  beklemede: 'Onay bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
}[status] ?? status)

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleString('tr-TR') : '—'

export default function AdminUsersPage() {
  const supabase = useMemo(() => createClient(), [])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('all')
  const [emailFilter, setEmailFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [companyStatusFilter, setCompanyStatusFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [loginFilter, setLoginFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    const { data, error } = await supabase.rpc('admin_list_users')

    if (error) {
      setUsers([])
      setErrorMessage(`Kullanıcılar yüklenemedi: ${error.message}`)
    } else {
      setUsers((data ?? []) as AdminUser[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadUsers() }, [loadUsers])

  const roles = useMemo(() => [...new Set(
    users.flatMap((user) => (user.companies ?? []).map((company) => company.role))
  )].sort(), [users])

  const cities = useMemo(() => [...new Set(
    users.flatMap((user) => (user.companies ?? []).map((company) => company.city).filter((city): city is string => Boolean(city)))
  )].sort((a, b) => a.localeCompare(b, 'tr')), [users])

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR')
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null

    const result = users.filter((user) => {
      const companies = user.companies ?? []
      const searchableValues = [
        user.full_name,
        user.email,
        user.user_id,
        ...companies.flatMap((company) => [
          company.id,
          company.name,
          company.role,
          roleLabel(company.role),
          company.status,
          statusLabel(company.status),
          company.city,
          company.address,
          company.phone,
          company.email,
          company.tax_no,
          company.website,
        ]),
      ]

      const createdAt = new Date(user.auth_created_at).getTime()

      return (
        (!normalized || searchableValues.some((value) => value?.toLocaleLowerCase('tr-TR').includes(normalized))) &&
        (accountFilter === 'all' || (accountFilter === 'admin' ? user.is_admin : !user.is_admin)) &&
        (emailFilter === 'all' || (emailFilter === 'confirmed' ? Boolean(user.email_confirmed_at) : !user.email_confirmed_at)) &&
        (roleFilter === 'all' || companies.some((company) => company.role === roleFilter)) &&
        (companyStatusFilter === 'all' || companies.some((company) => company.status === companyStatusFilter)) &&
        (cityFilter === 'all' || companies.some((company) => company.city === cityFilter)) &&
        (loginFilter === 'all' || (loginFilter === 'signed_in' ? Boolean(user.last_sign_in_at) : !user.last_sign_in_at)) &&
        (start === null || createdAt >= start) &&
        (end === null || createdAt <= end)
      )
    })

    return result.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.auth_created_at).getTime() - new Date(b.auth_created_at).getTime()
      if (sortBy === 'name') return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr')
      if (sortBy === 'last_sign_in') return new Date(b.last_sign_in_at ?? 0).getTime() - new Date(a.last_sign_in_at ?? 0).getTime()
      return new Date(b.auth_created_at).getTime() - new Date(a.auth_created_at).getTime()
    })
  }, [accountFilter, cityFilter, companyStatusFilter, dateFrom, dateTo, emailFilter, loginFilter, query, roleFilter, sortBy, users])

  const clearFilters = () => {
    setQuery('')
    setAccountFilter('all')
    setEmailFilter('all')
    setRoleFilter('all')
    setCompanyStatusFilter('all')
    setCityFilter('all')
    setLoginFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortBy('newest')
  }

  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const header = ['Kullanıcı ID', 'Ad soyad', 'E-posta', 'Hesap tipi', 'E-posta doğrulandı', 'Firma', 'Rol', 'Firma durumu', 'Şehir', 'Telefon', 'Vergi no', 'Kayıt tarihi', 'Son giriş']
    const rows = filteredUsers.flatMap((user) => {
      const companies = user.companies?.length ? user.companies : [null]
      return companies.map((company) => [
        user.user_id,
        user.full_name,
        user.email,
        user.is_admin ? 'Yönetici' : 'Standart kullanıcı',
        user.email_confirmed_at ? 'Evet' : 'Hayır',
        company?.name,
        company ? roleLabel(company.role) : '',
        company ? statusLabel(company.status) : '',
        company?.city,
        company?.phone,
        company?.tax_no,
        dateText(user.auth_created_at),
        dateText(user.last_sign_in_at),
      ])
    })
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kullanicilar-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Hesap yönetimi</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Kullanıcılar</h1>
            <p className="mt-1 text-sm text-slate-500">Tüm kullanıcı ve firma ayrıntılarını filtreleyin ve inceleyin.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} disabled={!filteredUsers.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" /> CSV indir</button>
            <button type="button" onClick={() => void loadUsers()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Yenile</button>
          </div>
        </header>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative md:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tüm kullanıcı ve firma bilgilerinde ara" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500" />
            </label>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm hesap tipleri</option><option value="admin">Yöneticiler</option><option value="standard">Standart kullanıcılar</option></select>
            <select value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm e-posta durumları</option><option value="confirmed">E-posta doğrulandı</option><option value="unconfirmed">E-posta doğrulanmadı</option></select>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm firma rolleri</option>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
            <select value={companyStatusFilter} onChange={(event) => setCompanyStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm firma durumları</option><option value="beklemede">Onay bekleyen</option><option value="onaylandi">Onaylanan</option><option value="reddedildi">Reddedilen</option></select>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm şehirler</option>{cities.map((city) => <option key={city}>{city}</option>)}</select>
            <select value={loginFilter} onChange={(event) => setLoginFilter(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">Tüm giriş durumları</option><option value="signed_in">Giriş yapmış</option><option value="never">Hiç giriş yapmamış</option></select>
            <label className="text-xs font-semibold text-slate-500">Başlangıç<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700" /></label>
            <label className="text-xs font-semibold text-slate-500">Bitiş<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700" /></label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="newest">En yeni kayıt</option><option value="oldest">En eski kayıt</option><option value="name">Ada göre</option><option value="last_sign_in">Son girişe göre</option></select>
            <button type="button" onClick={clearFilters} className="self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Filtreleri temizle</button>
          </div>
        </section>

        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-600">{filteredUsers.length} / {users.length} kullanıcı</p><p className="text-xs text-slate-400">Satıra basarak bilgileri açabilirsiniz.</p></div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(170px,1.2fr)_130px_150px_140px_44px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid">
            <span>Kullanıcı</span><span>Firma</span><span>Rol / Durum</span><span>Hesap</span><span>Son giriş</span><span />
          </div>

          {!loading && !filteredUsers.length && <div className="p-12 text-center text-sm text-slate-500">Filtreye uygun kullanıcı bulunamadı.</div>}

          {filteredUsers.map((user) => {
            const companies = user.companies ?? []
            const primaryCompany = companies[0]
            const expanded = expandedId === user.user_id
            return (
              <article key={user.user_id} className="border-b border-slate-100 last:border-b-0">
                <button type="button" onClick={() => setExpandedId(expanded ? null : user.user_id)} className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[minmax(180px,1.4fr)_minmax(170px,1.2fr)_130px_150px_140px_44px] lg:items-center">
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{user.full_name || 'İsimsiz kullanıcı'}</p><p className="truncate text-xs text-slate-500">{user.email || 'E-posta yok'}</p></div>
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{primaryCompany?.name || 'Firma yok'}</p><p className="truncate text-xs text-slate-400">{primaryCompany?.city || 'Şehir yok'}{companies.length > 1 ? ` · +${companies.length - 1} firma` : ''}</p></div>
                  <div className="text-xs"><p className="font-semibold text-slate-700">{primaryCompany ? roleLabel(primaryCompany.role) : '—'}</p><p className="text-slate-500">{primaryCompany ? statusLabel(primaryCompany.status) : '—'}</p></div>
                  <div className="flex flex-wrap gap-1.5">{user.is_admin && <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700"><ShieldCheck className="h-3 w-3" /> Admin</span>}<span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${user.email_confirmed_at ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{user.email_confirmed_at ? 'Doğrulandı' : 'Doğrulanmadı'}</span></div>
                  <p className="text-xs text-slate-500">{dateText(user.last_sign_in_at)}</p>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="bg-slate-50/70 px-4 py-5">
                    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
                      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                        <div><dt className="text-xs text-slate-400">Kullanıcı ID</dt><dd className="mt-1 break-all font-medium text-slate-700">{user.user_id}</dd></div>
                        <div><dt className="text-xs text-slate-400">Hesap oluşturulma</dt><dd className="mt-1 font-medium text-slate-700">{dateText(user.auth_created_at)}</dd></div>
                        <div><dt className="text-xs text-slate-400">E-posta doğrulama</dt><dd className="mt-1 font-medium text-slate-700">{dateText(user.email_confirmed_at)}</dd></div>
                        <div><dt className="text-xs text-slate-400">Son giriş</dt><dd className="mt-1 font-medium text-slate-700">{dateText(user.last_sign_in_at)}</dd></div>
                      </dl>
                      <div className="space-y-3">
                        {companies.length ? companies.map((company) => (
                          <div key={company.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap justify-between gap-2"><p className="font-bold text-slate-900">{company.name}</p><p className="text-xs font-semibold text-slate-500">{roleLabel(company.role)} · {statusLabel(company.status)}</p></div>
                            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-3"><p>Şehir: <strong>{company.city || '—'}</strong></p><p>Telefon: <strong>{company.phone || '—'}</strong></p><p>E-posta: <strong>{company.email || '—'}</strong></p><p>Vergi no: <strong>{company.tax_no || '—'}</strong></p><p>Web: <strong>{company.website || '—'}</strong></p><p>Firma ID: <strong className="break-all">{company.id}</strong></p></div>
                          </div>
                        )) : <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Bağlı firma bulunmuyor.</p>}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end"><Link href={`/admin/kullanicilar/${user.user_id}`} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"><ExternalLink className="h-3.5 w-3.5" /> Yönetim detayını aç</Link></div>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}
