-- Vía OS — initial schema
--
-- Design notes (invariants live in the database, not the app):
--   * All enums are Postgres enums.
--   * Derived broker counts are a VIEW (broker_stats), never stored columns.
--   * Audit is enforced with triggers — impossible to bypass from any client,
--     including the MCP server and the Attio import script.
--   * The change "source" (ui / mcp / import / system) is read from the
--     PostgREST request header `x-change-source`, which each client sets.
--     Absent or invalid values fall back to 'system'.
--   * interactions inserts bump brokers.last_contact_date via trigger (DB
--     trigger chosen over app logic so MCP/import writes behave identically).
--   * maturity_date is derived date arithmetic: settlement_date + term months.
--     A trigger keeps it in sync unless it is explicitly overridden in the
--     same UPDATE (extension scenarios).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.broker_stage as enum ('introduced', 'engaged', 'active_submitter', 'prime');
create type public.deal_status as enum ('live', 'settled', 'withdrawn', 'declined', 'fell_over');
create type public.deal_product as enum ('bridge', 'draw', 'hold', 'frame', 'other');
create type public.deal_funder as enum ('hcp', 'first_federal', 'other');
create type public.deal_pipeline_stage as enum ('enquiry', 'scenario', 'term_sheet', 'credit', 'docs', 'settlement');
create type public.interaction_type as enum ('email', 'call', 'meeting', 'note');
create type public.link_parent_type as enum ('deal', 'broker');
create type public.audit_action as enum ('insert', 'update', 'delete');
create type public.change_source as enum ('ui', 'mcp', 'import', 'system');

-- ---------------------------------------------------------------------------
-- Allowlist (multi-user-ready: add a role column here later)
-- ---------------------------------------------------------------------------

