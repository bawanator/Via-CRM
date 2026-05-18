import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between border-b border-[#E8E8E8] bg-white px-6 py-4', className)}>
      <div>
        <h1 className="text-[17px] font-semibold text-[#111111]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <kbd className="hidden lg:inline-flex items-center gap-1 rounded-md border border-[#E8E8E8] bg-[#F9F9F9] px-2 py-1 text-[11px] text-[#9CA3AF] cursor-pointer hover:bg-[#F0F0F0] transition-colors">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </div>
    </div>
  )
}
