'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  label?: string
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
}

export function Select({ value, onValueChange, placeholder, label, options, className, disabled }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-[11px] font-medium uppercase tracking-wide text-[#6B7280]">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111]',
            'focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]',
            'data-[placeholder]:text-[#9CA3AF]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="z-50 min-w-[8rem] overflow-hidden rounded-md border border-[#E8E8E8] bg-white shadow-lg animate-in fade-in-0 zoom-in-95"
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    'relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-[13px] text-[#111111] outline-none',
                    'data-[highlighted]:bg-[#F5F5F5]',
                    'data-[state=checked]:text-[#7C3AED]'
                  )}
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ml-auto">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  )
}
