export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
export type ActivityType = 'call' | 'meeting' | 'note' | 'email'

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  created_at: string
}

export interface Company {
  id: string
  name: string
  domain: string | null
  industry: string | null
  employee_count: string | null
  website: string | null
  description: string | null
  owner_id: string
  created_at: string
  updated_at: string
  owner?: Profile
}

export interface Contact {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  company_id: string | null
  owner_id: string
  created_at: string
  updated_at: string
  company?: Company
  owner?: Profile
}

export interface Deal {
  id: string
  name: string
  value: number | null
  currency: string
  stage: DealStage
  close_date: string | null
  contact_id: string | null
  company_id: string | null
  owner_id: string
  created_at: string
  updated_at: string
  contact?: Contact
  company?: Company
  owner?: Profile
}

export interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  assignee_id: string | null
  deal_id: string | null
  contact_id: string | null
  company_id: string | null
  created_by: string
  created_at: string
  assignee?: Profile
  deal?: Deal
  contact?: Contact
  company?: Company
}

export interface Activity {
  id: string
  type: ActivityType
  title: string | null
  body: string | null
  logged_at: string
  user_id: string
  contact_id: string | null
  deal_id: string | null
  company_id: string | null
  gmail_message_id: string | null
  created_at: string
  user?: Profile
}

export interface GmailConnection {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  email: string
  created_at: string
}

export const DEAL_STAGES: { value: DealStage; label: string; color: string }[] = [
  { value: 'lead',        label: 'Lead',        color: '#6B7280' },
  { value: 'qualified',   label: 'Qualified',   color: '#3B82F6' },
  { value: 'proposal',    label: 'Proposal',    color: '#8B5CF6' },
  { value: 'negotiation', label: 'Negotiation', color: '#F59E0B' },
  { value: 'won',         label: 'Won',         color: '#059669' },
  { value: 'lost',        label: 'Lost',        color: '#EF4444' },
]

export const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'call',    label: 'Call',    icon: 'phone' },
  { value: 'meeting', label: 'Meeting', icon: 'calendar' },
  { value: 'note',    label: 'Note',    icon: 'file-text' },
  { value: 'email',   label: 'Email',   icon: 'mail' },
]