create table public.allowed_users (
  email text primary key check (email = lower(email)),
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

-- A signed-in user may see their own allowlist row (used to verify access).
create policy "read own allowlist row"
  on public.allowed_users for select
  to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- Allowlist membership check used by every policy below.
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users au
    where au.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company text,
  email text,
  phone text,
  linkedin_url text,
  stage public.broker_stage not null default 'introduced',
  last_contact_date date,
  next_action text,
  next_action_date date,
  notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create unique index brokers_email_unique on public.brokers (lower(email)) where email is not null;
create index brokers_stage_idx on public.brokers (stage);
create index brokers_next_action_date_idx on public.brokers (next_action_date) where next_action_date is not null;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  broker_id uuid not null references public.brokers (id),
  borrower_entity text,
  borrower_contact_name text,
  borrower_contact_email text,
  borrower_contact_phone text,
  security_address text,
  loan_amount numeric, -- display-only; no arithmetic is ever performed on it
  product public.deal_product,
  funder public.deal_funder,
  pipeline_stage public.deal_pipeline_stage not null default 'enquiry',
  status public.deal_status not null default 'live',
  settlement_date date,
  loan_term_months integer check (loan_term_months is null or loan_term_months > 0),
  maturity_date date,
  -- When the deal left 'live' (trigger-maintained). Gives last_deal_outcome a
  -- stable ordering that unrelated edits to old closed deals can't disturb.
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index deals_broker_id_idx on public.deals (broker_id);
create index deals_status_idx on public.deals (status);
create index deals_pipeline_stage_idx on public.deals (pipeline_stage) where status = 'live';
create index deals_maturity_date_idx on public.deals (maturity_date) where status = 'settled';

create table public.key_dates (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  label text not null,
  due_date date not null,
  completed boolean not null default false,
  remind_days_before integer not null default 7 check (remind_days_before >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index key_dates_deal_id_idx on public.key_dates (deal_id);
create index key_dates_due_idx on public.key_dates (due_date) where not completed;

create table public.drive_links (
  id uuid primary key default gen_random_uuid(),
  parent_type public.link_parent_type not null,
  parent_id uuid not null,
  label text not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index drive_links_parent_idx on public.drive_links (parent_type, parent_id);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  type public.interaction_type not null,
  occurred_at timestamptz not null default now(),
  summary text not null,
  gmail_thread_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index interactions_broker_idx on public.interactions (broker_id, occurred_at desc);
create index interactions_deal_idx on public.interactions (deal_id) where deal_id is not null;
-- Gmail sync idempotency: one interaction per (broker, thread). Not a partial
-- index — PostgREST upsert conflict inference can't target partial indexes,
-- and NULL thread ids never collide anyway (NULLs are distinct).
create unique index interactions_gmail_thread_unique
  on public.interactions (broker_id, gmail_thread_id);

-- Google OAuth refresh tokens (for read-only Gmail sync). One row per user.
create table public.google_oauth_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;

create policy "own tokens only"
  on public.google_oauth_tokens for all
  to authenticated
  using (user_id = auth.uid() and public.is_allowed())
  with check (user_id = auth.uid() and public.is_allowed());

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action public.audit_action not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb,
  source public.change_source not null default 'system'
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

alter table public.audit_log enable row level security;

-- Read-only for allowlisted users. No insert/update/delete policies exist:
-- rows are written exclusively by the security-definer trigger function.
create policy "allowlisted read audit"
  on public.audit_log for select
  to authenticated
  using (public.is_allowed());

-- ---------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------

-- Resolve the change source from the PostgREST request header, defaulting to
-- 'system' (covers direct SQL, cron jobs, and anything that forgot the header).
create or replace function public.current_change_source()
returns public.change_source
language plpgsql
stable
as $$
declare
  hdr text;
begin
  begin
    hdr := (current_setting('request.headers', true))::json ->> 'x-change-source';
  exception when others then
    hdr := null;
  end;
  if hdr in ('ui', 'mcp', 'import', 'system') then
    return hdr::public.change_source;
  end if;
  return 'system';
end;
$$;

-- Stamp created_by/updated_by/updated_at. Service-role clients (MCP, import)
-- have no auth.uid(); they pass the actor explicitly and coalesce keeps it.
create or replace function public.set_row_meta()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by, old.updated_by);
  end if;
  return new;
end;
$$;

-- Generic audit writer. SECURITY DEFINER so it can insert into audit_log
-- regardless of the caller's RLS context.
create or replace function public.audit_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_actor uuid;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id;
    v_actor := coalesce(auth.uid(), old.updated_by);
    insert into public.audit_log (table_name, record_id, action, changed_by, before, after, source)
    values (tg_table_name, v_record_id, 'delete', v_actor, to_jsonb(old), null, public.current_change_source());
    return old;
  elsif tg_op = 'UPDATE' then
    v_record_id := new.id;
    v_actor := coalesce(auth.uid(), new.updated_by);
    insert into public.audit_log (table_name, record_id, action, changed_by, before, after, source)
    values (tg_table_name, v_record_id, 'update', v_actor, to_jsonb(old), to_jsonb(new), public.current_change_source());
    return new;
  else
    v_record_id := new.id;
    v_actor := coalesce(auth.uid(), new.created_by);
    insert into public.audit_log (table_name, record_id, action, changed_by, before, after, source)
    values (tg_table_name, v_record_id, 'insert', v_actor, null, to_jsonb(new), public.current_change_source());
    return new;
  end if;
end;
$$;

-- Keep brokers.last_contact_date fresh. greatest() means a back-dated
-- interaction can never regress the date. The calendar date is taken in
-- Australia/Sydney — a 9am AEST call must not land on yesterday's UTC date.
create or replace function public.bump_last_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.brokers
  set last_contact_date = greatest(coalesce(last_contact_date, '0001-01-01'::date), (new.occurred_at at time zone 'Australia/Sydney')::date)
  where id = new.broker_id
    and (last_contact_date is null or last_contact_date < (new.occurred_at at time zone 'Australia/Sydney')::date);
  return new;
end;
$$;

-- Derived date arithmetic: maturity = settlement + term months.
-- Recomputes when settlement/term change, unless maturity_date was explicitly
-- changed in the same statement (manual override, e.g. an extension).
-- Clearing either input clears the derived value rather than leaving it stale.
create or replace function public.sync_maturity_date()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.maturity_date is null and new.settlement_date is not null and new.loan_term_months is not null then
      new.maturity_date := (new.settlement_date + make_interval(months => new.loan_term_months))::date;
    end if;
  else
    if new.maturity_date is not distinct from old.maturity_date
       and (new.settlement_date is distinct from old.settlement_date
            or new.loan_term_months is distinct from old.loan_term_months) then
      if new.settlement_date is not null and new.loan_term_months is not null then
        new.maturity_date := (new.settlement_date + make_interval(months => new.loan_term_months))::date;
      else
        new.maturity_date := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Stamp deals.closed_at when a deal leaves the live pipeline; clear on reopen.
create or replace function public.sync_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'live' then
    new.closed_at := null;
  elsif new.closed_at is null or (tg_op = 'UPDATE' and old.status = 'live') then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Wire up triggers (order matters: meta before audit so audit sees final row)
-- ---------------------------------------------------------------------------

create trigger a_set_row_meta before insert or update on public.brokers
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.deals
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.key_dates
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.drive_links
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.interactions
  for each row execute function public.set_row_meta();

create trigger b_sync_maturity before insert or update on public.deals
  for each row execute function public.sync_maturity_date();
create trigger b_sync_closed_at before insert or update on public.deals
  for each row execute function public.sync_closed_at();

create trigger z_audit after insert or update or delete on public.brokers
  for each row execute function public.audit_changes();
create trigger z_audit after insert or update or delete on public.deals
  for each row execute function public.audit_changes();
create trigger z_audit after insert or update or delete on public.key_dates
  for each row execute function public.audit_changes();
create trigger z_audit after insert or update or delete on public.drive_links
  for each row execute function public.audit_changes();
create trigger z_audit after insert or update or delete on public.interactions
  for each row execute function public.audit_changes();

-- INSERT OR UPDATE: the Gmail sync upserts, and a thread that gained a reply
-- takes the ON CONFLICT UPDATE path — that newer occurred_at must still bump.
create trigger z_bump_last_contact after insert or update on public.interactions
  for each row execute function public.bump_last_contact();

-- ---------------------------------------------------------------------------
-- RLS: allowlisted authenticated users have full access.
-- To add roles later, replace public.is_allowed() with a role-aware check —
-- policies are already structured one-per-table so it is a single function edit.
-- ---------------------------------------------------------------------------

alter table public.brokers enable row level security;
alter table public.deals enable row level security;
alter table public.key_dates enable row level security;
alter table public.drive_links enable row level security;
alter table public.interactions enable row level security;

create policy "allowlisted full access" on public.brokers
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.deals
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.key_dates
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.drive_links
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.interactions
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- ---------------------------------------------------------------------------
-- Derived broker stats — computed on read, never stored, cannot drift.
-- "Most recent closed deal" orders by closed_at (trigger-stamped when a deal
-- leaves the live pipeline), so editing an old closed deal can't flip it.
-- ---------------------------------------------------------------------------

create view public.broker_stats
with (security_invoker = true)
as
select
  b.id as broker_id,
  count(d.id) filter (where d.status = 'live')::int as live_deal_count,
  count(d.id)::int as total_deals_submitted,
  (
    select d2.status
    from public.deals d2
    where d2.broker_id = b.id and d2.status <> 'live'
    order by coalesce(d2.closed_at, d2.updated_at) desc
    limit 1
  ) as last_deal_outcome
from public.brokers b
left join public.deals d on d.broker_id = b.id
group by b.id;
