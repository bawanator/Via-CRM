'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordTable, type Column } from '@/components/records/RecordTable'
import { Avatar } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import type { Company } from '@/lib/supabase/types'

const INDUSTRY_OPTIONS = [
  'Technology', 'Finance', 'Healthcare', 'Retail', 'Manufacturing',
  'Media', 'Education', 'Real Estate', 'Consulting', 'Other',
]

const EMPLOYEE_OPTIONS = ['1–10', '11–50', '51–200', '201–500', '500+']

const columns: Column<Company>[] = [
  {
    key: 'name',
    label: 'Company',
    width: '260px',
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={row.name} size="sm" />
        <span className="font-medium text-[#111111]">{row.name}</span>
      </div>
    ),
  },
  {
    key: 'domain',
    label: 'Domain',
    render: (row) => row.domain ? (
      <a
        href={`https://${row.domain}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-[#7C3AED] hover:underline"
      >
        {row.domain}
      </a>
    ) : <span className="text-[#C4C4C4]">—</span>,
  },
  {
    key: 'industry',
    label: 'Industry',
    sortable: true,
    render: (row) => <span className="text-[#6B7280]">{row.industry || '—'}</span>,
  },
  {
    key: 'employee_count',
    label: 'Employees',
    render: (row) => <span className="text-[#6B7280] tabular-nums">{row.employee_count || '—'}</span>,
  },
]

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', domain: '', industry: '', employee_count: '', website: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchCompanies() }, [])

  async function fetchCompanies() {
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('*, owner:profiles(id, full_name)')
      .order('name')
    setCompanies((data as Company[]) || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('companies').insert({ ...form, owner_id: user!.id })
    setSaving(false)
    setOpen(false)
    setForm({ name: '', domain: '', industry: '', employee_count: '', website: '' })
    fetchCompanies()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} companies`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm">+ Add company</Button>
            </DialogTrigger>
            <DialogContent title="New company">
              <form onSubmit={handleAdd} className="space-y-4">
                <Input label="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
                <Input label="Domain" value={form.domain} placeholder="acme.com" onChange={(e) => setForm({ ...form, domain: e.target.value })} />
                <Input label="Website" value={form.website} placeholder="https://acme.com" onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Industry</label>
                    <select
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })}
                      className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
                    >
                      <option value="">Select…</option>
                      {INDUSTRY_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Employees</label>
                    <select
                      value={form.employee_count}
                      onChange={(e) => setForm({ ...form, employee_count: e.target.value })}
                      className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
                    >
                      <option value="">Select…</option>
                      {EMPLOYEE_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button variant="primary" size="sm" type="submit" loading={saving}>Save company</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex-1 overflow-hidden">
        <RecordTable
          data={companies}
          columns={columns}
          href={(row) => `/companies/${row.id}`}
          onAdd={() => setOpen(true)}
          addLabel="Add company"
          loading={loading}
        />
      </div>
    </div>
  )
}
