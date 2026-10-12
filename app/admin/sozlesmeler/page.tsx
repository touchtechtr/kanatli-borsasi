"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSignature, RefreshCw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import DecisionMessagePicker from "@/components/admin/DecisionMessagePicker";
import type { DecisionAction } from "@/constants/adminDecisionMessages";

type Contract = {
  id: string;
  company_id: string;
  title: string;
  region: string;
  capacity_required: number;
  model_type: string;
  duration_months: number;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  companyName: string;
  companyRole: string;
};

const statusLabel = (status: string) =>
  ({
    beklemede: "Onay bekliyor",
    aktif: "Aktif",
    pasif: "Pasif",
    tamamlandi: "Tamamlandı",
    reddedildi: "Reddedildi",
  })[status] ?? status;

const statusClass = (status: string) =>
  ({
    beklemede: "bg-amber-100 text-amber-800",
    aktif: "bg-emerald-100 text-emerald-800",
    pasif: "bg-slate-200 text-slate-700",
    tamamlandi: "bg-blue-100 text-blue-800",
    reddedildi: "bg-red-100 text-red-800",
  })[status] ?? "bg-slate-100 text-slate-700";

export default function AdminContractsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(
    null,
  );

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("contract_farming")
      .select(
        "id, company_id, title, region, capacity_required, model_type, duration_months, status, admin_note, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setContracts([]);
      setErrorMessage(`Sözleşmeler yüklenemedi: ${error.message}`);
      setLoading(false);
      return;
    }

    const companyIds = [
      ...new Set((data ?? []).map((item) => item.company_id).filter(Boolean)),
    ];
    const { data: companies, error: companyError } = companyIds.length
      ? await supabase
          .from("companies")
          .select("id, name, role")
          .in("id", companyIds)
      : { data: [], error: null };

    if (companyError)
      setErrorMessage(`Firma bilgileri yüklenemedi: ${companyError.message}`);
    const companyMap = new Map(
      (companies ?? []).map((company) => [company.id, company]),
    );

    setContracts(
      (data ?? []).map((item) => ({
        ...item,
        companyName:
          companyMap.get(item.company_id)?.name ?? "Bilinmeyen firma",
        companyRole: companyMap.get(item.company_id)?.role ?? "—",
      })) as Contract[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const companies = useMemo(
    () => [
      ...new Map(
        contracts.map((contract) => [
          contract.company_id,
          contract.companyName,
        ]),
      ).entries(),
    ],
    [contracts],
  );

  const filteredContracts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    return contracts.filter((contract) => {
      const createdAt = new Date(contract.created_at).getTime();
      return (
        (!normalized ||
          [
            contract.title,
            contract.region,
            contract.model_type,
            contract.companyName,
            contract.id,
          ].some((value) =>
            value.toLocaleLowerCase("tr-TR").includes(normalized),
          )) &&
        (statusFilter === "all" || contract.status === statusFilter) &&
        (companyFilter === "all" || contract.company_id === companyFilter) &&
        (start === null || createdAt >= start) &&
        (end === null || createdAt <= end)
      );
    });
  }, [companyFilter, contracts, dateFrom, dateTo, query, statusFilter]);

  const counts = useMemo(
    () => ({
      beklemede: contracts.filter((item) => item.status === "beklemede").length,
      aktif: contracts.filter((item) => item.status === "aktif").length,
      tamamlandi: contracts.filter((item) => item.status === "tamamlandi")
        .length,
      reddedildi: contracts.filter((item) => item.status === "reddedildi")
        .length,
    }),
    [contracts],
  );

  const review = async (id: string, action: DecisionAction) => {
    if (!adminNote.trim()) {
      setErrorMessage("Kullanıcıya iletilecek açıklamayı seçin veya yazın.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("admin_review_contract", {
      p_contract_id: id,
      p_action: action,
      p_admin_note: adminNote.trim() || null,
    });

    if (error) {
      setErrorMessage(`Sözleşme güncellenemedi: ${error.message}`);
    } else {
      await dispatchNotificationEmails(supabase);
      setSuccessMessage("Sözleşme durumu güncellendi.");
      setSelectedId(null);
      setAdminNote("");
      setDecisionAction(null);
      await loadContracts();
    }
    setActionLoading(false);
  };

  const exportCsv = () => {
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "ID",
        "Başlık",
        "Firma",
        "Bölge",
        "Model",
        "Kapasite",
        "Süre",
        "Durum",
        "Yönetim notu",
        "Oluşturulma",
      ],
      ...filteredContracts.map((item) => [
        item.id,
        item.title,
        item.companyName,
        item.region,
        item.model_type,
        item.capacity_required,
        item.duration_months,
        statusLabel(item.status),
        item.admin_note,
        new Date(item.created_at).toLocaleString("tr-TR"),
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `sozlesmeler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    [
      "beklemede",
      "Onay bekleyen",
      counts.beklemede,
      "border-amber-400 bg-amber-50",
    ],
    ["aktif", "Aktif", counts.aktif, "border-emerald-400 bg-emerald-50"],
    [
      "tamamlandi",
      "Tamamlanan",
      counts.tamamlandi,
      "border-blue-400 bg-blue-50",
    ],
    ["reddedildi", "Reddedilen", counts.reddedildi, "border-red-400 bg-red-50"],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-600">
              Üretim yönetimi
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Sözleşmeli Üretim
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Sözleşme tekliflerini inceleyin ve yayın durumlarını yönetin.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!filteredContracts.length}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV indir
            </button>
            <button
              type="button"
              onClick={() => void loadContracts()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />{" "}
              Yenile
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(([status, label, value, activeClass]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${statusFilter === status ? activeClass : "border-slate-200 bg-white"}`}
            >
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {loading ? "—" : value}
              </p>
            </button>
          ))}
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

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative md:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Başlık, firma, bölge, model veya ID ara"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm durumlar</option>
              <option value="beklemede">Onay bekliyor</option>
              <option value="aktif">Aktif</option>
              <option value="pasif">Pasif</option>
              <option value="tamamlandi">Tamamlandı</option>
              <option value="reddedildi">Reddedildi</option>
            </select>
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm firmalar</option>
              {companies.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label className="text-xs font-semibold text-slate-500">
              Başlangıç
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Bitiş
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setCompanyFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"
            >
              Filtreleri temizle
            </button>
          </div>
        </section>

        <p className="text-sm font-semibold text-slate-600">
          {filteredContracts.length} sözleşme
        </p>
        <section className="space-y-3">
          {!loading && !filteredContracts.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              Filtreye uygun sözleşme bulunmuyor.
            </div>
          )}
          {filteredContracts.map((contract) => {
            const selected = selectedId === contract.id;
            const actions: Array<[DecisionAction, string, string]> =
              contract.status === "beklemede"
                ? [
                    ["reddet", "Reddet", "bg-red-100 text-red-700"],
                    ["onayla", "Onayla", "bg-emerald-600 text-white"],
                  ]
                : contract.status === "aktif"
                  ? [
                      ["durdur", "Durdur", "bg-amber-100 text-amber-800"],
                      ["tamamla", "Tamamlandı", "bg-blue-600 text-white"],
                    ]
                  : contract.status === "pasif"
                    ? [
                        [
                          "etkinlestir",
                          "Yeniden etkinleştir",
                          "bg-emerald-600 text-white",
                        ],
                      ]
                    : [];
            return (
              <article
                key={contract.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(contract.status)}`}
                      >
                        {statusLabel(contract.status)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(contract.created_at).toLocaleString("tr-TR")}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {contract.title}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {contract.companyName} · {contract.companyRole} ·{" "}
                      {contract.region}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <span>
                        Kapasite:{" "}
                        <strong>
                          {Number(contract.capacity_required).toLocaleString(
                            "tr-TR",
                          )}
                        </strong>
                      </span>
                      <span>
                        Süre: <strong>{contract.duration_months} ay</strong>
                      </span>
                      <span>
                        Model: <strong>{contract.model_type}</strong>
                      </span>
                    </div>
                    {contract.admin_note && (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        Yönetim notu: {contract.admin_note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(selected ? null : contract.id);
                      setAdminNote("");
                      setDecisionAction(null);
                      setErrorMessage(null);
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {selected ? "İşlemi kapat" : "Yönet"}
                  </button>
                </div>
                {selected && (
                  <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                    <div className="flex flex-wrap justify-end gap-2">
                      {actions.map(([action, label, className]) => (
                        <button
                          key={action}
                          disabled={actionLoading}
                          onClick={() => {
                            setDecisionAction(action);
                            setAdminNote("");
                          }}
                          className={`rounded-xl px-4 py-2 text-sm font-semibold ${className}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {decisionAction && (
                      <>
                        <DecisionMessagePicker
                          action={decisionAction}
                          value={adminNote}
                          onChange={setAdminNote}
                          disabled={actionLoading}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionAction(null);
                              setAdminNote("");
                            }}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading || !adminNote.trim()}
                            onClick={() =>
                              void review(contract.id, decisionAction)
                            }
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            İşlemi onayla
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
