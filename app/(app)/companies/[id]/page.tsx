'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Globe, Users, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AttributeField } from '@/components/records/AttributeField'
import { ActivityTimeline } from '@/components/records/ActivityTimeline'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { Company, Contact, Activity, ActivityType } from '@/lib/supabase/types'
import { formatDate } from '@/lib/utils'

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCompany()
    fetchContacts()
    fetchActivities()
  }, [id])

  async function fetchCompany() {
    const { data } = await supabase.from('companies').select('*').eq('id', id).single()
    setCompany(data as Company)
    setLoading(false)
  }

  async function fetchContacts() {
    const { data } = await supabase.from('contacts').select('*').eq('company_id', id).order('first_name')
    setContacts((data as Contact[]) || [])
  }

  async function fetchActivities() {
    const { data } = await supabase
      .from('activities')
      .select('*, user:profiles(id, full_name, avatar_url)')
      .eq('company_id', id)
      .order('logged_at', { ascending: false })
    setActivities((data as Activity[]) || [])
  }

  async function updateField(field: string, value: string) {
    await supabase.from('companies').update({ [field]: value || null }).eq('id', id)
    setCompany((c) => c ? { ...c, [field]: value } : c)
  }

  async function logActivity(type: ActivityType, body: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({ type, body, company_id: id, user_id: user!.id, logged_at: new Date().toISOString() })
    fetchActivities()
  }

  async function handleDelete() {
    if (!confirm('Delete this company?')) return
    await supabase.from('companies').delete().eq('id', id)
    router.push('/companies')
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
    </div>
  )

  if (!company) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-[#9CA3AF]">Company not found.</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#E8E8E8] bg-white px-6 py-3">
        <button onClick={() => router.back()} className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Avatar name={company.name} size="md" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-semibold text-[#111111] truncate">{company.name}</h1>
          {company.industry && <p className="text-[12px] text-[#9CA3AF]">{company.industry}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Attributes */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-[#E8E8E8] bg-white p-5 space-y-5">
          <AttributeField label="Company name" value={company.name} onSave={(v) => updateField('name', v)} />
          <AttributeField label="Domain" value={company.domain} onSave={(v) => updateField('domain', v)}
            render={(v) => v ? <a href={`https://${v}`} target="_blank" rel="noopener noreferrer" className="text-[#7C3AED] hover:underline flex items-center gap-1"><Globe className="h-3 w-3" />{v}</a> : null}
          />
          <AttributeField label="Website" value={company.website} type="url" onSave={(v) => updateField('website', v)} />
          <AttributeField label="Industry" value={company.industry} onSave={(v) => updateField('industry', v)} />
          <AttributeField label="Employees" value={company.employee_count} onSave={(v) => updateField('employee_count', v)} />
          <AttributeField label="Description" value={company.description} onSave={(v) => updateField('description', v)} />
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Added</p>
            <p className="text-[13px] text-[#6B7280]">{formatDate(company.created_at)}</p>
          </div>

          {/* People */}
          {contacts.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
                People ({contacts.length})
              </p>
              <div className="space-y-1.5">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/people/${c.id}`)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#F5F5F5] transition-colors"
                  >
                    <Avatar name={`${c.first_name} ${c.last_name || ''}`} size="xs" />
                    <span className="text-[12px] text-[#111111]">{c.first_name} {c.last_name}</span>
                    {c.job_title && <span className="ml-auto text-[11px] text-[#9CA3AF] truncate">{c.job_title}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Activity</h2>
          <ActivityTimeline activities={activities} onAdd={logActivity} />
        </div>
      </div>
    </div>
  )
}
