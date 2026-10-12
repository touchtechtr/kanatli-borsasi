'use client'



import { useEffect, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'

import Link from 'next/link'

import {

  CheckCircle,

  Clock,

  LockKeyhole,

  ShoppingBag,

  TrendingUp,

} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'



type AccessState =

  | 'loading'

  | 'approved'

  | 'pending'

  | 'rejected'

  | 'wrong-role'



type OfferStatus =

  | 'beklemede'

  | 'kabul_edildi'

  | 'reddedildi'

  | 'iptal_edildi'

  | 'tamamlandi'



interface CompanyAccess {

  id: string

  name: string

  role: string

  status: 'beklemede' | 'onaylandi' | 'reddedildi'

}



interface TradeOffer {

  id: string

  listing_kind: 'listing' | 'livestock' | 'feed'

  listing_id: string

  buyer_company_id: string

  seller_company_id: string

  product_title: string

  offered_quantity: number

  unit: string

  seller_unit_price: number

  commission_rate: number

  commission_unit_amount: number

  buyer_unit_price: number

  subtotal_amount: number

  commission_amount: number

  total_amount: number

  message: string | null

  status: OfferStatus

  created_at: string

  updated_at: string

}



const STATUS_LABELS: Record<OfferStatus, string> = {

  beklemede: 'Beklemede',

  kabul_edildi: 'Kabul Edildi',

  reddedildi: 'Reddedildi',

  iptal_edildi: 'İptal Edildi',

  tamamlandi: 'Tamamlandı',

}



const STATUS_STYLES: Record<OfferStatus, string> = {

  beklemede:

    'bg-amber-50 text-amber-700 border-amber-200',

  kabul_edildi:

    'bg-emerald-50 text-emerald-700 border-emerald-200',

  reddedildi:

    'bg-red-50 text-red-700 border-red-200',

  iptal_edildi:

    'bg-slate-100 text-slate-600 border-slate-200',

  tamamlandi:

    'bg-blue-50 text-blue-700 border-blue-200',

}



export default function TuccarPanelPage() {

  const router = useRouter()

  const supabase = createClient()



  const [accessState, setAccessState] =

    useState<AccessState>('loading')

  const [company, setCompany] =

    useState<CompanyAccess | null>(null)

  const [offers, setOffers] = useState<TradeOffer[]>([])

  const [isAdmin, setIsAdmin] = useState(false)

  const [offersLoading, setOffersLoading] = useState(false)

  const [processingId, setProcessingId] =

    useState<string | null>(null)

  const [pageError, setPageError] =

    useState<string | null>(null)



  useEffect(() => {

    const initializePage = async () => {

      const {

        data: { user },

        error: userError,

      } = await supabase.auth.getUser()



      if (userError || !user) {

        window.location.replace('/auth')

        return

      }



      const [{ data: companyData, error: companyError }, {

        data: profileData,

        error: profileError,

      }] = await Promise.all([

        supabase

          .from('companies')

          .select('id, name, role, status')

          .eq('user_id', user.id)

          .maybeSingle(),



        supabase

          .from('profiles')

          .select('is_admin')

          .eq('id', user.id)

          .maybeSingle(),

      ])



      if (companyError || !companyData) {

        window.location.replace('/profil')

        return

      }



      if (profileError) {

        console.error(

          'Yönetici yetkisi kontrol edilemedi:',

          profileError.message

        )

      }



      const adminUser = Boolean(profileData?.is_admin)



      setCompany(companyData as CompanyAccess)

      setIsAdmin(adminUser)



      if (adminUser) {

        setAccessState('approved')

        await fetchOffers()

        return

      }



      const { data: hasBuyerActivity, error: activityError } = await supabase.rpc(
        'company_has_any_active_activity',
        { p_company_id: companyData.id, p_activity_codes: ['animal_buyer', 'feed_buyer'] }
      )

      if (activityError) {
        console.error('Faaliyet yetkisi kontrol edilemedi:', activityError.message)
      }

      if (!hasBuyerActivity) {

        setAccessState('wrong-role')

        return

      }



      if (companyData.status === 'beklemede') {

        setAccessState('pending')

        return

      }



      if (companyData.status === 'reddedildi') {

        setAccessState('rejected')

        return

      }



      setAccessState('approved')

      await fetchOffers()

    }



    initializePage()

  }, [])



  const fetchOffers = async () => {

    setOffersLoading(true)

    setPageError(null)



    const { data, error } = await supabase

      .from('trade_offers')

      .select(

        'id, listing_kind, listing_id, buyer_company_id, seller_company_id, product_title, offered_quantity, unit, seller_unit_price, commission_rate, commission_unit_amount, buyer_unit_price, subtotal_amount, commission_amount, total_amount, message, status, created_at, updated_at'

      )

      .order('created_at', { ascending: false })



    if (error) {

      setPageError(

        'Teklifler yüklenemedi: ' + error.message

      )

      setOffers([])

    } else {

      setOffers((data ?? []) as TradeOffer[])

    }



    setOffersLoading(false)

  }



  const handleStatusChange = async (

    offerId: string,

    newStatus: OfferStatus

  ) => {

    setProcessingId(offerId)

    setPageError(null)



    const { error } = await supabase

      .from('trade_offers')

      .update({ status: newStatus })

      .eq('id', offerId)



    if (error) {

      setPageError(

        'Teklif işlemi tamamlanamadı: ' + error.message

      )

    } else {

      await fetchOffers()

    }



    setProcessingId(null)

  }



  const activeOfferCount = useMemo(

    () =>

      offers.filter((offer) =>

        ['beklemede', 'kabul_edildi'].includes(

          offer.status

        )

      ).length,

    [offers]

  )



  const completedOfferCount = useMemo(

    () =>

      offers.filter(

        (offer) => offer.status === 'tamamlandi'

      ).length,

    [offers]

  )



  const transactionVolume = useMemo(

    () =>

      offers

        .filter((offer) =>

          ['kabul_edildi', 'tamamlandi'].includes(

            offer.status

          )

        )

        .reduce(

          (total, offer) =>

            total + Number(offer.total_amount || 0),

          0

        ),

    [offers]

  )



  if (accessState === 'loading') {

    return (

      <main className="min-h-screen bg-slate-50 flex items-center justify-center">

        <p className="text-sm text-slate-500">

          Hesap yetkileri kontrol ediliyor...

        </p>

      </main>

    )

  }



  if (accessState !== 'approved') {

    const content = {

      pending: {

        title: 'Firma Onayı Bekleniyor',

        description:

          'Tüccar panelini kullanabilmek için firmanızın yönetici tarafından onaylanması gerekiyor.',

        icon: Clock,

        color: 'text-amber-600',

        background: 'bg-amber-50',

      },

      rejected: {

        title: 'Firma Başvurusu Onaylanmadı',

        description:

          'Firma bilgilerinizi kontrol edip düzelttikten sonra yeniden inceleme talebi gönderebilirsiniz.',

        icon: LockKeyhole,

        color: 'text-red-600',

        background: 'bg-red-50',

      },

      'wrong-role': {

        title: 'Onaylı Alıcı Faaliyeti Gerekiyor',

        description:

          'Bu alanı kullanmak için Canlı Hayvan Alıcısı veya Yem Alıcısı faaliyetlerinden en az birinin onaylanması gerekir.',

        icon: LockKeyhole,

        color: 'text-slate-600',

        background: 'bg-slate-100',

      },

    }[accessState]



    const Icon = content.icon



    return (

      <main className="min-h-screen bg-slate-50 px-6 py-12">

        <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">

          <div

            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${content.background}`}

          >

            <Icon className={`h-7 w-7 ${content.color}`} />

          </div>



          <h1 className="mt-5 text-xl font-bold text-slate-900">

            {content.title}

          </h1>



          <p className="mt-2 text-sm leading-6 text-slate-500">

            {content.description}

          </p>



          {company && (

            <p className="mt-4 text-xs text-slate-400">

              Firma: {company.name}

            </p>

          )}



          <div className="mt-6 flex justify-center gap-3">

            <Link

              href="/profil"

              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"

            >

              Firma Profiline Git

            </Link>



            <button

              type="button"

              onClick={() => router.push('/')}

              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"

            >

              Ana Sayfa

            </button>

          </div>

        </div>

      </main>

    )

  }



  return (

    <main className="min-h-screen bg-slate-50 p-6 md:p-12">

      <div className="max-w-7xl mx-auto space-y-6">

        <div>

          <button

            type="button"

            onClick={() => router.push('/')}

            className="text-xs font-semibold text-emerald-600 hover:underline"

          >

            ← Ana Sayfaya Dön

          </button>



          <h1 className="mt-2 text-2xl font-bold text-slate-900">

            Tüccar Alım ve Teklif Paneli

          </h1>



          <p className="mt-1 text-sm text-slate-500">

            Gerçek tekliflerinizi ve anlaşma süreçlerinizi

            takip edin.

          </p>



          {isAdmin && (

            <p className="mt-2 text-xs font-semibold text-blue-600">

              Yönetici görünümü: Sistemdeki tüm teklifler

              gösteriliyor.

            </p>

          )}

        </div>



        {pageError && (

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">

            {pageError}

          </div>

        )}



        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          <StatCard

            title="Aktif Teklifler"

            value={activeOfferCount.toLocaleString('tr-TR')}

            icon={ShoppingBag}

            iconClass="bg-emerald-50 text-emerald-600"

          />



          <StatCard

            title="İşlem Hacmi"

            value={transactionVolume.toLocaleString(

              'tr-TR',

              {

                style: 'currency',

                currency: 'TRY',

              }

            )}

            icon={TrendingUp}

            iconClass="bg-blue-50 text-blue-600"

          />



          <StatCard

            title="Tamamlanan Anlaşmalar"

            value={completedOfferCount.toLocaleString(

              'tr-TR'

            )}

            icon={CheckCircle}

            iconClass="bg-amber-50 text-amber-600"

          />

        </div>



        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="border-b border-slate-200 p-5">

            <h2 className="font-bold text-slate-900">

              Ticari Teklifler

            </h2>

          </div>



          {offersLoading ? (

            <div className="p-10 text-center text-sm text-slate-500">

              Teklifler yükleniyor...

            </div>

          ) : offers.length === 0 ? (

            <div className="p-10 text-center">

              <ShoppingBag className="mx-auto h-10 w-10 text-slate-300" />



              <h3 className="mt-3 font-semibold text-slate-800">

                Henüz teklif bulunmuyor

              </h3>



              <p className="mt-1 text-sm text-slate-500">

                İlanlardan gönderilen gerçek teklifler burada

                görüntülenecek.

              </p>

            </div>

          ) : (

            <div className="overflow-x-auto">

              <table className="w-full text-left text-sm">

                <thead className="bg-slate-50 text-xs uppercase text-slate-500">

                  <tr>

                    <th className="px-4 py-3">Teklif</th>

                    <th className="px-4 py-3">Ürün</th>

                    <th className="px-4 py-3">Miktar</th>

                    <th className="px-4 py-3 text-right">

                      Komisyonlu birim fiyat

                    </th>

                    <th className="px-4 py-3 text-center">

                      Durum

                    </th>

                    <th className="px-4 py-3 text-right">

                      İşlemler

                    </th>

                  </tr>

                </thead>



                <tbody className="divide-y divide-slate-100">

                  {offers.map((offer) => {

                    const isBuyer =

                      offer.buyer_company_id === company?.id

                    const isSeller =

                      offer.seller_company_id === company?.id



                    return (

                      <tr

                        key={offer.id}

                        className="hover:bg-slate-50"

                      >

                        <td className="px-4 py-4">

                          <p className="font-semibold text-slate-800">

                            {isBuyer

                              ? 'Gönderilen'

                              : isSeller

                                ? 'Alınan'

                                : 'Sistem'}

                          </p>



                          <p className="mt-1 text-xs text-slate-400">

                            {new Date(

                              offer.created_at

                            ).toLocaleString('tr-TR')}

                          </p>

                        </td>



                        <td className="px-4 py-4">

                          <p className="font-medium text-slate-900">

                            {offer.product_title}

                          </p>



                          {offer.message && (

                            <p className="mt-1 max-w-xs text-xs text-slate-500">

                              {offer.message}

                            </p>

                          )}

                        </td>



                        <td className="px-4 py-4 text-slate-600">

                          {Number(

                            offer.offered_quantity

                          ).toLocaleString('tr-TR')}{' '}

                          {offer.unit}

                        </td>



                        <td className="px-4 py-4 text-right font-semibold text-slate-900">

                          {Number(

                            offer.buyer_unit_price

                          ).toLocaleString('tr-TR', {

                            style: 'currency',

                            currency: 'TRY',

                          })}

                        </td>



                        <td className="px-4 py-4 text-center">

                          <span

                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[offer.status]}`}

                          >

                            {STATUS_LABELS[offer.status]}

                          </span>

                        </td>



                        <td className="px-4 py-4 text-right">

                          <div className="flex justify-end gap-2">

                            {isSeller &&

                              offer.status === 'beklemede' && (

                                <>

                                  <ActionButton

                                    label="Kabul Et"

                                    disabled={

                                      processingId === offer.id

                                    }

                                    className="bg-emerald-600 text-white hover:bg-emerald-700"

                                    onClick={() =>

                                      handleStatusChange(

                                        offer.id,

                                        'kabul_edildi'

                                      )

                                    }

                                  />



                                  <ActionButton

                                    label="Reddet"

                                    disabled={

                                      processingId === offer.id

                                    }

                                    className="bg-red-50 text-red-700 hover:bg-red-100"

                                    onClick={() =>

                                      handleStatusChange(

                                        offer.id,

                                        'reddedildi'

                                      )

                                    }

                                  />

                                </>

                              )}



                            {isBuyer &&

                              offer.status === 'beklemede' && (

                                <ActionButton

                                  label="İptal Et"

                                  disabled={

                                    processingId === offer.id

                                  }

                                  className="bg-slate-100 text-slate-700 hover:bg-slate-200"

                                  onClick={() =>

                                    handleStatusChange(

                                      offer.id,

                                      'iptal_edildi'

                                    )

                                  }

                                />

                              )}



                            {isSeller &&

                              offer.status ===

                                'kabul_edildi' && (

                                <ActionButton

                                  label="Tamamla"

                                  disabled={

                                    processingId === offer.id

                                  }

                                  className="bg-blue-600 text-white hover:bg-blue-700"

                                  onClick={() =>

                                    handleStatusChange(

                                      offer.id,

                                      'tamamlandi'

                                    )

                                  }

                                />

                              )}



                            {!isBuyer && !isSeller && (

                              <span className="text-xs text-slate-400">

                                Yönetici görünümü

                              </span>

                            )}

                          </div>

                        </td>

                      </tr>

                    )

                  })}

                </tbody>

              </table>

            </div>

          )}

        </section>

      </div>

    </main>

  )

}



function StatCard({

  title,

  value,

  icon: Icon,

  iconClass,

}: {

  title: string

  value: string

  icon: typeof ShoppingBag

  iconClass: string

}) {

  return (

    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">

      <div>

        <p className="text-xs font-medium text-slate-500">

          {title}

        </p>



        <h3 className="mt-1 text-2xl font-bold text-slate-900">

          {value}

        </h3>

      </div>



      <div className={`rounded-lg p-3 ${iconClass}`}>

        <Icon className="h-6 w-6" />

      </div>

    </div>

  )

}



function ActionButton({

  label,

  disabled,

  className,

  onClick,

}: {

  label: string

  disabled: boolean

  className: string

  onClick: () => void

}) {

  return (

    <button

      type="button"

      disabled={disabled}

      onClick={onClick}

      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}

    >

      {disabled ? 'İşleniyor...' : label}

    </button>

  )

}
