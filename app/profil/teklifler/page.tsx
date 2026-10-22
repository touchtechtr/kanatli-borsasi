"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Handshake,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PlatformUI";

type OfferStatus =
  "beklemede" | "kabul_edildi" | "reddedildi" | "iptal_edildi" | "tamamlandi";
type DisputeOrder = {
  decision_id: string;
  settlement_kind: "buyer_refund" | "seller_payout";
  attempt_no: number;
  provider: string;
  gross_amount: number;
  transfer_fee: number;
  net_amount: number;
  status: string;
  provider_reference: string | null;
};

type DisputeDecision = {
  id: string;
  dispute_id: string;
  decision_type: "tam_iade" | "tam_satici" | "kismi_paylasim";
  status: string;
  buyer_total: number;
  buyer_refund_amount: number;
  seller_payout_amount: number;
  platform_commission_amount: number;
  reason: string;
  decided_at: string;
  completed_at: string | null;
  settlement_orders: DisputeOrder[] | DisputeOrder | null;
};

type DeliveryDispute = {
  id: string;
  trade_offer_id: string;
  status: string;
  reason: string;
  admin_note: string | null;
  created_at: string;
  resolved_at: string | null;
  decision: DisputeDecision | DisputeDecision[] | null;
};

type Offer = {
  id: string;
  listing_kind: "listing" | "feed" | "livestock";
  listing_id: string;
  buyer_company_id: string;
  seller_company_id: string;
  product_title: string;
  offered_quantity: number;
  unit: string;
  seller_unit_price: number;
  buyer_unit_price: number;
  subtotal_amount: number;
  commission_amount: number;
  total_amount: number;
  message: string | null;
  status: OfferStatus;
  admin_status: "beklemede" | "onaylandi" | "reddedildi";
  created_at: string;
  buyerName: string;
  sellerName: string;
  delivery_confirmations: { party: "seller" | "buyer"; confirmed_at: string }[];
  delivery_disputes: DeliveryDispute[];
};

const STATUS_LABELS: Record<string, string> = {
  beklemede: "Yanıt bekliyor",
  kabul_edildi: "Kabul edildi",
  reddedildi: "Reddedildi",
  iptal_edildi: "İptal edildi",
  tamamlandi: "Tamamlandı",
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
  });

