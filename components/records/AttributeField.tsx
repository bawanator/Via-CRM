'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface AttributeFieldProps {
  label: string
  value: string | null | undefined
  onSave?: (value: string) => Promise<void>
  type?: 'text' | 'email' | 'tel' | 'url' | 'number'
  placeholder?: string
  className?: string
  readOnly?: boolean
  render?: (value: string | null | undefined) => React.ReactNode
}

export function AttributeField({
  label,
  value,
  onSave,
  type = 'text',
  placeholder = '—',
  className,
  readOnly,
  render,
}: AttributeFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleSave = async () => {
    if (!onSave || draft === (value || '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setDraft(value || '')
      setEditing(false)
    }
  }

  return (
    <div className={cn('group', className)}>
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
        {label}
      </p>
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={saving}
          className="w-full rounded-md border border-[#7C3AED] bg-white px-2 py-1 text-[13px] text-[#111111] ring-1 ring-[#7C3AED] outline-none"
        />
      ) : (
        <div
          className={cn(
            'inline-edit min-h-[22px] text-[13px]',
            value ? 'text-[#111111]' : 'text-[#9CA3AF]',
            !readOnly && onSave && 'cursor-text'
          )}
          onClick={() => !readOnly && onSave && setEditing(true)}
        >
          {render ? render(value) : (value || <span className="text-[#C4C4C4]">{placeholder}</span>)}
        </div>
      )}
    </div>
  )
}
