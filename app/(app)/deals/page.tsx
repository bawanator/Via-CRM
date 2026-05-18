'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { KanbanBoard } from '@/components/deals/KanbanBoard'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Deal, DealStage, Company, Contact } from '@/lib/supabase/types'
import { DEAL_STAGES } from '@/lib/supabase/types'

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [defaultStage, setDefaultStage] = useState<DealStage>('lead')
  const [form, setForm] = useState({ name: '', value: '', stage: 'lead' as DealStage, close_date: '', company_id: '', contact_id: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchDeals()
    fetchCompanies()
    fetchContacts()
  }, [])

  async function fetchDeals() {
    setLoading(true)
    const { data } = await supabase
      .from('deals')
      .select('*, company:companies(id, name), contact:contacts(id, first_name, last_name), owner:profiles(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
    setDeals((data as Deal[]) || [])
    setLoading(false)
  }

  async function fetchCompanies() {
    const { data } = await supabase.from('companies').select('id, name').order('name')
    setCompanies((data as Company[]) || [])
  }

  async function fetchContacts() {
    const { data } = await supabase.from('contacts').select('id, first_name, last_name').order('first_name')
    setContacts((data as Contact[]) || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('deals').insert({
      name: form.name,
      value: form.value ? parseFloat(form.value) : null,
      stage: form.stage,
      close_date: form.close_date || null,
      company_id: form.company_id || null,
      contact_id: form.contact_id || null,
      owner_id: user!.id,
    })
    setSaving(false)
    setOpen(false)
    setForm({ name: '', value: '', stage: 'lead', close_date: '', company_id: '', contact_id: '' })
    fetchDeals()
  }

  async function handleStageChange(dealId: string, newStage: DealStage) {
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: newStage } : d))
    await supabase.from('deals').update({ stage: newStage }).eq('id', dealId)
  }

  const openAdd = (stage: DealStage) => {
    setDefaultStage(stage)
    setForm((f) => ({ ...f, stage }))
    setOpen(true)
  }

  const totalOpen = deals
    .filter((d) => !['won', 'lost'].includes(d.stage))
    .reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Deals"
        subtitle={totalOpen > 0 ? `${formatCurrency(totalOpen)} open pipeline` : `${deals.length} deals`}
        actions={<Button variant="primary" size="sm" onClick={() => openAdd('lead')}>+ Add deal</Button>}
      />

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
          </div>
        ) : (
          <KanbanBoard deals={deals} onStageChange={handleStageChange} onAdd={openAdd} />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New deal">
          <form onSubmit={handleAdd} className="space-y-4">
            <Input label="Deal name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Value (£)" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" />
              <Input label="Close date" type="date" value={form.close_date} onChange={(e) => setForm({ ...form, close_date: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as DealStage })}
                className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]">
                {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Company</label>
              <select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]">
                <option value="">None</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Contact</label>
              <select value={form.contact_id} onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]">
                <option value="">None</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" type="submit" loading={saving}>Save deal</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
