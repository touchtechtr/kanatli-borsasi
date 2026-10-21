'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PlatformUI'

type WalletTransaction = {
  id: string
  type: 'sale_income' | 'purchase_expense' | 'buyer_refund' | 'platform_commission' | 'transfer_fee' | 'adjustment'
  direction: 'credit' | 'debit'
  amount: number
  description: string
  status: 'pending' | 'posted' | 'cancelled'
  trade_offer_id: string | null
  slaughterhouse_delivery_id: string | null
  slaughterhouse_request_id: string | null
  source: 'trade' | 'slaughterhouse' | 'manual'
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
  pending_income: number
  pending_expense: number
  disputed_income: number
  disputed_expense: number
  can_view_platform: boolean
  has_company: boolean
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
  buyer_refund: 'Uyuşmazlık iadesi',
  platform_commission: 'Platform komisyonu',
  transfer_fee: 'Banka / aktarım masrafı',
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

    const { data: platformAccess } = await supabase.rpc('get_my_platform_access')
    if (platformAccess?.is_staff) {
      window.location.replace('/admin/finans')
      return
    }

    const { data, error: walletError } = await supabase.rpc(
      'get_wallet_dashboard',
      { p_scope: 'company' }
    )
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
    return <main className="ui-page-shell"><div className="rounded-2xl bg-white p-12 text-center text-slate-500">Cüzdan yükleniyor…</div></main>
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <PageHeader eyebrow="Finans ve hesap hareketleri" title={wallet?.name ?? "Cüzdan"} description="Ticari teklifler ve kesimhane alımlarından oluşan doğrulanmış hesap hareketlerinizi inceleyin." icon={Wallet} tone="emerald" actions={<button type="button" onClick={() => void loadWallet()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Yenile</button>} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {wallet && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard icon={Wallet} label={wallet.account_type === 'platform' ? 'Komisyon bakiyesi' : 'Net ticari hareket'} value={money(wallet.balance)} tone="emerald" />
            <SummaryCard icon={ArrowDownLeft} label={wallet.account_type === 'platform' ? 'Toplam komisyon' : 'Toplam satış geliri'} value={money(wallet.total_income)} tone="blue" />
            <SummaryCard icon={ArrowUpRight} label={wallet.account_type === 'platform' ? 'Toplam çıkış' : 'Toplam alış harcaması'} value={money(wallet.total_expense)} tone="amber" />
          </section>

          {wallet.account_type === 'company' && (
            wallet.pending_income > 0 ||
            wallet.pending_expense > 0 ||
            wallet.disputed_income > 0 ||
            wallet.disputed_expense > 0
          ) && (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatusCard
                label="Bekleyen satış alacağı"
                value={money(wallet.pending_income)}
                tone="blue"
              />
              <StatusCard
                label="Bekleyen alış ödemesi"
                value={money(wallet.pending_expense)}
                tone="amber"
              />
              <StatusCard
                label="Uyuşmazlıktaki alacak"
                value={money(wallet.disputed_income)}
                tone="red"
              />
              <StatusCard
                label="Uyuşmazlıktaki ödeme"
                value={money(wallet.disputed_expense)}
                tone="red"
              />
            </section>
          )}

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
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {transactionLabels[item.type]}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.source === 'slaughterhouse'
                              ? 'bg-rose-100 text-rose-700'
                              : item.source === 'trade'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.source === 'slaughterhouse'
                              ? 'Kesimhane alımı'
                              : item.source === 'trade'
                                ? 'Ticari teklif'
                                : 'Manuel hareket'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(item.created_at).toLocaleString('tr-TR')}
                        </p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className={`text-lg font-bold ${
                        item.direction === 'credit'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}>
                        {item.direction === 'credit' ? '+' : '−'} {money(item.amount)}
                      </p>
                      {item.slaughterhouse_request_id ? (
                        <Link
                          href={'/kesimhane/alim-merkezi/' + item.slaughterhouse_request_id}
                          className="text-xs font-semibold text-rose-700 hover:underline"
                        >
                          Teslimat dosyasını görüntüle
                        </Link>
                      ) : item.trade_offer_id ? (
                        <Link
                          href={
                            wallet.account_type === 'platform'
                              ? '/admin/teklifler/' + item.trade_offer_id
                              : '/profil/islem-gecmisi'
                          }
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          İşlemi görüntüle
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs leading-5 text-slate-500">Bu değerler platform içindeki ticari muhasebe hareketleridir; banka hesabındaki kullanılabilir parayı göstermez. Para yatırma ve çekme, ödeme kuruluşu entegrasyonu tamamlandığında ayrıca gösterilecektir.</p>
        </>
      )}
    </main>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone: 'emerald' | 'blue' | 'amber' }) {
  const colors = { emerald: 'bg-emerald-100 text-emerald-700', blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700' }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`inline-flex rounded-xl p-2.5 ${colors[tone]}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>
}


function StatusCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'blue' | 'amber' | 'red'
}) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
  }
  return (
    <div className={'rounded-xl border p-4 ' + colors[tone]}>
      <p className="text-xs font-bold uppercase opacity-70">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  )
}
