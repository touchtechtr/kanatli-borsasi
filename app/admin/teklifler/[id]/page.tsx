"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AdminStatus = "beklemede" | "onaylandi" | "reddedildi";
type OfferStatus =
  "beklemede" | "kabul_edildi" | "reddedildi" | "iptal_edildi" | "tamamlandi";

type TradeOffer = {
  id: string;
  listing_kind: string;
  listing_id: string;
  buyer_company_id: string;
  seller_company_id: string;
  product_title: string;
  offered_quantity: number;
  unit: string;
  seller_unit_price: number;
  commission_rate: number;
  commission_unit_amount: number;
  buyer_unit_price: number;
  subtotal_amount: number;
  commission_amount: number;
  total_amount: number;
  message: string | null;
  status: OfferStatus;
  admin_status: AdminStatus;
  admin_note: string | null;
  admin_reviewed_at: string | null;
  responded_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CompanySummary = {
  id: string;
  name: string;
  role: string;
  city: string | null;
  tax_no: string | null;
  phone: string | null;
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
});

const number = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});

const ADMIN_LABELS: Record<AdminStatus, string> = {
  beklemede: "Admin onayı bekliyor",
  onaylandi: "Admin onayladı",
  reddedildi: "Admin reddetti",
};

const STATUS_LABELS: Record<OfferStatus, string> = {
  beklemede: "Satıcı yanıtı bekleniyor",
  kabul_edildi: "Satıcı kabul etti",
  reddedildi: "Reddedildi",
  iptal_edildi: "Alıcı iptal etti",
  tamamlandi: "İşlem tamamlandı",
};

