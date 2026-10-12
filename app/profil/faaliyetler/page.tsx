"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ActivityType = {
  code: string;
  segment: string;
  name: string;
  description: string;
  requires_document: boolean;
};
type Requirement = {
  activity_code: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  max_file_size_mb: number;
};
type ActiveActivity = {
  activity_code: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  suspension_reason: string | null;
};
type Application = {
  id: string;
  activity_code: string;
  status: string;
  applicant_note: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  created_at: string;
};
type DocumentRow = {
  application_id: string;
  requirement_code: string;
  original_name: string;
  status: string;
};

const STATUS: Record<string, { label: string; className: string }> = {
  aktif: { label: "Aktif", className: "bg-emerald-100 text-emerald-800" },
  askida: { label: "Askıda", className: "bg-red-100 text-red-800" },
  suresi_doldu: {
    label: "Süresi doldu",
    className: "bg-slate-200 text-slate-700",
  },
  kapatildi: { label: "Kapatıldı", className: "bg-slate-200 text-slate-700" },
  taslak: { label: "Taslak", className: "bg-slate-100 text-slate-700" },
  inceleme_bekliyor: {
    label: "İnceleme bekliyor",
    className: "bg-amber-100 text-amber-800",
  },
  duzeltme_istendi: {
    label: "Düzeltme istendi",
    className: "bg-orange-100 text-orange-800",
  },
  onaylandi: {
    label: "Onaylandı",
    className: "bg-emerald-100 text-emerald-800",
  },
  reddedildi: { label: "Reddedildi", className: "bg-red-100 text-red-800" },
};

