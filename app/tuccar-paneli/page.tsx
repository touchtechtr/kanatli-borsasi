'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Clock,
  LockKeyhole,
  ShoppingBag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type AccessState =
  | 'loading'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'wrong-role'

interface CompanyAccess {
  name: string
  role: string
  status: 'beklemede' | 'onaylandi' | 'reddedildi'
}

export default function TuccarPanelPage() {
  const router = useRouter()
  const supabase = createClient()

  const [accessState, setAccessState] =
    useState<AccessState>('loading')
  const [company, setCompany] =
    useState<CompanyAccess | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        window.location.replace('/auth')
        return
      }

      const { data: companyData, error: companyError } =
        await supabase
          .from('companies')
          .select('name, role, status')
          .eq('user_id', user.id)
          .maybeSingle()

      if (companyError || !companyData) {
        window.location.replace('/profil')
        return
      }

      const { data: profileData, error: profileError } =
  await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

if (profileError) {
  console.error(
    'Yönetici yetkisi kontrol edilemedi:',
    profileError.message
  )
}

setCompany(companyData as CompanyAccess)

// Gerçek yönetici yetkisi profiles.is_admin alanından gelir.
// Yönetici, kendi firma rolü ne olursa olsun paneli inceleyebilir.
if (profileData?.is_admin) {
  setAccessState('approved')
  return
}

if (companyData.role !== 'tuccar') {
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
    }

    checkAccess()
  }, [])

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
          'Firma bilgilerinizi kontrol edip düzelttikten sonra profil sayfasından yeniden inceleme talebi gönderebilirsiniz.',
        icon: LockKeyhole,
        color: 'text-red-600',
        background: 'bg-red-50',
      },
      'wrong-role': {
        title: 'Bu Panel Tüccar Hesaplarına Özeldir',
        description:
          'Mevcut firma rolünüz tüccar panelini kullanmaya uygun değil.',
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
            Üreticilerden gelen gerçek teklifleri yönetin ve
            ticari süreçlerinizi takip edin.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <ShoppingBag className="h-7 w-7 text-emerald-600" />
          </div>

          <h2 className="mt-4 text-lg font-bold text-slate-900">
            Teklif yönetimi hazırlanıyor
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Demo kayıtlar kaldırıldı. Bu alanda yalnızca gerçek
            üretici teklifleri, miktarlar, fiyatlar ve anlaşma
            durumları gösterilecektir.
          </p>

          {company && (
            <p className="mt-4 text-xs font-medium text-emerald-700">
              Onaylı firma: {company.name}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}