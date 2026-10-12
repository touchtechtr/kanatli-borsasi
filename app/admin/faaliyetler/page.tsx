"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dispatchNotificationEmails } from "@/lib/dispatch-notification-emails";

type Application = {
  id: string;
  company_id: string;
  activity_code: string;
  status: string;
  applicant_note: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  created_at: string;
};
type Company = {
  id: string;
  name: string;
  tax_no: string | null;
  city: string | null;
  user_id: string | null;
};
type ActivityType = { code: string; name: string; segment: string };
type DocumentRow = {
  id: string;
  application_id: string;
  requirement_code: string;
  storage_path: string;
  original_name: string;
  status: string;
};
type CompanyActivity = {
  company_id: string;
  activity_code: string;
  status: string;
  activated_at: string;
  suspension_reason: string | null;
};
type Metric = { listings: number; movements: number; revenue: number };
type SortMode =
  | "name"
  | "active"
  | "pending"
  | "listings"
  | "movements"
  | "revenue";

const EMPTY: Metric = { listings: 0, movements: 0, revenue: 0 };
const money = (value: number) =>
  Number(value || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  });

export default function AdminActivitiesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [applications, setApplications] = useState<Application[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [permissions, setPermissions] = useState<CompanyActivity[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metric>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("pending");
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ar, cr, tr, pr, lr, fr, vr, or] = await Promise.all([
      supabase
        .from("company_activity_applications")
        .select(
          "id,company_id,activity_code,status,applicant_note,admin_note,submitted_at,created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id,name,tax_no,city,user_id"),
      supabase
        .from("activity_types")
        .select("code,name,segment")
        .order("sort_order"),
      supabase
        .from("company_activities")
        .select(
          "company_id,activity_code,status,activated_at,suspension_reason",
        ),
      supabase.from("listings").select("company_id"),
      supabase.from("feed_listings").select("company_id"),
      supabase.from("livestock_listings").select("company_id"),
      supabase
        .from("trade_offers")
        .select("buyer_company_id,seller_company_id,status,subtotal_amount"),
    ]);
    const coreError = [ar.error, cr.error, tr.error, pr.error].find(Boolean);
    if (coreError) {
      setError(coreError.message);
      setLoading(false);
      return;
    }
    const apps = (ar.data ?? []) as Application[];
    const dr = apps.length
      ? await supabase
          .from("company_activity_documents")
          .select(
            "id,application_id,requirement_code,storage_path,original_name,status",
          )
          .in(
            "application_id",
            apps.map((x) => x.id),
          )
      : { data: [], error: null };
    const next: Record<string, Metric> = {};
    const metric = (id: string) => (next[id] ??= { ...EMPTY });
    [lr, fr, vr].forEach((result) =>
      (result.data ?? []).forEach((row: { company_id: string | null }) => {
        if (row.company_id) metric(row.company_id).listings++;
      }),
    );
    (or.data ?? []).forEach(
      (offer: {
        buyer_company_id: string;
        seller_company_id: string;
        status: string;
        subtotal_amount: number | null;
      }) => {
        metric(offer.buyer_company_id).movements++;
        metric(offer.seller_company_id).movements++;
        if (offer.status === "tamamlandi")
          metric(offer.seller_company_id).revenue += Number(
            offer.subtotal_amount ?? 0,
          );
      },
    );
    const metricError = [lr.error, fr.error, vr.error, or.error, dr.error].find(
      Boolean,
    );
    if (metricError)
      setError(
        "Faaliyetler yüklendi; bazı performans ölçümleri alınamadı: " +
          metricError.message,
      );
    setApplications(apps);
    setCompanies((cr.data ?? []) as Company[]);
    setActivities((tr.data ?? []) as ActivityType[]);
    setPermissions((pr.data ?? []) as CompanyActivity[]);
    setDocuments((dr.data ?? []) as DocumentRow[]);
    setMetrics(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);
  const activityMap = useMemo(
    () => Object.fromEntries(activities.map((x) => [x.code, x])),
    [activities],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return companies
      .map((company) => {
        const companyPermissions = permissions.filter(
          (x) => x.company_id === company.id,
        );
        const companyApplications = applications.filter(
          (x) => x.company_id === company.id,
        );
        const active = companyPermissions.filter(
          (x) => x.status === "aktif",
        ).length;
        const suspended = companyPermissions.filter(
          (x) => x.status === "askida",
        ).length;
        const pending = companyApplications.filter(
          (x) => x.status === "inceleme_bekliyor",
        ).length;
        const correction = companyApplications.filter(
          (x) => x.status === "duzeltme_istendi",
        ).length;
        const codes = new Set([
          ...companyPermissions.map((x) => x.activity_code),
          ...companyApplications.map((x) => x.activity_code),
        ]);
        return {
          company,
          companyPermissions,
          companyApplications,
          active,
          suspended,
          pending,
          correction,
          codes,
          metric: metrics[company.id] ?? EMPTY,
          search: [company.name, company.city, company.tax_no]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("tr-TR"),
        };
      })
      .filter(
        (row) =>
          (!q || row.search.includes(q)) &&
          (activityFilter === "all" || row.codes.has(activityFilter)) &&
          (statusFilter === "all" ||
            (statusFilter === "active" && row.active > 0) ||
            (statusFilter === "pending" && row.pending > 0) ||
            (statusFilter === "suspended" && row.suspended > 0) ||
            (statusFilter === "correction" && row.correction > 0) ||
            (statusFilter === "empty" && row.codes.size === 0)),
      )
      .sort((a, b) => {
        if (sortMode === "active") return b.active - a.active;
        if (sortMode === "pending")
          return (
            b.pending - a.pending ||
            a.company.name.localeCompare(b.company.name, "tr")
          );
        if (sortMode === "listings")
          return b.metric.listings - a.metric.listings;
        if (sortMode === "movements")
          return b.metric.movements - a.metric.movements;
        if (sortMode === "revenue") return b.metric.revenue - a.metric.revenue;
        return a.company.name.localeCompare(b.company.name, "tr");
      });
  }, [
    companies,
    permissions,
    applications,
    metrics,
    query,
    activityFilter,
    statusFilter,
    sortMode,
  ]);

  const review = async (
    id: string,
    action: "onayla" | "reddet" | "duzeltme_iste",
  ) => {
    const explanation = note[id]?.trim() || null;
    if (action !== "onayla" && !explanation) {
      setError("Ret veya düzeltme işlemi için açıklama yazın.");
      return;
    }
    if (!confirm(`Başvuru için “${action}” işlemi uygulansın mı?`)) return;
    setBusy(id);
    setError(null);
    const { error: e } = await supabase.rpc("admin_review_company_activity", {
      p_application_id: id,
      p_action: action,
      p_note: explanation,
    });
    setBusy(null);
    if (e) {
      setError(e.message);
      return;
    }
    await dispatchNotificationEmails(supabase);
    await load();
  };
  const openDocument = async (path: string) => {
    const { data, error: e } = await supabase.storage
      .from("company-activity-documents")
      .createSignedUrl(path, 120);
    if (e) {
      setError(e.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  const changeStatus = async (
    item: CompanyActivity,
    status: "aktif" | "askida" | "kapatildi",
  ) => {
    const reason =
      status === "aktif"
        ? null
        : prompt(
            status === "askida"
              ? "Askıya alma gerekçesi:"
              : "Kapatma gerekçesi:",
          );
    if (status !== "aktif" && !reason?.trim()) return;
    if (!confirm(`Faaliyet durumu “${status}” olarak değiştirilsin mi?`))
      return;
    const key = `${item.company_id}:${item.activity_code}`;
    setBusy(key);
    setError(null);
    const { error: e } = await supabase.rpc(
      "admin_set_company_activity_status",
      {
        p_company_id: item.company_id,
        p_activity_code: item.activity_code,
        p_status: status,
        p_reason: reason,
      },
    );
    setBusy(null);
    if (e) {
      setError(e.message);
      return;
    }
    await dispatchNotificationEmails(supabase);
    await load();
  };

  const pendingTotal = applications.filter(
    (x) => x.status === "inceleme_bekliyor",
  ).length;
  const activeTotal = permissions.filter((x) => x.status === "aktif").length;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-600">
              Yetki ve belge yönetimi
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Şirket Faaliyetleri
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Şirketleri karşılaştırın; satıra tıklayarak faaliyet, başvuru ve
              belgeleri yönetin.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold"
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
        <section className="grid gap-3 sm:grid-cols-3">
          <Summary label="Toplam şirket" value={companies.length} />
          <Summary label="Aktif faaliyet" value={activeTotal} tone="emerald" />
          <Summary
            label="İnceleme bekleyen"
            value={pendingTotal}
            tone="amber"
          />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Filter className="h-4 w-4 text-emerald-600" />
            Süzgeç ve sıralama
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Şirket, şehir veya vergi no"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm faaliyetler</option>
              {activities.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.segment} · {x.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="all">Tüm durumlar</option>
              <option value="active">Aktif faaliyeti olanlar</option>
              <option value="pending">Başvurusu bekleyenler</option>
              <option value="suspended">Askıda faaliyeti olanlar</option>
              <option value="correction">Düzeltme bekleyenler</option>
              <option value="empty">Faaliyeti bulunmayanlar</option>
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="pending">En çok bekleyen başvuru</option>
              <option value="active">En çok aktif faaliyet</option>
              <option value="listings">En çok ilan</option>
              <option value="movements">En çok ticari hareket</option>
              <option value="revenue">En yüksek tamamlanan kazanç</option>
              <option value="name">Şirket adına göre</option>
            </select>
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-slate-900">Şirket listesi</h2>
            <span className="text-xs font-semibold text-slate-500">
              {rows.length} şirket
            </span>
          </div>
          {loading && <Empty text="Şirket faaliyetleri yükleniyor..." />}
          {!loading && rows.length === 0 && (
            <Empty text="Seçilen süzgeçlere uygun şirket bulunamadı." />
          )}
          {!loading &&
            rows.map((row, index) => {
              const open = expanded === row.company.id;
              return (
                <article
                  key={row.company.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : row.company.id)}
                    className="grid w-full gap-4 p-4 text-left transition hover:bg-slate-50 md:grid-cols-[42px_minmax(190px,1.4fr)_1.3fr_1.2fr_32px] md:items-center"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold text-slate-600">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-bold text-slate-900">
                        {row.company.name}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {row.company.city ?? "Şehir yok"} · VKN/TC{" "}
                        {row.company.tax_no ?? "—"}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge label="Aktif" value={row.active} tone="emerald" />
                      <Badge
                        label="Beklemede"
                        value={row.pending}
                        tone="amber"
                      />
                      <Badge
                        label="Askıda"
                        value={row.suspended}
                        tone="orange"
                      />
                      {row.correction > 0 && (
                        <Badge
                          label="Düzeltme"
                          value={row.correction}
                          tone="blue"
                        />
                      )}
                    </span>
                    <span className="grid grid-cols-3 gap-2 text-center">
                      <Mini label="İlan" value={row.metric.listings} />
                      <Mini label="Hareket" value={row.metric.movements} />
                      <Mini
                        label="Kazanç"
                        value={money(row.metric.revenue)}
                        compact
                      />
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 md:p-6">
                      <Details
                        permissions={row.companyPermissions}
                        applications={row.companyApplications}
                        activities={activityMap}
                        documents={documents}
                        note={note}
                        setNote={setNote}
                        busy={busy}
                        review={review}
                        openDocument={openDocument}
                        changeStatus={changeStatus}
                      />
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

function Details({
  permissions,
  applications,
  activities,
  documents,
  note,
  setNote,
  busy,
  review,
  openDocument,
  changeStatus,
}: {
  permissions: CompanyActivity[];
  applications: Application[];
  activities: Record<string, ActivityType>;
  documents: DocumentRow[];
  note: Record<string, string>;
  setNote: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busy: string | null;
  review: (
    id: string,
    a: "onayla" | "reddet" | "duzeltme_iste",
  ) => Promise<void>;
  openDocument: (p: string) => Promise<void>;
  changeStatus: (
    i: CompanyActivity,
    s: "aktif" | "askida" | "kapatildi",
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-bold text-slate-900">Mevcut faaliyet yetkileri</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {permissions.map((item) => {
            const a = activities[item.activity_code],
              key = `${item.company_id}:${item.activity_code}`;
            return (
              <div
                key={key}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      {a?.segment ?? "Faaliyet"}
                    </p>
                    <p className="mt-1 font-bold text-slate-900">
                      {a?.name ?? item.activity_code}
                    </p>
                    {item.suspension_reason && (
                      <p className="mt-1 text-xs text-red-600">
                        {item.suspension_reason}
                      </p>
                    )}
                  </div>
                  <Badge
                    label={item.status}
                    tone={item.status === "aktif" ? "emerald" : "orange"}
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  {item.status !== "aktif" && (
                    <button
                      disabled={busy === key}
                      onClick={() => void changeStatus(item, "aktif")}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                    >
                      Yeniden aç
                    </button>
                  )}
                  {item.status === "aktif" && (
                    <button
                      disabled={busy === key}
                      onClick={() => void changeStatus(item, "askida")}
                      className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-bold text-orange-700"
                    >
                      Askıya al
                    </button>
                  )}
                  <button
                    disabled={busy === key || item.status === "kapatildi"}
                    onClick={() => void changeStatus(item, "kapatildi")}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            );
          })}
          {permissions.length === 0 && (
            <Empty text="Bu şirketin etkinleştirilmiş faaliyeti bulunmuyor." />
          )}
        </div>
      </section>
      <section>
        <h3 className="font-bold text-slate-900">Faaliyet başvuruları</h3>
        <div className="mt-3 space-y-3">
          {[...applications]
            .sort(
              (a, b) =>
                Number(b.status === "inceleme_bekliyor") -
                Number(a.status === "inceleme_bekliyor"),
            )
            .map((app) => {
              const a = activities[app.activity_code],
                docs = documents.filter((x) => x.application_id === app.id),
                actionable = app.status === "inceleme_bekliyor";
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">
                        {a?.segment ?? "Faaliyet"}
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {a?.name ?? app.activity_code}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(app.created_at).toLocaleString("tr-TR")}
                      </p>
                    </div>
                    <Badge
                      label={app.status}
                      tone={app.status === "onaylandi" ? "emerald" : "amber"}
                    />
                  </div>
                  {app.applicant_note && (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                      {app.applicant_note}
                    </p>
                  )}
                  {app.admin_note && (
                    <p className="mt-3 text-sm text-slate-600">
                      <strong>Yönetim notu:</strong> {app.admin_note}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {docs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => void openDocument(doc.storage_path)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-emerald-600" />
                        {doc.original_name}
                      </button>
                    ))}
                    {docs.length === 0 && (
                      <span className="text-xs text-slate-400">
                        Belge yüklenmemiş.
                      </span>
                    )}
                  </div>
                  {actionable && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <textarea
                        value={note[app.id] ?? ""}
                        onChange={(e) =>
                          setNote((c) => ({ ...c, [app.id]: e.target.value }))
                        }
                        placeholder="Onay notu isteğe bağlı; ret ve düzeltme açıklaması zorunludur."
                        className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm"
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          disabled={busy === app.id}
                          onClick={() => void review(app.id, "duzeltme_iste")}
                          className="rounded-xl border border-orange-200 px-4 py-2 text-sm font-bold text-orange-700"
                        >
                          Düzeltme iste
                        </button>
                        <button
                          disabled={busy === app.id}
                          onClick={() => void review(app.id, "reddet")}
                          className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700"
                        >
                          Reddet
                        </button>
                        <button
                          disabled={busy === app.id}
                          onClick={() => void review(app.id, "onayla")}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                        >
                          Onayla
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          {applications.length === 0 && (
            <Empty text="Bu şirkete ait faaliyet başvurusu bulunmuyor." />
          )}
        </div>
      </section>
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber";
}) {
  const s = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`rounded-2xl border p-4 ${s[tone]}`}>
      <p className="text-sm opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone: "emerald" | "amber" | "orange" | "blue";
}) {
  const s = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    orange: "bg-orange-100 text-orange-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s[tone]}`}>
      {label}
      {value === undefined ? "" : ` ${value}`}
    </span>
  );
}
function Mini({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <span className="rounded-lg bg-slate-50 px-2 py-1.5">
      <span className="block text-[10px] uppercase text-slate-400">
        {label}
      </span>
      <span
        className={`block font-bold text-slate-700 ${compact ? "text-[11px]" : "text-sm"}`}
      >
        {value}
      </span>
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
