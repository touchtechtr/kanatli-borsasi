"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";
import DecisionMessagePicker from "@/components/admin/DecisionMessagePicker";
import type { DecisionAction } from "@/constants/adminDecisionMessages";

type Appointment = {
  id: string;
  company_id: string | null;
  flock_size: number;
  appointment_date: string;
  status: string;
  notes: string | null;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  slaughterhouses:
    | { name: string; city: string }
    | { name: string; city: string }[]
    | null;
  companyName: string;
};

const STATUS_OPTIONS = ["Tümü", "Onay Bekliyor", "Onaylandı", "Reddedildi"];

export default function AdminAppointmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("Onay Bekliyor");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(
    null,
  );

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("slaughter_appointments")
      .select(
        "id, company_id, flock_size, appointment_date, status, notes, admin_note, reviewed_at, created_at, slaughterhouses ( name, city )",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(`Randevular yüklenemedi: ${error.message}`);
      setAppointments([]);
      setLoading(false);
      return;
    }

    const companyIds = [
      ...new Set((data ?? []).map((item) => item.company_id).filter(Boolean)),
    ];
    const { data: companies, error: companyError } = companyIds.length
      ? await supabase.from("companies").select("id, name").in("id", companyIds)
      : { data: [], error: null };

    if (companyError) {
      setErrorMessage(`Firma bilgileri yüklenemedi: ${companyError.message}`);
    }

    const companyMap = new Map(
      (companies ?? []).map((company) => [company.id, company.name]),
    );
    setAppointments(
      (data ?? []).map((item) => ({
        ...item,
        companyName: companyMap.get(item.company_id) ?? "Bilinmeyen firma",
      })) as Appointment[],
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const filteredAppointments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    return appointments.filter((item) => {
      const house = Array.isArray(item.slaughterhouses)
        ? item.slaughterhouses[0]
        : item.slaughterhouses;
      const matchesStatus =
        statusFilter === "Tümü" || item.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        item.companyName.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
        house?.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
        item.id.toLocaleLowerCase("tr-TR").includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    });
  }, [appointments, query, statusFilter]);

  const reviewAppointment = async (action: "onayla" | "reddet") => {
    if (!selectedId) return;
    if (!adminNote.trim()) {
      setErrorMessage("Kullanıcıya iletilecek açıklamayı seçin veya yazın.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    const { error } = await supabase.rpc("admin_review_slaughter_appointment", {
      p_appointment_id: selectedId,
      p_action: action,
      p_admin_note: adminNote.trim() || null,
    });

    if (error) {
      setErrorMessage(`Randevu güncellenemedi: ${error.message}`);
    } else {
      await dispatchNotificationEmails(supabase);
      setSuccessMessage(
        action === "onayla" ? "Randevu onaylandı." : "Randevu reddedildi.",
      );
      setSelectedId(null);
      setAdminNote("");
      setDecisionAction(null);
      await loadAppointments();
    }
    setActionLoading(false);
  };

  const statusClass = (status: string) => {
    if (status === "Onaylandı") return "bg-emerald-100 text-emerald-800";
    if (status === "Reddedildi") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
  };

  const stats = {
    pending: appointments.filter((item) => item.status === "Onay Bekliyor")
      .length,
    approved: appointments.filter((item) => item.status === "Onaylandı").length,
    rejected: appointments.filter((item) => item.status === "Reddedildi")
      .length,
  };

  const statCards = [
    {
      label: "Onay bekleyen",
      value: stats.pending,
      status: "Onay Bekliyor",
      icon: Clock3,
      color: "text-amber-700 bg-amber-100",
      activeBorder: "border-amber-400 ring-2 ring-amber-100",
    },
    {
      label: "Onaylanan",
      value: stats.approved,
      status: "Onaylandı",
      icon: CheckCircle2,
      color: "text-emerald-700 bg-emerald-100",
      activeBorder: "border-emerald-400 ring-2 ring-emerald-100",
    },
    {
      label: "Reddedilen",
      value: stats.rejected,
      status: "Reddedildi",
      icon: XCircle,
      color: "text-red-700 bg-red-100",
      activeBorder: "border-red-400 ring-2 ring-red-100",
    },
  ];

  const selectStatus = (status: string) => {
    setStatusFilter(status);
    setSelectedId(null);
    setAdminNote("");
    setErrorMessage(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">
              Operasyon yönetimi
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Kesimhane Randevuları
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Kesim taleplerini inceleyin, onaylayın veya gerekçesiyle reddedin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{" "}
            Yenile
          </button>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
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
              placeholder="Firma, kesimhane veya randevu ID ara"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-violet-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4">
          {!loading && filteredAppointments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
              Bu filtreye uygun randevu bulunmuyor.
            </div>
          )}

          {filteredAppointments.map((appointment) => {
            const house = Array.isArray(appointment.slaughterhouses)
              ? appointment.slaughterhouses[0]
              : appointment.slaughterhouses;
            const isSelected = selectedId === appointment.id;
            return (
              <article
                key={appointment.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(appointment.status)}`}
                      >
                        {appointment.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(appointment.created_at).toLocaleString(
                          "tr-TR",
                        )}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {appointment.companyName}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {house?.name ?? "Bilinmeyen kesimhane"} ·{" "}
                      {house?.city ?? "Şehir belirtilmedi"}
                    </p>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <span>
                        <strong>
                          {Number(appointment.flock_size).toLocaleString(
                            "tr-TR",
                          )}
                        </strong>{" "}
                        adet
                      </span>
                      <span>
                        Planlanan tarih:{" "}
                        <strong>
                          {new Date(
                            appointment.appointment_date,
                          ).toLocaleDateString("tr-TR")}
                        </strong>
                      </span>
                    </div>
                    {appointment.notes && (
                      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                        Başvuru notu: {appointment.notes}
                      </p>
                    )}
                    {appointment.admin_note && (
                      <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-800">
                        Yönetim notu: {appointment.admin_note}
                      </p>
                    )}
                  </div>

                  {appointment.status === "Onay Bekliyor" && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(isSelected ? null : appointment.id);
                        setAdminNote("");
                        setDecisionAction(null);
                        setErrorMessage(null);
                      }}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {isSelected ? "İşlemi kapat" : "İncele"}
                    </button>
                  )}
                </div>

                {isSelected && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
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
                      <div className="mt-4 space-y-3">
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
                              void reviewAppointment(
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
