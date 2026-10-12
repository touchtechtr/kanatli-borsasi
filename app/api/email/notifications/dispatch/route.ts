import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export async function POST(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const mode = process.env.EMAIL_DELIVERY_MODE || "test";
  const testRecipient = process.env.EMAIL_TEST_TO;
  const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  if (!token) {
    return Response.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }
  if (!supabaseUrl || !anonKey || !resendKey || !from) {
    return Response.json(
      { error: "E-posta ortam değişkenleri eksik." },
      { status: 500 },
    );
  }
  if (mode === "test" && !testRecipient) {
    return Response.json(
      { error: "EMAIL_TEST_TO tanımlı değil." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } =
    await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json(
      {
        error: "Oturum geçersiz.",
        detail:
          process.env.NODE_ENV === "development"
            ? userError?.message || "Kullanıcı bulunamadı."
            : undefined,
      },
      { status: 401 },
    );
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin)
    return Response.json(
      { error: "Yönetici yetkisi gerekiyor." },
      { status: 403 },
    );

  const { data: rows, error: loadError } = await supabase
    .from("notification_email_outbox")
    .select("id,recipient_email,subject,title,message,link,attempt_count")
    .in("status", ["beklemede", "hata"])
    .lt("attempt_count", 4)
    .order("created_at", { ascending: true })
    .limit(25);
  if (loadError)
    return Response.json({ error: loadError.message }, { status: 500 });

  const resend = new Resend(resendKey);
  let sent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const destination = mode === "test" ? testRecipient! : row.recipient_email;
    const actionUrl = row.link
      ? `${siteUrl}${row.link.startsWith("/") ? row.link : `/${row.link}`}`
      : `${siteUrl}/profil/bildirimler`;
    const { error: emailError } = await resend.emails.send({
      from,
      to: destination,
      subject:
        mode === "test"
          ? `[TEST → ${row.recipient_email}] ${row.subject}`
          : row.subject,
      html: `<div style="background:#f1f5f9;padding:30px 12px;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden"><div style="background:#064e3b;padding:22px 26px;color:white"><strong style="font-size:20px">Kanatlı Borsası</strong></div><div style="padding:28px"><h1 style="font-size:22px;color:#0f172a">${escapeHtml(row.title)}</h1><p style="color:#475569;line-height:1.7">${escapeHtml(row.message)}</p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:18px;background:#059669;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">Ayrıntıyı görüntüle</a></div></div></div>`,
    });
    if (emailError) {
      failed++;
      await supabase
        .from("notification_email_outbox")
        .update({
          status: "hata",
          attempt_count: Number(row.attempt_count) + 1,
          last_error: emailError.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    } else {
      sent++;
      await supabase
        .from("notification_email_outbox")
        .update({
          status: "gonderildi",
          attempt_count: Number(row.attempt_count) + 1,
          last_error: null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return Response.json({ processed: (rows ?? []).length, sent, failed, mode });
}
