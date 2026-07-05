-- Vía OS — v2 upgrade
--
-- Generalises brokers → contacts (typed, located), simplifies deal outcomes to
-- live/settled/lost with a required loss reason, drops the Enquiry stage,
-- re-bases products, code-names funders (1/2/3 — real names live nowhere),
-- and adds tasks, guarantors, contact types and saved reports.
--
-- Forward migration: safe to apply on top of 00001 with `supabase db push`.
-- Enums that lose values are recreated (Postgres can't drop enum values);
-- enums that only gain/rename values are altered in place.

-- broker_stats depends on deals.status/columns we retype below; drop it first
-- and rebuild it at the end (section 13).
drop view if exists public.broker_stats;

-- Partial indexes whose predicates reference status/pipeline block the enum
-- retype (the predicate literal is bound to the old type). Drop now, rebuild
-- in section 12.5 once the columns hold the new types.
drop index if exists public.deals_status_idx;
drop index if exists public.deals_pipeline_stage_idx;
drop index if exists public.deals_maturity_date_idx;

-- ---------------------------------------------------------------------------
-- 1. Contacts (was brokers): type + location
-- ---------------------------------------------------------------------------

alter table public.brokers rename to contacts;

-- Extensible without code: a lookup table the user can add rows to via UI/MCP.
create table public.contact_types (
  name text primary key,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

insert into public.contact_types (name, sort) values
  ('Broker', 10),
  ('Borrower', 20),
  ('Solicitor', 30),
  ('Valuer', 40),
  ('Accountant', 50),
  ('Referrer', 60),
  ('Other', 900);

alter table public.contacts
  add column type text not null default 'Broker' references public.contact_types (name) on update cascade,
  add column location text; -- city / region, e.g. "Melbourne" — used for filtering

create index contacts_type_idx on public.contacts (type);
create index contacts_location_idx on public.contacts (location) where location is not null;

-- The 4-stage pipeline (stage, next_action*) only applies to Broker-type
-- contacts. Non-brokers simply leave those columns null.

-- ---------------------------------------------------------------------------
-- 2. Deal outcomes: live / settled / lost (+ required loss reason)
-- ---------------------------------------------------------------------------

create type public.deal_loss_reason as enum (
  'outside_mandate',
  'unknown_broker',
  'failed_broker_dd',
  'failed_customer_dd',
  'lost_to_competitor',
  'ghosted'
);

alter table public.deals add column loss_reason public.deal_loss_reason;

-- Recreate deal_status: withdrawn/declined/fell_over collapse into 'lost'.
alter table public.deals alter column status drop default;
alter type public.deal_status rename to deal_status_old;
create type public.deal_status as enum ('live', 'settled', 'lost');
alter table public.deals
  alter column status type public.deal_status using (
    case status::text
      when 'live' then 'live'
      when 'settled' then 'settled'
      else 'lost'
    end::public.deal_status
  );
alter table public.deals alter column status set default 'live';
drop type public.deal_status_old;

-- Any deal that just became 'lost' needs a reason (default the historical ones).
update public.deals set loss_reason = 'ghosted' where status = 'lost' and loss_reason is null;

-- Invariant: lost ⇒ reason present; not lost ⇒ no reason.
alter table public.deals add constraint deals_loss_reason_ck check (
  (status = 'lost' and loss_reason is not null) or (status <> 'lost' and loss_reason is null)
);

-- ---------------------------------------------------------------------------
-- 3. Pipeline stages: drop 'enquiry' (everything starts at scenario)
-- ---------------------------------------------------------------------------

alter table public.deals alter column pipeline_stage drop default;
alter type public.deal_pipeline_stage rename to deal_pipeline_stage_old;
create type public.deal_pipeline_stage as enum ('scenario', 'term_sheet', 'credit', 'docs', 'settlement');
alter table public.deals
  alter column pipeline_stage type public.deal_pipeline_stage using (
    case pipeline_stage::text when 'enquiry' then 'scenario' else pipeline_stage::text end::public.deal_pipeline_stage
  );
alter table public.deals alter column pipeline_stage set default 'scenario';
drop type public.deal_pipeline_stage_old;

-- ---------------------------------------------------------------------------
-- 4. Products: Bridging / Equity Release / Purchase / Residual Stock / Other
-- ---------------------------------------------------------------------------

alter type public.deal_product rename to deal_product_old;
create type public.deal_product as enum ('bridging', 'equity_release', 'purchase', 'residual_stock', 'other');
alter table public.deals
  alter column product type public.deal_product using (
    case product::text
      when 'bridge' then 'bridging'
      when null then null
      else 'other'
    end::public.deal_product
  );
drop type public.deal_product_old;

-- ---------------------------------------------------------------------------
-- 5. Funders: code-named 1 / 2 / 3 — real names never stored as such
--    funder_1 = HCP, funder_2 = First Federal, funder_3 = Vest Capital
--    (mapping lives only in this comment; the app shows "1"/"2"/"3").
-- ---------------------------------------------------------------------------

alter type public.deal_funder rename value 'hcp' to 'funder_1';
alter type public.deal_funder rename value 'first_federal' to 'funder_2';
alter type public.deal_funder add value if not exists 'funder_3';
-- ('other' remains as a harmless unused legacy value.)

-- ---------------------------------------------------------------------------
-- 6. Drive links can attach to any contact, not just brokers
-- ---------------------------------------------------------------------------

alter type public.link_parent_type rename value 'broker' to 'contact';

-- ---------------------------------------------------------------------------
-- 7. Tasks — against contacts and/or deals; feed Today and (later) Google Tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  contact_id uuid references public.contacts (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  -- Set by the auto-generator so we never double-prompt for the same meeting.
  source_event_id text,
  -- Populated once synced to Google Tasks (later phase).
  google_task_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index tasks_open_idx on public.tasks (due_date) where not completed;
create index tasks_contact_idx on public.tasks (contact_id) where contact_id is not null;
create index tasks_deal_idx on public.tasks (deal_id) where deal_id is not null;
-- One auto-task per calendar event.
create unique index tasks_source_event_unique on public.tasks (source_event_id) where source_event_id is not null;

-- Stamp completed_at whenever completed flips true; clear it when reopened.
create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Guarantors — up to 3 per deal (cap enforced in app), personal detail
-- ---------------------------------------------------------------------------

create table public.guarantors (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index guarantors_deal_idx on public.guarantors (deal_id);

-- ---------------------------------------------------------------------------
-- 9. Saved reports — up to 3 pinnable, editable in-app / via MCP (no code)
-- ---------------------------------------------------------------------------

create table public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  spec jsonb not null, -- { metric, filters, group_by, from, to, ... }
  pinned boolean not null default false,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index saved_reports_pinned_idx on public.saved_reports (sort) where pinned;

-- ---------------------------------------------------------------------------
-- 10. bump_last_contact now targets the renamed contacts table
-- ---------------------------------------------------------------------------

create or replace function public.bump_last_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts
  set last_contact_date = greatest(coalesce(last_contact_date, '0001-01-01'::date), (new.occurred_at at time zone 'Australia/Sydney')::date)
  where id = new.broker_id
    and (last_contact_date is null or last_contact_date < (new.occurred_at at time zone 'Australia/Sydney')::date);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Triggers on the new tables (meta before audit; completed_at for tasks)
-- ---------------------------------------------------------------------------

create trigger a_set_row_meta before insert or update on public.tasks
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.guarantors
  for each row execute function public.set_row_meta();
create trigger a_set_row_meta before insert or update on public.saved_reports
  for each row execute function public.set_row_meta();

create trigger b_sync_task_completed_at before insert or update on public.tasks
  for each row execute function public.sync_task_completed_at();

create trigger z_audit after insert or update or delete on public.tasks
  for each row execute function public.audit_changes();
create trigger z_audit after insert or update or delete on public.guarantors
  for each row execute function public.audit_changes();

-- ---------------------------------------------------------------------------
-- 12. RLS on the new tables (allowlisted full access, same shape as the rest)
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.guarantors enable row level security;
alter table public.saved_reports enable row level security;
alter table public.contact_types enable row level security;

create policy "allowlisted full access" on public.tasks
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.guarantors
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted full access" on public.saved_reports
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "allowlisted read types" on public.contact_types
  for select to authenticated using (public.is_allowed());
create policy "allowlisted write types" on public.contact_types
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- ---------------------------------------------------------------------------
-- 12.5 Rebuild the deals indexes dropped up front, now with new-type predicates
-- ---------------------------------------------------------------------------

create index deals_status_idx on public.deals (status);
create index deals_pipeline_stage_idx on public.deals (pipeline_stage) where status = 'live';
create index deals_maturity_date_idx on public.deals (maturity_date) where status = 'settled';

-- ---------------------------------------------------------------------------
-- 13. Rebuild broker_stats over contacts (name kept; used across the app)
-- ---------------------------------------------------------------------------

drop view if exists public.broker_stats;
create view public.broker_stats
with (security_invoker = true)
as
select
  c.id as broker_id,
  count(d.id) filter (where d.status = 'live')::int as live_deal_count,
  count(d.id)::int as total_deals_submitted,
  (
    select d2.status
    from public.deals d2
    where d2.broker_id = c.id and d2.status <> 'live'
    order by coalesce(d2.closed_at, d2.updated_at) desc
    limit 1
  ) as last_deal_outcome
from public.contacts c
left join public.deals d on d.broker_id = c.id
group by c.id;
