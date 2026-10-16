"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Factory,
  RefreshCw,
  Scale,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
type RequestRow = {
  id: string;
  company_id: string;
  slaughterhouse_id: string | null;
  title: string;
  animal_type: string;
  breed: string | null;
  quantity_required: number;
  min_live_weight: number | null;
  max_live_weight: number | null;
  price_model: string;
  target_price: number | null;
  city: string;
  delivery_address: string | null;
  delivery_start: string;
  delivery_end: string;
  health_requirements: string | null;
  expert_required: boolean;
  transport_responsibility: string;
  payment_terms: string | null;
  description: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};
type Offer = {
  id: string;
  seller_company_id: string;
  quantity: number;
  average_live_weight: number | null;
  unit_price: number;
  price_unit: string;
  proposed_delivery_date: string;
  transport_included: boolean;
  message: string | null;
  status: string;
  created_at: string;
};
export default function AdminRequestFile() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [facility, setFacility] = useState<{
    id: string;
    name: string;
    status: string;
    city: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: r, error: re } = await supabase
      .from("slaughterhouse_purchase_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (re || !r) {
      setError(re?.message ?? "Talep bulunamadı.");
      setLoading(false);
      return;
    }
    const { data: o, error: oe } = await supabase
      .from("slaughterhouse_purchase_offers")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: false });
    if (oe) {
      setError(oe.message);
      setLoading(false);
      return;
    }
    const offerRows = (o ?? []) as Offer[];
    const ids = [
      ...new Set([r.company_id, ...offerRows.map((x) => x.seller_company_id)]),
    ];
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("public_companies").select("id,name").in("id", ids),
      r.slaughterhouse_id
        ? supabase
            .from("slaughterhouses")
            .select("id,name,status,city")
            .eq("id", r.slaughterhouse_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    setRequest(r as RequestRow);
    setOffers(offerRows);
    setNames(Object.fromEntries((c ?? []).map((x) => [x.id, x.name])));
    setFacility(s);
    setLoading(false);
  }, [id, supabase]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading)
    return (
      <div className="p-12 text-center text-slate-500">
        Talep dosyası yükleniyor…
      </div>
    );
  if (!request)
    return <div className="p-12 text-center text-red-600">{error}</div>;
  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/admin/kesimhane-alimlari"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Kesimhane alımlarına dön
          </Link>
          <button
            onClick={() => void load()}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
          >
            <RefreshCw className="mr-2 inline h-4 w-4" />
            Yenile
          </button>
        </div>
        <section className="rounded-3xl bg-slate-950 p-7 text-white">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
            {request.status}
          </span>
          <h1 className="mt-4 text-3xl font-black">{request.title}</h1>
          <p className="mt-2 text-slate-300">
            {names[request.company_id]} · {request.city} ·{" "}
            {new Date(request.created_at).toLocaleString("tr-TR")}
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat
              icon={Scale}
              label="Talep"
              value={`${request.quantity_required.toLocaleString("tr-TR")} baş`}
            />
            <Stat icon={Building2} label="Hayvan" value={request.animal_type} />
            <Stat
              icon={Scale}
              label="Hedef fiyat"
              value={
                request.target_price
                  ? Number(request.target_price).toLocaleString("tr-TR", {
                      style: "currency",
                      currency: "TRY",
                    })
                  : "—"
              }
            />
            <Stat
              icon={CalendarDays}
              label="Teslim"
              value={`${new Date(request.delivery_start).toLocaleDateString("tr-TR")}–${new Date(request.delivery_end).toLocaleDateString("tr-TR")}`}
            />
          </div>
        </section>
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-black">Talep sahibi ve tesis</h2>
            <Info label="Firma" value={names[request.company_id]} />
            <Info
              label="Tesis"
              value={
                facility
                  ? `${facility.name} · ${facility.city} · ${facility.status}`
                  : "Bağlı tesis bulunmuyor"
              }
            />
            <Info label="Teslimat adresi" value={request.delivery_address} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/admin/firmalar/${request.company_id}#faaliyetler`}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Firma faaliyetleri
              </Link>
              <Link
                href={`/admin/firmalar/${request.company_id}#kesimhaneler`}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Firma tesisleri
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-black">Alım koşulları</h2>
            <Info label="Irk / çeşit" value={request.breed} />
            <Info
              label="Canlı ağırlık"
              value={`${request.min_live_weight ?? "—"}–${request.max_live_weight ?? "—"} kg`}
            />
            <Info label="Nakliye" value={request.transport_responsibility} />
            <Info
              label="Ekspertiz"
              value={request.expert_required ? "Zorunlu" : "Talebe bağlı"}
            />
            <Info label="Sağlık şartları" value={request.health_requirements} />
            <Info label="Ödeme şartları" value={request.payment_terms} />
            <Info label="Yönetim notu" value={request.admin_note} />
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-black">Bu talebe gelen teklifler</h2>
          <div className="mt-4 space-y-3">
            {offers.length === 0 ? (
              <p className="text-sm text-slate-500">Teklif bulunmuyor.</p>
            ) : (
              offers.map((o) => {
                const total =
                  o.price_unit === "bas"
                    ? o.quantity * Number(o.unit_price)
                    : o.average_live_weight
                      ? o.quantity *
                        Number(o.average_live_weight) *
                        Number(o.unit_price)
                      : null;
                return (
                  <article key={o.id} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-extrabold">
                          {names[o.seller_company_id]}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(o.created_at).toLocaleString("tr-TR")}
                        </p>
                      </div>
                      <span className="text-xs font-bold">{o.status}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Info label="Miktar" value={`${o.quantity} baş`} />
                      <Info
                        label="Birim fiyat"
                        value={`${Number(o.unit_price).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} / ${o.price_unit}`}
                      />
                      <Info
                        label="Tahmini toplam"
                        value={
                          total
                            ? total.toLocaleString("tr-TR", {
                                style: "currency",
                                currency: "TRY",
                              })
                            : "Ağırlık sonrası"
                        }
                      />
                      <Info
                        label="Ortalama ağırlık"
                        value={
                          o.average_live_weight
                            ? `${o.average_live_weight} kg / baş`
                            : "—"
                        }
                      />
                      <Info
                        label="Teslim tarihi"
                        value={new Date(
                          o.proposed_delivery_date,
                        ).toLocaleDateString("tr-TR")}
                      />
                      <Info
                        label="Nakliye"
                        value={o.transport_included ? "Dahil" : "Dahil değil"}
                      />
                    </div>
                    <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700">
                      {o.message || "Açıklama yok."}
                    </p>
                    <Link
                      href={`/admin/firmalar/${o.seller_company_id}#faaliyetler`}
                      className="mt-3 inline-flex text-xs font-bold text-violet-700 underline"
                    >
                      Teklif veren firmanın dosyasını aç
                    </Link>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 font-extrabold">{value}</p>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}
