'client'
'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LivestockPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtre State'leri
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnimalType, setSelectedAnimalType] = useState('Tümü');
  const [selectedCity, setSelectedCity] = useState('Tümü');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');

  useEffect(() => {
    async function fetchListings() {
      const { data, error } = await supabase
        .from('livestock_listings')
        .select('*, companies(name)')
        .eq('status', 'aktif')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('İlanlar çekilirken hata oluştu:', error.message);
      } else {
        setListings(data || []);
      }
      setLoading(false);
    }

    fetchListings();
  }, []);

  // Filtreleme Mantığı (Memoized)
  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.breed && item.breed.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.companies?.name && item.companies.name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesAnimalType =
        selectedAnimalType === 'Tümü' || item.animal_type === selectedAnimalType;

      const matchesCity =
        selectedCity === 'Tümü' || (item.city && item.city.toLowerCase() === selectedCity.toLowerCase());

      const matchesCategory =
        selectedCategory === 'Tümü' || item.category === selectedCategory;

      return matchesSearch && matchesAnimalType && matchesCity && matchesCategory;
    });
  }, [listings, searchQuery, selectedAnimalType, selectedCity, selectedCategory]);

  const uniqueCities = useMemo(() => {
    const cities = listings.map((i) => i.city).filter(Boolean);
    return ['Tümü', ...Array.from(new Set(cities))];
  }, [listings]);

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Canlı hayvan ilanları yükleniyor...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-12 space-y-8">
      
      {/* Üst Bilgi ve İlan Ver Butonu */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Canlı Hayvan Borsası</h1>
          <p className="text-sm text-slate-500 mt-1">Kanatlı, küçükbaş ve büyükbaş canlı hayvan alım-satım ilanları.</p>
        </div>
        <a
          href="/livestock/new"
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
        >
          + Yeni Canlı Hayvan İlanı Ver
        </a>
      </div>

      {/* Filtreleme ve Arama Paneli */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Irk (örn: Ross 308, Simental), başlık veya firma adı ile arayın..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕ Temizle
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Canlı Grubu</label>
            <select
              value={selectedAnimalType}
              onChange={(e) => setSelectedAnimalType(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="Tümü">Tüm Gruplar</option>
              <option value="Kanatlı Hayvan">Kanatlı Hayvan</option>
              <option value="Küçükbaş (Koyun/Keçi)">Küçükbaş (Koyun/Keçi)</option>
              <option value="Büyükbaş (İnek/Sığır)">Büyükbaş (İnek/Sığır)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Şehir</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              {uniqueCities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedAnimalType('Tümü');
                setSelectedCity('Tümü');
                setSelectedCategory('Tümü');
              }}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Filtreleri Sıfırla
            </button>
          </div>
        </div>
      </div>

      {/* İlan Listesi */}
      {filteredListings.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 text-center text-slate-400">
          Arama ve filtreleme kriterlerinize uygun canlı hayvan ilanı bulunamadı.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((item) => (
            <div key={item.id} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-semibold px-3 py-1 rounded-full">
                    {item.category}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md">
                    📍 {item.city}
                  </span>
                </div>
                
                <h2 className="text-base font-bold text-slate-900 mb-2">{item.title}</h2>
                
                <div className="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p><span className="font-semibold text-slate-700">Canlı Grubu:</span> {item.animal_type}</p>
                  <p><span className="font-semibold text-slate-700">Irk / Çeşit:</span> {item.breed || 'Belirtilmemiş'}</p>
                  <p><span className="font-semibold text-slate-700">Yaş / Dönem:</span> {item.age_group || 'Belirtilmemiş'}</p>
                  {item.average_weight && (
                    <p><span className="font-semibold text-slate-700">Ort. Ağırlık:</span> {item.average_weight} kg</p>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-slate-100">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Miktar</div>
                  <div className="text-sm font-bold text-slate-800">{item.quantity} {item.unit}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Birim Fiyat</div>
                  <div className="text-lg font-extrabold text-emerald-600">
                    ₺{Number(item.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 border-t border-slate-50 pt-2 flex justify-between items-center">
                <span>Firma: <strong className="text-slate-600">{item.companies?.name || 'Kurumsal Üye'}</strong></span>
                <span>{new Date(item.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}