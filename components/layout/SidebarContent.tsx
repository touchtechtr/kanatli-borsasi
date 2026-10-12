'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpenText,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  ChevronDown,
  ClipboardCheck,
  Crown,
  Factory,
  Feather,
  FileSignature,
  Handshake,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Microscope,
  MailWarning,
  PackageSearch,
  ShieldCheck,
  ScrollText,
  TrendingUp,
  Users,
  UserCircle,
  Wheat,
  SlidersHorizontal,
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
  isAdmin: boolean
  name: string
  label: string
  initials: string
}

type AdminBadge = { value: number; tone: 'red' | 'yellow' | 'green' | 'blue' }
type AdminCounts = Record<string, AdminBadge[]>

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Genel Bakış',
    items: [
      { href: '/', label: 'Anasayfa', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Ticaret & Üretim',
    items: [
      { href: '/ciftci-paneli', label: 'Çiftçi Paneli', icon: Wheat },
      { href: '/tuccar-paneli', label: 'Tüccar Paneli', icon: Handshake },
      { href: '/borsa', label: 'Piyasa Fiyatları', icon: TrendingUp },
      {
        href: '/sozlesme-yonetimi',
        label: 'Sözleşmeli Üretim',
        icon: FileSignature,
      },
      { href: '/kesimhane', label: 'Kesimhane', icon: Factory },
    ],
  },
  {
    title: 'Danışmanlık & Bilgi',
    items: [
      { href: '/ekspertiz', label: 'Ekspertiz', icon: ClipboardCheck },
      { href: '/teknik-merkez', label: 'Teknik Merkez', icon: BookOpenText },
      { href: '/sektor-konseyi', label: 'Sektör Konseyi', icon: Landmark },
    ],
  },
  {
    title: 'Hesabım',
    items: [
      { href: '/profil/ilanlarim', label: 'İlanlarım', icon: PackageSearch },
      { href: '/profil', label: 'Hesap Merkezi', icon: UserCircle },
    ],
  },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Genel Bakış', icon: LayoutDashboard },
  { href: '/admin/hareket-kayitlari', label: 'Hareket Kayıtları', icon: ScrollText },
  { href: '/admin/firmalar', label: 'Firmalar', icon: Building2 },
  { href: '/admin/faaliyetler', label: 'Faaliyetler', icon: BadgeCheck },
  { href: '/admin/ilanlar', label: 'İlanlar', icon: Megaphone },
  { href: '/admin/ilan-promosyonlari', label: 'Öne Çıkarma', icon: Crown },
  { href: '/admin/ilan-kurallari', label: 'İlan Kuralları', icon: SlidersHorizontal },
  { href: '/admin/teklifler', label: 'Teklifler', icon: Megaphone },
  { href: '/admin/randevular', label: 'Randevular', icon: CalendarCheck2 },
  { href: '/admin/ekspertiz', label: 'Ekspertiz Talepleri', icon: Microscope },
  { href: '/admin/kullanicilar', label: 'Kullanıcılar', icon: Users },
  { href: '/admin/sozlesmeler', label: 'Sözleşmeler', icon: FileSignature },
  { href: '/admin/kesimhaneler', label: 'Kesimhaneler', icon: Factory },
  { href: '/admin/eposta-kuyrugu', label: 'E-posta Kuyruğu', icon: MailWarning },
]

const GUEST_ACCOUNT: SidebarAccount = {
  authenticated: false,
  isAdmin: false,
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

  const [account, setAccount] = useState<SidebarAccount>(GUEST_ACCOUNT)
  const [managementOpen, setManagementOpen] = useState(
    pathname.startsWith('/admin')
  )
  const [adminCounts, setAdminCounts] = useState<AdminCounts>({})

  useEffect(() => {
    if (pathname.startsWith('/admin')) {
      setManagementOpen(true)
    }
  }, [pathname])

  useEffect(() => {
    if (!account.isAdmin) return
    let active = true
    const refreshCounts = async () => {
      const { data, error } = await supabase.rpc('admin_sidebar_counts')
      if (active && !error && data) setAdminCounts(data as AdminCounts)
    }
    void refreshCounts()
    return () => { active = false }
  }, [pathname, account.isAdmin])

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

      const [{ data: profile }, { data: company }] = await Promise.all([
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

      const role = company?.role as CompanyRole | undefined
      const isAdmin = Boolean(profile?.is_admin)

      setAccount({
        authenticated: true,
        isAdmin,
        name: fullName,
        label: isAdmin
          ? 'Yönetici Hesabı'
          : role
            ? `${ROLE_LABELS[role] || role} Hesabı`
            : 'Kullanıcı Hesabı',
        initials,
      })

      if (isAdmin) {
        const { data: countData, error: countError } = await supabase.rpc(
          'admin_sidebar_counts'
        )
        if (!countError && mounted && countData) {
          setAdminCounts(countData as AdminCounts)
        }
      } else {
        setAdminCounts({})
      }

    }

    void loadAccount()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadAccount()
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
          Kanatlı<span className="text-tarim-500">Borsa</span>
        </span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              {group.title}
            </p>

            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === '/'
                    ? pathname === '/'
                    : pathname === href || pathname.startsWith(`${href}/`)

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
              })}
            </div>
          </div>
        ))}

        {account.isAdmin && (
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Yönetim
            </p>

            <button
              type="button"
              onClick={() => setManagementOpen((current) => !current)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-tarim-600/15 text-tarim-400'
                  : 'text-slate-400 hover:bg-navy-800 hover:text-white'
              }`}
              aria-expanded={managementOpen}
            >
              <ShieldCheck className="h-[18px] w-[18px] flex-shrink-0 text-slate-500 group-hover:text-tarim-500" />
              Yönetim Paneli
              <ChevronDown
                className={`ml-auto h-4 w-4 transition-transform ${
                  managementOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {managementOpen && (
              <div className="ml-5 mt-1 space-y-1 border-l border-navy-700 pl-3">
                {ADMIN_ITEMS.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === '/admin'
                      ? pathname === '/admin'
                      : pathname.startsWith(href)

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-navy-800 text-tarim-400'
                          : 'text-slate-500 hover:bg-navy-800 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {(adminCounts[href] ?? []).map((badge, index) => badge.value > 0 && (
                        <span
                          key={`${href}-${index}`}
                          title={badge.tone === 'red' ? 'Sorunlu / reddedilen' : badge.tone === 'yellow' ? 'Bekleyen' : badge.tone === 'green' ? 'Aktif / tamamlanan' : 'Yeni / toplam'}
                          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-extrabold ${
                            badge.tone === 'red' ? 'bg-red-500 text-white' :
                            badge.tone === 'yellow' ? 'bg-amber-400 text-slate-950' :
                            badge.tone === 'green' ? 'bg-emerald-500 text-white' :
                            'bg-blue-500 text-white'
                          }`}
                        >
                          {badge.value > 99 ? '99+' : badge.value}
                        </span>
                      ))}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="flex-shrink-0 border-t border-navy-800 p-4">
        <Link
          href={account.authenticated ? '/profil' : '/auth'}
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
