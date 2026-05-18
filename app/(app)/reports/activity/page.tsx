'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { createClient } from '@/lib/supabase/client'
import { Phone, Calendar, FileText, Mail } from 'lucide-react'
import type { Activity, Profile } from '@/lib/supabase/types'

const typeConfig = {
  call:    { label: 'Calls',    Icon: Phone,    color: '#3B82F6' },
  meeting: { label: 'Meetings', Icon: Calendar, color: '#8B5CF6' },
  note:    { label: 'Notes',    Icon: FileText,  color: '#F59E0B' },
  email:   { label: 'Emails',  Icon: Mail,     color: '#6B7280' },
}

export default function ActivityReportPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const supabase = createClient()

  useEffect(() => {
    const since = new Date()
    since.setDate(since.getDate() - (period === 'week' ? 7 : 30))
    Promise.all([
      supabase.from('activities').select('*, user:profiles(id, full_name)').gte('logged_at', since.toISOString()),
      supabase.from('profiles').select('*'),
    ]).then(([a, p]) => {
      setActivities((a.data as Activity[]) || [])
      setProfiles((p.data as Profile[]) || [])
      setLoading(false)
    })
  }, [period])

  const byType = (type: string) => activities.filter((a) => a.type === type).length
  const byUser = profiles.map((p) => ({
    profile: p,
    total: activities.filter((a) => a.user_id === p.id).length,
    calls: activities.filter((a) => a.user_id === p.id && a.type === 'call').length,
    meetings: activities.filter((a) => a.user_id === p.id && a.type === 'meeting').length,
    notes: activities.filter((a) => a.user_id === p.id && a.type === 'note').length,
  })).filter((u) => u.total > 0).sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Activity"
        subtitle="Logged calls, meetings, and notes"
        actions={
          <div className="flex rounded-md border border-[#E8E8E8] overflow-hidden">
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  period === p ? 'bg-[#7C3AED] text-white' : 'bg-white text-[#6B7280] hover:bg-[#F5F5F5]'
                }`}
              >
                {p === 'week' ? 'This week' : 'This month'}
              </button>
            ))}
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-4xl space-y-6">
            {/* Activity type KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(typeConfig).map(([type, { label, Icon, color }]) => (
                <div key={type} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color }} />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9CA3AF]">{label}</p>
                  </div>
                  <p className="text-[28px] font-semibold text-[#111111] tabular-nums">{byType(type)}</p>
                </div>
              ))}
            </div>

            {/* By user */}
            {byUser.length > 0 && (
              <div className="rounded-xl border border-[#E8E8E8] bg-white overflow-hidden">
                <div className="border-b border-[#F0F0F0] px-4 py-3">
                  <h2 className="text-[13px] font-semibold text-[#111111]">Activity by person</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#F0F0F0]">
                      {['Person', 'Total', 'Calls', 'Meetings', 'Notes'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byUser.map(({ profile, total, calls, meetings, notes }) => (
                      <tr key={profile.id} className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3 text-[13px] font-medium text-[#111111]">{profile.full_name}</td>
                        <td className="px-4 py-3 text-[13px] font-semibold tabular-nums">{total}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-[#3B82F6]">{calls}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-[#8B5CF6]">{meetings}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-[#F59E0B]">{notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activities.length === 0 && (
              <div className="rounded-xl border border-[#E8E8E8] bg-white p-10 text-center">
                <p className="text-[13px] text-[#9CA3AF]">No activity logged {period === 'week' ? 'this week' : 'this month'}.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
