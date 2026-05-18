'use client'

import { useEffect, useState } from 'react'
import { CheckSquare, Square, Plus, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate } from '@/lib/utils'
import type { Task, Profile } from '@/lib/supabase/types'

function groupTasks(tasks: Task[]) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const overdue: Task[] = []
  const today: Task[] = []
  const upcoming: Task[] = []
  const noDueDate: Task[] = []
  const completed: Task[] = []

  for (const t of tasks) {
    if (t.completed_at) { completed.push(t); continue }
    if (!t.due_date) { noDueDate.push(t); continue }
    const due = new Date(t.due_date)
    due.setHours(0, 0, 0, 0)
    if (due < now) overdue.push(t)
    else if (due.getTime() === now.getTime()) today.push(t)
    else upcoming.push(t)
  }
  return { overdue, today, upcoming, noDueDate, completed }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', due_date: '', assignee_id: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchTasks()
    fetchProfiles()
  }, [])

  async function fetchTasks() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('*, assignee:profiles(id, full_name, avatar_url)')
      .order('due_date', { ascending: true, nullsFirst: false })
    setTasks((data as Task[]) || [])
    setLoading(false)
  }

  async function fetchProfiles() {
    const { data } = await supabase.from('profiles').select('*')
    setProfiles((data as Profile[]) || [])
  }

  async function toggleComplete(task: Task) {
    const completed_at = task.completed_at ? null : new Date().toISOString()
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed_at } : t))
    await supabase.from('tasks').update({ completed_at }).eq('id', task.id)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tasks').insert({
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      assignee_id: form.assignee_id || user!.id,
      created_by: user!.id,
    })
    setSaving(false)
    setOpen(false)
    setForm({ title: '', description: '', due_date: '', assignee_id: '' })
    fetchTasks()
  }

  const groups = groupTasks(tasks)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => !t.completed_at).length} open`}
        actions={<Button variant="primary" size="sm" onClick={() => setOpen(true)}>+ Add task</Button>}
      />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-4 space-y-6">
            <TaskGroup label="Overdue" tasks={groups.overdue} onToggle={toggleComplete} urgent />
            <TaskGroup label="Today" tasks={groups.today} onToggle={toggleComplete} />
            <TaskGroup label="Upcoming" tasks={groups.upcoming} onToggle={toggleComplete} />
            <TaskGroup label="No due date" tasks={groups.noDueDate} onToggle={toggleComplete} />
            {groups.completed.length > 0 && (
              <TaskGroup label="Completed" tasks={groups.completed.slice(0, 10)} onToggle={toggleComplete} muted />
            )}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New task">
          <form onSubmit={handleAdd} className="space-y-4">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Due date" type="datetime-local" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Assignee</label>
                <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                  className="h-8 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]">
                  <option value="">Me (default)</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" type="submit" loading={saving}>Save task</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskGroup({
  label,
  tasks,
  onToggle,
  urgent,
  muted,
}: {
  label: string
  tasks: Task[]
  onToggle: (t: Task) => void
  urgent?: boolean
  muted?: boolean
}) {
  if (tasks.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className={cn(
          'text-[11px] font-semibold uppercase tracking-widest',
          urgent ? 'text-red-500' : muted ? 'text-[#C4C4C4]' : 'text-[#9CA3AF]'
        )}>
          {label}
        </h2>
        {urgent && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
        <span className="text-[11px] text-[#C4C4C4]">{tasks.length}</span>
      </div>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              'group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 hover:border-[#E8E8E8] hover:bg-white transition-colors',
              task.completed_at && 'opacity-50'
            )}
          >
            <button
              onClick={() => onToggle(task)}
              className="mt-0.5 shrink-0 text-[#9CA3AF] hover:text-[#7C3AED] transition-colors"
            >
              {task.completed_at
                ? <CheckSquare className="h-4 w-4 text-[#7C3AED]" />
                : <Square className="h-4 w-4" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] text-[#111111]', task.completed_at && 'line-through text-[#9CA3AF]')}>
                {task.title}
              </p>
              {task.description && (
                <p className="mt-0.5 text-[12px] text-[#9CA3AF] truncate">{task.description}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {task.due_date && (
                <span className={cn(
                  'text-[11px]',
                  urgent ? 'text-red-500 font-medium' : 'text-[#9CA3AF]'
                )}>
                  {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )}
              {task.assignee && (
                <Avatar name={task.assignee.full_name} size="xs" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
