'use client'

import { useState } from 'react'
import { Phone, Calendar, FileText, Mail, Plus } from 'lucide-react'
import { cn, formatRelativeDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import type { Activity, ActivityType } from '@/lib/supabase/types'

const iconMap: Record<ActivityType, React.ElementType> = {
  call:    Phone,
  meeting: Calendar,
  note:    FileText,
  email:   Mail,
}

const colorMap: Record<ActivityType, string> = {
  call:    'bg-blue-50 text-blue-600 border-blue-100',
  meeting: 'bg-violet-50 text-violet-600 border-violet-100',
  note:    'bg-amber-50 text-amber-600 border-amber-100',
  email:   'bg-gray-50 text-gray-500 border-gray-200',
}

interface ActivityTimelineProps {
  activities: Activity[]
  onAdd?: (type: ActivityType, body: string) => Promise<void>
}

export function ActivityTimeline({ activities, onAdd }: ActivityTimelineProps) {
  const [composing, setComposing] = useState(false)
  const [type, setType] = useState<ActivityType>('note')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!body.trim() || !onAdd) return
    setSaving(true)
    try {
      await onAdd(type, body.trim())
      setBody('')
      setComposing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Compose */}
      {onAdd && (
        composing ? (
          <div className="rounded-lg border border-[#E8E8E8] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Select
                value={type}
                onValueChange={(v) => setType(v as ActivityType)}
                options={[
                  { value: 'note',    label: 'Note' },
                  { value: 'call',    label: 'Call' },
                  { value: 'meeting', label: 'Meeting' },
                ]}
                className="w-32"
              />
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened?"
              rows={3}
              autoFocus
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setBody('') }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSubmit} loading={saving} disabled={!body.trim()}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[#E8E8E8] px-4 py-2.5 text-[13px] text-[#9CA3AF] hover:border-[#D1D5DB] hover:text-[#6B7280] hover:bg-[#FAFAFA] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Log activity
          </button>
        )
      )}

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[13px] text-[#9CA3AF]">No activity yet</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-2 bottom-2 w-px bg-[#F0F0F0]" />
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = iconMap[activity.type]
              const colorClass = colorMap[activity.type]
              return (
                <div key={activity.id} className="relative flex gap-3 pl-2">
                  <div className={cn(
                    'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    colorClass
                  )}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 rounded-lg border border-[#F0F0F0] bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {activity.user && (
                          <Avatar name={activity.user.full_name} size="xs" />
                        )}
                        <span className="text-[12px] font-medium text-[#111111] capitalize">
                          {activity.type}
                          {activity.title && ` — ${activity.title}`}
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-[#9CA3AF]">
                        {formatRelativeDate(activity.logged_at)}
                      </span>
                    </div>
                    {activity.body && (
                      <p className="mt-2 text-[13px] text-[#6B7280] leading-relaxed">
                        {activity.body}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
