// components/Sparkline.tsx
import React from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export default function Sparkline({
  data,
  width = 120,
  height = 35,
  color,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <span className="text-xs text-gray-400">Veri yok</span>;
  }

  // Fiyat yönüne göre otomatik renk (Son fiyat ilk fiyattan yüksekse yeşil, düşükse kırmızı)
  const isUp = data[data.length - 1] >= data[0];
  const strokeColor = color || (isUp ? '#10B981' : '#EF4444'); // Tailwind emerald-500 / red-500

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;

  // SVG koordinatlarını hesaplama
  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      // SVG koordinat düzleminde Y ekseni yukarıdan aşağıya olduğu ters çevrilir
      const y = height - ((val - min) / range) * (height - 8) - 4; 
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="overflow-visible">
        {/* Çizgi Grafiği */}
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {/* Son veri noktasına vurgu dairesi */}
        {data.length > 0 && (
          <circle
            cx={width}
            cy={
              height -
              ((data[data.length - 1] - min) / range) * (height - 8) -
              4
            }
            r="3"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
}