'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Notification = { id: string; title: string; message: string; link: string | null; read_at: string | null; created_at: string }

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await supabase.from('notifications').select('id, title, message, link, read_at, created_at').order('created_at', { ascending: false }).limit(100)
    if (loadError) setError(`Bildirimler yüklenemedi: ${loadError.message}`)
    setItems((data ?? []) as Notification[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const markRead = async (id: string) => {
    await supabase.rpc('mark_notification_read', { p_notification_id: id })
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item))
  }

  const markAll = async () => {
    await supabase.rpc('mark_all_notifications_read')
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })))
  }

  const unread = items.filter((item) => !item.read_at).length

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold text-emerald-600">Hesap merkezi</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Bildirimler</h1><p className="mt-1 text-sm text-slate-500">Başvuru, ilan ve ticari işlemlerinizdeki gelişmeleri takip edin.</p></div>
        <div className="flex gap-2">
          <button onClick={() => void markAll()} disabled={!unread} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><CheckCheck className="h-4 w-4" /> Tümünü okundu yap</button>
          <button onClick={() => void load()} className="rounded-xl bg-slate-900 p-2.5 text-white" aria-label="Bildirimleri yenile"><RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <p className="text-sm font-semibold text-slate-600">{unread} okunmamış · {items.length} bildirim</p>
      <section className="space-y-3">
        {!loading && !items.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500"><Bell className="mx-auto mb-3 h-8 w-8" />Henüz bildiriminiz yok.</div>}
        {items.map((item) => (
          <article key={item.id} className={`rounded-2xl border p-5 shadow-sm ${item.read_at ? 'border-slate-200 bg-white' : 'border-emerald-300 bg-emerald-50'}`}>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
              <div><div className="flex items-center gap-2"><h2 className="font-bold text-slate-900">{item.title}</h2>{!item.read_at && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</div><p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('tr-TR')}</p></div>
              <div className="flex shrink-0 gap-2">{!item.read_at && <button onClick={() => void markRead(item.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Okundu</button>}{item.link && <Link href={item.link} onClick={() => void markRead(item.id)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Kaydı aç</Link>}</div>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
