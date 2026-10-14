import { createClient } from '@/lib/supabase/client'

export type ListingImageType = 'listings' | 'feed_listings' | 'livestock_listings'

export async function uploadListingImages(
  supabase: ReturnType<typeof createClient>,
  files: File[],
  details: { listingType: ListingImageType; listingId: string; companyId: string; userId: string },
) {
  if (files.length === 0) return
  const uploadedPaths: string[] = []
  const rows: Array<Record<string, unknown>> = []

  try {
    for (const [position, file] of files.entries()) {
      const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${details.companyId}/${details.listingType}/${details.listingId}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('listing-images').upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) throw error
      uploadedPaths.push(path)
      const { data } = supabase.storage.from('listing-images').getPublicUrl(path)
      rows.push({
        listing_type: details.listingType,
        listing_id: details.listingId,
        company_id: details.companyId,
        storage_path: path,
        public_url: data.publicUrl,
        position,
        is_primary: position === 0,
        created_by: details.userId,
      })
    }
    const { error } = await supabase.from('listing_images').insert(rows)
    if (error) throw error
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from('listing-images').remove(uploadedPaths)
    throw error
  }
}
