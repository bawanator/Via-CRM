-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can view all profiles" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- COMPANIES
-- ============================================================
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  domain          text,
  industry        text,
  employee_count  text,
  website         text,
  description     text,
  owner_id        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.companies enable row level security;
create policy "Authenticated users can view companies"  on public.companies for select  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert companies" on public.companies for insert with check (auth.role() = 'authenticated');
create policy "Authenticated users can update companies" on public.companies for update using (auth.role() = 'authenticated');
create policy "Authenticated users can delete companies" on public.companies for delete using (auth.uid() = owner_id);

-- ============================================================
-- CONTACTS
-- ============================================================
create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text,
  email       text,
  phone       text,
  job_title   text,
  company_id  uuid references public.companies(id) on delete set null,
  owner_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.contacts enable row level security;
create policy "Authenticated users can view contacts"   on public.contacts for select  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert contacts" on public.contacts for insert  with check (auth.role() = 'authenticated');
create policy "Authenticated users can update contacts" on public.contacts for update  using (auth.role() = 'authenticated');
create policy "Authenticated users can delete contacts" on public.contacts for delete  using (auth.uid() = owner_id);

-- ============================================================
-- DEALS
-- ============================================================
create type deal_stage as enum ('lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

create table public.deals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  value       numeric,
  currency    text not null default 'GBP',
  stage       deal_stage not null default 'lead',
  close_date  date,
  contact_id  uuid references public.contacts(id) on delete set null,
  company_id  uuid references public.companies(id) on delete set null,
  owner_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.deals enable row level security;
create policy "Authenticated users can view deals"   on public.deals for select  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert deals" on public.deals for insert  with check (auth.role() = 'authenticated');
create policy "Authenticated users can update deals" on public.deals for update  using (auth.role() = 'authenticated');
create policy "Authenticated users can delete deals" on public.deals for delete  using (auth.uid() = owner_id);

-- ============================================================
-- TASKS
-- ============================================================
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  due_date      timestamptz,
  completed_at  timestamptz,
  assignee_id   uuid references public.profiles(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete cascade,
  company_id    uuid references public.companies(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.tasks enable row level security;
create policy "Authenticated users can view tasks"   on public.tasks for select  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert tasks" on public.tasks for insert  with check (auth.role() = 'authenticated');
create policy "Authenticated users can update tasks" on public.tasks for update  using (auth.role() = 'authenticated');
create policy "Authenticated users can delete tasks" on public.tasks for delete  using (auth.role() = 'authenticated');

-- ============================================================
-- ACTIVITIES
-- ============================================================
create type activity_type as enum ('call', 'meeting', 'note', 'email');

create table public.activities (
  id                uuid primary key default gen_random_uuid(),
  type              activity_type not null,
  title             text,
  body              text,
  logged_at         timestamptz not null default now(),
  user_id           uuid references public.profiles(id) on delete set null,
  contact_id        uuid references public.contacts(id) on delete cascade,
  deal_id           uuid references public.deals(id) on delete cascade,
  company_id        uuid references public.companies(id) on delete cascade,
  gmail_message_id  text,
  created_at        timestamptz not null default now()
);

alter table public.activities enable row level security;
create policy "Authenticated users can view activities"   on public.activities for select  using (auth.role() = 'authenticated');
create policy "Authenticated users can insert activities" on public.activities for insert  with check (auth.role() = 'authenticated');
create policy "Authenticated users can update activities" on public.activities for update  using (auth.uid() = user_id);
create policy "Authenticated users can delete activities" on public.activities for delete  using (auth.uid() = user_id);

-- ============================================================
-- GMAIL CONNECTIONS
-- ============================================================
create table public.gmail_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade unique,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  email          text not null,
  created_at     timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;
create policy "Users can manage own Gmail connection" on public.gmail_connections
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_companies_updated_at before update on public.companies
  for each row execute procedure public.set_updated_at();
create trigger set_contacts_updated_at  before update on public.contacts
  for each row execute procedure public.set_updated_at();
create trigger set_deals_updated_at     before update on public.deals
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index on public.contacts  (company_id);
create index on public.contacts  (owner_id);
create index on public.deals     (stage);
create index on public.deals     (company_id);
create index on public.deals     (contact_id);
create index on public.deals     (owner_id);
create index on public.tasks     (assignee_id);
create index on public.tasks     (due_date);
create index on public.tasks     (completed_at);
create index on public.activities (contact_id);
create index on public.activities (deal_id);
create index on public.activities (logged_at desc);
