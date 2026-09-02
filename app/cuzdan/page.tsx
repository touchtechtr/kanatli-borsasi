'use client';

import React from 'react';
import { Wallet, ArrowUpRight, ArrowDownLeft, CreditCard, RefreshCcw } from 'lucide-react';

interface Transaction {
  id: string;
  description: string;
  type: 'income' | 'expense';
  amount: number;
  date: string;
}

export default function FinansPage() {
  const transactions: Transaction[] = [
    { id: '1', description: 'Buğday Satış Ödemesi (20 Ton)', type: 'income', amount: 208000, date: '2026-08-30' },
    { id: '2', description: 'Gübre ve Tohum Alımı', type: 'expense', amount: 45000, date: '2026-08-27' },
    { id: '3', description: 'Mısır Hasat Avansı', type: 'income', amount: 95000, date: '2026-08-22' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Finans ve Cüzdan</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Hesap bakiyenizi, varlıklarınızı ve geçmiş transferlerinizi görüntüleyin.</p>
      </div>

      {/* Bakiye Kartı */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <p className="text-emerald-100 text-sm font-medium">Toplam Kullanılabilir Bakiye</p>
          <h2 className="text-4xl font-extrabold tracking-tight">258,450.00 ₺</h2>
          <p className="text-xs text-emerald-200 pt-1">Son Güncelleme: Bugün, 02:00</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="flex-1 md:flex-none px-4 py-2.5 bg-white text-emerald-700 hover:bg-emerald-50 rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center justify-center gap-2">
            <ArrowDownLeft className="w-4 h-4" /> Para Yatır
          </button>
          <button className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-800/60 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold transition-colors border border-emerald-500/30 flex items-center justify-center gap-2">
            <ArrowUpRight className="w-4 h-4" /> Para Çek
          </button>
        </div>
      </div>

      {/* İşlem Geçmişi */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-500" />
            Son Finansal İşlemler
          </h2>
          <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
            <RefreshCcw className="w-3.5 h-3.5" /> Yenile
          </button>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {transactions.map((tx) => {
            const isIncome = tx.type === 'income';
            return (
              <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isIncome ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'}`}>
                    {isIncome ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{tx.description}</p>
                    <p className="text-xs text-slate-500">{tx.date}</p>
                  </div>
                </div>
                <div className={`text-sm font-bold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                  {isIncome ? '+' : '-'}{tx.amount.toLocaleString('tr-TR')} ₺
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}