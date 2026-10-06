'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  Clock3,
  Megaphone,
  ShieldCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type DashboardStats = {
  totalCompanies: number
  pendingCompanies: number
  approvedCompanies: number
  rejectedCompanies: number
  activeListings: number
  appointments: number
}

const INITIAL_STATS: DashboardStats = {
  totalCompanies: 0,
  pendingCompanies: 0,
  approvedCompanies: 0,
  rejectedCompanies: 0,
  activeListings: 0,
  appointments: 0,
}

export default function AdminDashboardPage() {
  const supabase = createClient()

  const [stats, setStats] =
    useState<DashboardStats>(INITIAL_STATS)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    setLoading(true)
    setErrorMessage(null)

    const [
      totalCompaniesResult,
      pendingCompaniesResult,
      approvedCompaniesResult,
      rejectedCompaniesResult,
      listingsResult,
      livestockResult,
      feedResult,
      appointmentsResult,
    ] = await Promise.all([
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true }),

      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'beklemede'),

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
        .select('id', { count: 'exact', head: true }),
    ])

    const firstError = [
      totalCompaniesResult.error,
      pendingCompaniesResult.error,
      approvedCompaniesResult.error,
      rejectedCompaniesResult.error,
      listingsResult.error,
      livestockResult.error,
      feedResult.error,
      appointmentsResult.error,
    ].find(Boolean)

    if (firstError) {
      setErrorMessage(
        'Yönetim verileri yüklenemedi: ' +
          firstError.message
      )
      setLoading(false)
      return
    }

    setStats({
      totalCompanies:
        totalCompaniesResult.count ?? 0,
      pendingCompanies:
        pendingCompaniesResult.count ?? 0,
      approvedCompanies:
        approvedCompaniesResult.count ?? 0,
      rejectedCompanies:
        rejectedCompaniesResult.count ?? 0,
      activeListings:
        (listingsResult.count ?? 0) +
        (livestockResult.count ?? 0) +
        (feedResult.count ?? 0),
      appointments:
        appointmentsResult.count ?? 0,
    })

    setLoading(false)
  }

  const cards = [
    {
      label: 'Toplam Firma',
      value: stats.totalCompanies,
      icon: Building2,
      className:
        'bg-slate-100 text-slate-700',
    },
    {
      label: 'Onay Bekleyen',
      value: stats.pendingCompanies,
      icon: Clock3,
      className:
        'bg-amber-100 text-amber-700',
    },
    {
      label: 'Onaylanan',
      value: stats.approvedCompanies,
      icon: BadgeCheck,
      className:
        'bg-emerald-100 text-emerald-700',
    },
    {
      label: 'Reddedilen',
      value: stats.rejectedCompanies,
      icon: ShieldCheck,
      className:
        'bg-red-100 text-red-700',
    },
    {
      label: 'Aktif İlan',
      value: stats.activeListings,
      icon: Megaphone,
      className:
        'bg-blue-100 text-blue-700',
    },
    {
      label: 'Kesim Randevusu',
      value: stats.appointments,
      icon: CalendarClock,
      className:
        'bg-violet-100 text-violet-700',
    },
  ]

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <p className="text-sm font-semibold text-emerald-600">
            Kanatlı Borsası
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Yönetim Paneli
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Firma başvurularını, ilanları ve operasyonel
            talepleri tek merkezden yönetin.
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(
            ({
              label,
              value,
              icon: Icon,
              className,
            }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">
                      {label}
                    </p>

                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {loading ? '—' : value}
                    </p>
                  </div>

                  <div
                    className={`rounded-xl p-3 ${className}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            )
          )}
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              Firma Moderasyonu
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Bekleyen firma başvurularını inceleyin,
              bilgilerini görüntüleyin ve onay ya da ret
              kararı verin.
            </p>

            <Link
              href="/admin/firmalar"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Firmaları Yönet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              Bekleyen İşlemler
            </h2>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
                <span className="text-sm font-medium text-amber-900">
                  Firma onayı bekleyenler
                </span>

                <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900">
                  {loading
                    ? '—'
                    : stats.pendingCompanies}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3">
                <span className="text-sm font-medium text-violet-900">
                  Kesimhane randevuları
                </span>

                <span className="rounded-full bg-violet-200 px-2.5 py-1 text-xs font-bold text-violet-900">
                  {loading
                    ? '—'
                    : stats.appointments}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}