'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Building2,
  TrendingUp,
  CheckSquare,
  BarChart2,
  Settings,
  ChevronDown,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'

const nav = [
  { href: '/people',    label: 'People',    icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/deals',     label: 'Deals',     icon: TrendingUp },
  { href: '/tasks',     label: 'Tasks',     icon: CheckSquare },
]

const reports = [
  { href: '/reports/pipeline', label: 'Pipeline' },
  { href: '/reports/activity', label: 'Activity' },
  { href: '/reports/tasks',    label: 'Task Health' },
]

interface SidebarProps {
  user: { id: string; full_name: string; avatar_url?: string | null } | null
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <TooltipProvider>
      <aside className="flex h-full w-[220px] shrink-0 flex-col bg-[#0C0C0E] border-r border-[#1F1F26]">
        {/* Workspace header */}
        <div className="flex h-12 items-center justify-between px-3 border-b border-[#1F1F26]">
          <button className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#1A1A1F] transition-colors w-full">
            <div className="h-5 w-5 rounded bg-[#7C3AED] flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">V</span>
            </div>
            <span className="text-[13px] font-semibold text-white truncate">Via CRM</span>
            <ChevronDown className="h-3 w-3 text-[#6B7280] ml-auto shrink-0" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-100',
                  active
                    ? 'bg-[#1E1B2E] text-white'
                    : 'text-[#9CA3AF] hover:bg-[#1A1A1F] hover:text-white'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#A78BFA]' : 'text-[#6B7280] group-hover:text-[#9CA3AF]')} />
                {label}
              </Link>
            )
          })}

          {/* Reports section */}
          <div className="pt-4">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4B5563]">
              Reports
            </p>
            {reports.map(({ href, label }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-100',
                    active
                      ? 'bg-[#1E1B2E] text-white'
                      : 'text-[#9CA3AF] hover:bg-[#1A1A1F] hover:text-white'
                  )}
                >
                  <BarChart2 className="h-3.5 w-3.5 shrink-0 text-[#4B5563]" />
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-[#1F1F26] p-2">
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-[#1A1A1F] transition-colors group"
          >
            <Avatar
              name={user?.full_name || 'User'}
              src={user?.avatar_url}
              size="sm"
            />
            <span className="flex-1 truncate text-[12px] text-[#9CA3AF] group-hover:text-white transition-colors">
              {user?.full_name || 'Account'}
            </span>
            <Settings className="h-3.5 w-3.5 text-[#4B5563] group-hover:text-[#9CA3AF] shrink-0" />
          </Link>
        </div>
      </aside>
    </TooltipProvider>
  )
}
