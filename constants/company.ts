import type { CompanyRole } from '@/types/company'

export const COMPANY_ROLES: ReadonlyArray<{
  value: CompanyRole
  label: string
}> = [
  { value: 'ciftci', label: 'Çiftçi / Yetiştirici' },
  { value: 'tuccar', label: 'Tüccar / Alıcı' },
  { value: 'tedarikci', label: 'Yem Fabrikası / Tedarikçi' },
  { value: 'entegre', label: 'Entegre Tesis / Kesimhane' },
  { value: 'uzman', label: 'Bağımsız Uzman / Veteriner' },
  { value: 'admin', label: 'Yönetici' },
]

export const ROLE_LABELS: Record<CompanyRole, string> =
  Object.fromEntries(
    COMPANY_ROLES.map(({ value, label }) => [value, label])
  ) as Record<CompanyRole, string>

export const REJECTION_REASONS = [
  'Bilgiler eksik',
  'Vergi veya kimlik bilgisi doğrulanamadı',
  'Firma bilgileri uyuşmuyor',
  'Şüpheli veya mükerrer hesap',
  'Platform kurallarına aykırı',
  'Diğer',
] as const
