'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  Crown,
  Factory,
  FileSignature,
  MailWarning,
  Megaphone,
  Microscope,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserCog,
  Users,
  Bell,
  BookOpenText,
  Bird,
  Home,
  Landmark,
  TrendingUp,
  Truck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader, PageShell } from '@/components/ui/PlatformUI'

type DashboardStats = {
  totalCompanies: number
  pendingCompanies: number
  pendingActivities: number
  approvedCompanies: number
  rejectedCompanies: number
  pendingListings: number
  pendingOffers: number
  pendingExpertRequests: number
  activeListings: number
  pendingAppointments: number
  pendingPurchaseRequests: number
}

type DashboardCard = {
  label: string
  value: number
  href: string
  icon: typeof Building2
  className: string
}

type ManagementModule = {
  label: string
  description: string
  href: string
  icon: typeof Building2
  roles: string[]
  count?: (stats: DashboardStats) => number
}

const ALL_STAFF = ['super_admin', 'moderator', 'finance', 'operations', 'auditor']
const MANAGEMENT_MODULES: ManagementModule[] = [
  { label: 'Firmalar', description: 'Firma başvuruları ve doğrulama durumları', href: '/admin/firmalar', icon: Building2, roles: ['super_admin', 'moderator'], count: (s) => s.pendingCompanies },
  { label: 'Faaliyetler', description: 'Faaliyet yetkileri ve belge başvuruları', href: '/admin/faaliyetler', icon: BadgeCheck, roles: ['super_admin', 'moderator'], count: (s) => s.pendingActivities },
  { label: 'İlanlar', description: 'Tüm ilanlar ve moderasyon işlemleri', href: '/admin/ilanlar', icon: Megaphone, roles: ['super_admin', 'moderator'], count: (s) => s.pendingListings },
  { label: 'Öne Çıkarma', description: 'Vitrin ve ilan promosyon talepleri', href: '/admin/ilan-promosyonlari', icon: Crown, roles: ['super_admin', 'moderator', 'finance'] },
  { label: 'İlan Kuralları', description: 'Otomatik moderasyon ve risk eşikleri', href: '/admin/ilan-kurallari', icon: SlidersHorizontal, roles: ['super_admin', 'moderator'] },
  { label: 'Teklifler', description: 'Ticari teklifler ve komisyon denetimi', href: '/admin/teklifler', icon: Tags, roles: ['super_admin', 'moderator', 'finance'], count: (s) => s.pendingOffers },
  { label: 'Finans ve Ödemeler', description: 'Ödeme havuzu, satıcı alacağı ve komisyonlar', href: '/admin/finans', icon: CircleDollarSign, roles: ['super_admin', 'finance'] },
  { label: 'Randevular', description: 'Kesimhane randevu başvuruları', href: '/admin/randevular', icon: CalendarCheck2, roles: ['super_admin', 'operations'], count: (s) => s.pendingAppointments },
  { label: 'Ekspertiz Talepleri', description: 'Ekspertiz başvuruları ve atamalar', href: '/admin/ekspertiz', icon: Microscope, roles: ['super_admin', 'operations'], count: (s) => s.pendingExpertRequests },
  { label: 'Kullanıcılar', description: 'Kullanıcı hesapları ve ayrıntıları', href: '/admin/kullanicilar', icon: Users, roles: ['super_admin', 'moderator'] },
  { label: 'Yönetim Personeli', description: 'Platform rolleri ve erişim yetkileri', href: '/admin/personel', icon: UserCog, roles: ['super_admin'] },
  { label: 'Sözleşmeler', description: 'Sözleşmeli üretim başvuruları', href: '/admin/sozlesmeler', icon: FileSignature, roles: ['super_admin', 'operations'] },
  { label: 'Kesimhaneler', description: 'Tesis başvuruları ve yayın durumları', href: '/admin/kesimhaneler', icon: Factory, roles: ['super_admin', 'operations'] },
  { label: 'Kesimhane Alımları', description: 'Toplu alım, teslim tutanağı, kanıt ve ödeme denetimi', href: '/admin/kesimhane-alimlari', icon: Truck, roles: ['super_admin', 'operations', 'finance'], count: (s) => s.pendingPurchaseRequests },
  { label: 'Bildirimler', description: 'Platform ve şirket bildirimleri', href: '/admin/bildirimler', icon: Bell, roles: ['super_admin'] },
  { label: 'E-posta Kuyruğu', description: 'Gönderim durumu ve teslimat hataları', href: '/admin/eposta-kuyrugu', icon: MailWarning, roles: ['super_admin', 'operations'] },
  { label: 'Hareket Kayıtları', description: 'Platform genelindeki denetim günlüğü', href: '/admin/hareket-kayitlari', icon: ScrollText, roles: ALL_STAFF },
]

