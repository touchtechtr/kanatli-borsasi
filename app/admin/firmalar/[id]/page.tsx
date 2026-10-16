"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Factory,
  FileCheck2,
  RefreshCw,
} from "lucide-react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = {
  id: string;
  name: string;
  role: string;
  status: string;
  tax_no: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
};
type Activity = {
  activity_code: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  suspension_reason: string | null;
};
type ActivityType = { code: string; name: string; segment: string };
type Application = {
  id: string;
  activity_code: string;
  status: string;
  applicant_note: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  created_at: string;
};
type Document = {
  id: string;
  application_id: string;
  requirement_code: string;
  original_name: string;
  storage_path: string;
  status: string;
  created_at: string;
};
type Facility = {
  id: string;
  name: string;
  city: string;
  daily_capacity: number;
  species: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export default function AdminCompanyFile() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState<Company | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [types, setTypes] = useState<Record<string, ActivityType>>({});
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [c, a, t, ap, d, f] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id,name,role,status,tax_no,phone,city,address,created_at",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("company_activities")
        .select(
          "activity_code,status,activated_at,expires_at,suspension_reason",
        )
        .eq("company_id", id)
        .order("activated_at", { ascending: false }),
      supabase.from("activity_types").select("code,name,segment"),
      supabase
        .from("company_activity_applications")
        .select(
          "id,activity_code,status,applicant_note,admin_note,submitted_at,created_at",
        )
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("company_activity_documents")
        .select(
          "id,application_id,requirement_code,original_name,storage_path,status,created_at",
        )
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("slaughterhouses")
        .select(
          "id,name,city,daily_capacity,species,status,admin_note,created_at",
        )
        .eq("company_id", id)
        .order("created_at", { ascending: false }),
    ]);
    const first = [c.error, a.error, t.error, ap.error, d.error, f.error].find(
      Boolean,
    );
    if (first) {
      setError(first?.message ?? "Firma dosyası yüklenemedi.");
      setLoading(false);
      return;
    }
    setCompany(c.data as Company | null);
    setActivities((a.data ?? []) as Activity[]);
    setTypes(
      Object.fromEntries(
        (t.data ?? []).map((x) => [x.code, x as ActivityType]),
      ),
    );
    setApplications((ap.data ?? []) as Application[]);
    setDocuments((d.data ?? []) as Document[]);
    setFacilities((f.data ?? []) as Facility[]);
    setLoading(false);
  }, [id, supabase]);
  useEffect(() => {
    void load();
  }, [load]);
  const openDocument = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("company-activity-documents")
      .createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      setError(error?.message ?? "Belge açılamadı.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };
  if (loading)
    return (
      <div className="p-12 text-center text-slate-500">
        Firma dosyası yükleniyor…
      </div>
    );
  if (!company)
    return (
      <div className="p-12 text-center text-red-600">
        {error ?? "Firma bulunamadı."}
      </div>
    );
  return (
    <main className="min-h-screen bg-slate-50 p-5 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/admin/firmalar"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Firmalara dön
          </Link>
          <button
            onClick={() => void load()}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
          >
            <RefreshCw className="mr-2 inline h-4 w-4" />
            Yenile
          </button>
        </div>
        <section className="rounded-3xl bg-slate-950 p-7 text-white">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-violet-300">
            Yönetim firma dosyası
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black">{company.name}</h1>
              <p className="mt-2 text-sm text-slate-300">
                {company.city ?? "Şehir yok"} · {company.role} · Kayıt{" "}
                {new Date(company.created_at).toLocaleDateString("tr-TR")}
              </p>
            </div>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold">
              {company.status}
            </span>
          </div>
        </section>
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        <section className="grid gap-4 md:grid-cols-2">
          <Box icon={Building2} title="Şirket bilgileri">
            <Info label="Telefon" value={company.phone} />
            <Info label="Vergi no" value={company.tax_no} />
            <Info label="Adres" value={company.address} />
            <Info label="Şehir" value={company.city} />
            <Info label="Ana firma rolü" value={company.role} />
          </Box>
          <Box icon={FileCheck2} title="Özet">
            <Info
              label="Aktif faaliyet"
              value={String(
                activities.filter((x) => x.status === "aktif").length,
              )}
            />
            <Info
              label="Faaliyet başvurusu"
              value={String(applications.length)}
            />
            <Info label="Yüklenen belge" value={String(documents.length)} />
            <Info label="Kesimhane tesisi" value={String(facilities.length)} />
          </Box>
        </section>
        <section
          id="faaliyetler"
          className="scroll-mt-6 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-black">Faaliyetler ve belgeler</h2>
          <div className="mt-5 space-y-4">
            {activities.length === 0 && applications.length === 0 ? (
              <p className="text-sm text-slate-500">
                Faaliyet kaydı bulunmuyor.
              </p>
            ) : (
              <>
                {activities.map((x) => (
                  <div
                    key={x.activity_code}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-extrabold">
                          {types[x.activity_code]?.name ?? x.activity_code}
                        </p>
                        <p className="text-xs text-slate-500">
                          {types[x.activity_code]?.segment}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">
                        {x.status}
                      </span>
                    </div>
                  </div>
                ))}
                {applications.map((x) => {
                  const docs = documents.filter(
                    (d) => d.application_id === x.id,
                  );
                  return (
                    <div key={x.id} className="rounded-xl bg-slate-50 p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-bold">
                            {types[x.activity_code]?.name ?? x.activity_code}
                          </p>
                          <p className="text-xs text-slate-500">
                            Başvuru ·{" "}
                            {new Date(x.created_at).toLocaleString("tr-TR")}
                          </p>
                        </div>
                        <span className="text-xs font-bold">{x.status}</span>
                      </div>
                      {x.applicant_note && (
                        <p className="mt-3 text-sm">
                          Başvuru notu: {x.applicant_note}
                        </p>
                      )}
                      {x.admin_note && (
                        <p className="mt-2 text-sm text-violet-700">
                          Yönetim notu: {x.admin_note}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {docs.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => void openDocument(doc.storage_path)}
                            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {doc.original_name} · {doc.status}
                          </button>
                        ))}
                        {docs.length === 0 && (
                          <span className="text-xs text-slate-400">
                            Belge yüklenmemiş.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>
        <section
          id="kesimhaneler"
          className="scroll-mt-6 rounded-2xl border bg-white p-6"
        >
          <h2 className="text-xl font-black">Şirkete bağlı kesimhaneler</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {facilities.length === 0 ? (
              <p className="text-sm text-red-600">
                Bu şirkete bağlı kesimhane bulunmuyor.
              </p>
            ) : (
              facilities.map((x) => (
                <article
                  key={x.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-extrabold">{x.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {x.city} · {x.species ?? "Tür belirtilmedi"}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">
                      {x.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm">
                    Günlük kapasite:{" "}
                    <b>{x.daily_capacity.toLocaleString("tr-TR")}</b>
                  </p>
                  {x.admin_note && (
                    <p className="mt-2 text-xs text-slate-500">
                      {x.admin_note}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
function Box({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Factory;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <h2 className="flex items-center gap-2 font-black">
        <Icon className="h-5 w-5 text-violet-600" />
        {title}
      </h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}
function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value || "—"}
      </p>
    </div>
  );
}
