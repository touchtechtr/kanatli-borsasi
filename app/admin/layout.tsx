'use client'

import { useEffect, useState } from 'react'
import {
  redirect,
  usePathname,
} from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const ADMIN_NAV = [
  {
    href: '/admin',
    label: 'Genel Bakış',
    icon: LayoutDashboard,
    enabled: true,
  },
  {
    href: '/admin/firmalar',
    label: 'Firmalar',
    icon: Building2,
    enabled: true,
  },
  {
    href: '/admin/ilanlar',
    label: 'İlanlar',
    icon: Megaphone,
    enabled: false,
  },
  {
    href: '/admin/kullanicilar',
    label: 'Kullanıcılar',
    icon: Users,
    enabled: false,
  },
  {
    href: '/admin/ayarlar',
    label: 'Ayarlar',
    icon: Settings,
    enabled: false,
  },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.replace('/auth')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error(
          'Admin yetki kontrolü başarısız:',
          error
        )
      }

      setIsAdmin(Boolean(profile?.is_admin))
      setChecking(false)
    }

    checkAccess()
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Kontrol ediliyor...
      </div>
    )
  }

  if (!isAdmin) {
    redirect('/profil')
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950">
        <div className="h-16 flex items-center gap-2 border-b border-navy-800 px-6">
          <span className="text-sm font-semibold text-white">
            Yönetim{' '}
            <span className="text-tarim-500">
              Paneli
            </span>
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {ADMIN_NAV.map(
            ({
              href,
              label,
              icon: Icon,
              enabled,
            }) => {
              const isActive =
                href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(href)

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
            }
          )}
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

      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}