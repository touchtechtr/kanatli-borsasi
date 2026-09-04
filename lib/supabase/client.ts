import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.nbdztaphtyiwjyglbrpz || ''
  const supabaseAnonKey = process.env.sb_publishable_PahwTbUG9dcTSBX50IubDA_1aPWoU5I || ''

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}