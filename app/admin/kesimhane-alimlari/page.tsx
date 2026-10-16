"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";

type PurchaseRequest = {
  id: string;
  company_id: string;
  slaughterhouse_id: string | null;
  title: string;
  animal_type: string;
  quantity_required: number;
  city: string;
  status: string;
  admin_note: string | null;
  delivery_start: string;
  delivery_end: string;
  created_at: string;
};
type Delivery = {
  id: string;
  request_id: string;
  buyer_company_id: string;
  seller_company_id: string;
  planned_quantity: number;
  delivered_quantity: number | null;
  total_live_weight: number | null;
  status: string;
  payment_status: string;
  created_at: string;
  dispute_reason: string | null;
};
type Payment = {
  id: string;
  delivery_id: string;
  price_unit: string;
  unit_price: number;
  billable_quantity: number;
  seller_amount: number;
  commission_rate: number;
  commission_amount: number;
  buyer_total: number;
  status: string;
  admin_note: string | null;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

export default function AdminPurchases() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Record<string, Payment>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [facilities, setFacilities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [requestResult, deliveryResult, paymentResult] = await Promise.all([
      supabase
        .from("slaughterhouse_purchase_requests")
        .select(
          "id,company_id,slaughterhouse_id,title,animal_type,quantity_required,city,status,admin_note,delivery_start,delivery_end,created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("slaughterhouse_deliveries")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("slaughterhouse_payments")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (requestResult.error || deliveryResult.error || paymentResult.error) {
      setError(
        requestResult.error?.message ??
          deliveryResult.error?.message ??
          paymentResult.error?.message ??
          "Veriler yüklenemedi.",
      );
      setLoading(false);
      return;
    }
    const requestRows = (requestResult.data ?? []) as PurchaseRequest[];
    const deliveryRows = (deliveryResult.data ?? []) as Delivery[];
    setRequests(requestRows);
    setDeliveries(deliveryRows);
    setPayments(
      Object.fromEntries(
        ((paymentResult.data ?? []) as Payment[]).map((payment) => [
          payment.delivery_id,
          payment,
        ]),
      ),
    );
    const companyIds = [
      ...new Set([
        ...requestRows.map((x) => x.company_id),
        ...deliveryRows.flatMap((x) => [
          x.buyer_company_id,
          x.seller_company_id,
        ]),
      ]),
    ];
    const facilityIds = [
      ...new Set(requestRows.map((x) => x.slaughterhouse_id).filter(Boolean)),
    ] as string[];
    const [companyResult, facilityResult] = await Promise.all([
      companyIds.length
        ? supabase
            .from("public_companies")
            .select("id,name")
            .in("id", companyIds)
        : Promise.resolve({ data: [], error: null }),
      facilityIds.length
        ? supabase
            .from("slaughterhouses")
            .select("id,name,status")
            .in("id", facilityIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    setNames(
      Object.fromEntries((companyResult.data ?? []).map((x) => [x.id, x.name])),
    );
    setFacilities(
      Object.fromEntries(
        (facilityResult.data ?? []).map((x) => [
          x.id,
          `${x.name} · ${x.status}`,
        ]),
      ),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (
    request: PurchaseRequest,
    action: "onayla" | "reddet",
  ) => {
    const note = notes[request.id]?.trim();
    if (!note) {
      setError("Başvuru sahibine iletilecek yönetim açıklamasını yazın.");
      return;
    }
    setBusyId(request.id);
    setError(null);
    setSuccess(null);
    const { error: reviewError } = await supabase.rpc(
      "admin_review_slaughterhouse_purchase_request",
      { p_request_id: request.id, p_action: action, p_admin_note: note },
    );
    if (reviewError) setError(reviewError.message);
    else {
      await dispatchNotificationEmails(supabase);
      setSuccess(
        action === "onayla"
          ? "Alım talebi yayınlandı."
          : "Alım talebi reddedildi.",
      );
      setNotes((x) => ({ ...x, [request.id]: "" }));
      await load();
    }
    setBusyId(null);
  };

  const release = async (id: string) => {
    const payment = payments[id];
    if (
      !confirm(
        payment
          ? `Çift taraflı teslim onayını ve kanıtları kontrol ettiniz mi?\n\nAlıcı tahsilatı: ${money(payment.buyer_total)}\nSatıcı alacağı: ${money(payment.seller_amount)}\nPlatform komisyonu: ${money(payment.commission_amount)}`
          : "Çift taraflı teslim onayını ve kanıtları kontrol ettiniz mi?",
      )
    )
      return;
    setBusyId(id);
    const { error: releaseError } = await supabase.rpc(
      "admin_release_slaughterhouse_payment",
      { p_delivery_id: id },
    );
    if (releaseError) setError(releaseError.message);
    else {
      await dispatchNotificationEmails(supabase);
      setSuccess("Ödeme cüzdanlara tekrarsız olarak işlendi ve serbest bırakıldı.");
      await load();
    }
    setBusyId(null);
  };

  const resolveDispute = async (
    delivery: Delivery,
    action: "saticiya_aktar" | "aliciya_iade" | "aliciya_iade_yeniden_yayinla",
  ) => {
    const decision =
      action === "saticiya_aktar"
        ? "satıcıya aktarım"
        : action === "aliciya_iade_yeniden_yayinla"
          ? "alıcıya iade ve talebi yeniden yayınlama"
          : "alıcıya iade";
    const note = prompt(`${decision} kararının gerekçesini yazın:`)?.trim();
    if (!note) return;
    if (!confirm(`Uyuşmazlık dosyasında ${decision} kararı uygulanacak. Onaylıyor musunuz?`)) return;
    setBusyId(delivery.id);
    setError(null);
    setSuccess(null);
    const { error: resolveError } = await supabase.rpc(
      "admin_resolve_slaughterhouse_dispute",
      {
        p_delivery_id: delivery.id,
        p_action: action,
        p_admin_note: note,
      },
    );
    if (resolveError) setError(resolveError.message);
    else {
      await dispatchNotificationEmails(supabase);
      setSuccess(
        action === "saticiya_aktar"
          ? "Uyuşmazlık satıcı lehine sonuçlandı ve ödeme cüzdanlara işlendi."
          : action === "aliciya_iade_yeniden_yayinla"
            ? "Ödeme alıcıya iade edildi ve alım talebi yeniden yayına açıldı."
            : "Uyuşmazlık alıcı lehine sonuçlandı; ödeme iade edildi ve talep kapatıldı.",
      );
      await load();
    }
    setBusyId(null);
  };
  const pending = requests.filter((x) => x.status === "inceleme_bekliyor");
  const hasValidDates = (request: PurchaseRequest) => {
    const start = new Date(`${request.delivery_start}T00:00:00`);
    const end = new Date(`${request.delivery_end}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const latest = new Date(now);
    latest.setFullYear(latest.getFullYear() + 2);
    return (
      start >= now &&
      start <= latest &&
      end >= start &&
      end <= latest &&
      (end.getTime() - start.getTime()) / 86400000 <= 365
    );
  };
  const ready = deliveries.filter(
    (x) => x.payment_status === "serbest_birakilmaya_hazir",
  ).length;
  const disputed = deliveries.filter((x) => x.status === "uyusmazlik").length;

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-rose-600">
              Alım ve teslimat denetimi
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">
              Kesimhane Alımları
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Alım taleplerini yayınlanmadan önce inceleyin; teslimat, kanıt,
              uyuşmazlık ve ödeme süreçlerini yönetin.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
          >
            <RefreshCw className="mr-2 inline h-4 w-4" />
            Yenile
          </button>
        </header>
        <section className="grid gap-4 sm:grid-cols-4">
          <Card
            label="Onay bekleyen talep"
            value={pending.length}
            tone="amber"
          />
          <Card label="Toplam teslimat" value={deliveries.length} />
          <Card label="Ödemeye hazır" value={ready} tone="green" />
          <Card label="Uyuşmazlık" value={disputed} tone="red" />
        </section>
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
            {success}
          </div>
        )}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Yayın onayı bekleyen talepler
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Firma faaliyetini, yüklenen belgeleri ve bağlı aktif kesimhaneyi
              kontrol ederek karar verin.
            </p>
          </div>
          {loading ? (
            <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">
              Yükleniyor…
            </div>
          ) : pending.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">
              İnceleme bekleyen alım talebi yok.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {pending.map((request) => {
                const validDates = hasValidDates(request);
                return (
                <article
                  key={request.id}
                  className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                      İnceleme bekliyor
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(request.created_at).toLocaleString("tr-TR")}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold">
                    {request.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {names[request.company_id] ?? "Firma"} · {request.city}
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <p>
                      <b>Tesis:</b>{" "}
                      {request.slaughterhouse_id
                        ? (facilities[request.slaughterhouse_id] ??
                          request.slaughterhouse_id)
                        : "Bağlı tesis yok"}
                    </p>
                    <p className="mt-1">
                      <b>Talep:</b>{" "}
                      {request.quantity_required.toLocaleString("tr-TR")} ·{" "}
                      {request.animal_type}
                    </p>
                    <p className="mt-1">
                      <b>Teslim:</b> {request.delivery_start} – {request.delivery_end}
                    </p>
                  </div>
                  {!validDates && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
                      Geçersiz teslimat tarihi: Bu talep onaylanamaz. Tarihleri düzeltilmek üzere reddedin.
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
                    <Link
                      href={`/admin/firmalar/${request.company_id}#faaliyetler`}
                      className="text-violet-700 underline"
                    >
                      Faaliyet ve belgeleri kontrol et
                    </Link>
                    <Link
                      href={`/admin/firmalar/${request.company_id}#kesimhaneler`}
                      className="text-violet-700 underline"
                    >
                      Tesisi kontrol et
                    </Link>
                    <Link
                      href={`/admin/kesimhane-alimlari/${request.id}`}
                      className="text-violet-700 underline"
                    >
                      Talep ayrıntısı
                    </Link>
                  </div>
                  <textarea
                    value={notes[request.id] ?? ""}
                    onChange={(e) =>
                      setNotes((x) => ({ ...x, [request.id]: e.target.value }))
                    }
                    placeholder="Başvuru sahibine iletilecek karar açıklaması"
                    className="mt-4 min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-400"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busyId === request.id}
                      onClick={() => void review(request, "reddet")}
                      className="flex-1 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50"
                    >
                      <XCircle className="mr-2 inline h-4 w-4" />
                      Reddet
                    </button>
                    <button
                      disabled={busyId === request.id || !validDates}
                      onClick={() => void review(request, "onayla")}
                      className="flex-1 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      <CheckCircle2 className="mr-2 inline h-4 w-4" />
                      Onayla ve yayınla
                    </button>
                  </div>
                </article>
                );
              })}
            </div>
          )}
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-black text-slate-900">
            Teslimat ve ödeme dosyaları
          </h2>
          {deliveries.length === 0 ? (
            <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">
              Henüz teslimat dosyası bulunmuyor.
            </div>
          ) : (
            deliveries.map((delivery) => {
              const request = requests.find(
                (x) => x.id === delivery.request_id,
              );
              const payment = payments[delivery.id];
              return (
                <article
                  key={delivery.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                          {delivery.status}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          {delivery.payment_status}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate font-extrabold">
                        {request?.title ?? delivery.request_id}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {names[delivery.seller_company_id]} →{" "}
                        {names[delivery.buyer_company_id]}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Planlanan {delivery.planned_quantity} · Teslim{" "}
                        {delivery.delivered_quantity ?? "—"} · Ağırlık{" "}
                        {delivery.total_live_weight ?? "—"} kg
                      </p>
                      {payment && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <Metric label="Alıcı toplamı" value={money(payment.buyer_total)} />
                          <Metric label="Satıcı alacağı" value={money(payment.seller_amount)} />
                          <Metric
                            label={`Komisyon · %${Number(payment.commission_rate).toLocaleString("tr-TR")}`}
                            value={money(payment.commission_amount)}
                          />
                        </div>
                      )}
                      {delivery.dispute_reason && (
                        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                          <ShieldAlert className="mr-2 inline h-4 w-4" />
                          {delivery.dispute_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/kesimhane/alim-merkezi/${delivery.request_id}`}
                        className="rounded-xl border px-4 py-2 text-sm font-bold"
                      >
                        Dosyayı aç
                      </Link>
                      {delivery.payment_status ===
                        "serbest_birakilmaya_hazir" && (
                        <button
                          disabled={busyId === delivery.id}
                          onClick={() => void release(delivery.id)}
                          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 className="mr-2 inline h-4 w-4" />
                          Ödemeyi serbest bırak
                        </button>
                      )}
                      {delivery.status === "uyusmazlik" && (
                        <>
                          <button
                            disabled={busyId === delivery.id}
                            onClick={() => void resolveDispute(delivery, "aliciya_iade")}
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                          >
                            Alıcıya iade et
                          </button>
                          <button
                            disabled={busyId === delivery.id}
                            onClick={() => void resolveDispute(delivery, "aliciya_iade_yeniden_yayinla")}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 disabled:opacity-50"
                          >
                            İade et ve talebi yeniden yayınla
                          </button>
                          <button
                            disabled={busyId === delivery.id}
                            onClick={() => void resolveDispute(delivery, "saticiya_aktar")}
                            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Satıcıya aktar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
        <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          Bu işlem mevcut aşamada platform içi ödeme kaydını günceller. Gerçek
          banka transferi lisanslı ödeme kuruluşu entegrasyonu tamamlandığında
          bağlanacaktır.
        </p>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-slate-800">{value}</p>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "green" | "red";
}) {
  const style =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "green"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-5 ${style}`}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
