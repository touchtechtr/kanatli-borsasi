'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BadgeCheck, Bell, Building2, FileText, Handshake, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PlatformUI'

type Summary = {
  company: any
  email: string
  isAdmin: boolean
  listings: number
  offers: number
  notifications: number
  balance: number
}

export default function ProfileOverviewPage() {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.replace('/auth'); return }

    const [{ data: profile }, { data: company }] = await Promise.all([
      supabase.from('profiles').select('is_admin, full_name').eq('id', user.id).maybeSingle(),
      supabase.from('companies').select('id, name, role, status, city, phone, rejection_count').eq('user_id', user.id).maybeSingle(),
    ])
    const [listingResult, feedResult, livestockResult, unreadResult, walletResult] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('feed_listings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('livestock_listings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
      supabase.rpc('get_my_wallet'),
    ])

    let offerCount = 0
    if (company?.id) {
      const { count } = await supabase.from('trade_offers').select('id', { count: 'exact', head: true }).or(`buyer_company_id.eq.${company.id},seller_company_id.eq.${company.id}`)
      offerCount = count ?? 0
    }
    if (walletResult.error && !walletResult.error.message.includes('does not exist')) setError(walletResult.error.message)

    setData({
      company,
      email: user.email ?? '—',
      isAdmin: Boolean(profile?.is_admin),
      listings: (listingResult.count ?? 0) + (feedResult.count ?? 0) + (livestockResult.count ?? 0),
      offers: offerCount,
      notifications: unreadResult.count ?? 0,
      balance: Number(walletResult.data?.balance ?? 0),
    })
  }, [supabase])

  useEffect(() => { void load() }, [load])
  if (!data) return <div className="rounded-2xl bg-white p-10 text-center text-slate-500">Hesap bilgileri yükleniyor…</div>

  const statusLabel = data.company?.status === 'onaylandi' ? 'Onaylı firma' : data.company?.status === 'reddedildi' ? 'Başvuru reddedildi' : 'Onay bekliyor'

  return (
    <main className="ui-page-shell">
      <PageHeader eyebrow="Şirket çalışma alanı" title="Profil Genel Bakış" description="Hesabınızı, şirketinizi ve ticari faaliyetlerinizi tek noktadan yönetin." icon={Building2} tone="emerald" />
      {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm text-slate-500">{data.email}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{data.company?.name ?? 'Firma kaydı bulunamadı'}</h2><p className="mt-2 text-sm text-slate-600">{data.company?.city ?? 'Şehir belirtilmedi'} · {data.company?.role ?? 'Rol belirtilmedi'}</p></div>
          <div className={`rounded-xl px-4 py-2 text-sm font-bold ${data.company?.status === 'onaylandi' ? 'bg-emerald-100 text-emerald-800' : data.company?.status === 'reddedildi' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{statusLabel}</div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={FileText} label="İlanlarım" value={data.listings} href="/profil/islem-gecmisi" />
        <Stat icon={Handshake} label="Ticari teklifler" value={data.offers} href="/profil/islem-gecmisi" />
        <Stat icon={Bell} label="Okunmamış bildirim" value={data.notifications} href="/profil/bildirimler" />
        <Stat icon={Wallet} label={data.isAdmin ? 'Platform komisyonu' : 'Cüzdan bakiyesi'} value={data.balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} href="/profil/cuzdan" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/profil/sirket" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"><Building2 className="h-6 w-6 text-emerald-600" /><h2 className="mt-3 font-bold text-slate-900">Şirket bilgilerini yönet</h2><p className="mt-1 text-sm text-slate-500">Unvan, rol, iletişim ve adres bilgilerini görüntüleyin veya güncelleyin.</p></Link>
        <Link href="/profil/faaliyetler" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"><BadgeCheck className="h-6 w-6 text-emerald-600" /><h2 className="mt-3 font-bold text-slate-900">Faaliyetler ve belgeler</h2><p className="mt-1 text-sm text-slate-500">Mevcut yetkilerinizi görün, yeni faaliyet başvurusu yapın ve belgelerinizi yönetin.</p></Link>
        {data.isAdmin && <Link href="/admin" className="rounded-2xl border border-violet-200 bg-violet-50 p-6"><h2 className="font-bold text-violet-900">Yönetim paneline geç</h2><p className="mt-1 text-sm text-violet-700">Başvuruları, ilanları ve ticari süreçleri yönetin.</p></Link>}
      </section>
    </main>
  )
}

function Stat({ icon: Icon, label, value, href }: { icon: typeof Wallet; label: string; value: string | number; href: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300"><Icon className="h-5 w-5 text-emerald-600" /><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></Link>
}