export default function CompanyActivitiesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [activities, setActivities] = useState<ActiveActivity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.replace("/auth");
      return;
    }
    const { data: companyData, error: companyError } = await supabase
      .from("companies")
      .select("id,name,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (companyError || !companyData) {
      setError(companyError?.message ?? "Firma kaydı bulunamadı.");
      return;
    }
    setCompany(companyData);
    const [typeResult, requirementResult, activityResult, applicationResult] =
      await Promise.all([
        supabase
          .from("activity_types")
          .select("code,segment,name,description,requires_document")
          .eq("enabled", true)
          .order("sort_order"),
        supabase
          .from("activity_document_requirements")
          .select(
            "activity_code,code,name,description,required,max_file_size_mb",
          )
          .order("sort_order"),
        supabase
          .from("company_activities")
          .select(
            "activity_code,status,activated_at,expires_at,suspension_reason",
          )
          .eq("company_id", companyData.id),
        supabase
          .from("company_activity_applications")
          .select(
            "id,activity_code,status,applicant_note,admin_note,submitted_at,created_at",
          )
          .eq("company_id", companyData.id)
          .order("created_at", { ascending: false }),
      ]);
    const firstError = [
      typeResult.error,
      requirementResult.error,
      activityResult.error,
      applicationResult.error,
    ].find(Boolean);
    if (firstError) {
      setError(firstError.message);
      return;
    }
    const apps = (applicationResult.data ?? []) as Application[];
    const ids = apps.map((item) => item.id);
    const documentResult = ids.length
      ? await supabase
          .from("company_activity_documents")
          .select("application_id,requirement_code,original_name,status")
          .in("application_id", ids)
      : { data: [], error: null };
    if (documentResult.error) setError(documentResult.error.message);
    setTypes((typeResult.data ?? []) as ActivityType[]);
    setRequirements((requirementResult.data ?? []) as Requirement[]);
    setActivities((activityResult.data ?? []) as ActiveActivity[]);
    setApplications(apps);
    setDocuments((documentResult.data ?? []) as DocumentRow[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const requestedActivity = new URLSearchParams(window.location.search).get(
      "activity",
    );
    if (requestedActivity) {
      setSelectedCode(requestedActivity);
      setMessage(
        "İlan yayınlamak için gereken faaliyet seçildi. Başvuruyu başlatıp zorunlu belgeleri yükleyin.",
      );
    }
  }, []);

  const start = async () => {
    if (!selectedCode)
      return setError("Başvurmak istediğiniz faaliyeti seçin.");
    setBusy("start");
    setError(null);
    setMessage(null);
    const { error: rpcError } = await supabase.rpc(
      "start_company_activity_application",
      { p_activity_code: selectedCode, p_note: note || null },
    );
    setBusy(null);
    if (rpcError) return setError(rpcError.message);
    setMessage(
      "Başvuru taslağı açıldı. Zorunlu belgeleri yükleyip başvuruyu gönderin.",
    );
    await load();
  };

  const upload = async (
    application: Application,
    requirement: Requirement,
    file: File,
  ) => {
    if (!company) return;
    if (file.size > requirement.max_file_size_mb * 1024 * 1024)
      return setError(
        `Dosya ${requirement.max_file_size_mb} MB sınırını aşıyor.`,
      );
    setBusy(`${application.id}:${requirement.code}`);
    setError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${company.id}/${application.id}/${requirement.code}-${Date.now()}-${safeName}`;
    const uploadResult = await supabase.storage
      .from("company-activity-documents")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadResult.error) {
      setBusy(null);
      return setError(uploadResult.error.message);
    }
    const { error: registerError } = await supabase.rpc(
      "register_company_activity_document",
      {
        p_application_id: application.id,
        p_requirement_code: requirement.code,
        p_storage_path: path,
        p_original_name: file.name,
        p_mime_type: file.type || null,
        p_file_size: file.size,
      },
    );
    setBusy(null);
    if (registerError) return setError(registerError.message);
    setMessage(`${requirement.name} yüklendi.`);
    await load();
  };

  const submit = async (applicationId: string) => {
    setBusy(applicationId);
    setError(null);
    setMessage(null);
    const { error: submitError } = await supabase.rpc(
      "submit_company_activity_application",
      { p_application_id: applicationId, p_note: note || null },
    );
    setBusy(null);
    if (submitError) return setError(submitError.message);
    setMessage("Faaliyet başvurunuz yönetici incelemesine gönderildi.");
    await load();
  };

  const activeCodes = new Set(
    activities
      .filter((item) => item.status === "aktif")
      .map((item) => item.activity_code),
  );
  const openApplication = (code: string) =>
    applications.find(
      (item) =>
        item.activity_code === code &&
        ["taslak", "inceleme_bekliyor", "duzeltme_istendi"].includes(
          item.status,
        ),
    );
  const available = types.filter(
    (item) => !activeCodes.has(item.code) && !openApplication(item.code),
  );
  const grouped = types.reduce<Record<string, ActivityType[]>>(
    (result, item) => {
      (result[item.segment] ??= []).push(item);
      return result;
    },
    {},
  );

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-600">
            Yetki ve belge merkezi
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Faaliyetlerim ve Belgelerim
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Firmanız birden fazla alanda çalışabilir. Her faaliyet ayrı
            belgelenir ve yönetici tarafından bağımsız olarak onaylanır.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" />
          Yenile
        </button>
      </header>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {company && company.status !== "onaylandi" && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          Yeni faaliyet başvurusu açabilmek için önce ana firma kaydınızın
          onaylanması gerekir.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold text-slate-900">Onaylı faaliyetler</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activities.length === 0 && (
            <p className="text-sm text-slate-500">
              Henüz onaylanmış faaliyet bulunmuyor.
            </p>
          )}
          {activities.map((item) => {
            const type = types.find(
              (entry) => entry.code === item.activity_code,
            );
            const badge = STATUS[item.status] ?? STATUS.taslak;
            return (
              <article
                key={item.activity_code}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      {type?.segment}
                    </p>
                    <h3 className="mt-1 font-bold text-slate-900">
                      {type?.name ?? item.activity_code}
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {item.suspension_reason && (
                  <p className="mt-3 text-xs text-red-700">
                    {item.suspension_reason}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Yeni faaliyet ekle</h2>
        <p className="mt-1 text-sm text-slate-500">
          Seçim mevcut faaliyetlerinizi kapatmaz; yalnızca yeni bir onay süreci
          başlatır.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <select
            value={selectedCode}
            onChange={(event) => setSelectedCode(event.target.value)}
            disabled={company?.status !== "onaylandi"}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Faaliyet seçin</option>
            {Object.entries(grouped).map(([segment, items]) => (
              <optgroup key={segment} label={segment}>
                {items
                  .filter((item) =>
                    available.some((entry) => entry.code === item.code),
                  )
                  .map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Başvuru notu (isteğe bağlı)"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            onClick={() => void start()}
            disabled={
              !selectedCode ||
              busy === "start" ||
              company?.status !== "onaylandi"
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Başlat
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Başvurular</h2>
        {applications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Henüz faaliyet başvurusu bulunmuyor.
          </div>
        )}
        {applications.map((application) => {
          const type = types.find(
            (item) => item.code === application.activity_code,
          );
          const badge = STATUS[application.status] ?? STATUS.taslak;
          const reqs = requirements.filter(
            (item) => item.activity_code === application.activity_code,
          );
          const editable = ["taslak", "duzeltme_istendi"].includes(
            application.status,
          );
          return (
            <article
              key={application.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {type?.segment}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {type?.name ?? application.activity_code}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {type?.description}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>
              {application.admin_note && (
                <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-800">
                  <strong>Yönetim açıklaması:</strong> {application.admin_note}
                </div>
              )}
              {reqs.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {reqs.map((requirement) => {
                    const document = documents.find(
                      (item) =>
                        item.application_id === application.id &&
                        item.requirement_code === requirement.code,
                    );
                    const key = `${application.id}:${requirement.code}`;
                    return (
                      <div
                        key={requirement.code}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <p className="text-sm font-semibold text-slate-800">
                          {requirement.name}
                          {requirement.required && (
                            <span className="text-red-500"> *</span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {document
                            ? `${document.original_name} · ${document.status}`
                            : (requirement.description ?? "PDF, JPG veya PNG")}
                        </p>
                        {editable && (
                          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <FileUp className="h-4 w-4" />
                            {busy === key
                              ? "Yükleniyor…"
                              : document
                                ? "Belgeyi değiştir"
                                : "Belge yükle"}
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="hidden"
                              disabled={busy === key}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file)
                                  void upload(application, requirement, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {editable && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => void submit(application.id)}
                    disabled={busy === application.id}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy === application.id
                      ? "Gönderiliyor…"
                      : "Başvuruyu incelemeye gönder"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
