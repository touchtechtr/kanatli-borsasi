"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileUp, Plus, RefreshCw, Send, ShieldCheck, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, PageShell, StatusBadge, SurfaceCard } from "@/components/ui/PlatformUI";
import CompanyLogisticsFiles from "@/components/logistics/CompanyLogisticsFiles";
import CompanyLogisticsDisputes from "@/components/logistics/CompanyLogisticsDisputes";
import CompanyLogisticsRequests from "@/components/logistics/CompanyLogisticsRequests";

type Vehicle={id:string;plate:string;vehicle_type:string;brand_model:string|null;capacity:number;capacity_unit:string;status:string;admin_note:string|null};
type Capability={vehicle_id:string;capability:string};
type DocumentRow={vehicle_id:string;document_type:string;original_name:string};

const capabilities=[
 ["canli_hayvan","Canlı hayvan"],["dokme_yem","Dökme yem"],["cuval_yem","Çuvallı yem"],
 ["tarimsal_urun","Tarımsal ürün"],["zirai_girdi","Gübre / zirai girdi"],["soguk_zincir","Soğuk zincir"],
] as const;
const documentTypes=[["ruhsat","Araç ruhsatı"],["sigorta","Trafik / taşıma sigortası"],["muayene","Muayene belgesi"],["hayvan_tasima_izin","Canlı hayvan taşıma izin belgesi"]] as const;

