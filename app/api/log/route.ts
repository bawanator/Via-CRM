import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM = `You are a CRM data parser. The user will describe something that happened — a meeting, call, new contact, deal update, etc.

Extract structured data and return ONLY valid JSON with this shape:
{
  "action": "log_activity" | "create_contact" | "create_deal" | "update_deal_stage",
  "activity_type": "call" | "meeting" | "note" | null,
  "body": "summary of what happened",
  "contact_name": "first last or null",
  "company_name": "company or null",
  "deal_name": "deal name or null",
  "deal_stage": "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | null,
  "follow_up": "follow-up task description or null",
  "follow_up_date": "ISO date string or null"
}

Be concise. Extract only what is explicitly mentioned. Return only the JSON, no prose.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content: text }],
  })

  let parsed: Record<string, string | null>
  try {
    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Failed to parse response', raw: message.content }, { status: 500 })
  }

  const results: string[] = []

  // Log activity
  if (parsed.action === 'log_activity' && parsed.body) {
    let contactId: string | null = null
    if (parsed.contact_name) {
      const parts = parsed.contact_name.trim().split(' ')
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .ilike('first_name', `%${parts[0]}%`)
        .limit(1)
        .single()
      contactId = data?.id || null
    }

    await supabase.from('activities').insert({
      type:       parsed.activity_type || 'note',
      body:       parsed.body,
      contact_id: contactId,
      user_id:    user.id,
      logged_at:  new Date().toISOString(),
    })
    results.push(`Logged ${parsed.activity_type || 'note'}`)
  }

  // Create follow-up task
  if (parsed.follow_up) {
    await supabase.from('tasks').insert({
      title:      parsed.follow_up,
      due_date:   parsed.follow_up_date || null,
      assignee_id: user.id,
      created_by: user.id,
    })
    results.push(`Created task: ${parsed.follow_up}`)
  }

  return NextResponse.json({ ok: true, results, parsed })
}
