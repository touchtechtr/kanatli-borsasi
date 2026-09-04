'tsx'
'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewLivestockPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    animal_type: 'Kanatlı Hayvan',
    category: 'Broyler (Etlik)',
    breed: '',
    title: '',
    quantity: '',
    unit: 'Baş',
    price: '',
    age_group: '',
    average_weight: '',
    city: 'Antalya',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('İlan vermek için giriş yapmalısınız.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('livestock_listings').insert([
      {
        user_id: user.id,
        animal_type: formData.animal_type,
        category: formData.category,
        breed: formData.breed,
        title: formData.title,
        quantity: parseInt(formData.quantity),
        unit: formData.unit,
        price: parseFloat(formData.price),
        age_group: formData.age_group,
        average_weight: formData.average_weight ? parseFloat(formData.average_weight) : null,
        city: formData.city,
        status: 'aktif',
      },
    ]);

    if (error) {
      alert('İlan eklenirken bir hata oluştu: ' + error.message);
    } else {
      alert('İlanınız başarıyla yayınlandı!');
      router.push('/livestock');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white shadow-sm rounded-xl border border-gray-200 my-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Yeni Canlı Hayvan İlanı Oluştur</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">İlan Başlığı</label>
          <input
            type="text"
            name="title"
            required
            placeholder="Örn: 30 Günlük Sağlık Sertifikalı Broyler Sürü"
            value={formData.title}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="Broyler (Etlik)">Broyler (Etlik)</option>
              <option value="Yumurtalık Yarka">Yumurtalık Yarka</option>
              <option value="Damızlık">Damızlık</option>
              <option value="Hindi">Hindi</option>
              <option value="Kaz / ördek">Kaz / Ördek</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Irk / Çeşit</label>
            <input
              type="text"
              name="breed"
              placeholder="Örn: Ross 308, Cobb 500"
              value={formData.breed}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adet / Baş</label>
            <input
              type="number"
              name="quantity"
              required
              placeholder="5000"
              value={formData.quantity}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Birim Fiyat (TL)</label>
            <input
              type="number"
              step="0.01"
              name="price"
              required
              placeholder="45.00"
              value={formData.price}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Şehir</label>
            <input
              type="text"
              name="city"
              required
              value={formData.city}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Yaş / Dönem Bilgisi</label>
            <input
              type="text"
              name="age_group"
              placeholder="Örn: 28 Günlük"
              value={formData.age_group}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ortalama Ağırlık (kg/g)</label>
            <input
              type="number"
              step="0.01"
              name="average_weight"
              placeholder="Örn: 1.45"
              value={formData.average_weight}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 text-white font-medium py-3 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 mt-4"
        >
          {loading ? 'Yayınlanıyor...' : 'İlanı Yayınla'}
        </button>
      </form>
    </div>
  );
}