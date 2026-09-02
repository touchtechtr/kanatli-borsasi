import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Sunucu tarafında (Server Component, Server Action, Route Handler)
 * kullanılacak Supabase client. Her çağrıda yeniden oluşturulmalı.
 * Örnek kullanım: const supabase = await createClient();
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component içinden çağrıldıysa cookie set edilemez.
            // Middleware oturumu zaten tazelediği için burada görmezden
            // gelmek güvenlidir.
          }
        },
      },
    }
  );
}
