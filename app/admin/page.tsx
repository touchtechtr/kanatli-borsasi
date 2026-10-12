'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Clock3,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Tags,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
}

type DashboardCard = {
  label: string
  value: number
  href: string
  icon: typeof Building2
  className: string
}

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
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    })

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void loadDashboard()
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
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">
              Kanatlı Borsası
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Yönetim Paneli
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Firma başvurularını, ilanları, teklifleri ve operasyonel
              talepleri tek merkezden yönetin.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, href, icon: Icon, className }) => (
            <Link
              key={label}
              href={href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">
                    {loading ? '—' : value}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${className}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition-colors group-hover:text-emerald-600">
                Yönetimi aç
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Hızlı Yönetim</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Firma başvurularını, ilan kurallarını ve ticari işlemleri ilgili
              yönetim ekranlarından inceleyin.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/admin/firmalar"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Firmaları Yönet
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/ilan-kurallari"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                İlan Kuralları
              </Link>
              <Link
                href="/admin/kullanicilar"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Kullanıcıları Yönet
              </Link>
              <Link
                href="/admin/sozlesmeler"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Sözleşmeleri Yönet
              </Link>
              <Link
                href="/admin/kesimhaneler"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Kesimhaneleri Yönet
              </Link>
            </div>
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
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
