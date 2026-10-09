'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    const checkAccess = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!mounted) return

      if (userError || !user) {
        window.location.replace('/auth')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (!mounted) return

      if (profileError) {
        console.error('Admin yetki kontrolü başarısız:', profileError.message)
      }

      if (!profile?.is_admin) {
        window.location.replace('/profil')
        return
      }

      setIsAdmin(true)
      setChecking(false)
    }

    void checkAccess()

    return () => {
      mounted = false
    }
  }, [supabase])

  if (checking || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Yönetici yetkisi kontrol ediliyor...
      </div>
    )
  }

  return <>{children}</>
}