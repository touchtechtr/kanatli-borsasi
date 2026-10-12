"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";

const TABLES = {
  listings: { label: "Genel ilan" },
  feed_listings: { label: "Yem ilanı" },
  livestock_listings: { label: "Canlı hayvan ilanı" },
} as const;
type ListingType = keyof typeof TABLES;
type Data = Record<string, unknown> & {
  id: string;
  company_id: string | null;
  title: string;
  status: string;
  moderation_status: string;
  moderation_reason: string | null;
  risk_score: number;
  risk_flags: string[];
  created_at: string;
};

const show = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const LABELS: Record<string, string> = {
  category: "Kategori",
  sub_category: "Alt kategori",
  animal_type: "Hayvan türü",
  breed: "Irk",
  feed_form: "Yem formu",
  quantity: "Miktar",
  unit: "Birim",
  price: "Birim fiyat",
  city: "Şehir",
  district: "İlçe",
  description: "Açıklama",
  protein_ratio: "Protein oranı",
  energy_value: "Enerji değeri",
  packaging_type: "Ambalaj",
  min_order_quantity: "Minimum sipariş",
  delivery_terms: "Teslimat şartları",
  payment_terms: "Ödeme şartları",
  age_group: "Yaş grubu",
  average_weight: "Ortalama ağırlık",
  health_status: "Sağlık durumu",
};

const RISK_LABELS: Record<string, string> = {
  manual_review_all: "Tüm ilanlar için manuel inceleme açık",
  duplicate_recent_listing: "Yakın zamanda aynı başlıkla ilan verilmiş",
  price_above_limit: "Birim fiyat yönetim sınırını aşıyor",
  quantity_above_limit: "Miktar yönetim sınırını aşıyor",
  new_company: "Yeni firma hesabı",
};

