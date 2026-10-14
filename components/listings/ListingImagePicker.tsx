'use client'

import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Star, Trash2 } from 'lucide-react'

export default function ListingImagePicker({ files, onChange, maxFiles=8 }: { files: File[]; onChange: (files: File[]) => void; maxFiles?: number }) {
  const [error,setError]=useState<string|null>(null)
  const previews=useMemo(()=>files.map(file=>URL.createObjectURL(file)),[files])
  useEffect(()=>()=>previews.forEach(url=>URL.revokeObjectURL(url)),[previews])
  const add=(selected:File[])=>{
    setError(null)
    const valid=selected.filter(file=>['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=5*1024*1024)
    if(valid.length!==selected.length)setError('Yalnızca JPG, PNG veya WEBP; en fazla 5 MB görsel yükleyebilirsiniz.')
    onChange([...files,...valid].slice(0,maxFiles))
  }
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">İlan görselleri</p><p className="text-xs text-slate-500">En fazla {maxFiles} görsel · İlk görsel kapak görselidir.</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><ImagePlus className="h-4 w-4"/>Görsel seç<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event=>{add(Array.from(event.target.files??[]));event.target.value='' }}/></label></div>
    {error&&<p className="text-xs font-semibold text-red-600">{error}</p>}
    {files.length>0&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{files.map((file,index)=><div key={`${file.name}-${file.lastModified}-${index}`} className={`relative overflow-hidden rounded-xl border-2 bg-slate-100 ${index===0?'border-emerald-500':'border-slate-200'}`}><img src={previews[index]} alt="İlan önizlemesi" className="aspect-[4/3] w-full object-cover"/><div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/70 p-1.5 text-white">{index===0?<span className="inline-flex items-center gap-1 text-[10px] font-bold"><Star className="h-3 w-3 fill-current"/>Kapak</span>:<button type="button" onClick={()=>onChange([files[index],...files.filter((_,i)=>i!==index)])} className="text-[10px] font-bold">Kapak yap</button>}<button type="button" aria-label="Görseli kaldır" onClick={()=>onChange(files.filter((_,i)=>i!==index))}><Trash2 className="h-3.5 w-3.5"/></button></div></div>)}</div>}
  </div>
}
