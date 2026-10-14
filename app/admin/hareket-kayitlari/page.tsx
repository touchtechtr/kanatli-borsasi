'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  Building2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FilterX,
  RefreshCw,
  Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type AuditRow = {
  id: string
  occurred_at: string
  actor_user_id: string | null
  actor_email: string | null
  subject_user_id: string | null
  subject_email: string | null
  company_id: string | null
  company_name: string | null
  module: string
  source_table: string
  entity_id: string | null
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  action: string
  record_title: string | null
  summary: string
  old_status: string | null
  new_status: string | null
  details: { onceki?: Record<string, unknown>; sonraki?: Record<string, unknown> }
}

const ALL = 'Tümü'

function getAuditHref(row: AuditRow) {
  switch (row.source_table) {
    case 'listing_promotions':
      return '/admin/ilan-promosyonlari'
    case 'listings':
    case 'feed_listings':
    case 'livestock_listings':
      return row.entity_id
        ? `/admin/ilanlar/${row.source_table}/${row.entity_id}`
        : '/admin/ilanlar'
    case 'trade_offers':
      return row.entity_id
        ? `/admin/teklifler/${row.entity_id}`
        : '/admin/teklifler'
    case 'companies':
      return '/admin/firmalar'
    case 'company_activity_applications':
    case 'company_activity_documents':
    case 'company_activities':
      return '/admin/faaliyetler'
    case 'contract_farming':
      return '/admin/sozlesmeler'
    case 'slaughterhouses':
      return '/admin/kesimhaneler'
    case 'slaughter_appointments':
      return '/admin/randevular'
    case 'expert_requests':
      return '/admin/ekspertiz'
    case 'wallet_accounts':
    case 'wallet_transactions':
      return row.subject_user_id
        ? `/admin/kullanicilar/${row.subject_user_id}`
        : '/admin/kullanicilar'
    case 'trade_payments':
      return '/admin/finans'
    case 'platform_staff':
    case 'company_members':
      return '/admin/personel'
    default:
      return null
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export default function AdminAuditLogPage() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState(ALL)
  const [actionFilter, setActionFilter] = useState(ALL)
  const [companyFilter, setCompanyFilter] = useState(ALL)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await supabase
      .from('platform_audit_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(1000)
    if (loadError) {
      setRows([])
      setError(`Hareket kayıtları yüklenemedi: ${loadError.message}`)
    } else {
      setRows((data ?? []) as AuditRow[])
      await supabase.rpc('admin_mark_audit_seen')
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const modules = useMemo(() => Array.from(new Set(rows.map((row) => row.module))).sort((a, b) => a.localeCompare(b, 'tr')), [rows])
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => row.action))).sort((a, b) => a.localeCompare(b, 'tr')), [rows])
  const companies = useMemo(() => Array.from(new Set(rows.map((row) => row.company_name).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, 'tr')), [rows])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    return rows.filter((row) => {
      const text = [row.summary, row.record_title, row.actor_email, row.subject_email, row.company_name, row.entity_id]
        .filter(Boolean).join(' ').toLocaleLowerCase('tr-TR')
      const day = row.occurred_at.slice(0, 10)
      return (!needle || text.includes(needle)) &&
        (moduleFilter === ALL || row.module === moduleFilter) &&
        (actionFilter === ALL || row.action === actionFilter) &&
        (companyFilter === ALL || row.company_name === companyFilter) &&
        (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo)
    })
  }, [actionFilter, companyFilter, dateFrom, dateTo, moduleFilter, query, rows])

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = rows.filter((row) => row.occurred_at.slice(0, 10) === today).length
  const statusCount = rows.filter((row) => row.action === 'Durum değişti').length

  const reset = () => {
    setQuery(''); setModuleFilter(ALL); setActionFilter(ALL)
    setCompanyFilter(ALL); setDateFrom(''); setDateTo('')
  }

  const downloadCsv = () => {
    const header = ['Tarih','Modül','İşlem','Kayıt','Şirket','İşlemi yapan','İlgili hesap','Önceki durum','Yeni durum','Kayıt ID']
    const lines = filtered.map((row) => [
      new Date(row.occurred_at).toLocaleString('tr-TR'), row.module, row.action,
      row.record_title, row.company_name, row.actor_email, row.subject_email,
      row.old_status, row.new_status, row.entity_id,
    ].map(csvCell).join(';'))
    const blob = new Blob(['\uFEFF' + [header.map(csvCell).join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `platform-hareketleri-${today}.csv`; anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">Denetim merkezi</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Platform Hareket Kayıtları</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Şirketlerin ve kullanıcıların ilan, teklif, faaliyet, randevu, ekspertiz, sözleşme ve finans hareketlerini tarihçeli olarak inceleyin.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={downloadCsv} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><Download className="h-4 w-4" />CSV indir</button>
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Yenile</button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Toplam kayıt" value={rows.length} />
          <Stat label="Bugünkü hareket" value={todayCount} accent />
          <Stat label="Durum değişikliği" value={statusCount} />
        </section>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Şirket, kullanıcı, ilan, kayıt veya ID ara..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-400" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Select value={moduleFilter} onChange={setModuleFilter} options={[ALL, ...modules]} />
            <Select value={actionFilter} onChange={setActionFilter} options={[ALL, ...actions]} />
            <Select value={companyFilter} onChange={setCompanyFilter} options={[ALL, ...companies]} />
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" title="Başlangıç tarihi" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" title="Bitiş tarihi" />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span><strong className="text-slate-800">{filtered.length}</strong> hareket gösteriliyor</span>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-slate-900"><FilterX className="h-4 w-4" />Filtreleri temizle</button>
          </div>
        </section>

        <section className="space-y-3">
          {!loading && !filtered.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500"><Activity className="mx-auto mb-3 h-9 w-9" />Henüz filtreye uygun hareket bulunmuyor.</div>}
          {filtered.map((row) => {
            const open = expandedId === row.id
            const relatedHref = getAuditHref(row)
            return <article key={row.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => setExpandedId(open ? null : row.id)} className="flex w-full flex-col gap-3 p-4 text-left md:flex-row md:items-center">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Activity className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">{row.module}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.action === 'Durum değişti' ? 'bg-amber-100 text-amber-800' : row.action === 'Oluşturuldu' ? 'bg-emerald-100 text-emerald-800' : row.action === 'Silindi' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{row.action}</span></div>
                  <h2 className="mt-2 truncate font-bold text-slate-900">{row.record_title || row.summary}</h2>
                  <p className="mt-1 text-xs text-slate-500">{row.company_name || 'Şirket bilgisi yok'} · {new Date(row.occurred_at).toLocaleString('tr-TR')}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500"><span>{row.actor_email || 'Sistem'}</span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
              </button>
              {open && <div className="border-t border-slate-200 bg-slate-50 p-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="İşlemi yapan" value={row.actor_email || 'Sistem'} />
                  <Detail label="İlgili hesap" value={row.subject_email || '—'} />
                  <Detail label="Şirket" value={row.company_name || '—'} />
                  <Detail label="Kaynak" value={row.source_table} />
                  <Detail label="Önceki durum" value={row.old_status || '—'} />
                  <Detail label="Yeni durum" value={row.new_status || '—'} />
                  <Detail label="İşlem türü" value={row.operation} />
                  <Detail label="Kayıt ID" value={row.entity_id || '—'} mono />
                </div>
                {relatedHref && <div className="mt-5 flex justify-end">
                  <Link href={relatedHref} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700">
                    İlgili yönetim sayfasına git
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>}
              </div>}
            </article>
          })}
        </section>
      </div>
    </main>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select>
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}><p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-emerald-700' : 'text-slate-400'}`}>{label}</p><p className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-900' : 'text-slate-900'}`}>{value}</p></div>
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 break-all text-sm font-semibold text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p></div>
}