export default function AdminListingDetailPage() {
  const params = useParams<{ type: string; id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const type = params.type as ListingType;
  const [listing, setListing] = useState<Data | null>(null);
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    if (!(type in TABLES)) {
      setError("Geçersiz ilan türü.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: listingError } = await supabase
      .from(type)
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (listingError || !data) {
      setError(listingError?.message ?? "İlan bulunamadı.");
      setLoading(false);
      return;
    }
    const loaded = data as Data;
    setListing(loaded);
    if (loaded.company_id) {
      const result = await supabase
        .from("companies")
        .select("id, name, role, city, tax_no, phone")
        .eq("id", loaded.company_id)
        .maybeSingle();
      if (result.error) setError(`Firma yüklenemedi: ${result.error.message}`);
      else setCompany(result.data);
    }
    setLoading(false);
  }, [params.id, supabase, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: "aktif" | "pasif") => {
    if (
      !listing ||
      !confirm(`İlan durumu “${status}” olarak değiştirilsin mi?`)
    )
      return;
    setProcessing(true);
    setError(null);
    const { error: updateError } = await supabase
      .from(type)
      .update({ status })
      .eq("id", listing.id);
    if (updateError) setError(`Durum değiştirilemedi: ${updateError.message}`);
    else {
      await dispatchNotificationEmails(supabase);
      await load();
    }
    setProcessing(false);
  };

  const reviewListing = async (decision: "onaylandi" | "reddedildi") => {
    if (!listing) return;
    const reason =
      decision === "reddedildi"
        ? window.prompt(
            "Ret nedenini yazın. Bu bilgi ilan kaydında saklanacaktır.",
          )
        : null;
    if (decision === "reddedildi" && !reason?.trim()) return;
    if (
      !window.confirm(
        decision === "onaylandi"
          ? "İlan onaylanıp yayımlansın mı?"
          : "İlan reddedilsin mi?",
      )
    )
      return;

    setProcessing(true);
    setError(null);
    const { error: reviewError } = await supabase.rpc("admin_review_listing", {
      target_listing_type: type,
      target_listing_id: listing.id,
      decision,
      review_reason: reason,
    });
    if (reviewError)
      setError(`Moderasyon işlemi başarısız: ${reviewError.message}`);
    else await load();
    setProcessing(false);
  };

  if (loading)
    return (
      <main className="p-10 text-sm text-slate-500">İlan yükleniyor…</main>
    );
  if (!listing)
    return (
      <main className="p-10">
        <p className="text-red-700">{error}</p>
        <Link
          href="/admin/ilanlar"
          className="mt-4 inline-block font-bold text-emerald-700"
        >
          İlanlara dön
        </Link>
      </main>
    );
  const fields = Object.entries(LABELS).filter(([key]) => key in listing);

  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-area,
          .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .print-area section {
            break-inside: avoid;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>
      <main className="min-h-screen bg-slate-50 p-5 md:p-10">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-5 flex flex-wrap justify-between gap-3">
            <Link
              href="/admin/ilanlar"
              className="inline-flex items-center gap-2 text-sm font-bold"
            >
              <ArrowLeft className="h-4 w-4" /> İlanlara dön
            </Link>
            <div className="flex gap-2">
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-bold"
              >
                <RefreshCw className="h-4 w-4" /> Yenile
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
              >
                <Printer className="h-4 w-4" /> Yazdır / PDF
              </button>
            </div>
          </div>
          {error && (
            <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="print-area space-y-4">
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-700">
                    {TABLES[type].label}
                  </p>
                  <h1 className="mt-2 text-2xl font-bold">{listing.title}</h1>
                  <p className="mt-1 break-all text-xs text-slate-400">
                    İlan ID: {listing.id}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-700">{listing.status}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(listing.created_at).toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Firma
                </p>
                <h2 className="mt-2 text-lg font-bold">
                  {show(company?.name)}
                </h2>
                <p className="text-sm text-slate-500">
                  Rol: {show(company?.role)}
                </p>
                <p className="text-sm text-slate-500">
                  Şehir: {show(company?.city)}
                </p>
                <p className="text-sm text-slate-500">
                  Vergi no: {show(company?.tax_no)}
                </p>
                <p className="text-sm text-slate-500">
                  Telefon: {show(company?.phone)}
                </p>
              </div>
              <div className="no-print rounded-2xl border bg-white p-5">
                <p className="text-xs font-bold uppercase text-slate-400">
                  Yönetim işlemi
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {listing.moderation_status === "inceleme_bekliyor"
                    ? "Risk nedenlerini inceleyip ilan hakkında karar verin."
                    : "İlanı yayından kaldırabilir veya yeniden etkinleştirebilirsiniz."}
                </p>
                {listing.moderation_status === "inceleme_bekliyor" ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={processing}
                      onClick={() => void reviewListing("reddedildi")}
                      className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-40"
                    >
                      Gerekçeyle reddet
                    </button>
                    <button
                      disabled={processing}
                      onClick={() => void reviewListing("onaylandi")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Onayla ve yayımla
                    </button>
                  </div>
                ) : listing.moderation_status === "reddedildi" ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    Reddedilen ilan doğrudan etkinleştirilemez. İlan sahibinin
                    bilgileri düzelterek yeniden ilan oluşturması gerekir.
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <button
                      disabled={processing || listing.status === "pasif"}
                      onClick={() => void changeStatus("pasif")}
                      className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-40"
                    >
                      Yayından kaldır
                    </button>
                    <button
                      disabled={processing || listing.status === "aktif"}
                      onClick={() => void changeStatus("aktif")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      Etkinleştir
                    </button>
                  </div>
                )}
              </div>
            </section>
            <section className="rounded-2xl border bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold">Moderasyon özeti</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    listing.moderation_status === "inceleme_bekliyor"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {listing.moderation_status}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Risk puanı: <b>{Number(listing.risk_score ?? 0)}</b>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(listing.risk_flags ?? []).length ? (
                  listing.risk_flags.map((flag) => (
                    <span
                      key={flag}
                      className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    >
                      {flag.startsWith("blocked_word:")
                        ? `Şüpheli kelime: ${flag.split(":").slice(1).join(":")}`
                        : (RISK_LABELS[flag] ?? flag)}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">
                    Risk kuralına takılmadı.
                  </span>
                )}
              </div>
              {listing.moderation_reason && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <b>Moderasyon nedeni:</b> {listing.moderation_reason}
                </div>
              )}
            </section>
            <section className="rounded-2xl border bg-white p-6">
              <h2 className="font-bold">İlan bilgileri</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map(([key, label]) => (
                  <div key={key} className="rounded-xl border bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 break-words text-sm font-bold">
                      {key === "price"
                        ? Number(listing[key]).toLocaleString("tr-TR", {
                            style: "currency",
                            currency: "TRY",
                          })
                        : show(listing[key])}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
