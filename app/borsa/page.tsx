'use client';

import React, { useState } from 'react';
import { Search, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';

interface MarketItem {
  id: string;
  name: string;
  category: string;
  price: number;
  change: number;
  high: number;
  low: number;
  volume: string;
}

const initialMarketData: MarketItem[] = [
  { id: '1', name: 'Buğday (Ekmeklik)', category: 'Tahıl', price: 10.45, change: 2.15, high: 10.60, low: 10.30, volume: '1.2M TL' },
  { id: '2', name: 'Arpa (Yemlik)', category: 'Tahıl', price: 8.90, change: -0.75, high: 9.05, low: 8.85, volume: '850K TL' },
  { id: '3', name: 'Mısır (Dane)', category: 'Tahıl', price: 9.75, change: 1.40, high: 9.85, low: 9.60, volume: '2.1M TL' },
  { id: '4', name: 'Broiler Yem (Çuval 50kg)', category: 'Kanatlı', price: 540.00, change: 0.50, high: 545.00, low: 535.00, volume: '4.5M TL' },
  { id: '5', name: 'Yumurta Tavuğu Yemi', category: 'Kanatlı', price: 495.00, change: -1.20, high: 500.00, low: 490.00, volume: '3.1M TL' },
  { id: '6', name: 'Ayçiçeği Küspesi', category: 'Küspe', price: 7.80, change: 3.20, high: 7.95, low: 7.55, volume: '950K TL' },
];

export default function BorsaPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [data] = useState<MarketItem[]>(initialMarketData);

  const filteredData = data.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Başlık ve Açıklama */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Canlı Piyasa ve Borsa</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Anlık tarım ve yem hammaddeleri fiyat akışı.</p>
        </div>
        
        {/* Arama Çubuğu */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Ürün veya kategori ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Tablo Kartı */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Ürün Adı</th>
                <th className="py-3 px-4">Kategori</th>
                <th className="py-3 px-4 text-right">Fiyat (TL)</th>
                <th className="py-3 px-4 text-right">Günlük Değişim</th>
                <th className="py-3 px-4 text-right">Gün İçi (Yüksek / Düşük)</th>
                <th className="py-3 px-4 text-right">İşlem Hacmi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredData.map((item) => {
                const isPositive = item.change >= 0;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{item.name}</td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      <span className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 rounded-md">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">
                      {item.price.toFixed(2)} ₺
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        isPositive 
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' 
                          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{item.change}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400 text-xs">
                      {item.high} ₺ / {item.low} ₺
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400 text-xs">
                      {item.volume}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}