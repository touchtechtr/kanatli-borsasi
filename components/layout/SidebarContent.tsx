'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpenText,
  ClipboardCheck,
  Factory,
  Feather,
  FileSignature,
  Handshake,
  Landmark,
  LayoutDashboard,
  TrendingUp,
  UserCircle,
  Wallet,
  Wheat,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS } from '@/constants/company'
import type { CompanyRole } from '@/types/company'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
}

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarAccount = {
  authenticated: boolean
  name: string
  label: string
  initials: string
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Genel Bakış',
    items: [
      {
        href: '/',
        label: 'Anasayfa',
        icon: LayoutDashboard,
      },
      {
        href: '/borsa',
        label: 'Canlı Borsa',
        icon: TrendingUp,
      },
    ],
  },
  {
    title: 'Ticaret & Üretim',
    items: [
      {
        href: '/ciftci-paneli',
        label: 'Çiftçi Paneli',
        icon: Wheat,
      },
      {
        href: '/tuccar-paneli',
        label: 'Tüccar Paneli',
        icon: Handshake,
      },
      {
        href: '/sozlesme-yonetimi',
        label: 'Sözleşmeli Üretim',
        icon: FileSignature,
      },
      {
        href: '/kesimhane',
        label: 'Kesimhane',
        icon: Factory,
      },
    ],
  },
  {
    title: 'Danışmanlık & Bilgi',
    items: [
      {
        href: '/ekspertiz',
        label: 'Ekspertiz',
        icon: ClipboardCheck,
      },
      {
        href: '/teknik-merkez',
        label: 'Teknik Merkez',
        icon: BookOpenText,
      },
      {
        href: '/sektor-konseyi',
        label: 'Sektör Konseyi',
        icon: Landmark,
      },
    ],
  },
  {
    title: 'Hesabım',
    items: [
      {
        href: '/cuzdan',
        label: 'Finans / Cüzdan',
        icon: Wallet,
      },
      {
        href: '/profil',
        label: 'Profil',
        icon: UserCircle,
      },
    ],
  },
]

const GUEST_ACCOUNT: SidebarAccount = {
  authenticated: false,
  name: 'Misafir',
  label: 'Giriş yapılmadı',
  initials: 'M',
}

export default function SidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const supabase = createClient()

  const [account, setAccount] =
    useState<SidebarAccount>(GUEST_ACCOUNT)

  useEffect(() => {
    let mounted = true

    const loadAccount = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted) return

      if (!user) {
        setAccount(GUEST_ACCOUNT)
        return
      }

      const [
        { data: profile },
        { data: company },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, is_admin')
          .eq('id', user.id)
          .maybeSingle(),

        supabase
          .from('companies')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      if (!mounted) return

      const fullName =
        profile?.full_name?.trim() ||
        user.user_metadata?.full_name?.trim() ||
        user.email?.split('@')[0] ||
        'Kullanıcı'

      const initials =
        fullName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part: string) => part[0])
          .join('')
          .toLocaleUpperCase('tr-TR') || 'K'

      const role = company?.role as
        | CompanyRole
        | undefined

      const accountLabel = profile?.is_admin
        ? 'Yönetici Hesabı'
        : role
          ? `${ROLE_LABELS[role] || role} Hesabı`
          : 'Kullanıcı Hesabı'

      setAccount({
        authenticated: true,
        name: fullName,
        label: accountLabel,
        initials,
      })
    }

    loadAccount()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAccount()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <>
      <div className="flex h-16 flex-shrink-0 items-center gap-2 border-b border-navy-800 px-6">
        <Feather
          className="h-6 w-6 text-tarim-500"
          strokeWidth={2.5}
        />

        <span className="text-lg font-semibold tracking-tight text-white">
          Kanatlı
          <span className="text-tarim-500">
            Borsa
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              {group.title}
            </p>

            <div className="space-y-1">
              {group.items.map(
                ({
                  href,
                  label,
                  icon: Icon,
                }) => {
                  const isActive =
                    pathname === href

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-tarim-600/15 text-tarim-400'
                          : 'text-slate-400 hover:bg-navy-800 hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`h-[18px] w-[18px] flex-shrink-0 ${
                          isActive
                            ? 'text-tarim-500'
                            : 'text-slate-500 group-hover:text-tarim-500'
                        }`}
                      />

                      {label}

                      {isActive && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-tarim-500" />
                      )}
                    </Link>
                  )
                }
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-navy-800 p-4">
        <Link
          href={
            account.authenticated
              ? '/profil'
              : '/auth'
          }
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg bg-navy-900 px-3 py-2.5 transition-colors hover:bg-navy-800"
        >
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-tarim-600 text-sm font-semibold text-white">
            {account.initials}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {account.name}
            </p>

            <p className="truncate text-xs text-slate-500">
              {account.label}
            </p>
          </div>
        </Link>
      </div>
    </>
  )
}