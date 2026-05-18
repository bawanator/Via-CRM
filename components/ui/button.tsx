import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'xs' | 'sm' | 'md'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', loading, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-100 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#7C3AED]',
        size === 'xs' && 'h-6 px-2 text-[11px]',
        size === 'sm' && 'h-7 px-3 text-[12px]',
        size === 'md' && 'h-8 px-4 text-[13px]',
        variant === 'primary'   && 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]',
        variant === 'secondary' && 'bg-white text-[#111111] border border-[#E8E8E8] hover:bg-[#F5F5F5]',
        variant === 'outline'   && 'bg-transparent text-[#111111] border border-[#E8E8E8] hover:bg-[#F5F5F5]',
        variant === 'ghost'     && 'bg-transparent text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#111111]',
        variant === 'danger'    && 'bg-red-600 text-white hover:bg-red-700',
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : null}
      {children}
    </button>
  )
})