export default function AdminTradeOfferDetailPage() {
  const params = useParams<{ id: string }>();
  const offerId = params.id;
  const supabase = useMemo(() => createClient(), []);

  const [offer, setOffer] = useState<TradeOffer | null>(null);
  const [buyer, setBuyer] = useState<CompanySummary | null>(null);
  const [seller, setSeller] = useState<CompanySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOffer = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: offerError } = await supabase
      .from("trade_offers")
      .select(
        "id, listing_kind, listing_id, buyer_company_id, seller_company_id, product_title, offered_quantity, unit, seller_unit_price, commission_rate, commission_unit_amount, buyer_unit_price, subtotal_amount, commission_amount, total_amount, message, status, admin_status, admin_note, admin_reviewed_at, responded_at, completed_at, created_at, updated_at",
      )
      .eq("id", offerId)
      .maybeSingle();

    if (offerError || !data) {
      setOffer(null);
      setError(
        offerError
          ? "Teklif yüklenemedi: " + offerError.message
          : "Teklif bulunamadı.",
      );
      setLoading(false);
      return;
    }

    const loadedOffer = data as TradeOffer;
    setOffer(loadedOffer);

    const { data: companyData, error: companyError } = await supabase
      .from("companies")
      .select("id, name, role, city, tax_no, phone")
      .in("id", [loadedOffer.buyer_company_id, loadedOffer.seller_company_id]);

    if (companyError) {
      setError("Firma bilgileri yüklenemedi: " + companyError.message);
    } else {
      const companies = (companyData ?? []) as CompanySummary[];
      setBuyer(
        companies.find((item) => item.id === loadedOffer.buyer_company_id) ??
          null,
      );
      setSeller(
        companies.find((item) => item.id === loadedOffer.seller_company_id) ??
          null,
      );
    }

    setLoading(false);
  }, [offerId, supabase]);

  useEffect(() => {
    void fetchOffer();
  }, [fetchOffer]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Teklif yükleniyor...
        </div>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">
            Teklif bulunamadı
          </h1>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <Link
            href="/admin/teklifler"
            className="mt-5 inline-flex text-sm font-bold text-emerald-700 hover:underline"
          >
            Teklif listesine dön
          </Link>
        </div>
      </main>
    );
  }

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
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }

          .print-area section {
            break-inside: avoid;
            box-shadow: none !important;
          }

          .no-print {
            display: none !important;
          }

          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>

      <main className="min-h-screen bg-slate-50 p-5 text-slate-800 md:p-10">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/teklifler"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Tekliflere dön
            </Link>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void fetchOffer()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" /> Yenile
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" /> Yazdır / PDF
              </button>
            </div>
          </div>

          {error && (
            <div className="no-print mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          )}

          <div className="print-area space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-700">
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Teklif ayrıntısı
                    </span>
                  </div>
                  <h1 className="mt-2 text-2xl font-bold text-slate-950">
                    {offer.product_title}
                  </h1>
                  <p className="mt-1 break-all text-xs text-slate-400">
                    Teklif ID: {offer.id}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-bold text-emerald-700">
                    {ADMIN_LABELS[offer.admin_status]}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {STATUS_LABELS[offer.status]}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <CompanyCard title="Alıcı firma" company={buyer} />
              <CompanyCard title="Satıcı firma" company={seller} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
              <h2 className="font-bold text-slate-950">
                Miktar ve finansal özet
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Teklif miktarı"
                  value={`${number.format(offer.offered_quantity)} ${offer.unit}`}
                />
                <Metric
                  label="Satıcı birim fiyatı"
                  value={money.format(offer.seller_unit_price)}
                />
                <Metric
                  label="Birim komisyon"
                  value={money.format(offer.commission_unit_amount)}
                  tone="amber"
                />
                <Metric
                  label="Alıcı birim fiyatı"
                  value={money.format(offer.buyer_unit_price)}
                  tone="blue"
                />
                <Metric
                  label="Satıcı toplamı"
                  value={money.format(offer.subtotal_amount)}
                />
                <Metric
                  label="Komisyon oranı"
                  value={`%${number.format(offer.commission_rate)}`}
                  tone="amber"
                />
                <Metric
                  label="Toplam komisyon"
                  value={money.format(offer.commission_amount)}
                  tone="amber"
                />
                <Metric
                  label="Alıcı toplamı"
                  value={money.format(offer.total_amount)}
                  tone="blue"
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <NoteCard title="Alıcının mesajı" value={offer.message} />
              <NoteCard title="Admin notu" value={offer.admin_note} danger />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
              <h2 className="font-bold text-slate-950">
                İşlem zaman çizelgesi
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DateItem label="Teklif oluşturuldu" value={offer.created_at} />
                <DateItem
                  label="Admin incelemesi"
                  value={offer.admin_reviewed_at}
                />
                <DateItem label="Satıcı yanıtı" value={offer.responded_at} />
                <DateItem label="İşlem tamamlandı" value={offer.completed_at} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function CompanyCard({
  title,
  company,
}: {
  title: string;
  company: CompanySummary | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <h2 className="mt-2 text-lg font-bold text-slate-900">
        {company?.name ?? "Bilinmeyen firma"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">Rol: {company?.role ?? "—"}</p>
      <p className="text-sm text-slate-500">Şehir: {company?.city ?? "—"}</p>
      <p className="text-sm text-slate-500">
        Vergi no: {company?.tax_no ?? "—"}
      </p>
      <p className="text-sm text-slate-500">Telefon: {company?.phone ?? "—"}</p>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "amber" | "blue";
}) {
  const colors = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-base font-bold ${colors[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function NoteCard({
  title,
  value,
  danger = false,
}: {
  title: string;
  value: string | null;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-5 shadow-sm print:shadow-none ${danger && value ? "border-red-200" : "border-slate-200"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <p
        className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${danger && value ? "text-red-700" : "text-slate-700"}`}
      >
        {value || "Not bulunmuyor."}
      </p>
    </section>
  );
}

function DateItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {value
          ? new Date(value).toLocaleString("tr-TR")
          : "Henüz gerçekleşmedi"}
      </p>
    </div>
  );
}