export default function CompanyOffersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [direction, setDirection] = useState<"all" | "incoming" | "outgoing">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.replace("/auth");
      return;
    }
    const { data: companyData, error: companyError } = await supabase
      .from("companies")
      .select("id, name, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (companyError || !companyData) {
      setErrorMessage(companyError?.message || "Şirket hesabı bulunamadı.");
      setLoading(false);
      return;
    }
    setCompany(companyData);

    const { data, error } = await supabase
      .from("trade_offers")
      .select(
        "id, listing_kind, listing_id, buyer_company_id, seller_company_id, product_title, offered_quantity, unit, seller_unit_price, buyer_unit_price, subtotal_amount, commission_amount, total_amount, message, status, admin_status, created_at, delivery_confirmations:trade_delivery_confirmations(party,confirmed_at), delivery_disputes:trade_delivery_disputes(id,status,reason,created_at)",
      )
      .or(
        `buyer_company_id.eq.${companyData.id},seller_company_id.eq.${companyData.id}`,
      )
      .order("created_at", { ascending: false });
    if (error) {
      setErrorMessage("Teklifler yüklenemedi: " + error.message);
      setOffers([]);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    const offerIds = rows.map((offer) => offer.id);
    const { data: disputeRows, error: disputeError } = offerIds.length
      ? await supabase
          .from("trade_delivery_disputes")
          .select("id,trade_offer_id,status,reason,admin_note,created_at,resolved_at")
          .in("trade_offer_id", offerIds)
      : { data: [], error: null };
    if (disputeError) {
      setErrorMessage("Uyuşmazlık kayıtları yüklenemedi: " + disputeError.message);
    }

    const disputeIds = (disputeRows ?? []).map((item) => item.id);
    const { data: decisionRows, error: decisionError } = disputeIds.length
      ? await supabase
          .from("trade_dispute_decisions")
          .select("id,dispute_id,decision_type,status,buyer_total,buyer_refund_amount,seller_payout_amount,platform_commission_amount,reason,decided_at,completed_at")
          .in("dispute_id", disputeIds)
      : { data: [], error: null };
    if (decisionError) {
      setErrorMessage("Uyuşmazlık kararları yüklenemedi: " + decisionError.message);
    }

    const decisionIds = (decisionRows ?? []).map((item) => item.id);
    const { data: orderRows, error: orderError } = decisionIds.length
      ? await supabase
          .from("trade_dispute_settlement_orders")
          .select("decision_id,settlement_kind,attempt_no,provider,gross_amount,transfer_fee,net_amount,status,provider_reference")
          .in("decision_id", decisionIds)
          .order("attempt_no", { ascending: true })
      : { data: [], error: null };
    if (orderError) {
      setErrorMessage("Uyuşmazlık aktarımları yüklenemedi: " + orderError.message);
    }

    const enrichedDisputes = (disputeRows ?? []).map((dispute) => {
      const decision = (decisionRows ?? []).find((item) => item.dispute_id === dispute.id);
      return {
        ...dispute,
        decision: decision
          ? {
              ...decision,
              settlement_orders: (orderRows ?? []).filter(
                (order) => order.decision_id === decision.id,
              ),
            }
          : null,
      };
    });

    const companyIds = [
      ...new Set(
        rows.flatMap((offer) => [
          offer.buyer_company_id,
          offer.seller_company_id,
        ]),
      ),
    ];
    const { data: companies } = companyIds.length
      ? await supabase
          .from("public_companies")
          .select("id, name")
          .in("id", companyIds)
      : { data: [] };
    const nameMap = new Map(
      (companies ?? []).map((item) => [item.id, item.name]),
    );
    setOffers(
      rows.map((offer) => ({
        ...offer,
        delivery_disputes: enrichedDisputes.filter(
          (dispute) => dispute.trade_offer_id === offer.id,
        ),
        buyerName: nameMap.get(offer.buyer_company_id) || "Alıcı firma",
        sellerName: nameMap.get(offer.seller_company_id) || "Satıcı firma",
      })) as Offer[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const requestedDirection = new URLSearchParams(window.location.search).get(
      "direction",
    );
    if (requestedDirection === "incoming" || requestedDirection === "outgoing")
      setDirection(requestedDirection);
    void loadOffers();
  }, [loadOffers]);

  const filtered = useMemo(
    () =>
      offers.filter((offer) => {
        const directionMatch =
          direction === "all" ||
          (direction === "incoming"
            ? offer.seller_company_id === company?.id
            : offer.buyer_company_id === company?.id);
        return (
          directionMatch &&
          (statusFilter === "all" || offer.status === statusFilter)
        );
      }),
    [offers, company?.id, direction, statusFilter],
  );

  const incoming = offers.filter(
    (offer) => offer.seller_company_id === company?.id,
  );
  const outgoing = offers.filter(
    (offer) => offer.buyer_company_id === company?.id,
  );
  const waitingIncoming = incoming.filter(
    (offer) =>
      offer.admin_status === "onaylandi" && offer.status === "beklemede",
  ).length;
  const activeTotal = offers.filter((offer) =>
    ["beklemede", "kabul_edildi"].includes(offer.status),
  ).length;
  const completedTotal = offers.filter(
    (offer) => offer.status === "tamamlandi",
  ).length;

  const changeStatus = async (offer: Offer, nextStatus: OfferStatus) => {
    const descriptions: Record<string, string> = {
      kabul_edildi: "teklifi kabul etmek",
      reddedildi: "teklifi reddetmek",
      iptal_edildi: "teklifi iptal etmek",
      tamamlandi: "işlemi tamamlandı olarak işaretlemek",
    };
    if (
      !confirm(
        `${descriptions[nextStatus] || "işlemi yapmak"} istediğinize emin misiniz?`,
      )
    )
      return;
    setProcessingId(offer.id);
    setErrorMessage(null);
    const { error } = await supabase
      .from("trade_offers")
      .update({ status: nextStatus })
      .eq("id", offer.id);
    if (error) setErrorMessage("Teklif güncellenemedi: " + error.message);
    else await loadOffers();
    setProcessingId(null);
  };

  const confirmDelivery = async (offer: Offer, party: "seller" | "buyer") => {
    const message = party === "seller"
      ? "Ürünü teslim ettiğinizi onaylıyor musunuz?"
      : "Ürünü eksiksiz teslim aldığınızı onaylıyor musunuz?";
    if (!confirm(message)) return;
    setProcessingId(offer.id);
    setErrorMessage(null);
    const { error } = await supabase.rpc("confirm_trade_delivery", {
      p_offer_id: offer.id,
      p_party: party,
    });
    if (error) setErrorMessage("Teslimat onaylanamadı: " + error.message);
    else await loadOffers();
    setProcessingId(null);
  };

  const openDispute = async (offer: Offer) => {
    const reason = prompt("Uyuşmazlık nedenini en az 10 karakterle açıklayın:")?.trim();
    if (!reason) return;
    setProcessingId(offer.id);
    setErrorMessage(null);
    const { error } = await supabase.rpc("dispute_trade_delivery", {
      p_offer_id: offer.id,
      p_reason: reason,
    });
    if (error) setErrorMessage("Uyuşmazlık açılamadı: " + error.message);
    else await loadOffers();
    setProcessingId(null);
  };

  return (
    <main className="ui-page-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader eyebrow="Şirket ticaret merkezi" title="Ticari Teklifler" description="Gelen ve gönderilen teklifleri, karşı tarafı ve işlem durumunu tek ekrandan yönetin." icon={Handshake} tone="emerald" actions={<button onClick={() => void loadOffers()} className="ui-button ui-button--secondary"><RefreshCw className="h-4 w-4"/>Yenile</button>} />

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Gelen teklif"
            value={incoming.length}
            icon={ArrowDownLeft}
          />
          <Stat
            label="Gönderilen teklif"
            value={outgoing.length}
            icon={ArrowUpRight}
          />
          <Stat
            label="Yanıt bekleyen"
            value={waitingIncoming}
            icon={Clock3}
            tone="amber"
          />
          <Stat
            label="Tamamlanan"
            value={completedTotal}
            icon={CheckCircle2}
            tone="emerald"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto">
              <Tab
                active={direction === "all"}
                onClick={() => setDirection("all")}
              >
                Tümü ({offers.length})
              </Tab>
              <Tab
                active={direction === "incoming"}
                onClick={() => setDirection("incoming")}
              >
                <ArrowDownLeft className="h-4 w-4" />
                Gelen ({incoming.length})
              </Tab>
              <Tab
                active={direction === "outgoing"}
                onClick={() => setDirection("outgoing")}
              >
                <ArrowUpRight className="h-4 w-4" />
                Gönderilen ({outgoing.length})
              </Tab>
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm durumlar</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-400">
              Teklifler yükleniyor…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center">
              <Handshake className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-3 font-extrabold text-slate-700">
                Bu filtrede teklif bulunmuyor
              </h2>
            </div>
          ) : (
            filtered.map((offer) => {
              const isIncoming = offer.seller_company_id === company?.id;
              const detailHref =
                offer.listing_kind === "livestock"
                  ? `/livestock/${offer.listing_id}`
                  : `/ilan/${offer.listing_kind === "feed" ? "feed_listings" : "listings"}/${offer.listing_id}`;
              return (
                <article
                  key={offer.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${isIncoming ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}
                        >
                          {isIncoming ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {isIncoming ? "GELEN" : "GÖNDERİLEN"}
                        </span>
                        <Status status={offer.status} />
                        <AdminStatus status={offer.admin_status} />
                      </div>
                      <h2 className="mt-3 truncate text-lg font-extrabold text-slate-900">
                        {offer.product_title}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {offer.buyerName} → {offer.sellerName} ·{" "}
                        {new Date(offer.created_at).toLocaleString("tr-TR")}
                      </p>
                      {offer.message && (
                        <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                          {offer.message}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[520px]">
                      <Metric
                        label="Miktar"
                        value={`${Number(offer.offered_quantity).toLocaleString("tr-TR")} ${offer.unit}`}
                      />
                      <Metric
                        label={isIncoming ? "Birim fiyat" : "Komisyonlu fiyat"}
                        value={money(
                          isIncoming
                            ? offer.seller_unit_price
                            : offer.buyer_unit_price,
                        )}
                      />
                      <Metric
                        label={isIncoming ? "Şirket alacağı" : "Alıcı toplamı"}
                        value={money(
                          isIncoming
                            ? offer.subtotal_amount
                            : offer.total_amount,
                        )}
                      />
                      <Metric
                        label="Komisyon"
                        value={money(offer.commission_amount)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 xl:w-44 xl:flex-col">
                      <Link
                        href={detailHref}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        İlan
                      </Link>
                      {isIncoming &&
                        offer.admin_status === "onaylandi" &&
                        offer.status === "beklemede" && (
                          <>
                            <button
                              disabled={processingId === offer.id}
                              onClick={() =>
                                void changeStatus(offer, "kabul_edildi")
                              }
                              className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white"
                            >
                              Kabul et
                            </button>
                            <button
                              disabled={processingId === offer.id}
                              onClick={() =>
                                void changeStatus(offer, "reddedildi")
                              }
                              className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700"
                            >
                              Reddet
                            </button>
                          </>
                        )}
                      {!isIncoming && offer.status === "beklemede" && (
                        <button
                          disabled={processingId === offer.id}
                          onClick={() =>
                            void changeStatus(offer, "iptal_edildi")
                          }
                          className="rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700"
                        >
                          İptal et
                        </button>
                      )}
                      {offer.status === "kabul_edildi" && (() => {
                        const sellerConfirmed = offer.delivery_confirmations?.some((item) => item.party === "seller");
                        const buyerConfirmed = offer.delivery_confirmations?.some((item) => item.party === "buyer");
                        const hasOpenDispute = offer.delivery_disputes?.some((item) => item.status === "acik");
                        const ownConfirmed = isIncoming ? sellerConfirmed : buyerConfirmed;
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-bold">
                              <span className={sellerConfirmed ? "rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-lg bg-slate-100 px-2 py-1 text-slate-500"}>Satıcı {sellerConfirmed ? "onayladı" : "bekleniyor"}</span>
                              <span className={buyerConfirmed ? "rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-lg bg-slate-100 px-2 py-1 text-slate-500"}>Alıcı {buyerConfirmed ? "onayladı" : "bekleniyor"}</span>
                            </div>
                            {!ownConfirmed && !hasOpenDispute && (
                              <button
                                disabled={processingId === offer.id}
                                onClick={() => void confirmDelivery(offer, isIncoming ? "seller" : "buyer")}
                                className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                              >
                                {isIncoming ? "Teslim ettim" : "Teslim aldım"}
                              </button>
                            )}
                            {!hasOpenDispute && (
                              <button
                                disabled={processingId === offer.id}
                                onClick={() => void openDispute(offer)}
                                className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50"
                              >
                                Sorun bildir
                              </button>
                            )}
                            {hasOpenDispute && <span className="rounded-xl bg-red-50 px-3 py-2.5 text-center text-xs font-bold text-red-700">Uyuşmazlık incelemede</span>}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  {offer.delivery_disputes?.[0] && (
                    <DisputeSummary dispute={offer.delivery_disputes[0]} />
                  )}
                </article>
              );
            })
          )}
        </section>

        {activeTotal > 0 && (
          <p className="text-center text-xs text-slate-400">
            Şirketinizin devam eden {activeTotal} ticari teklifi bulunuyor.
          </p>
        )}
      </div>
    </main>
  );
}


function DisputeSummary({ dispute }: { dispute: DeliveryDispute }) {
  const decision = Array.isArray(dispute.decision)
    ? dispute.decision[0] ?? null
    : dispute.decision;
  const orders = !decision?.settlement_orders
    ? []
    : Array.isArray(decision.settlement_orders)
      ? decision.settlement_orders
      : [decision.settlement_orders];
  const completedFee = orders
    .filter((order) => order.status === "tamamlandi")
    .reduce((sum, order) => sum + Number(order.transfer_fee || 0), 0);
  const decisionLabel =
    decision?.decision_type === "tam_iade"
      ? "Tam iade"
      : decision?.decision_type === "tam_satici"
        ? "Satıcı lehine sonuçlandı"
        : decision?.decision_type === "kismi_paylasim"
          ? "Kısmi paylaşım"
          : null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className={
        "rounded-2xl border p-4 " +
        (dispute.status === "acik"
          ? "border-red-200 bg-red-50"
          : "border-violet-200 bg-violet-50")
      }>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-violet-600">
              Güvenli ticaret uyuşmazlığı
            </p>
            <h3 className="mt-1 font-extrabold text-slate-900">
              {dispute.status === "acik"
                ? "Yönetim incelemesi sürüyor"
                : decisionLabel ?? "Karar ve aktarım süreci"}
            </h3>
          </div>
          <span className={
            "rounded-full px-2.5 py-1 text-[10px] font-black " +
            (dispute.status === "kapatildi"
              ? "bg-emerald-100 text-emerald-700"
              : dispute.status === "acik"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-800")
          }>
            {dispute.status === "kapatildi" ? "Dosya kapandı" : dispute.status === "acik" ? "Karar bekleniyor" : "Aktarım sürüyor"}
          </span>
        </div>

        <p className="mt-3 text-sm leading-6 text-slate-700">
          <strong>Bildirim:</strong> {dispute.reason}
        </p>

        {decision ? (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Havuz" value={money(decision.buyer_total)} />
              <Metric label="Alıcı iadesi" value={money(decision.buyer_refund_amount)} />
              <Metric label="Satıcı ödemesi" value={money(decision.seller_payout_amount)} />
              <Metric label="Komisyon" value={money(decision.platform_commission_amount)} />
              <Metric label="Tamamlanan masraf" value={money(completedFee)} />
            </div>
            <p className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-5 text-slate-700">
              <strong>Yönetim kararı:</strong> {decision.reason}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {orders.map((order) => (
                <span
                  key={order.settlement_kind + "-" + order.attempt_no}
                  className={
                    "rounded-full px-2.5 py-1 text-[10px] font-bold " +
                    (order.status === "tamamlandi"
                      ? "bg-emerald-100 text-emerald-700"
                      : order.status === "hata"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700")
                  }
                >
                  {order.settlement_kind === "buyer_refund" ? "Alıcı iadesi" : "Satıcı ödemesi"} · Deneme {order.attempt_no} · {order.status === "tamamlandi" ? "Tamamlandı" : order.status === "hata" ? "Başarısız" : "İşleniyor"}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs font-semibold text-red-700">
            Para havuzda korunuyor. Yönetim gerekçeli karar vermeden aktarım yapılmaz.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: number;
  icon: typeof Handshake;
  tone?: "slate" | "amber" | "emerald";
}) {
  const color =
    tone === "amber"
      ? "text-amber-600 bg-amber-50"
      : tone === "emerald"
        ? "text-emerald-600 bg-emerald-50"
        : "text-slate-600 bg-white";
  return (
    <div
      className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${color}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">{label}</p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
    >
      {children}
    </button>
  );
}
function Status({ status }: { status: string }) {
  const style =
    status === "kabul_edildi" || status === "tamamlandi"
      ? "bg-emerald-50 text-emerald-700"
      : status === "beklemede"
        ? "bg-amber-50 text-amber-700"
        : status === "reddedildi"
          ? "bg-red-50 text-red-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
function AdminStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
      {status === "onaylandi"
        ? "Yönetim onaylı"
        : status === "reddedildi"
          ? "Yönetim reddetti"
          : "Yönetim incelemesinde"}
    </span>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[9px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-extrabold text-slate-800">
        {value}
      </p>
    </div>
  );
}
