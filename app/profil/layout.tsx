import ProfileNavigation from '@/components/profile/ProfileNavigation'

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <div className="profile-vip-content min-h-screen"><div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8"><ProfileNavigation />{children}</div></div>
}
