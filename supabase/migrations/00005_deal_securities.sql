-- 00005: multiple securities per deal.
-- deals.security_address (one text field) becomes deal_securities — an
-- add/remove list like guarantors. Existing addresses backfill as the first
-- security, then the old column is dropped (one source of truth).
-- Forward migration: safe to apply on top of 00004.

create table public.deal_securities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create index deal_securities_deal_idx on public.deal_securities (deal_id);

create trigger a_set_row_meta before insert or update on public.deal_securities
  for each row execute function public.set_row_meta();
create trigger z_audit after insert or update or delete on public.deal_securities
  for each row execute function public.audit_changes();

alter table public.deal_securities enable row level security;
create policy "allowlisted full access" on public.deal_securities
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- Backfill: every existing single address becomes the deal's first security.
insert into public.deal_securities (deal_id, address)
select id, btrim(security_address)
from public.deals
where security_address is not null and btrim(security_address) <> '';

alter table public.deals drop column security_address;
