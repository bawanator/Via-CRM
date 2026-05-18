'use client'

import { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import { Search, Users, Building2, TrendingUp, CheckSquare, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Contact, Company, Deal } from '@/lib/supabase/types'

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setContacts([])
      setCompanies([])
      setDeals([])
      return
    }
    const [c, co, d] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, first_name, last_name, email, job_title')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(4),
      supabase
        .from('companies')
        .select('id, name, domain')
        .ilike('name', `%${q}%`)
        .limit(4),
      supabase
        .from('deals')
        .select('id, name, stage, value')
        .ilike('name', `%${q}%`)
        .limit(4),
    ])
    setContacts((c.data as Contact[]) || [])
    setCompanies((co.data as Company[]) || [])
    setDeals((d.data as Deal[]) || [])
  }, [supabase])

  useEffect(() => {
    const t = setTimeout(() => search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  const navigate = (href: string) => {
    router.push(href)
    setOpen(false)
    setQuery('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <Command
        className="relative z-10 w-full max-w-lg rounded-xl border border-[#E8E8E8] bg-white shadow-2xl overflow-hidden"
        shouldFilter={false}
      >
        <div className="flex items-center border-b border-[#E8E8E8] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search people, companies, deals…"
            className="flex-1 bg-transparent py-3.5 px-3 text-[14px] text-[#111111] placeholder:text-[#9CA3AF] outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[#E8E8E8] bg-[#F9F9F9] px-1.5 py-0.5 text-[10px] text-[#9CA3AF]">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          {!query && (
            <>
              <Command.Group heading={<GroupHeading>Navigation</GroupHeading>}>
                {[
                  { href: '/people',    label: 'People',    Icon: Users },
                  { href: '/companies', label: 'Companies', Icon: Building2 },
                  { href: '/deals',     label: 'Deals',     Icon: TrendingUp },
                  { href: '/tasks',     label: 'Tasks',     Icon: CheckSquare },
                  { href: '/reports/pipeline', label: 'Pipeline Report', Icon: BarChart2 },
                ].map(({ href, label, Icon }) => (
                  <CommandItem key={href} onSelect={() => navigate(href)}>
                    <Icon className="h-4 w-4 text-[#9CA3AF]" />
                    {label}
                  </CommandItem>
                ))}
              </Command.Group>
            </>
          )}

          {contacts.length > 0 && (
            <Command.Group heading={<GroupHeading>People</GroupHeading>}>
              {contacts.map((c) => (
                <CommandItem key={c.id} onSelect={() => navigate(`/people/${c.id}`)}>
                  <Users className="h-4 w-4 text-[#9CA3AF]" />
                  <span>{c.first_name} {c.last_name}</span>
                  {c.email && <span className="ml-auto text-[11px] text-[#9CA3AF]">{c.email}</span>}
                </CommandItem>
              ))}
            </Command.Group>
          )}

          {companies.length > 0 && (
            <Command.Group heading={<GroupHeading>Companies</GroupHeading>}>
              {companies.map((c) => (
                <CommandItem key={c.id} onSelect={() => navigate(`/companies/${c.id}`)}>
                  <Building2 className="h-4 w-4 text-[#9CA3AF]" />
                  {c.name}
                  {c.domain && <span className="ml-auto text-[11px] text-[#9CA3AF]">{c.domain}</span>}
                </CommandItem>
              ))}
            </Command.Group>
          )}

          {deals.length > 0 && (
            <Command.Group heading={<GroupHeading>Deals</GroupHeading>}>
              {deals.map((d) => (
                <CommandItem key={d.id} onSelect={() => navigate(`/deals/${d.id}`)}>
                  <TrendingUp className="h-4 w-4 text-[#9CA3AF]" />
                  {d.name}
                  <span className="ml-auto text-[11px] capitalize text-[#9CA3AF]">{d.stage}</span>
                </CommandItem>
              ))}
            </Command.Group>
          )}

          {query && contacts.length === 0 && companies.length === 0 && deals.length === 0 && (
            <Command.Empty className="py-8 text-center text-[13px] text-[#9CA3AF]">
              No results for &ldquo;{query}&rdquo;
            </Command.Empty>
          )}
        </Command.List>

        <div className="border-t border-[#E8E8E8] px-4 py-2 flex gap-4">
          <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
            <kbd className="rounded border border-[#E8E8E8] bg-[#F9F9F9] px-1 py-0.5 font-mono text-[10px]">↵</kbd>
            select
          </span>
          <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
            <kbd className="rounded border border-[#E8E8E8] bg-[#F9F9F9] px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
        </div>
      </Command>
    </div>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
      {children}
    </span>
  )
}

function CommandItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-[#111111] data-[selected=true]:bg-[#F5F5F5] outline-none"
    >
      {children}
    </Command.Item>
  )
}
