import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
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
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          'w-full rounded-md border border-[#E8E8E8] bg-white px-3 py-2 text-[13px] text-[#111111] placeholder:text-[#9CA3AF] resize-none',
          'transition-colors duration-100',
          'focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]',
          error && 'border-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
})
