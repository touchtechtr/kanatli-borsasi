"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  SearchCheck,
  UserCheck,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import DecisionMessagePicker from "@/components/admin/DecisionMessagePicker";
import type { DecisionAction } from "@/constants/adminDecisionMessages";

type ExpertRequest = {
  id: string;
  company_id: string;
  service_type: string;
  title: string;
  description: string;
  city: string;
  status: string;
  admin_note: string | null;
  assigned_expert_company_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  companyName: string;
  expertName: string | null;
};

type ExpertCompany = { id: string; name: string };

const STATUS_OPTIONS = [
  "Tümü",
  "beklemede",
  "onaylandi",
  "uzman_atandi",
  "reddedildi",
];

export default function AdminExpertRequestsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<ExpertRequest[]>([]);
  const [experts, setExperts] = useState<ExpertCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("beklemede");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExpertId, setSelectedExpertId] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(
    null,
  );

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const [
      { data, error },
      { data: expertActivities, error: expertActivityError },
    ] = await Promise.all([
      supabase
        .from("expert_requests")
        .select(
          "id, company_id, service_type, title, description, city, status, admin_note, assigned_expert_company_id, reviewed_at, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("company_activities")
        .select("company_id")
        .in("activity_code", ["expert_provider", "veterinarian"])
        .eq("status", "aktif"),
    ]);

    if (error || expertActivityError) {
      setErrorMessage(
        `Ekspertiz verileri yüklenemedi: ${(error ?? expertActivityError)?.message}`,
      );
      setRequests([]);
      setLoading(false);
      return;
    }

    const expertIds = [
      ...new Set((expertActivities ?? []).map((item) => item.company_id)),
    ];
    const companyIds = [
      ...new Set(
        (data ?? [])
          .flatMap((item) => [
            item.company_id,
            item.assigned_expert_company_id,
            ...expertIds,
          ])
          .filter(Boolean),
      ),
    ];
    const { data: companies, error: companyError } = companyIds.length
      ? await supabase
          .from("companies")
          .select("id, name, status")
          .in("id", companyIds)
      : { data: [], error: null };

    if (companyError)
      setErrorMessage(`Firma bilgileri yüklenemedi: ${companyError.message}`);
    const companyMap = new Map(
      (companies ?? []).map((company) => [company.id, company.name]),
    );

    setExperts(
      (companies ?? [])
        .filter(
          (company) =>
            expertIds.includes(company.id) && company.status === "onaylandi",
        )
        .sort((a, b) => a.name.localeCompare(b.name, "tr")) as ExpertCompany[],
    );
    setRequests(
      (data ?? []).map((item) => ({
        ...item,
        companyName: companyMap.get(item.company_id) ?? "Bilinmeyen firma",
        expertName: item.assigned_expert_company_id
          ? (companyMap.get(item.assigned_expert_company_id) ??
            "Bilinmeyen uzman")
          : null,
      })) as ExpertRequest[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return requests.filter(
      (item) =>
        (statusFilter === "Tümü" || item.status === statusFilter) &&
        (!normalizedQuery ||
          [
            item.title,
            item.companyName,
            item.service_type,
            item.city,
            item.id,
          ].some((value) =>
            value.toLocaleLowerCase("tr-TR").includes(normalizedQuery),
          )),
    );
  }, [query, requests, statusFilter]);

  const reviewRequest = async (action: "onayla" | "reddet") => {
    if (!selectedId) return;
    if (!adminNote.trim()) {
      setErrorMessage("Kullanıcıya iletilecek açıklamayı seçin veya yazın.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("admin_review_expert_request", {
      p_request_id: selectedId,
      p_action: action,
      p_admin_note: adminNote.trim() || null,
      p_expert_company_id:
        action === "onayla" && selectedExpertId ? selectedExpertId : null,
    });

    if (error) {
      setErrorMessage(`Talep güncellenemedi: ${error.message}`);
    } else {
      await dispatchNotificationEmails(supabase);
      setSuccessMessage(
        action === "onayla"
          ? "Ekspertiz talebi onaylandı."
          : "Ekspertiz talebi reddedildi.",
      );
      setSelectedId(null);
      setSelectedExpertId("");
      setAdminNote("");
      setDecisionAction(null);
      await loadRequests();
    }
    setActionLoading(false);
  };

  const statusLabel = (status: string) =>
    ({
      beklemede: "Onay bekliyor",
      onaylandi: "Onaylandı",
      uzman_atandi: "Uzman atandı",
      reddedildi: "Reddedildi",
    })[status] ?? status;

  const statusClass = (status: string) => {
    if (status === "reddedildi") return "bg-red-100 text-red-800";
    if (status === "uzman_atandi") return "bg-blue-100 text-blue-800";
    if (status === "onaylandi") return "bg-emerald-100 text-emerald-800";
    return "bg-amber-100 text-amber-800";
  };

  const stats = {
    pending: requests.filter((item) => item.status === "beklemede").length,
    approved: requests.filter((item) => item.status === "onaylandi").length,
    assigned: requests.filter((item) => item.status === "uzman_atandi").length,
    rejected: requests.filter((item) => item.status === "reddedildi").length,
  };

  const statCards = [
    {
      label: "Onay bekleyen",
      value: stats.pending,
      status: "beklemede",
      icon: Clock3,
      color: "bg-amber-100 text-amber-700",
      activeBorder: "border-amber-400 ring-2 ring-amber-100",
    },
    {
      label: "Onaylanan",
      value: stats.approved,
      status: "onaylandi",
      icon: CheckCircle2,
      color: "bg-emerald-100 text-emerald-700",
      activeBorder: "border-emerald-400 ring-2 ring-emerald-100",
    },
    {
      label: "Uzman atanan",
      value: stats.assigned,
      status: "uzman_atandi",
      icon: UserCheck,
      color: "bg-blue-100 text-blue-700",
      activeBorder: "border-blue-400 ring-2 ring-blue-100",
    },
    {
      label: "Reddedilen",
      value: stats.rejected,
      status: "reddedildi",
      icon: XCircle,
      color: "bg-red-100 text-red-700",
      activeBorder: "border-red-400 ring-2 ring-red-100",
    },
  ];

  const selectStatus = (status: string) => {
    setStatusFilter(status);
    setSelectedId(null);
    setSelectedExpertId("");
    setAdminNote("");
    setErrorMessage(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">
              Hizmet yönetimi
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Ekspertiz Talepleri
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Talepleri inceleyin, uzman atayın veya gerekçesiyle reddedin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRequests()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{" "}
            Yenile
          </button>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(
            ({ label, value, status, icon: Icon, color, activeBorder }) => (
              <button
                key={label}
                type="button"
                onClick={() => selectStatus(status)}
                aria-pressed={statusFilter === status}
                className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  statusFilter === status ? activeBorder : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-2 text-3xl font-bold">
                      {loading ? "—" : value}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 ${color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  {statusFilter === status
                    ? "Bu sonuçlar gösteriliyor"
                    : "Sonuçları göster"}
                </p>
              </button>
            ),
          )}
        </section>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Başlık, firma, hizmet, şehir veya talep ID ara"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status === "Tümü" ? status : statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          {!loading && filteredRequests.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              Bu filtreye uygun ekspertiz talebi bulunmuyor.
            </div>
          )}
          {filteredRequests.map((request) => {
            const isSelected = selectedId === request.id;
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(request.status)}`}
                      >
                        {statusLabel(request.status)}
                      </span>
                      <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {request.service_type}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(request.created_at).toLocaleString("tr-TR")}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {request.title}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {request.companyName} · {request.city}
                    </p>
                    <p className="max-w-4xl text-sm leading-6 text-slate-600">
                      {request.description}
                    </p>
                    {request.expertName && (
                      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                        Atanan uzman: <strong>{request.expertName}</strong>
                      </p>
                    )}
                    {request.admin_note && (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        Yönetim notu: {request.admin_note}
                      </p>
                    )}
                  </div>

                  {request.status === "beklemede" && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(isSelected ? null : request.id);
                        setSelectedExpertId("");
                        setAdminNote("");
                        setDecisionAction(null);
                        setErrorMessage(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      <SearchCheck className="h-4 w-4" />{" "}
                      {isSelected ? "İşlemi kapat" : "İncele"}
                    </button>
                  )}
                </div>

                {isSelected && (
                  <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold uppercase text-slate-500">
                        Uzman ata (isteğe bağlı)
                      </label>
                      <select
                        value={selectedExpertId}
                        onChange={(event) =>
                          setSelectedExpertId(event.target.value)
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm"
                      >
                        <option value="">Şimdilik uzman atama</option>
                        {experts.map((expert) => (
                          <option key={expert.id} value={expert.id}>
                            {expert.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          setDecisionAction("reddet");
                          setAdminNote("");
                        }}
                        className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60"
                      >
                        Reddet
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          setDecisionAction("onayla");
                          setAdminNote("");
                        }}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Onayla
                      </button>
                    </div>
                    {decisionAction && (
                      <div className="space-y-3 md:col-span-2">
                        <DecisionMessagePicker
                          action={decisionAction}
                          value={adminNote}
                          onChange={setAdminNote}
                          disabled={actionLoading}
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={actionLoading || !adminNote.trim()}
                            onClick={() =>
                              void reviewRequest(
                                decisionAction as "onayla" | "reddet",
                              )
                            }
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            İşlemi onayla
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <Link
          href="/admin"
          className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          ← Yönetim paneline dön
        </Link>
      </div>
    </main>
  );
}
