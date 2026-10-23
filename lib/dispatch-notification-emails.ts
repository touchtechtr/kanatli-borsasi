import type { SupabaseClient } from "@supabase/supabase-js";

const DISPATCH_COOLDOWN_MS = 15_000;
let activeDispatch: Promise<DispatchResult | null> | null = null;
let lastDispatchAt = 0;

export type DispatchOptions = {
  limit?: number;
  outboxId?: string;
  bypassCooldown?: boolean;
};

export type DispatchResult = {
  processed: number;
  sent: number;
  failed: number;
  mode: string;
  requestedOutboxId?: string | null;
};

async function runDispatch(
  supabase: SupabaseClient,
  options: DispatchOptions,
): Promise<DispatchResult | null> {
  const send = (accessToken: string) =>
    fetch("/api/email/notifications/dispatch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: options.limit,
        outboxId: options.outboxId,
      }),
    });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) return null;

  let response = await send(session.access_token);

  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession();

    if (!error && data.session?.access_token) {
      response = await send(data.session.access_token);
    }
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.warn(
      "Bildirim e-postaları gönderilemedi:",
      [result?.error, result?.detail].filter(Boolean).join(" — ") ||
        response.statusText,
    );
    return null;
  }

  return result as DispatchResult;
}

export function dispatchNotificationEmails(
  supabase: SupabaseClient,
  options: DispatchOptions = {},
) {
  const now = Date.now();

  if (activeDispatch) return activeDispatch;
  if (!options.bypassCooldown && now - lastDispatchAt < DISPATCH_COOLDOWN_MS) {
    return Promise.resolve(null);
  }

  lastDispatchAt = now;
  activeDispatch = runDispatch(supabase, options).finally(() => {
    activeDispatch = null;
  });

  return activeDispatch;
}
