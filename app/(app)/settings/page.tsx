'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
    checkGmail()
    if (searchParams.get('gmail') === 'connected') {
      checkGmail()
    }
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data as Profile)
      setName(data.full_name)
    }
  }

  async function checkGmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('gmail_connections').select('email').eq('user_id', user.id).single()
    if (data) {
      setGmailConnected(true)
      setGmailEmail(data.email)
    }
  }

  async function saveName() {
    if (!profile || !name.trim()) return
    setSaving(true)
    await supabase.from('profiles').update({ full_name: name }).eq('id', profile.id)
    setProfile({ ...profile, full_name: name })
    setSaving(false)
  }

  async function disconnectGmail() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('gmail_connections').delete().eq('user_id', user.id)
    setGmailConnected(false)
    setGmailEmail('')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg space-y-6">

          {/* Profile */}
          <div className="rounded-xl border border-[#E8E8E8] bg-white p-5">
            <h2 className="mb-4 text-[13px] font-semibold text-[#111111]">Profile</h2>
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={name || 'User'} size="lg" />
              <div>
                <p className="text-[13px] font-medium text-[#111111]">{name || 'No name set'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Input
                label="Display name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <div className="flex items-end">
                <Button variant="secondary" size="sm" onClick={saveName} loading={saving}>
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* Gmail */}
          <div className="rounded-xl border border-[#E8E8E8] bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#9CA3AF]" />
              <h2 className="text-[13px] font-semibold text-[#111111]">Gmail</h2>
            </div>
            {gmailConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-[13px] text-emerald-700">Connected as {gmailEmail}</span>
                </div>
                <p className="text-[12px] text-[#9CA3AF]">
                  Emails from your contacts will appear on their profile pages.
                </p>
                <Button variant="outline" size="sm" onClick={disconnectGmail}>
                  Disconnect Gmail
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-[#6B7280]">
                  Connect Gmail to see email history on contact profiles (read-only).
                </p>
                <Button variant="primary" size="sm" onClick={() => window.location.href = '/api/gmail/connect'}>
                  <Mail className="h-3.5 w-3.5" />
                  Connect Gmail
                </Button>
              </div>
            )}
          </div>

          {/* Mobile quick-entry */}
          <div className="rounded-xl border border-[#E8E8E8] bg-white p-5">
            <h2 className="mb-2 text-[13px] font-semibold text-[#111111]">Mobile quick-entry</h2>
            <p className="text-[13px] text-[#6B7280] mb-3">
              Send a message to Claude on your phone describing what happened — a call, meeting, or new contact — and it will be logged automatically.
            </p>
            <div className="rounded-lg bg-[#F5F5F5] p-3 font-mono text-[12px] text-[#6B7280]">
              POST /api/log<br />
              {'{ "text": "Had a call with Sarah at Acme, moving to proposal" }'}
            </div>
          </div>

          {/* Sign out */}
          <div className="rounded-xl border border-[#E8E8E8] bg-white p-5">
            <h2 className="mb-3 text-[13px] font-semibold text-[#111111]">Account</h2>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
