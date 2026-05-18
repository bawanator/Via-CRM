'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { createClient } from '@/lib/supabase/client'
import { CheckSquare, AlertCircle, Clock } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Task, Profile } from '@/lib/supabase/types'

export default function TaskReportPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      supabase.from('tasks').select('*, assignee:profiles(id, full_name, avatar_url)'),
      supabase.from('profiles').select('*'),
    ]).then(([t, p]) => {
      setTasks((t.data as Task[]) || [])
      setProfiles((p.data as Profile[]) || [])
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const open = tasks.filter((t) => !t.completed_at)
  const overdue = open.filter((t) => t.due_date && new Date(t.due_date) < now)
  const completedThisWeek = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= weekAgo)
  const completionRate = tasks.length
    ? Math.round((tasks.filter((t) => t.completed_at).length / tasks.length) * 100)
    : 0

  const byAssignee = profiles.map((p) => {
    const mine = tasks.filter((t) => t.assignee_id === p.id)
    return {
      profile: p,
      open: mine.filter((t) => !t.completed_at).length,
      overdue: mine.filter((t) => !t.completed_at && t.due_date && new Date(t.due_date) < now).length,
      completed: mine.filter((t) => t.completed_at).length,
    }
  }).filter((u) => u.open + u.completed > 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Task Health" subtitle="Completion rates and overdue tasks" />
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-4xl space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Open tasks', value: open.length, icon: Clock, iconColor: '#6B7280' },
                { label: 'Overdue', value: overdue.length, icon: AlertCircle, iconColor: overdue.length > 0 ? '#EF4444' : '#9CA3AF' },
                { label: 'Done this week', value: completedThisWeek.length, icon: CheckSquare, iconColor: '#059669' },
                { label: 'Completion rate', value: `${completionRate}%`, icon: CheckSquare, iconColor: '#7C3AED' },
              ].map(({ label, value, icon: Icon, iconColor }) => (
                <div key={label} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4" style={{ color: iconColor }} />
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9CA3AF]">{label}</p>
                  </div>
                  <p className={cn(
                    'text-[28px] font-semibold tabular-nums',
                    label === 'Overdue' && overdue.length > 0 ? 'text-red-500' : 'text-[#111111]'
                  )}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* By assignee */}
            {byAssignee.length > 0 && (
              <div className="rounded-xl border border-[#E8E8E8] bg-white overflow-hidden">
                <div className="border-b border-[#F0F0F0] px-4 py-3">
                  <h2 className="text-[13px] font-semibold text-[#111111]">Tasks by person</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#F0F0F0]">
                      {['Person', 'Open', 'Overdue', 'Completed'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byAssignee.map(({ profile, open: o, overdue: od, completed }) => (
                      <tr key={profile.id} className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={profile.full_name} size="sm" />
                            <span className="text-[13px] font-medium text-[#111111]">{profile.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums font-medium">{o}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums">
                          <span className={od > 0 ? 'text-red-500 font-medium' : 'text-[#9CA3AF]'}>{od}</span>
                        </td>
                        <td className="px-4 py-3 text-[13px] tabular-nums text-emerald-600">{completed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Overdue list */}
            {overdue.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50 overflow-hidden">
                <div className="border-b border-red-100 px-4 py-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <h2 className="text-[13px] font-semibold text-red-700">Overdue tasks</h2>
                </div>
                <div className="divide-y divide-red-100">
                  {overdue.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1">
                        <p className="text-[13px] text-[#111111]">{t.title}</p>
                        {t.due_date && (
                          <p className="text-[11px] text-red-500">
                            Due {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </div>
                      {t.assignee && <Avatar name={t.assignee.full_name} size="xs" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
