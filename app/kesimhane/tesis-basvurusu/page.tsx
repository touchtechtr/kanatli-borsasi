'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Company = { id: string; name: string; role: string; status: string }
type Facility = { id: string; name: string; city: string; daily_capacity: number; species: string | null; status: string; admin_note: string | null; created_at: string }

export default function SlaughterhouseApplicationPage() {
  const supabase = useMemo(() => createClient(), [])
  const [companies, setCompanies] = useState<Company[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [capacity, setCapacity] = useState('')
  const [species, setSpecies] = useState('Broyler / Piliç')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.replace('/auth'); return }

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('id, name, role, status')
      .eq('user_id', user.id)
      .order('name')

    if (companyError) {
      setErrorMessage(`Firmalar yüklenemedi: ${companyError.message}`)
      setLoading(false)
      return
    }

    const companyIds = (companyData ?? []).map((company) => company.id)
    const { data: activityData, error: activityError } = companyIds.length
      ? await supabase.from('company_activities').select('company_id').in('company_id', companyIds).eq('activity_code', 'slaughterhouse_operator').eq('status', 'aktif')
      : { data: [], error: null }
    if (activityError) setErrorMessage(`Faaliyet yetkileri yüklenemedi: ${activityError.message}`)
    const eligibleIds = new Set((activityData ?? []).map((item) => item.company_id))
    const eligible = (companyData ?? []).filter((company) => eligibleIds.has(company.id) && company.status === 'onaylandi') as Company[]
    setCompanies(eligible)
    setSelectedCompanyId((current) => current || eligible[0]?.id || '')

    const ids = companyIds
    const { data: facilityData, error: facilityError } = ids.length
      ? await supabase.from('slaughterhouses').select('id, name, city, daily_capacity, species, status, admin_note, created_at').in('company_id', ids).order('created_at', { ascending: false })
      : { data: [], error: null }

    if (facilityError) setErrorMessage(`Tesis başvuruları yüklenemedi: ${facilityError.message}`)
    setFacilities((facilityData ?? []) as Facility[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadData() }, [loadData])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCompanyId) return
    setLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    const { error } = await supabase.from('slaughterhouses').insert({
      company_id: selectedCompanyId,
      name: name.trim(),
      city: city.trim(),
      daily_capacity: Number(capacity),
      species: species.trim(),
      status: 'Beklemede',
    })
    if (error) {
      setErrorMessage(`Başvuru oluşturulamadı: ${error.message}`)
      setLoading(false)
      return
    }
    setName(''); setCity(''); setCapacity(''); setSpecies('Broyler / Piliç')
    setSuccessMessage('Tesis başvurusu yönetici incelemesine gönderildi.')
    await loadData()
  }

  const remove = async (facility: Facility) => {
    if (!confirm(`${facility.name} başvurusunu kaldırmak istiyor musunuz?`)) return
    const { error } = await supabase.from('slaughterhouses').delete().eq('id', facility.id)
    if (error) setErrorMessage(`Başvuru kaldırılamadı: ${error.message}`)
    else await loadData()
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10"><div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-violet-600">Entegre tesis</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Kesimhane Tesis Başvurusu</h1><p className="mt-2 text-sm text-slate-500">Tesisinizi kaydedin ve yönetici onayına gönderin.</p></div><div className="flex gap-2"><Link href="/kesimhane" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">← Kesimhanelere dön</Link><button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Yenile</button></div></div>
      {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}{successMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{successMessage}</div>}

      {companies.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-bold text-amber-900">Onaylı entegre firma bulunmuyor</h2><p className="mt-2 text-sm text-amber-800">Tesis başvurusu oluşturmak için firma rolünüzün entegre olması ve yönetici tarafından onaylanması gerekir.</p><Link href="/profil" className="mt-4 inline-flex rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white">Firma profiline git</Link></div> : <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2"><h2 className="md:col-span-2 text-lg font-bold text-slate-900">Yeni tesis başvurusu</h2><label className="text-xs font-semibold uppercase text-slate-500">Firma<select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-800">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-xs font-semibold uppercase text-slate-500">Tesis adı<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-800" /></label><label className="text-xs font-semibold uppercase text-slate-500">Şehir<input required value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-800" /></label><label className="text-xs font-semibold uppercase text-slate-500">Günlük kapasite<input required min="1" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-800" /></label><label className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">Hayvan türü<input required value={species} onChange={(event) => setSpecies(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal text-slate-800" /></label><div className="md:col-span-2 flex justify-end"><button disabled={loading} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Yönetici incelemesine gönder</button></div></form>}

      <section className="space-y-3"><h2 className="text-lg font-bold text-slate-900">Tesislerim ({facilities.length})</h2>{!facilities.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Henüz tesis başvurusu bulunmuyor.</div>}{facilities.map((facility) => <article key={facility.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-violet-600" /><h3 className="font-bold text-slate-900">{facility.name}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{facility.status}</span></div><p className="mt-2 text-sm text-slate-500">{facility.city} · {facility.species} · Günlük {Number(facility.daily_capacity).toLocaleString('tr-TR')} adet</p>{facility.admin_note && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Yönetim notu: {facility.admin_note}</p>}</div>{['Beklemede', 'Reddedildi'].includes(facility.status) && <button onClick={() => void remove(facility)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Başvuruyu kaldır</button>}</div></article>)}</section>
    </div></main>
  )
}
