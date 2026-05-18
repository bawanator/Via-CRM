'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordTable, type Column } from '@/components/records/RecordTable'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import type { Contact } from '@/lib/supabase/types'

const columns: Column<Contact>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '240px',
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2.5">
        <Avatar
          name={`${row.first_name} ${row.last_name || ''}`}
          size="sm"
        />
        <span className="font-medium text-[#111111]">
          {row.first_name} {row.last_name}
        </span>
      </div>
    ),
  },
  {
    key: 'job_title',
    label: 'Title',
    sortable: true,
    render: (row) => (
      <span className="text-[#6B7280]">{row.job_title || '—'}</span>
    ),
  },
  {
    key: 'company',
    label: 'Company',
    sortable: true,
    render: (row) => row.company ? (
      <span className="text-[#111111]">{row.company.name}</span>
    ) : <span className="text-[#C4C4C4]">—</span>,
  },
  {
    key: 'email',
    label: 'Email',
    render: (row) => row.email ? (
      <a
        href={`mailto:${row.email}`}
        onClick={(e) => e.stopPropagation()}
        className="text-[#7C3AED] hover:underline"
      >
        {row.email}
      </a>
    ) : <span className="text-[#C4C4C4]">—</span>,
  },
  {
    key: 'phone',
    label: 'Phone',
    render: (row) => <span className="text-[#6B7280] tabular-nums">{row.phone || '—'}</span>,
  },
]

export default function PeoplePage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', job_title: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchContacts()
  }, [])

  async function fetchContacts() {
    setLoading(true)
    const { data } = await supabase
      .from('contacts')
      .select('*, company:companies(id, name), owner:profiles(id, full_name)')
      .order('first_name')
    setContacts((data as Contact[]) || [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('contacts').insert({ ...form, owner_id: user!.id })
    setSaving(false)
    setOpen(false)
    setForm({ first_name: '', last_name: '', email: '', phone: '', job_title: '' })
    fetchContacts()
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="People"
        subtitle={`${contacts.length} contacts`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" size="sm">+ Add person</Button>
            </DialogTrigger>
            <DialogContent title="New person">
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="First name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    required
                    autoFocus
                  />
                  <Input
                    label="Last name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                </div>
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                <Input
                  label="Job title"
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" loading={saving}>
                    Save person
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex-1 overflow-hidden">
        <RecordTable
          data={contacts}
          columns={columns}
          href={(row) => `/people/${row.id}`}
          onAdd={() => setOpen(true)}
          addLabel="Add person"
          loading={loading}
        />
      </div>
    </div>
  )
}
