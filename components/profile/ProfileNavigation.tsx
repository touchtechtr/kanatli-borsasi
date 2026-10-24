"use client";

import Link from "next/link";
import { useCallback,useEffect,useMemo,useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BadgeCheck,
  Bell,
  Building2,
  Crown,
  Factory,
  Handshake,
  History,
  LayoutDashboard,
  PackageSearch,
  ShieldCheck,
  Wallet,
  Truck,
} from "lucide-react";

const ITEMS = [
  { href: "/profil", label: "Genel Bakış", icon: LayoutDashboard, exact: true },
  { href: "/profil/sirket", label: "Şirket Bilgilerim", icon: Building2 },
  {
    href: "/profil/faaliyetler",
    label: "Faaliyetler ve Belgeler",
    icon: BadgeCheck,
  },
  { href: "/profil/ilanlarim", label: "İlanlarım", icon: PackageSearch },
  { href: "/profil/teklifler", label: "Teklifler", icon: Handshake },
  { href: "/profil/lojistik", label: "Nakliye ve Araçlar", icon: Truck },
  { href: "/kesimhane/alim-merkezi", label: "Kesimhane Alımları", icon: Factory },
  { href: "/profil/ilan-promosyonlari", label: "Öne Çıkarma", icon: Crown },
  { href: "/profil/islem-gecmisi", label: "İşlem Geçmişim", icon: History },
  { href: "/profil/cuzdan", label: "Finans / Cüzdan", icon: Wallet },
  { href: "/profil/bildirimler", label: "Bildirimler", icon: Bell },
  { href: "/profil/guvenlik", label: "Güvenlik", icon: ShieldCheck },
];

export default function ProfileNavigation() {
  const pathname = usePathname();
  const supabase=useMemo(()=>createClient(),[]);
  const[unread,setUnread]=useState(0);
  const refreshUnread=useCallback(async()=>{const result=await supabase.from("notifications").select("id",{count:"exact",head:true}).is("read_at",null);if(!result.error)setUnread(result.count??0)},[supabase]);
  useEffect(()=>{void refreshUnread();const channel=supabase.channel("profile-unread-notifications").on("postgres_changes",{event:"*",schema:"public",table:"notifications"},()=>void refreshUnread()).subscribe();return()=>{void supabase.removeChannel(channel)}},[refreshUnread,supabase]);
  return (
   <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
    <div className="mb-2 flex items-center justify-between border-b border-slate-100 px-2 pb-2"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Şirket çalışma alanı</p><Link href="/profil/bildirimler" aria-label={`${unread} okunmamış bildirim`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-900 hover:text-white"><Bell className="h-5 w-5"/>{unread>0&&<span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white ring-2 ring-white">{unread>99?"99+":unread}</span>}</Link></div>
    <nav className="grid grid-flow-col grid-rows-2 gap-2 overflow-x-auto pb-1">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
   </div>
  );
}
