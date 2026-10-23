'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Mail, RefreshCw, RotateCcw, Search, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PlatformUI'
import { dispatchNotificationEmails } from '@/lib/dispatch-notification-emails'

type MailRow = {
  id: string; recipient_email: string; subject: string; title: string; message: string
  link: string | null; status: string; attempt_count: number; last_error: string | null
  sent_at: string | null; created_at: string; updated_at: string
}

const labels: Record<string, string> = { beklemede: 'Bekliyor', gonderildi: 'Gönderildi', hata: 'Başarısız' }

export default function AdminEmailQueuePage() {
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<MailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('tumu')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const { data, error: loadError } = await supabase.from('notification_email_outbox').select('id,recipient_email,subject,title,message,link,status,attempt_count,last_error,sent_at,created_at,updated_at').order('created_at', { ascending: false }).limit(1000)
    if (loadError) { setRows([]); setError(loadError.message) } else setRows((data ?? []) as MailRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => rows.filter((row) => {
    const needle = query.trim().toLocaleLowerCase('tr-TR')
    const text = `${row.recipient_email} ${row.subject} ${row.title} ${row.message} ${row.last_error ?? ''}`.toLocaleLowerCase('tr-TR')
    return (status === 'tumu' || row.status === status) && (!needle || text.includes(needle))
  }), [query, rows, status])

  const counts = (value: string) => rows.filter((row) => row.status === value).length

  const dispatch = async (limit: number) => {
    if (limit > 1 && !confirm(`Bekleyen en fazla ${limit} e-posta gönderilecek. Devam edilsin mi?`)) return
    setBusy(limit === 1 ? 'sample' : 'all')
    setError(null); setNotice(null)
    const result = await dispatchNotificationEmails(supabase, { limit, bypassCooldown: true })
    if (result) setNotice(`${result.mode === 'test' ? 'TEST modu' : 'CANLI mod'} · ${result.sent} gönderildi · ${result.failed} başarısız · ${result.processed} işlendi`)
    else setError('E-posta gönderimi başlatılamadı. Oturumu ve sunucu kayıtlarını kontrol edin.')
    await load()
    setBusy(null)
  }

  const retry = async (row: MailRow) => {
    setBusy(row.id); setError(null); setNotice(null)
    if (row.status === 'hata') {
      const { error: retryError } = await supabase.rpc('admin_retry_email', { p_outbox_id: row.id })
      if (retryError) { setError(retryError.message); setBusy(null); return }
    }
    const result = await dispatchNotificationEmails(supabase, { outboxId: row.id, limit: 1, bypassCooldown: true })
    if (result?.sent === 1) setNotice(`${result.mode === 'test' ? 'TEST modu' : 'CANLI mod'} · Seçilen e-posta gönderildi.`)
    else if (result) setError(`Seçilen kayıt gönderilemedi. Başarısız: ${result.failed}`)
    else setError('E-posta gönderimi başlatılamadı.')
    await load()
    setBusy(null)
  }

  return <main className="ui-page-shell"><div className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow="İletişim ve teslimat denetimi" title="E-posta Kuyruğu" description="Bildirim e-postalarının teslim durumunu, hata nedenlerini ve yeniden gönderimlerini yönetin." icon={Mail} tone="emerald" actions={<><button onClick={() => void load()} className="ui-button ui-button--secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Yenile</button><button onClick={() => void dispatch(1)} disabled={busy !== null} className="ui-button ui-button--secondary"><Send className="h-4 w-4" />1 e-posta dene</button><button onClick={() => void dispatch(25)} disabled={busy !== null} className="ui-button ui-button--primary"><Send className="h-4 w-4" />Kuyruğu çalıştır</button></>} />
    <section className="grid gap-3 sm:grid-cols-3"><Card label="Bekleyen" value={counts('beklemede')} icon={Clock3} tone="yellow" /><Card label="Gönderilen" value={counts('gonderildi')} icon={CheckCircle2} tone="green" /><Card label="Başarısız" value={counts('hata')} icon={AlertCircle} tone="red" /></section>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</div>}
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Alıcı, başlık, içerik veya hata ara..." className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 text-sm" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border px-3 text-sm"><option value="tumu">Tüm durumlar</option><option value="beklemede">Bekleyen</option><option value="gonderildi">Gönderilen</option><option value="hata">Başarısız</option></select></div><p className="mt-3 text-xs text-slate-500">{filtered.length} / {rows.length} kayıt</p></section>
    <section className="space-y-3">{!loading && filtered.length === 0 && <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-slate-400"><Mail className="mx-auto mb-3 h-9 w-9" />E-posta kaydı bulunamadı.</div>}{filtered.map((row) => <article key={row.id} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge status={row.status} /><span className="text-xs text-slate-400">{new Date(row.created_at).toLocaleString('tr-TR')}</span><span className="text-xs text-slate-400">Deneme: {row.attempt_count}</span></div><h2 className="mt-2 truncate font-extrabold text-slate-900">{row.subject}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{row.recipient_email}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{row.message}</p>{row.last_error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{row.last_error}</p>}</div>{row.status !== 'gonderildi' && <button onClick={() => void retry(row)} disabled={busy !== null} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Bu e-postayı gönder</button>}</div></article>)}</section>
  </div></main>
}

function Badge({ status }: { status: string }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${status === 'hata' ? 'bg-red-100 text-red-700' : status === 'beklemede' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{labels[status] ?? status}</span> }
function Card({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Mail; tone: 'yellow'|'green'|'red' }) { const style = tone === 'red' ? 'bg-red-50 text-red-700 border-red-200' : tone === 'yellow' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'; return <div className={`flex items-center justify-between rounded-2xl border p-5 ${style}`}><div><p className="text-xs font-bold uppercase tracking-wide">{label}</p><p className="mt-1 text-3xl font-extrabold">{value}</p></div><Icon className="h-7 w-7" /></div> }
