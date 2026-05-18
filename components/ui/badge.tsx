import { cn } from '@/lib/utils'
import type { DealStage } from '@/lib/supabase/types'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'outline' | 'stage'
  stage?: DealStage
  className?: string
}

const stageStyles: Record<DealStage, string> = {
  lead:        'bg-gray-100 text-gray-600 border-gray-200',
  qualified:   'bg-blue-50 text-blue-700 border-blue-200',
  proposal:    'bg-violet-50 text-violet-700 border-violet-200',
  negotiation: 'bg-amber-50 text-amber-700 border-amber-200',
  won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost:        'bg-red-50 text-red-600 border-red-200',
}

export function Badge({ children, variant = 'default', stage, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none',
        variant === 'default' && 'bg-gray-100 text-gray-700 border-gray-200',
        variant === 'outline' && 'bg-transparent text-gray-600 border-gray-300',
        variant === 'stage' && stage && stageStyles[stage],
        className
      )}
    >
      {children}
    </span>
  )
}
