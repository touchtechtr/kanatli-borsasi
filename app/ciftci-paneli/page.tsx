'use client';

import React, { useState } from 'react';
import { PlusCircle, Package, Trash2, CheckCircle2 } from 'lucide-react';

interface ProductItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  date: string;
}

export default function CiftciPanelPage() {
  const [products, setProducts] = useState<ProductItem[]>([
    { id: '1', name: 'Buğday (Sert)', category: 'Tahıl', quantity: 5000, unit: 'Kg', price: 10.50, date: '2026-08-30' },
    { id: '2', name: 'Dane Mısır', category: 'Tahıl', quantity: 3200, unit: 'Kg', price: 9.75, date: '2026-08-28' },
  ]);

  const [form, setForm] = useState({
    name: '',
    category: 'Tahıl',
    quantity: '',
    unit: 'Kg',
    price: ''
  });

  const [successMsg, setSuccessMsg] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.quantity || !form.price) return;

    const newItem: ProductItem = {
      id: Date.now().toString(),
      name: form.name,
      category: form.category,
      quantity: Number(form.quantity),
      unit: form.unit,
      price: Number(form.price),
      date: new Date().toISOString().split('T')[0]
    };

    setProducts([newItem, ...products]);
    setForm({ name: '', category: 'Tahıl', quantity: '', unit: 'Kg', price: '' });
    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 3000);
  };

  const handleDelete = (id: string) => {
    setProducts(products.filter(item => item.id !== id));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Çiftçi Ürün Paneli</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Üretimini yaptığınız tarım ürünlerini sisteme kolayca kaydedin ve listeleyin.</p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5" />
          <span>Ürününüz başarıyla sisteme eklendi ve piyasaya arz edildi!</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ürün Ekleme Formu */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm h-fit space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-500" />
            Yeni Ürün Girişi
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Ürün Adı</label>
              <input
                type="text"
                placeholder="Örn: Arpa, Soya Küspesi..."
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Kategori</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
              >
                <option value="Tahıl">Tahıl</option>
                <option value="Kanatlı Yemi">Kanatlı Yemi</option>
                <option value="Küspe & Bakliyat">Küspe & Bakliyat</option>
                <option value="Yağlı Tohumlar">Yağlı Tohumlar</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Miktar</label>
                <input
                  type="number"
                  placeholder="Miktar"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Birim</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                >
                  <option value="Kg">Kg</option>
                  <option value="Ton">Ton</option>
                  <option value="Çuval">Çuval</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Birim Fiyat (TL)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900 dark:text-white"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              Ürünü Sisteme Kaydet
            </button>
          </form>
        </div>

        {/* Kayıtlı Ürünler Listesi */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-500" />
              Aktif Ürün İlanlarım ({products.length})
            </h2>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-semibold text-slate-500 uppercase">
                  <th className="py-3 px-4">Ürün Adı</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Miktar</th>
                  <th className="py-3 px-4 text-right">Fiyat</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">Henüz kayıtlı bir ürününüz bulunmuyor.</td>
                  </tr>
                ) : (
                  products.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{item.name}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400">{item.category}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{item.quantity} {item.unit}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-white">{item.price.toFixed(2)} ₺</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                          title="İlanı Kaldır"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}