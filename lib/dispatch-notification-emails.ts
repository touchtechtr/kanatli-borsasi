import type { SupabaseClient } from "@supabase/supabase-js";

const DISPATCH_COOLDOWN_MS = 15_000;
let activeDispatch: Promise<void> | null = null;
let lastDispatchAt = 0;

async function runDispatch(supabase: SupabaseClient) {
  const send = (accessToken: string) =>
    fetch("/api/email/notifications/dispatch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return;

  let response = await send(session.access_token);

  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();

    if (!error && data.session?.access_token) {
      response = await send(data.session.access_token);
    }
  }

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    console.warn(
      "Bildirim e-postaları gönderilemedi:",
      [result?.error, result?.detail].filter(Boolean).join(" — ") ||
        response.statusText,
    );
  }
}

export function dispatchNotificationEmails(supabase: SupabaseClient) {
  const now = Date.now();

  if (activeDispatch) return activeDispatch;
  if (now - lastDispatchAt < DISPATCH_COOLDOWN_MS) {
    return Promise.resolve();
  }

  lastDispatchAt = now;
  activeDispatch = runDispatch(supabase).finally(() => {
    activeDispatch = null;
  });

  return activeDispatch;
}
