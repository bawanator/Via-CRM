'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

interface DialogContentProps {
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function DialogContent({ children, title, description, className, size = 'md' }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E8E8E8] bg-white shadow-xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          sizeMap[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-[#E8E8E8] px-6 py-4">
            <div>
              {title && (
                <DialogPrimitive.Title className="text-[15px] font-semibold text-[#111111]">
                  {title}
                </DialogPrimitive.Title>
              )}
              {description && (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-[#6B7280]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