export default function LogisticsProfilePage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [access,setAccess]=useState<{active?:boolean;company_id?:string|null}>({});
 const [vehicles,setVehicles]=useState<Vehicle[]>([]);
 const [caps,setCaps]=useState<Capability[]>([]);
 const [docs,setDocs]=useState<DocumentRow[]>([]);
 const [selectedCaps,setSelectedCaps]=useState<string[]>([]);
 const [form,setForm]=useState({plate:"",vehicle_type:"hayvan_nakil_araci",brand_model:"",model_year:"",capacity:"",capacity_unit:"ton",inspection_expires_at:"",insurance_expires_at:"",animal_transport_certificate_expires_at:""});
 const [busy,setBusy]=useState<string|null>(null); const [error,setError]=useState<string|null>(null); const [message,setMessage]=useState<string|null>(null);

 const load=useCallback(async()=>{
  setError(null);
  const a=await supabase.rpc("get_my_logistics_access");
  if(a.error){setError(a.error.message);return}
  const next=a.data??{}; setAccess(next);
  if(!next.company_id){setVehicles([]);return}
  const [v,c,d]=await Promise.all([
   supabase.from("logistics_vehicles").select("id,plate,vehicle_type,brand_model,capacity,capacity_unit,status,admin_note").eq("company_id",next.company_id).order("created_at",{ascending:false}),
   supabase.from("logistics_vehicle_capabilities").select("vehicle_id,capability"),
   supabase.from("logistics_vehicle_documents").select("vehicle_id,document_type,original_name"),
  ]);
  const e=v.error||c.error||d.error;if(e){setError(e.message);return}
  setVehicles((v.data??[]) as Vehicle[]);setCaps((c.data??[]) as Capability[]);setDocs((d.data??[]) as DocumentRow[]);
 },[supabase]);
 useEffect(()=>{void load()},[load]);

 const save=async(e:React.FormEvent)=>{e.preventDefault();setBusy("save");setError(null);setMessage(null);
  const r=await supabase.rpc("save_logistics_vehicle",{p_data:{...form,capabilities:selectedCaps}});
  setBusy(null);if(r.error){setError(r.error.message);return}
  setMessage("Araç taslağı kaydedildi. Ruhsat, sigorta ve muayene belgelerini yükleyin.");setForm({...form,plate:"",brand_model:"",model_year:"",capacity:""});setSelectedCaps([]);await load();
 };
 const upload=async(vehicle:Vehicle,type:string,file:File)=>{
  if(!access.company_id)return;setBusy(vehicle.id+type);setError(null);
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=`${access.company_id}/${vehicle.id}/${type}-${Date.now()}-${safe}`;
  const u=await supabase.storage.from("logistics-documents").upload(path,file,{contentType:file.type,upsert:true});
  if(u.error){setBusy(null);setError(u.error.message);return}
  const r=await supabase.rpc("register_logistics_vehicle_document",{p_vehicle_id:vehicle.id,p_document_type:type,p_storage_path:path,p_original_name:file.name,p_mime_type:file.type||null,p_file_size:file.size});
  setBusy(null);if(r.error){setError(r.error.message);return} await load();
 };
 const submit=async(id:string)=>{setBusy(id);setError(null);const r=await supabase.rpc("submit_logistics_vehicle",{p_vehicle_id:id});setBusy(null);if(r.error){setError(r.error.message);return}setMessage("Araç yönetici incelemesine gönderildi.");await load()};

 return <PageShell>
  <PageHeader eyebrow="Şirket çalışma alanı" title="Nakliye ve araçlar" icon={Truck} tone="emerald"
   description="Resmî faaliyet belgelerinizi, araç ruhsatlarını ve taşıma yetkinliklerinizi yönetin."
   actions={<><Link href="/lojistik" className="ui-button ui-button--secondary">Lojistik pazarını aç</Link><button onClick={()=>void load()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Yenile</button></>}/>
  {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
  {!access.active&&<SurfaceCard className="border-amber-200 bg-amber-50/70">
   <div className="flex gap-3"><ShieldCheck className="h-6 w-6 text-amber-600"/><div><h2 className="font-black text-slate-900">Nakliyeci olarak hizmet vermek ister misiniz?</h2><p className="mt-1 text-sm text-slate-600">Taşıma talebi sahibi olarak mevcut nakliye dosyalarınızı aşağıdan takip edebilirsiniz. İlan vermek, teklif sunmak ve araç kaydetmek için nakliye faaliyetini ayrıca onaylatmanız gerekir.</p><Link href="/profil/faaliyetler?activity=logistics_operator" className="ui-button ui-button--primary mt-4">Nakliyeci faaliyet başvurusuna git</Link></div></div>
  </SurfaceCard>}
  {access.company_id&&<CompanyLogisticsDisputes/>}
  {access.company_id&&<CompanyLogisticsRequests compact/>}
  {access.company_id&&<CompanyLogisticsFiles/>}
  {access.active&&<SurfaceCard>
   <h2 className="ui-section-title">Yeni araç kaydı</h2><p className="ui-section-description">Araç onaylandıktan sonra yalnızca seçilen taşıma türlerinde ilan ve teklif verebilir.</p>
   <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <Field label="Plaka"><input required value={form.plate} onChange={e=>setForm({...form,plate:e.target.value})} className="ui-input" placeholder="07ABC123"/></Field>
    <Field label="Araç türü"><select value={form.vehicle_type} onChange={e=>setForm({...form,vehicle_type:e.target.value})} className="ui-input"><option value="hayvan_nakil_araci">Hayvan nakil aracı</option><option value="silobas">Silobas</option><option value="kamyon">Kamyon</option><option value="tir">Tır</option><option value="kamyonet">Kamyonet</option><option value="frigofrik">Frigorifik</option><option value="diger">Diğer</option></select></Field>
    <Field label="Marka / model"><input value={form.brand_model} onChange={e=>setForm({...form,brand_model:e.target.value})} className="ui-input"/></Field>
    <Field label="Model yılı"><input type="number" value={form.model_year} onChange={e=>setForm({...form,model_year:e.target.value})} className="ui-input"/></Field>
    <Field label="Kapasite"><input required min="0.01" step="0.01" type="number" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})} className="ui-input"/></Field>
    <Field label="Kapasite birimi"><select value={form.capacity_unit} onChange={e=>setForm({...form,capacity_unit:e.target.value})} className="ui-input"><option value="ton">Ton</option><option value="kg">Kg</option><option value="adet">Adet</option><option value="palet">Palet</option><option value="m3">m³</option></select></Field>
    <Field label="Muayene bitiş"><input type="date" value={form.inspection_expires_at} onChange={e=>setForm({...form,inspection_expires_at:e.target.value})} className="ui-input"/></Field>
    <Field label="Sigorta bitiş"><input type="date" value={form.insurance_expires_at} onChange={e=>setForm({...form,insurance_expires_at:e.target.value})} className="ui-input"/></Field>
    <div className="md:col-span-2 xl:col-span-4"><p className="text-sm font-bold text-slate-700">Taşıma yetkinlikleri</p><div className="mt-2 flex flex-wrap gap-2">{capabilities.map(([v,l])=><label key={v} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold ${selectedCaps.includes(v)?"border-emerald-500 bg-emerald-50 text-emerald-800":"border-slate-200"}`}><input type="checkbox" className="mr-2" checked={selectedCaps.includes(v)} onChange={()=>setSelectedCaps(x=>x.includes(v)?x.filter(i=>i!==v):[...x,v])}/>{l}</label>)}</div></div>
    <button disabled={busy!==null||selectedCaps.length===0} className="ui-button ui-button--primary md:col-span-2 xl:col-span-4"><Plus className="h-4 w-4"/>Araç taslağını kaydet</button>
   </form>
  </SurfaceCard>}
  <div className="grid gap-5 xl:grid-cols-2">{vehicles.map(v=><SurfaceCard key={v.id}>
   <div className="flex items-start justify-between gap-3"><div><p className="ui-eyebrow">{v.vehicle_type.replaceAll("_"," ")}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{v.plate}</h2><p className="mt-1 text-sm text-slate-500">{v.brand_model||"Marka/model belirtilmedi"} · {v.capacity} {v.capacity_unit}</p></div><StatusBadge tone={v.status==="onaylandi"?"emerald":v.status==="reddedildi"?"red":"amber"}>{v.status.replaceAll("_"," ")}</StatusBadge></div>
   <div className="mt-4 flex flex-wrap gap-2">{caps.filter(c=>c.vehicle_id===v.id).map(c=><span key={c.capability} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{capabilities.find(x=>x[0]===c.capability)?.[1]||c.capability}</span>)}</div>
   {v.admin_note&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Yönetim notu: {v.admin_note}</p>}
   <div className="mt-5 grid gap-3 sm:grid-cols-2">{documentTypes.map(([type,label])=>{const found=docs.find(d=>d.vehicle_id===v.id&&d.document_type===type);return <label key={type} className="cursor-pointer rounded-xl border border-dashed p-3 text-sm"><span className="flex items-center gap-2 font-bold"><FileUp className="h-4 w-4"/>{label}</span><span className="mt-1 block truncate text-xs text-slate-500">{found?.original_name||"Belge seç"}</span><input type="file" accept=".pdf,image/jpeg,image/png" className="hidden" disabled={busy!==null} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(v,type,f)}}/></label>})}</div>
   {v.status!=="onaylandi"&&<button onClick={()=>void submit(v.id)} disabled={busy!==null} className="ui-button ui-button--primary mt-5 w-full"><Send className="h-4 w-4"/>İncelemeye gönder</button>}
  </SurfaceCard>)}</div>
 </PageShell>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="space-y-1.5"><span className="text-sm font-bold text-slate-700">{label}</span>{children}</label>}
