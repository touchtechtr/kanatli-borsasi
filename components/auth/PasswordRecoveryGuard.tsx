"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const RECOVERY_MARKER = "kanatli_password_recovery";

export default function PasswordRecoveryGuard() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let mounted = true;

    const clearRecovery = () => {
      window.sessionStorage.removeItem(RECOVERY_MARKER);
    };

    const sendToReset = () => {
      window.sessionStorage.setItem(RECOVERY_MARKER, "1");

      if (!window.location.pathname.startsWith("/auth/reset-password")) {
        window.location.replace("/auth/reset-password?recovery=1");
      }
    };

    const verifyStoredRecovery = async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const explicitRecovery =
        query.get("type") === "recovery" ||
        hash.get("type") === "recovery";

      if (explicitRecovery) {
        sendToReset();
        return;
      }

      if (window.sessionStorage.getItem(RECOVERY_MARKER) !== "1") return;
      if (pathname.startsWith("/auth/reset-password")) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session) {
        sendToReset();
      } else {
        clearRecovery();
      }
    };

    void verifyStoredRecovery();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") sendToReset();
      if (event === "SIGNED_OUT") clearRecovery();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, supabase]);

  return null;
}

export { RECOVERY_MARKER };