const INITIAL_STATS: DashboardStats = {
  totalCompanies: 0,
  pendingCompanies: 0,
  pendingActivities: 0,
  approvedCompanies: 0,
  rejectedCompanies: 0,
  pendingListings: 0,
  pendingOffers: 0,
  pendingExpertRequests: 0,
  activeListings: 0,
  pendingAppointments: 0,
  pendingPurchaseRequests: 0,
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [staffRole, setStaffRole] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    const [
      totalCompaniesResult,
      pendingCompaniesResult,
      pendingActivitiesResult,
      approvedCompaniesResult,
      rejectedCompaniesResult,
      pendingGeneralListingsResult,
      pendingFeedListingsResult,
      pendingLivestockListingsResult,
      pendingOffersResult,
      pendingExpertRequestsResult,
      listingsResult,
      livestockResult,
      feedResult,
      appointmentsResult,
      pendingPurchaseRequestsResult,
    ] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'beklemede'),
      supabase
        .from('company_activity_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'inceleme_bekliyor'),
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'onaylandi'),
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'reddedildi'),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('moderation_status', 'inceleme_bekliyor'),
      supabase
        .from('feed_listings')
        .select('id', { count: 'exact', head: true })
        .eq('moderation_status', 'inceleme_bekliyor'),
      supabase
        .from('livestock_listings')
        .select('id', { count: 'exact', head: true })
        .eq('moderation_status', 'inceleme_bekliyor'),
      supabase
        .from('trade_offers')
        .select('id', { count: 'exact', head: true })
        .eq('admin_status', 'beklemede'),
      supabase
        .from('expert_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'beklemede'),
      supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aktif'),
      supabase
        .from('livestock_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aktif'),
      supabase
        .from('feed_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'aktif'),
      supabase
        .from('slaughter_appointments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Onay Bekliyor'),
      supabase
        .from('slaughterhouse_purchase_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'inceleme_bekliyor'),
    ])

    const firstError = [
      totalCompaniesResult.error,
      pendingCompaniesResult.error,
      pendingActivitiesResult.error,
      approvedCompaniesResult.error,
      rejectedCompaniesResult.error,
      pendingGeneralListingsResult.error,
      pendingFeedListingsResult.error,
      pendingLivestockListingsResult.error,
      pendingOffersResult.error,
      pendingExpertRequestsResult.error,
      listingsResult.error,
      livestockResult.error,
      feedResult.error,
      appointmentsResult.error,
      pendingPurchaseRequestsResult.error,
    ].find(Boolean)

    if (firstError) {
      setErrorMessage(`Yönetim verileri yüklenemedi: ${firstError.message}`)
      setLoading(false)
      return
    }

    setStats({
      totalCompanies: totalCompaniesResult.count ?? 0,
      pendingCompanies: pendingCompaniesResult.count ?? 0,
      pendingActivities: pendingActivitiesResult.count ?? 0,
      approvedCompanies: approvedCompaniesResult.count ?? 0,
      rejectedCompanies: rejectedCompaniesResult.count ?? 0,
      pendingListings:
        (pendingGeneralListingsResult.count ?? 0) +
        (pendingFeedListingsResult.count ?? 0) +
        (pendingLivestockListingsResult.count ?? 0),
      pendingOffers: pendingOffersResult.count ?? 0,
      pendingExpertRequests: pendingExpertRequestsResult.count ?? 0,
      activeListings:
        (listingsResult.count ?? 0) +
        (livestockResult.count ?? 0) +
        (feedResult.count ?? 0),
      pendingAppointments: appointmentsResult.count ?? 0,
      pendingPurchaseRequests: pendingPurchaseRequestsResult.count ?? 0,
    })

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadDashboard()
    void supabase.rpc('get_my_platform_access').then(({ data }) => {
      setStaffRole(data?.role ?? null)
    })
  }, [loadDashboard])

  const cards: DashboardCard[] = [
    {
      label: 'Toplam Firma',
      value: stats.totalCompanies,
      href: '/admin/firmalar',
      icon: Building2,
      className: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Faaliyet Başvurusu',
      value: stats.pendingActivities,
      href: '/admin/faaliyetler',
      icon: BadgeCheck,
      className: 'bg-teal-100 text-teal-700',
    },
    {
      label: 'İnceleme Bekleyen İlan',
      value: stats.pendingListings,
      href: '/admin/ilanlar',
      icon: ShieldCheck,
      className: 'bg-orange-100 text-orange-700',
    },
    {
      label: 'İnceleme Bekleyen Teklif',
      value: stats.pendingOffers,
      href: '/admin/teklifler',
      icon: Tags,
      className: 'bg-cyan-100 text-cyan-700',
    },
    {
      label: 'Bekleyen Kesimhane Alımı',
      value: stats.pendingPurchaseRequests,
      href: '/admin/kesimhane-alimlari',
      icon: Truck,
      className: 'bg-fuchsia-100 text-fuchsia-700',
    },
    {
      label: 'Onay Bekleyen Firma',
      value: stats.pendingCompanies,
      href: '/admin/firmalar',
      icon: Clock3,
      className: 'bg-amber-100 text-amber-700',
    },
    {
      label: 'Onaylanan Firma',
      value: stats.approvedCompanies,
      href: '/admin/firmalar',
      icon: BadgeCheck,
      className: 'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Reddedilen Firma',
      value: stats.rejectedCompanies,
      href: '/admin/firmalar',
      icon: ShieldCheck,
      className: 'bg-red-100 text-red-700',
    },
    {
      label: 'Aktif İlan',
      value: stats.activeListings,
      href: '/admin/ilanlar',
      icon: Megaphone,
      className: 'bg-blue-100 text-blue-700',
    },
    {
      label: 'Bekleyen Ekspertiz',
      value: stats.pendingExpertRequests,
      href: '/admin/ekspertiz',
      icon: ShieldCheck,
      className: 'bg-teal-100 text-teal-700',
    },
    {
      label: 'Bekleyen Kesim Randevusu',
      value: stats.pendingAppointments,
      href: '/admin/randevular',
      icon: CalendarClock,
      className: 'bg-violet-100 text-violet-700',
    },
  ]

  return (
    <PageShell className="space-y-8">
        <PageHeader
          eyebrow="Kanatlı Borsası"
          title="Yönetim Paneli"
          description="Firma başvurularını, ilanları, teklifleri ve operasyonel talepleri tek merkezden yönetin."
          icon={Crown}
          actions={
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          }
        />

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Öncelikli işler</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">Bugün ilgilenmeniz gerekenler</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.slice(0, 5).map(({ label, value, href, icon: Icon, className }) => (
            <Link
              key={label}
              href={href}
              className="ui-surface-card ui-surface-card--interactive group relative overflow-hidden p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {loading ? '—' : value}
                  </p>
                </div>
                <div className={`rounded-2xl p-3 shadow-inner ${className}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors group-hover:text-emerald-600">
                Yönetimi aç
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
          </div>
        </section>

        <section className="ui-surface-card p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-extrabold text-slate-900">Sistem özeti</h2>
            <p className="text-xs text-slate-500">Firma, ilan ve operasyonların genel durumu</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {cards.slice(5).map(({ label, value, href, icon: Icon, className }) => (
              <Link key={label} href={href} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white">
                <span className={`rounded-lg p-2 ${className}`}><Icon className="h-4 w-4" /></span>
                <span><span className="block text-lg font-black text-slate-900">{loading ? '—' : value}</span><span className="block text-[11px] leading-4 text-slate-500">{label}</span></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
              Yönetim merkezi
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">
              Yönetim modülleri
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Yetkiniz bulunan bütün yönetim ekranlarına buradan ulaşın.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {MANAGEMENT_MODULES.filter(
              (module) => staffRole && module.roles.includes(staffRole),
            ).map(({ label, description, href, icon: Icon, count }) => (
              <Link
                key={href}
                href={href}
                className="group relative flex items-start gap-4 overflow-hidden rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.6)] ring-1 ring-slate-200/70 transition hover:-translate-y-1 hover:ring-violet-300 hover:shadow-[0_24px_50px_-28px_rgba(109,40,217,0.45)]"
              >
                <span className="rounded-xl bg-violet-50 p-3 text-violet-700">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-900">{label}</span>
                    {count && !loading && count(stats) > 0 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800">
                        {count(stats)} bekliyor
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {description}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700">
                    Modülü aç <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Site görünümü</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">Kullanıcıların gördüğü alanlar</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Pazar ve hizmet sayfalarını yönetici görüntüleme modunda inceleyin.</p>
              </div>
              <Home className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                { href: '/', label: 'Ana pazar vitrini', icon: Home, tone: 'bg-slate-100 text-slate-700' },
                { href: '/borsa', label: 'Piyasa fiyatları', icon: TrendingUp, tone: 'bg-blue-100 text-blue-700' },
                { href: '/livestock', label: 'Canlı hayvan pazarı', icon: Bird, tone: 'bg-amber-100 text-amber-700' },
                { href: '/ekspertiz', label: 'Ekspertiz merkezi', icon: Microscope, tone: 'bg-teal-100 text-teal-700' },
                { href: '/teknik-merkez', label: 'Teknik merkez', icon: BookOpenText, tone: 'bg-indigo-100 text-indigo-700' },
                { href: '/sektor-konseyi', label: 'Sektör konseyi', icon: Landmark, tone: 'bg-violet-100 text-violet-700' },
                { href: '/sozlesme-yonetimi', label: 'Sözleşmeli üretim', icon: FileSignature, tone: 'bg-cyan-100 text-cyan-700' },
                { href: '/kesimhane', label: 'Kesimhane ağı', icon: Factory, tone: 'bg-rose-100 text-rose-700' },
              ].map(({ href, label, icon: Icon, tone }) => (
                <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40">
                  <span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-sm font-bold text-slate-700">{label}</span>
                  <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-emerald-600" />
                </Link>
              ))}
            </div>
            <p className="mt-4 rounded-xl bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-800">Platform personeli bu sayfalarda içerikleri görüntüleyebilir; ilan, teklif ve ticari talep oluşturamaz.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              Bekleyen İşlemler
            </h2>

            <div className="mt-4 space-y-3">
              <Link
                href="/admin/firmalar"
                className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100"
              >
                <span className="text-sm font-medium text-amber-900">
                  Firma onayı bekleyenler
                </span>
                <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900">
                  {loading ? '—' : stats.pendingCompanies}
                </span>
              </Link>

              <Link
                href="/admin/ilanlar"
                className="flex items-center justify-between rounded-xl bg-orange-50 px-4 py-3 transition-colors hover:bg-orange-100"
              >
                <span className="text-sm font-medium text-orange-900">
                  İnceleme bekleyen ilanlar
                </span>
                <span className="rounded-full bg-orange-200 px-2.5 py-1 text-xs font-bold text-orange-900">
                  {loading ? '—' : stats.pendingListings}
                </span>
              </Link>

              <Link
                href="/admin/teklifler"
                className="flex items-center justify-between rounded-xl bg-cyan-50 px-4 py-3 transition-colors hover:bg-cyan-100"
              >
                <span className="text-sm font-medium text-cyan-900">
                  İnceleme bekleyen teklifler
                </span>
                <span className="rounded-full bg-cyan-200 px-2.5 py-1 text-xs font-bold text-cyan-900">
                  {loading ? '—' : stats.pendingOffers}
                </span>
              </Link>

              <Link
                href="/admin/ekspertiz"
                className="flex items-center justify-between rounded-xl bg-teal-50 px-4 py-3 transition-colors hover:bg-teal-100"
              >
                <span className="text-sm font-medium text-teal-900">
                  İnceleme bekleyen ekspertiz talepleri
                </span>
                <span className="rounded-full bg-teal-200 px-2.5 py-1 text-xs font-bold text-teal-900">
                  {loading ? '—' : stats.pendingExpertRequests}
                </span>
              </Link>

              <Link
                href="/admin/randevular"
                className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3 transition-colors hover:bg-violet-100"
              >
                <span className="text-sm font-medium text-violet-900">
                  Kesimhane randevuları
                </span>
                <span className="rounded-full bg-violet-200 px-2.5 py-1 text-xs font-bold text-violet-900">
                  {loading ? '—' : stats.pendingAppointments}
                </span>
              </Link>

              <Link
                href="/admin/kesimhane-alimlari"
                className="flex items-center justify-between rounded-xl bg-fuchsia-50 px-4 py-3 transition-colors hover:bg-fuchsia-100"
              >
                <span className="text-sm font-medium text-fuchsia-900">
                  Yayın onayı bekleyen kesimhane alımları
                </span>
                <span className="rounded-full bg-fuchsia-200 px-2.5 py-1 text-xs font-bold text-fuchsia-900">
                  {loading ? '—' : stats.pendingPurchaseRequests}
                </span>
              </Link>
            </div>
          </div>
        </section>
    </PageShell>
  )
}
