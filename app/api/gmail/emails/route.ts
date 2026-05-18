import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  })
  return res.json()
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contactEmail = searchParams.get('email')
  if (!contactEmail) return NextResponse.json({ emails: [] })

  const { data: conn } = await supabase
    .from('gmail_connections')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!conn) return NextResponse.json({ emails: [], connected: false })

  let accessToken = conn.access_token
  if (new Date(conn.expires_at) <= new Date()) {
    const refreshed = await refreshAccessToken(conn.refresh_token)
    accessToken = refreshed.access_token
    await supabase.from('gmail_connections').update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('user_id', user.id)
  }

  const listRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=from:${contactEmail} OR to:${contactEmail}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const list = await listRes.json()

  if (!list.messages?.length) return NextResponse.json({ emails: [], connected: true })

  const emails = await Promise.all(
    list.messages.slice(0, 10).map(async (msg: { id: string }) => {
      const res = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      const headers = data.payload?.headers || []
      const get = (name: string) => headers.find((h: { name: string; value: string }) => h.name === name)?.value || ''
      return {
        id:      data.id,
        subject: get('Subject') || '(no subject)',
        from:    get('From'),
        date:    get('Date'),
        snippet: data.snippet,
      }
    })
  )

  return NextResponse.json({ emails, connected: true })
}
