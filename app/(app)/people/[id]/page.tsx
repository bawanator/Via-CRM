'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Building2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AttributeField } from '@/components/records/AttributeField'
import { ActivityTimeline } from '@/components/records/ActivityTimeline'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Contact, Activity, ActivityType } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [contact, setContact] = useState<Contact | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchContact()
    fetchActivities()
  }, [id])

  async function fetchContact() {
    const { data } = await supabase
      .from('contacts')
      .select('*, company:companies(id, name), owner:profiles(id, full_name, avatar_url)')
      .eq('id', id)
      .single()
    setContact(data as Contact)
    setLoading(false)
  }

  async function fetchActivities() {
    const { data } = await supabase
      .from('activities')
      .select('*, user:profiles(id, full_name, avatar_url)')
      .eq('contact_id', id)
      .order('logged_at', { ascending: false })
    setActivities((data as Activity[]) || [])
  }

  async function updateField(field: string, value: string) {
    await supabase.from('contacts').update({ [field]: value || null }).eq('id', id)
    setContact((c) => c ? { ...c, [field]: value } : c)
  }

  async function logActivity(type: ActivityType, body: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({
      type,
      body,
      contact_id: id,
      user_id: user!.id,
      logged_at: new Date().toISOString(),
    })
    fetchActivities()
  }

  async function handleDelete() {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    router.push('/people')
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[#9CA3AF]">Contact not found.</p>
      </div>
    )
  }

  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#E8E8E8] bg-white px-6 py-3">
        <button
          onClick={() => router.back()}
          className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar name={fullName} size="md" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-semibold text-[#111111] truncate">{fullName}</h1>
          {contact.job_title && (
            <p className="text-[12px] text-[#9CA3AF]">{contact.job_title}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Attributes panel */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-[#E8E8E8] bg-white p-5 space-y-5">
          <AttributeField
            label="First name"
            value={contact.first_name}
            onSave={(v) => updateField('first_name', v)}
          />
          <AttributeField
            label="Last name"
            value={contact.last_name}
            onSave={(v) => updateField('last_name', v)}
          />
          <AttributeField
            label="Email"
            value={contact.email}
            type="email"
            onSave={(v) => updateField('email', v)}
            render={(v) => v ? (
              <a href={`mailto:${v}`} className="text-[#7C3AED] hover:underline flex items-center gap-1">
                <Mail className="h-3 w-3" />{v}
              </a>
            ) : null}
          />
          <AttributeField
            label="Phone"
            value={contact.phone}
            type="tel"
            onSave={(v) => updateField('phone', v)}
            render={(v) => v ? (
              <a href={`tel:${v}`} className="flex items-center gap-1 text-[#111111]">
                <Phone className="h-3 w-3 text-[#9CA3AF]" />{v}
              </a>
            ) : null}
          />
          <AttributeField
            label="Job title"
            value={contact.job_title}
            onSave={(v) => updateField('job_title', v)}
          />
          <AttributeField
            label="Company"
            value={contact.company?.name}
            readOnly
            render={(v) => v ? (
              <span className="flex items-center gap-1 text-[#111111]">
                <Building2 className="h-3 w-3 text-[#9CA3AF]" />{v}
              </span>
            ) : null}
          />
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Added</p>
            <p className="text-[13px] text-[#6B7280]">{formatDate(contact.created_at)}</p>
          </div>
        </div>

        {/* Activity timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Activity</h2>
          <ActivityTimeline activities={activities} onAdd={logActivity} />
        </div>
      </div>
    </div>
  )
}
