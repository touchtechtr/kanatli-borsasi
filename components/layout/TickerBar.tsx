"use client";

import { ArrowUp, ArrowDown } from "lucide-react";

type TickerItem = {
  symbol: string;
  name: string;
  price: number;
  unit: string;
  change: number; // yüzde değişim
};

// TODO: Bu veriler canlı borsa API'sinden / WebSocket akışından beslenecek.
const TICKER_DATA: TickerItem[] = [
  { symbol: "PLC-BYZ", name: "Piliç (Beyaz Et)", price: 42.5, unit: "kg", change: 1.8 },
  { symbol: "PLC-KRM", name: "Piliç (Kırmızı Et)", price: 39.2, unit: "kg", change: -0.6 },
  { symbol: "HNDI", name: "Hindi", price: 61.75, unit: "kg", change: 2.4 },
  { symbol: "YMRT-B", name: "Yumurta (Beyaz, 30lu)", price: 78.0, unit: "koli", change: -1.2 },
  { symbol: "YMRT-K", name: "Yumurta (Kahve, 30lu)", price: 82.5, unit: "koli", change: 0.9 },
  { symbol: "CIVCIV", name: "Etlik Civciv (1 Günlük)", price: 12.3, unit: "adet", change: 0.4 },
  { symbol: "KAZ", name: "Kaz", price: 155.0, unit: "kg", change: -0.3 },
  { symbol: "ORDEK", name: "Ördek", price: 98.4, unit: "kg", change: 1.1 },
];

function TickerCell({ item }: { item: TickerItem }) {
  const isUp = item.change >= 0;
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap px-5 py-2 text-sm">
      <span className="font-semibold text-white/90">{item.symbol}</span>
      <span className="text-slate-400">{item.name}</span>
      <span className="font-mono font-medium text-white">
        {item.price.toFixed(2)}₺<span className="text-slate-500">/{item.unit}</span>
      </span>
      <span
        className={`flex items-center gap-0.5 font-mono text-xs font-semibold ${
          isUp ? "text-tarim-400" : "text-red-400"
        }`}
      >
        {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(item.change).toFixed(1)}%
      </span>
    </div>
  );
}

export default function TickerBar() {
  return (
    <div className="flex h-11 flex-shrink-0 items-center border-b border-navy-800 bg-navy-900">
      {/* Canlı rozeti */}
      <div className="flex h-full flex-shrink-0 items-center gap-1.5 border-r border-navy-700 bg-navy-950 px-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-tarim-500" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-tarim-500" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-tarim-500">
          Canlı
        </span>
      </div>

      {/* Kayan fiyat şeridi */}
      <div className="group relative flex flex-1 overflow-hidden">
        <div className="flex w-max animate-marquee items-center group-hover:[animation-play-state:paused]">
          {[...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
            <TickerCell key={`${item.symbol}-${i}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
