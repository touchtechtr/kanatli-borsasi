"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Factory, RefreshCw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PlatformUI";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import DecisionMessagePicker from "@/components/admin/DecisionMessagePicker";
import type { DecisionAction } from "@/constants/adminDecisionMessages";

type Facility = {
  id: string;
  company_id: string;
  name: string;
  city: string;
  daily_capacity: number;
  species: string | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  companyName: string;
};

const statusClass = (status: string) =>
  ({
    Beklemede: "bg-amber-100 text-amber-800",
    Aktif: "bg-emerald-100 text-emerald-800",
    Pasif: "bg-slate-200 text-slate-700",
    Reddedildi: "bg-red-100 text-red-800",
  })[status] ?? "bg-slate-100 text-slate-700";

export default function AdminSlaughterhousesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(
    null,
  );

  const loadFacilities = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("slaughterhouses")
      .select(
        "id, company_id, name, city, daily_capacity, species, status, admin_note, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setFacilities([]);
      setErrorMessage(`Kesimhaneler yüklenemedi: ${error.message}`);
      setLoading(false);
      return;
    }

    const companyIds = [
      ...new Set((data ?? []).map((item) => item.company_id).filter(Boolean)),
    ];
    const { data: companies, error: companyError } = companyIds.length
      ? await supabase.from("companies").select("id, name").in("id", companyIds)
      : { data: [], error: null };

    if (companyError)
      setErrorMessage(`Firma bilgileri yüklenemedi: ${companyError.message}`);
    const companyMap = new Map(
      (companies ?? []).map((company) => [company.id, company.name]),
    );
    setFacilities(
      (data ?? []).map((item) => ({
        ...item,
        companyName: companyMap.get(item.company_id) ?? "Bilinmeyen firma",
      })) as Facility[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadFacilities();
  }, [loadFacilities]);

  const cities = useMemo(
    () =>
      [...new Set(facilities.map((item) => item.city))].sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
    [facilities],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return facilities.filter(
      (item) =>
        (!normalized ||
          [
            item.name,
            item.city,
            item.species ?? "",
            item.companyName,
            item.id,
          ].some((value) =>
            value.toLocaleLowerCase("tr-TR").includes(normalized),
          )) &&
        (statusFilter === "all" || item.status === statusFilter) &&
        (cityFilter === "all" || item.city === cityFilter),
    );
  }, [cityFilter, facilities, query, statusFilter]);

  const counts = useMemo(
    () => ({
      Beklemede: facilities.filter((item) => item.status === "Beklemede")
        .length,
      Aktif: facilities.filter((item) => item.status === "Aktif").length,
      Pasif: facilities.filter((item) => item.status === "Pasif").length,
      Reddedildi: facilities.filter((item) => item.status === "Reddedildi")
        .length,
    }),
    [facilities],
  );

  const review = async (facility: Facility, action: DecisionAction) => {
    if (!adminNote.trim()) {
      setErrorMessage("Kullanıcıya iletilecek açıklamayı seçin veya yazın.");
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("admin_review_slaughterhouse", {
      p_slaughterhouse_id: facility.id,
      p_action: action,
      p_admin_note: adminNote.trim() || null,
    });
    if (error) {
      setErrorMessage(`Tesis güncellenemedi: ${error.message}`);
    } else {
      await dispatchNotificationEmails(supabase);
      setSuccessMessage("Tesis durumu güncellendi.");
      setSelectedId(null);
      setAdminNote("");
      setDecisionAction(null);
      await loadFacilities();
    }
    setActionLoading(false);
  };

  const exportCsv = () => {
    const escape = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "ID",
        "Tesis",
        "Firma",
        "Şehir",
        "Tür",
        "Günlük kapasite",
        "Durum",
        "Yönetim notu",
        "Oluşturulma",
      ],
      ...filtered.map((item) => [
        item.id,
        item.name,
        item.companyName,
        item.city,
        item.species,
        item.daily_capacity,
        item.status,
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
    link.download = `kesimhaneler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="ui-page-shell">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader eyebrow="Tesis güven ve kapasite yönetimi" title="Kesimhaneler" description="Tesis başvurularını, resmî uygunluk durumlarını ve yayın erişimini yönetin." icon={Factory} tone="violet" actions={<><button type="button" onClick={exportCsv} disabled={!filtered.length} className="ui-button ui-button--secondary"><Download className="h-4 w-4" />CSV indir</button><button type="button" onClick={() => void loadFacilities()} disabled={loading} className="ui-button ui-button--primary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Yenile</button></>} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["Beklemede", "Aktif", "Pasif", "Reddedildi"] as const).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-2xl border p-4 text-left shadow-sm ${statusFilter === status ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}
              >
                <p className="text-sm text-slate-500">{status}</p>
                <p className="mt-2 text-2xl font-bold">
                  {loading ? "—" : counts[status]}
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

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tesis, firma, şehir, tür veya ID ara"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm durumlar</option>
              <option>Beklemede</option>
              <option>Aktif</option>
              <option>Pasif</option>
              <option>Reddedildi</option>
            </select>
            <select
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm şehirler</option>
              {cities.map((city) => (
                <option key={city}>{city}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setCityFilter("all");
              }}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600"
            >
              Temizle
            </button>
          </div>
        </section>

        <p className="text-sm font-semibold text-slate-600">
          {filtered.length} tesis
        </p>
        <section className="space-y-3">
          {!loading && !filtered.length && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              Filtreye uygun tesis bulunmuyor.
            </div>
          )}
          {filtered.map((facility) => {
            const selected = selectedId === facility.id;
            const actions: Array<[DecisionAction, string, string]> =
              facility.status === "Beklemede"
                ? [
                    ["reddet", "Reddet", "bg-red-100 text-red-700"],
                    ["onayla", "Onayla", "bg-emerald-600 text-white"],
                  ]
                : facility.status === "Aktif"
                  ? [["durdur", "Durdur", "bg-amber-100 text-amber-800"]]
                  : facility.status === "Pasif"
                    ? [
                        [
                          "etkinlestir",
                          "Etkinleştir",
                          "bg-emerald-600 text-white",
                        ],
                      ]
                    : [];
            return (
              <article
                key={facility.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(facility.status)}`}
                      >
                        {facility.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(facility.created_at).toLocaleString("tr-TR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Factory className="h-5 w-5 text-violet-600" />
                      <h2 className="text-lg font-bold text-slate-900">
                        {facility.name}
                      </h2>
                    </div>
                    <p className="text-sm text-slate-500">
                      {facility.companyName} · {facility.city}
                    </p>
                    <p className="text-sm text-slate-600">
                      {facility.species || "Tür belirtilmedi"} · Günlük{" "}
                      <strong>
                        {Number(facility.daily_capacity).toLocaleString(
                          "tr-TR",
                        )}
                      </strong>{" "}
                      adet
                    </p>
                    {facility.admin_note && (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                        Yönetim notu: {facility.admin_note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(selected ? null : facility.id);
                      setAdminNote("");
                      setDecisionAction(null);
                      setErrorMessage(null);
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {selected ? "Kapat" : "Yönet"}
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
                              void review(facility, decisionAction)
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
