'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AttributeField } from '@/components/records/AttributeField'
import { ActivityTimeline } from '@/components/records/ActivityTimeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { Deal, Activity, ActivityType, DealStage } from '@/lib/supabase/types'
import { DEAL_STAGES } from '@/lib/supabase/types'
import { formatCurrency, formatDate } from '@/lib/utils'

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDeal()
    fetchActivities()
  }, [id])

  async function fetchDeal() {
    const { data } = await supabase
      .from('deals')
      .select('*, company:companies(id, name), contact:contacts(id, first_name, last_name), owner:profiles(id, full_name, avatar_url)')
      .eq('id', id)
      .single()
    setDeal(data as Deal)
    setLoading(false)
  }

  async function fetchActivities() {
    const { data } = await supabase
      .from('activities')
      .select('*, user:profiles(id, full_name, avatar_url)')
      .eq('deal_id', id)
      .order('logged_at', { ascending: false })
    setActivities((data as Activity[]) || [])
  }

  async function updateField(field: string, value: string) {
    const parsed = field === 'value' ? (value ? parseFloat(value) : null) : (value || null)
    await supabase.from('deals').update({ [field]: parsed }).eq('id', id)
    setDeal((d) => d ? { ...d, [field]: parsed } : d)
  }

  async function updateStage(stage: DealStage) {
    await supabase.from('deals').update({ stage }).eq('id', id)
    setDeal((d) => d ? { ...d, stage } : d)
  }

  async function logActivity(type: ActivityType, body: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({ type, body, deal_id: id, user_id: user!.id, logged_at: new Date().toISOString() })
    fetchActivities()
  }

  async function handleDelete() {
    if (!confirm('Delete this deal?')) return
    await supabase.from('deals').delete().eq('id', id)
    router.push('/deals')
  }

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
    </div>
  )

  if (!deal) return (
    <div className="flex h-full items-center justify-center">
      <p className="text-[#9CA3AF]">Deal not found.</p>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#E8E8E8] bg-white px-6 py-3">
        <button onClick={() => router.back()} className="rounded-md p-1.5 text-[#9CA3AF] hover:bg-[#F5F5F5] hover:text-[#111111] transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold text-[#111111] truncate">{deal.name}</h1>
            <Badge variant="stage" stage={deal.stage} className="shrink-0">
              {DEAL_STAGES.find((s) => s.value === deal.stage)?.label}
            </Badge>
          </div>
          {deal.value && <p className="text-[12px] font-medium text-[#7C3AED]">{formatCurrency(deal.value, deal.currency)}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-500 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 shrink-0 overflow-y-auto border-r border-[#E8E8E8] bg-white p-5 space-y-5">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Stage</p>
            <Select
              value={deal.stage}
              onValueChange={(v) => updateStage(v as DealStage)}
              options={DEAL_STAGES.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
          <AttributeField label="Deal name" value={deal.name} onSave={(v) => updateField('name', v)} />
          <AttributeField label="Value (£)" value={deal.value?.toString()} type="number" onSave={(v) => updateField('value', v)} />
          <AttributeField label="Close date" value={deal.close_date} type="text" onSave={(v) => updateField('close_date', v)} />
          <AttributeField label="Company" value={deal.company?.name} readOnly
            render={(v) => v ? (
              <button onClick={() => deal.company_id && router.push(`/companies/${deal.company_id}`)} className="text-[#7C3AED] hover:underline text-left">
                {v}
              </button>
            ) : null}
          />
          <AttributeField label="Contact" value={deal.contact ? `${deal.contact.first_name} ${deal.contact.last_name || ''}` : null} readOnly
            render={(v) => v ? (
              <button onClick={() => deal.contact_id && router.push(`/people/${deal.contact_id}`)} className="text-[#7C3AED] hover:underline text-left">
                {v}
              </button>
            ) : null}
          />
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Created</p>
            <p className="text-[13px] text-[#6B7280]">{formatDate(deal.created_at)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-[#9CA3AF]">Activity</h2>
          <ActivityTimeline activities={activities} onAdd={logActivity} />
        </div>
      </div>
    </div>
  )
}
