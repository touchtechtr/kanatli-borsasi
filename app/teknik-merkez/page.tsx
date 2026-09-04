'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Article {
  id: string
  title: string
  category: string
  summary: string
  author: string
  read_time: string
  created_at: string
}

export default function TeknikMerkezPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')

  const categories = ['Tümü', 'Kümes & Kuluçka', 'Alternatif Yem', 'Biyogüvenlik', 'Küresel Piyasalar']

  useEffect(() => {
    setMounted(true)
    fetchArticles()
  }, [])

  const fetchArticles = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('technical_articles')
      .select('*')
      .order('created_at', { ascending: false })
    
    setArticles(data || [])
    setLoading(false)
  }

  const filteredArticles = articles.filter(item => {
    if (selectedCategory === 'Tümü') return true;
    return item.category === selectedCategory;
  });

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Üst Bar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <button onClick={() => router.push('/')} className="text-xs text-emerald-600 font-semibold hover:underline">
              ← Ana Sayfaya Dön
            </button>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">📚 Teknik Bilgi Bankası ve Ar-Ge Merkezi</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Veterinerlik rehberleri, kuluçka optimizasyonu, alternatif yem araştırmaları ve küresel piyasa bültenleri.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push('/sektor-konseyi')}
              className="bg-slate-900 text-white hover:bg-slate-800 px-4 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm"
            >
              🏛️ Sektor Konseyi
            </button>
          </div>
        </div>

        {/* Kategori Filtreleri */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Makaleler Grid / Liste */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-lg">Güncel Araştırma ve Teknik Raporlar</h2>
            <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
              Toplam: {filteredArticles.length}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">Yükleniyor...</div>
          ) : filteredArticles.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Bu kategoride henüz içerik bulunmuyor.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredArticles.map((item) => (
                <div key={item.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                        {item.category}
                      </span>
                      <span className="text-xs font-medium text-slate-500">✍️ {item.author}</span>
                      <span className="text-xs text-slate-400">• ⏱️ {item.read_time}</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-base">{item.title}</h3>
                    <p className="text-sm text-slate-600 max-w-3xl">{item.summary}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <button className="inline-block bg-slate-100 text-slate-800 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all">
                      Makaleyi Oku →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}