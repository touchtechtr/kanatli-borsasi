import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcıda (Client Component'lerde) kullanılacak Supabase client.
 * Örnek kullanım: const supabase = createClient();
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
