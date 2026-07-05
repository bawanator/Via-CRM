-- Vía OS — v3: companies become first-class records (Attio-style org views).
--
-- Contacts link to a company record; the old free-text contacts.company column
-- is backfilled into real records and dropped (one source of truth, no drift).
-- Companies are auto-created by the app from typed names and email domains —
-- never hand-maintained.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Primary email domain (lowercase, no @). Used to auto-link contacts created
  -- from email replies. Free-mail domains (gmail etc.) are never stored here.
  domain text,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create unique index companies_name_unique on public.companies (lower(name));
create unique index companies_domain_unique on public.companies (lower(domain)) where domain is not null;

alter table public.contacts add column company_id uuid references public.companies (id);
create index contacts_company_idx on public.contacts (company_id) where company_id is not null;

-- Backfill: one company per distinct trimmed name in the old text column.
insert into public.companies (name)
select distinct trim(company)
from public.contacts
where company is not null and trim(company) <> '';

update public.contacts c
set company_id = co.id
from public.companies co
where c.company is not null and lower(trim(c.company)) = lower(co.name);

alter table public.contacts drop column company;

-- Standard triggers + RLS (same shape as every other table).
create trigger a_set_row_meta before insert or update on public.companies
  for each row execute function public.set_row_meta();
create trigger z_audit after insert or update or delete on public.companies
  for each row execute function public.audit_changes();

alter table public.companies enable row level security;
create policy "allowlisted full access" on public.companies
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
