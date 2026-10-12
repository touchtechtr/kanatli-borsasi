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

export type ActivityOption = {
  code: string
  name: string
  segment: string
  description: string
}

export const INITIAL_ACTIVITY_OPTIONS: ReadonlyArray<ActivityOption> = [
  { code: 'animal_breeder', name: 'Hayvan Yetiştiricisi', segment: 'Canlı Hayvan', description: 'Kanatlı, büyükbaş veya küçükbaş yetiştiriciliği' },
  { code: 'animal_seller', name: 'Canlı Hayvan Satıcısı', segment: 'Canlı Hayvan', description: 'Canlı hayvan ilanı ve satışı' },
  { code: 'animal_buyer', name: 'Canlı Hayvan Alıcısı / Tüccarı', segment: 'Canlı Hayvan', description: 'Canlı hayvan ilanlarına teklif verme' },
  { code: 'poultry_breeder', name: 'Kanatlı Yetiştiricisi', segment: 'Kanatlı', description: 'Etlik, yumurtacı veya damızlık yetiştiriciliği' },
  { code: 'hatchery', name: 'Kuluçkahane', segment: 'Kanatlı', description: 'Kuluçkalık yumurta ve kuluçka hizmeti' },
  { code: 'chick_producer', name: 'Civciv / Piliç Üreticisi', segment: 'Kanatlı', description: 'Günlük civciv, yarka veya piliç üretimi' },
  { code: 'egg_producer', name: 'Yumurta Üreticisi', segment: 'Kanatlı', description: 'Sofralık veya kuluçkalık yumurta üretimi' },
  { code: 'feed_producer', name: 'Yem Üreticisi', segment: 'Yem ve Hammadde', description: 'Fabrika veya işletme yemi üretimi' },
  { code: 'feed_wholesaler', name: 'Yem Toptancısı', segment: 'Yem ve Hammadde', description: 'Tonajlı yem ticareti ve dağıtımı' },
  { code: 'feed_retailer', name: 'Yem Satıcısı / Bayisi', segment: 'Yem ve Hammadde', description: 'Çuvallı ve bölgesel yem satışı' },
  { code: 'raw_material_supplier', name: 'Yem Hammaddesi Tedarikçisi', segment: 'Yem ve Hammadde', description: 'Mısır, arpa, soya, küspe ve katkı maddeleri' },
  { code: 'feed_buyer', name: 'Yem Alıcısı', segment: 'Yem ve Hammadde', description: 'Yem alım talebi ve tedarik teklifi toplama' },
  { code: 'ration_consultant', name: 'Rasyon Danışmanı', segment: 'Yem ve Hammadde', description: 'Rasyon ve besleme danışmanlığı' },
  { code: 'contract_publisher', name: 'Sözleşmeli Üretim Yayıncısı', segment: 'Üretim', description: 'Sözleşmeli üretici arama' },
  { code: 'slaughterhouse_operator', name: 'Kesimhane / Mezbaha İşletmecisi', segment: 'Hizmet', description: 'Kesim tesisi ve randevu yönetimi' },
  { code: 'milk_collection', name: 'Süt Toplama Merkezi', segment: 'Hizmet', description: 'Çiğ süt alımı ve toplama faaliyeti' },
  { code: 'dairy_processor', name: 'Mandıra / Süt Fabrikası', segment: 'Hizmet', description: 'Süt tedariki ve işleme faaliyeti' },
  { code: 'expert_provider', name: 'Bağımsız Ekspertiz', segment: 'Uzmanlık', description: 'Tarafsız değerleme ve uygunluk raporu' },
  { code: 'veterinarian', name: 'Veteriner Hekim', segment: 'Uzmanlık', description: 'Sağlık, aşı ve veteriner raporları' },
  { code: 'animal_logistics', name: 'Canlı Hayvan Nakliyecisi', segment: 'Lojistik', description: 'Ruhsatlı canlı hayvan taşıması' },
  { code: 'feed_logistics', name: 'Yem Nakliyecisi', segment: 'Lojistik', description: 'Dökme veya çuvallı yem taşıması' },
]
