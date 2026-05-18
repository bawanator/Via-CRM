import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const userId = searchParams.get('state')

  if (!code || !userId) {
    return NextResponse.redirect(`${origin}/settings?error=gmail_auth`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
      grant_type:    'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/settings?error=gmail_token`)
  }

  const tokens = await tokenRes.json()

  const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const gmailProfile = await profileRes.json()

  const supabase = await createClient()
  await supabase.from('gmail_connections').upsert({
    user_id:       userId,
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    email:         gmailProfile.emailAddress,
  }, { onConflict: 'user_id' })

  return NextResponse.redirect(`${origin}/settings?gmail=connected`)
}
