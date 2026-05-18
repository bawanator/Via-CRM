import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...props },
  ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] placeholder:text-[#9CA3AF]',
          'transition-colors duration-100',
          'focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
})
