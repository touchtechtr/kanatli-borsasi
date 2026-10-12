'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BadgeCheck, Bell, Building2, History, LayoutDashboard, ShieldCheck, Wallet } from 'lucide-react'

const ITEMS = [
  { href: '/profil', label: 'Genel Bakış', icon: LayoutDashboard, exact: true },
  { href: '/profil/sirket', label: 'Şirket Bilgilerim', icon: Building2 },
  { href: '/profil/faaliyetler', label: 'Faaliyetler ve Belgeler', icon: BadgeCheck },
  { href: '/profil/islem-gecmisi', label: 'İşlem Geçmişim', icon: History },
  { href: '/profil/cuzdan', label: 'Finans / Cüzdan', icon: Wallet },
  { href: '/profil/bildirimler', label: 'Bildirimler', icon: Bell },
  { href: '/profil/guvenlik', label: 'Güvenlik', icon: ShieldCheck },
]

export default function ProfileNavigation() {
  const pathname = usePathname()
  return <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{ITEMS.map(({ href, label, icon: Icon, exact }) => { const active = exact ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{label}</Link> })}</nav>
}
