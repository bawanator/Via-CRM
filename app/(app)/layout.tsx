import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { CommandPalette } from '@/components/shared/CommandPalette'
import type { Profile } from '@/lib/supabase/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar user={profile as Profile | null} />
      <main className="flex flex-1 flex-col overflow-hidden bg-[#FAFAFA]">
        {children}
      </main>
      <CommandPalette />
    </div>
  )
}
