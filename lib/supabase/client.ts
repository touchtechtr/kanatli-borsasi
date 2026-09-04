import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.[https://nbdztaphtyiwjyglbrpz.supabase.co](https://nbdztaphtyiwjyglbrpz.supabase.co) || ''
  const supabaseAnonKey = process.env.sb_publishable_PahwTbUG9dcTSBX50IubDA_1aPWoU5I || ''

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}