export type CompanyStatus = 'beklemede' | 'onaylandi' | 'reddedildi'

export type CompanyRole =
  | 'ciftci'
  | 'tuccar'
  | 'tedarikci'
  | 'entegre'
  | 'uzman'
  | 'admin'

export interface Company {
  id: string
  user_id: string | null
  name: string
  role: CompanyRole
  tax_no: string | null
  phone: string | null
  city: string | null
  address: string | null
  website: string | null
  status: CompanyStatus
  rejection_count: number
  last_rejection_reason: string | null
  rejected_at: string | null
  blocked_until: string | null
  is_permanently_blocked: boolean
  is_approved: boolean
  created_at: string
}

export interface CompanyModerationHistory {
  id: string
  company_id: string
  reason: string | null
  created_at: string
}
