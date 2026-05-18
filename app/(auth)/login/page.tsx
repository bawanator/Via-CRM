'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="flex h-full min-h-screen bg-[#0C0C0E]">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-start justify-between p-12">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#7C3AED] flex items-center justify-center">
            <span className="text-[13px] font-bold text-white">V</span>
          </div>
          <span className="text-[16px] font-semibold text-white">Via CRM</span>
        </div>
        <div>
          <p className="max-w-sm text-[28px] font-semibold leading-snug text-white">
            Your contacts, deals, and conversations — in one place.
          </p>
          <p className="mt-4 text-[14px] text-[#6B7280]">
            Built for small sales teams who want clarity, not complexity.
          </p>
        </div>
        <p className="text-[12px] text-[#4B5563]">Via CRM</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-[#1F1F26] bg-[#111113] p-8">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="h-6 w-6 rounded-md bg-[#7C3AED] flex items-center justify-center">
                <span className="text-[11px] font-bold text-white">V</span>
              </div>
              <span className="text-[14px] font-semibold text-white">Via CRM</span>
            </div>

            {sent ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#1E1B2E]">
                  <span className="text-2xl">✉️</span>
                </div>
                <h2 className="text-[17px] font-semibold text-white">Check your email</h2>
                <p className="mt-2 text-[13px] text-[#6B7280]">
                  We sent a magic link to <strong className="text-[#9CA3AF]">{email}</strong>
                </p>
                <button
                  onClick={() => setSent(false)}
                  className="mt-4 text-[12px] text-[#7C3AED] hover:underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 text-[20px] font-semibold text-white">Sign in</h2>
                <p className="mb-6 text-[13px] text-[#6B7280]">
                  Enter your email to receive a sign-in link.
                </p>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className="h-9 w-full rounded-lg border border-[#2A2A35] bg-[#1A1A1F] px-3 text-[13px] text-white placeholder:text-[#4B5563] focus:outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED]"
                    />
                  </div>
                  {error && <p className="text-[12px] text-red-400">{error}</p>}
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={loading}
                    className="w-full"
                  >
                    Continue with email
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
