'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Activity = { id: string; title: string; message: string; link: string | null; created_at: string; read_at: string | null }

export default function ActivityHistoryPage() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Activity[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setLoading(true); const { data } = await supabase.from('notifications').select('id, title, message, link, created_at, read_at').order('created_at', { ascending: false }).limit(250); setItems((data ?? []) as Activity[]); setLoading(false) }, [supabase])
  useEffect(() => { void load() }, [load])
  const filtered = items.filter((item) => `${item.title} ${item.message}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')))
  return <main className="space-y-5"><header className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-600">Hesap merkezi</p><h1 className="mt-1 text-3xl font-bold text-slate-900">İşlem Geçmişim</h1><p className="mt-1 text-sm text-slate-500">Başvuru, ilan, teklif ve yönetim hareketlerinizin kronolojik kaydı.</p></div><button onClick={() => void load()} className="rounded-xl bg-slate-900 p-3 text-white"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></header><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="İşlem geçmişinde ara" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm" /><section className="rounded-2xl border border-slate-200 bg-white shadow-sm">{!loading && !filtered.length && <div className="p-12 text-center text-slate-500"><History className="mx-auto mb-3 h-8 w-8" />Henüz kayıtlı işlem bulunmuyor.</div>}<div className="divide-y divide-slate-100">{filtered.map((item) => <div key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-bold text-slate-900">{item.title}</h2>{!item.read_at && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Yeni</span>}</div><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('tr-TR')}</p></div>{item.link && <Link href={item.link} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Kaydı aç</Link>}</div>)}</div></section></main>
}
