'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type WalletTransaction = {
  id: string
  type: 'sale_income' | 'purchase_expense' | 'platform_commission' | 'adjustment'
  direction: 'credit' | 'debit'
  amount: number
  description: string
  status: 'pending' | 'posted' | 'cancelled'
  trade_offer_id: string | null
  created_at: string
}

type WalletData = {
  account_id: string
  account_type: 'company' | 'platform'
  company_id: string | null
  name: string
  currency: 'TRY'
  balance: number
  total_income: number
  total_expense: number
  transactions: WalletTransaction[]
}

type Filter = 'all' | 'credit' | 'debit'

const money = (value: number) =>
  Number(value || 0).toLocaleString('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })

const transactionLabels: Record<WalletTransaction['type'], string> = {
  sale_income: 'Satış geliri',
  purchase_expense: 'Alım ödemesi',
  platform_commission: 'Platform komisyonu',
  adjustment: 'Bakiye düzeltmesi',
}

export default function WalletPage() {
  const supabase = useMemo(() => createClient(), [])
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const loadWallet = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.replace('/auth')
      return
    }

    const { data, error: walletError } = await supabase.rpc('get_my_wallet')
    if (walletError) {
      setError('Cüzdan yüklenemedi: ' + walletError.message)
      setWallet(null)
    } else {
      setWallet(data as WalletData)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadWallet() }, [loadWallet])

  const transactions = (wallet?.transactions ?? []).filter(
    (item) => filter === 'all' || item.direction === filter
  )

  if (loading) {
    return <main className="mx-auto max-w-6xl"><div className="rounded-2xl bg-white p-12 text-center text-slate-500">Cüzdan yükleniyor…</div></main>
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-600">Finans merkezi</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{wallet?.name ?? 'Cüzdan'}</h1>
          <p className="mt-2 text-sm text-slate-500">Tamamlanan ticari tekliflerden oluşan gerçek hesap hareketleri.</p>
        </div>
        <button type="button" onClick={() => void loadWallet()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {wallet && (
        <>
          {wallet.account_type === 'platform' && (
            <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              Yönetici hesabında yalnızca platformun tamamlanan işlemlerden kazandığı komisyonlar gösterilir.
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard icon={Wallet} label="Net bakiye" value={money(wallet.balance)} tone="emerald" />
            <SummaryCard icon={ArrowDownLeft} label="Toplam giriş" value={money(wallet.total_income)} tone="blue" />
            <SummaryCard icon={ArrowUpRight} label="Toplam çıkış" value={money(wallet.total_expense)} tone="amber" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="font-bold text-slate-900">Hesap hareketleri</h2><p className="mt-1 text-sm text-slate-500">{wallet.transactions.length} kayıt</p></div>
              <div className="flex rounded-xl bg-slate-100 p-1">
                {([['all', 'Tümü'], ['credit', 'Girişler'], ['debit', 'Çıkışlar']] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="p-12 text-center"><Wallet className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">Henüz hesap hareketi yok</h3><p className="mt-1 text-sm text-slate-500">Tamamlanan ticari teklifler burada otomatik olarak görünecek.</p></div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-xl p-2.5 ${item.direction === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.direction === 'credit' ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                      </div>
                      <div><p className="font-semibold text-slate-900">{transactionLabels[item.type]}</p><p className="mt-0.5 text-sm text-slate-500">{item.description}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('tr-TR')}</p></div>
                    </div>
                    <div className="sm:text-right"><p className={`text-lg font-bold ${item.direction === 'credit' ? 'text-emerald-700' : 'text-amber-700'}`}>{item.direction === 'credit' ? '+' : '−'} {money(item.amount)}</p>{item.trade_offer_id && <Link href={wallet.account_type === 'platform' ? `/admin/teklifler/${item.trade_offer_id}` : '/profil/islem-gecmisi'} className="text-xs font-semibold text-emerald-700 hover:underline">İşlemi görüntüle</Link>}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs leading-5 text-slate-500">Bu ekran ticari hareket kayıtlarını gösterir. Banka hesabına para yatırma veya çekme özelliği, ödeme kuruluşu entegrasyonu yapılana kadar aktif değildir.</p>
        </>
      )}
    </main>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone: 'emerald' | 'blue' | 'amber' }) {
  const colors = { emerald: 'bg-emerald-100 text-emerald-700', blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700' }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`inline-flex rounded-xl p-2.5 ${colors[tone]}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>
}
