'use client';

import React, { useState } from 'react';
import { ShoppingBag, TrendingUp, CheckCircle, Clock } from 'lucide-react';

interface Offer {
  id: string;
  product: string;
  farmer: string;
  requestedQty: string;
  bidPrice: number;
  status: 'Beklemede' | 'Onaylandı' | 'Tamamlandı';
}

export default function TuccarPanelPage() {
  const [offers, setOffers] = useState<Offer[]>([
    { id: '1', product: 'Buğday (Sert)', farmer: 'Ahmet Yılmaz', requestedQty: '20 Ton', bidPrice: 10.40, status: 'Onaylandı' },
    { id: '2', product: 'Dane Mısır', farmer: 'Mehmet Demir', requestedQty: '15 Ton', bidPrice: 9.60, status: 'Beklemede' },
    { id: '3', product: 'Arpa (Yemlik)', farmer: 'Hasan Çelik', requestedQty: '50 Ton', bidPrice: 8.80, status: 'Tamamlandı' },
  ]);

  const handleStatusChange = (id: string, newStatus: 'Beklemede' | 'Onaylandı' | 'Tamamlandı') => {
    setOffers(offers.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tüccar Alım ve Teklif Paneli</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Üreticilerden gelen teklifleri yönetin ve piyasa hacmini takip edin.</p>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Aktif Teklifler</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">12</h3>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-lg">
            <ShoppingBag className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Günlük İşlem Hacmi</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">1.45 Milyon ₺</h3>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/50 text-blue-600 rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Tamamlanan Anlaşmalar</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">38</h3>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-600 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Teklifler Tablosu */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Piyasa Alım Teklifleri</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 uppercase">
                <th className="py-3 px-4">Ürün</th>
                <th className="py-3 px-4">Üretici / Çiftçi</th>
                <th className="py-3 px-4">Talep Miktarı</th>
                <th className="py-3 px-4 text-right">Teklif Edilen Fiyat</th>
                <th className="py-3 px-4 text-center">Durum</th>
                <th className="py-3 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {offers.map((offer) => (
                <tr key={offer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{offer.product}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{offer.farmer}</td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{offer.requestedQty}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">{offer.bidPrice.toFixed(2)} ₺</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-px px-2.5 py-1 text-xs font-medium rounded-full ${
                      offer.status === 'Onaylandı' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' :
                      offer.status === 'Beklemede' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' :
                      'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                    }`}>
                      {offer.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleStatusChange(offer.id, 'Onaylandı')}
                      className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-2.5 py-1 rounded transition-colors font-medium"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => handleStatusChange(offer.id, 'Tamamlandı')}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded transition-colors font-medium"
                    >
                      Bitir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}