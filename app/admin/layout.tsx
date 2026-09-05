'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Building2, Megaphone, Users, Settings, ArrowLeft } from 'lucide-react'

const ADMIN_NAV = [
  { href: '/admin/firmalar', label: 'Firmalar', icon: Building2, enabled: true },
  { href: '/admin/ilanlar', label: 'İlanlar', icon: Megaphone, enabled: false },
  { href: '/admin/kullanicilar', label: 'Kullanıcılar', icon: Users, enabled: false },
  { href: '/admin/ayarlar', label: 'Ayarlar', icon: Settings, enabled: false },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    checkAccess()
  }, [])

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/auth')
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()

    setIsAdmin(!!profile?.is_admin)
    setChecking(false)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Kontrol ediliyor...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center">
          <h1 className="text-lg font-bold text-slate-900 mb-2">Erişim Yetkiniz Yok</h1>
          <p className="text-sm text-slate-500">
            Bu alan sadece platform yöneticileri içindir.
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            ← Borsaya Dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Admin Sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950">
        <div className="h-16 flex items-center gap-2 border-b border-navy-800 px-6">
          <span className="text-sm font-semibold text-white">
            Yönetim <span className="text-tarim-500">Paneli</span>
          </span>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1">
          {ADMIN_NAV.map(({ href, label, icon: Icon, enabled }) => {
            const isActive = pathname === href

            if (!enabled) {
              return (
                <div
                  key={href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 cursor-not-allowed"
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {label}
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-700">
                    Yakında
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-tarim-600/15 text-tarim-400'
                    : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                }`}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-navy-800 p-4">
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Ana Siteye Dön
          </Link>
        </div>
      </aside>

      {/* İçerik */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}