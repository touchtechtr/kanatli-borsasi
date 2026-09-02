import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL veya Anon Key eksik! Lütfen .env.local dosyanızı kontrol edin.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)