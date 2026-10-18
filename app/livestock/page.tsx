'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type PublicCompany = {
  name: string
}

type LivestockListing = {
  id: string
  company_id: string | null
  animal_type: string
  category: string
  breed: string | null
  title: string
  quantity: number
  unit: string | null
  price: number
  age_group: string | null
  average_weight: number | null
  health_status: string | null
  city: string
  district: string | null
  negotiable: boolean
  min_order_quantity: number | null
  status: string | null
  created_at: string
  companies: PublicCompany | null
}

const ALL = 'Tümü'

export default function LivestockPage() {
  const supabase = useMemo(() => createClient(), [])

  const [listings, setListings] = useState<LivestockListing[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAnimalType, setSelectedAnimalType] = useState(ALL)
  const [selectedCity, setSelectedCity] = useState(ALL)
  const [selectedCategory, setSelectedCategory] = useState(ALL)

  useEffect(() => {
    let mounted = true

    async function fetchListings() {
      setLoading(true)
      setErrorMessage(null)

      const { data: listingData, error: listingError } = await supabase
        .from('livestock_listings')
        .select(
          'id, company_id, animal_type, category, breed, title, quantity, unit, price, age_group, average_weight, health_status, city, district, negotiable, min_order_quantity, status, created_at'
        )
        .eq('status', 'aktif')
        .order('created_at', { ascending: false })

      if (!mounted) return

      if (listingError) {
        console.error(
          'İlanlar çekilirken hata oluştu:',
          listingError.message
        )
        setListings([])
        setErrorMessage(
          'Canlı hayvan ilanları şu anda yüklenemedi. Lütfen biraz sonra yeniden deneyin.'
        )
        setLoading(false)
        return
      }

      const companyIds = [
        ...new Set(
          (listingData ?? [])
            .map((listing) => listing.company_id)
            .filter((companyId): companyId is string => Boolean(companyId))
        ),
      ]

      const { data: publicCompanies, error: companyError } =
        companyIds.length > 0
          ? await supabase
              .from('public_companies')
              .select('id, name')
              .in('id', companyIds)
          : { data: [], error: null }

      if (!mounted) return

      if (companyError) {
        console.error(
          'İlan firma bilgileri yüklenemedi:',
          companyError.message
        )
      }

      const companyMap = new Map<string, PublicCompany>(
        (publicCompanies ?? []).map((company) => [
          company.id,
          { name: company.name },
        ])
      )

      const safeListings: LivestockListing[] = (listingData ?? []).map(
        (listing) => ({
          ...listing,
          companies: listing.company_id
            ? companyMap.get(listing.company_id) ?? null
            : null,
        })
      )

      setListings(safeListings)
      setLoading(false)
    }

    void fetchListings()

    return () => {
      mounted = false
    }
  }, [supabase, refreshKey])

  const uniqueCities = useMemo(() => {
    const cities = listings
      .map((listing) => listing.city?.trim())
      .filter((city): city is string => Boolean(city))

    return [ALL, ...Array.from(new Set(cities)).sort((a, b) =>
      a.localeCompare(b, 'tr')
    )]
  }, [listings])

  const uniqueAnimalTypes = useMemo(() => {
    const animalTypes = listings
      .map((listing) => listing.animal_type?.trim())
      .filter((animalType): animalType is string => Boolean(animalType))

    return [ALL, ...Array.from(new Set(animalTypes)).sort((a, b) =>
      a.localeCompare(b, 'tr')
    )]
  }, [listings])

  const uniqueCategories = useMemo(() => {
    const categories = listings
      .map((listing) => listing.category?.trim())
      .filter((category): category is string => Boolean(category))

    return [ALL, ...Array.from(new Set(categories)).sort((a, b) =>
      a.localeCompare(b, 'tr')
    )]
  }, [listings])

  const filteredListings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('tr-TR')

    return listings.filter((item) => {
      const searchableText = [
        item.title,
        item.breed,
        item.animal_type,
        item.category,
        item.city,
        item.companies?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')

      const matchesSearch =
        normalizedQuery.length === 0 || searchableText.includes(normalizedQuery)
      const matchesAnimalType =
        selectedAnimalType === ALL || item.animal_type === selectedAnimalType
      const matchesCity =
        selectedCity === ALL || item.city === selectedCity
      const matchesCategory =
        selectedCategory === ALL || item.category === selectedCategory

      return (
        matchesSearch &&
        matchesAnimalType &&
        matchesCity &&
        matchesCategory
      )
    })
  }, [
    listings,
    searchQuery,
    selectedAnimalType,
    selectedCity,
    selectedCategory,
  ])

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAnimalType !== ALL ||
    selectedCity !== ALL ||
    selectedCategory !== ALL

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedAnimalType(ALL)
    setSelectedCity(ALL)
    setSelectedCategory(ALL)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 marketplace-page">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
            <p className="mt-3 text-sm text-slate-500">
              Canlı hayvan ilanları yükleniyor...
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Doğrulanmış firmalardan güncel ilanlar
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Canlı Hayvan Borsası
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Kanatlı, küçükbaş ve büyükbaş canlı hayvan ilanlarını arayın,
                filtreleyin ve firma bilgileriyle birlikte inceleyin.
              </p>
            </div>

            <Link
              href="/livestock/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Yeni ilan ver
            </Link>
          </div>

          <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70 sm:grid-cols-3">
            <SummaryItem label="Aktif ilan" value={listings.length} />
            <SummaryItem label="Görüntülenen" value={filteredListings.length} />
            <SummaryItem
              label="Şehir"
              value={Math.max(uniqueCities.length - 1, 0)}
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Arama ve filtreler</h2>
            </div>

            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-emerald-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Başlık, ırk, firma, kategori veya şehir ara..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Canlı grubu"
              value={selectedAnimalType}
              onChange={setSelectedAnimalType}
              options={uniqueAnimalTypes}
            />
            <FilterSelect
              label="Kategori"
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={uniqueCategories}
            />
            <FilterSelect
              label="Şehir"
              value={selectedCity}
              onChange={setSelectedCity}
              options={uniqueCities}
            />

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Filtreleri temizle
              </button>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="mt-3 font-semibold underline underline-offset-4"
            >
              Yeniden dene
            </button>
          </div>
        )}

        {!errorMessage && filteredListings.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-4 font-semibold text-slate-800">
              Uygun ilan bulunamadı
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Filtreleri temizleyebilir veya farklı bir arama yapabilirsiniz.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Tüm ilanları göster
              </button>
            )}
          </section>
        ) : (
          !errorMessage && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                    Pazar
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Aktif canlı hayvan ilanları
                  </h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {filteredListings.length} ilan
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredListings.map((item) => (
                  <article
                    key={item.id}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                  >
                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          {item.category}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3.5 w-3.5" />
                          {[item.city, item.district].filter(Boolean).join(' / ')}
                        </span>
                      </div>

                      <h3 className="mt-4 text-lg font-bold text-slate-900 transition group-hover:text-emerald-700">
                        {item.title}
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        {item.companies?.name || 'Firma bilgisi gösterilemiyor'}
                      </p>

                      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <InfoItem label="Canlı grubu" value={item.animal_type} />
                        <InfoItem label="Irk / çeşit" value={item.breed || 'Belirtilmedi'} />
                        <InfoItem label="Yaş / dönem" value={item.age_group || 'Belirtilmedi'} />
                        <InfoItem
                          label="Ortalama ağırlık"
                          value={
                            item.average_weight
                              ? `${item.average_weight.toLocaleString('tr-TR')} kg`
                              : 'Belirtilmedi'
                          }
                        />
                      </dl>

                      {item.health_status && (
                        <div className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
                          <span className="font-semibold">Sağlık bilgisi:</span>{' '}
                          {item.health_status}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/70 p-5">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Miktar
                          </p>
                          <p className="mt-1 font-bold text-slate-800">
                            {Number(item.quantity).toLocaleString('tr-TR')}{' '}
                            {item.unit || 'Baş'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Birim fiyat
                          </p>
                          <p className="mt-1 text-xl font-extrabold text-emerald-600">
                            {Number(item.price).toLocaleString('tr-TR', {
                              style: 'currency',
                              currency: 'TRY',
                            })}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-400">
                            {item.negotiable ? 'Pazarlığa açık' : 'Sabit fiyat'}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] text-slate-500">
                        Minimum sipariş:{' '}
                        <strong className="text-slate-700">
                          {Number(item.min_order_quantity ?? 1).toLocaleString('tr-TR')}{' '}
                          {item.unit || 'Baş'}
                        </strong>
                      </p>

                      <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-400">
                        Yayın tarihi:{' '}
                        {new Date(item.created_at).toLocaleDateString('tr-TR')}
                      </p>

                      <Link
                        href={`/livestock/${item.id}`}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        İlanı incele
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        )}
      </div>
    </main>
  )
}

function SummaryItem({
  label,
  value,
  className = '',
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className={`border-r border-slate-100 px-5 py-4 text-center ${className}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === ALL ? `Tüm ${label.toLocaleLowerCase('tr-TR')} seçenekleri` : option}
          </option>
        ))}
      </select>
    </label>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-slate-700">{value}</dd>
    </div>
  )
}
