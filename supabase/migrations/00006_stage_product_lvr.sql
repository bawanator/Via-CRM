-- Pipeline: drop the 'credit' stage (zero deals ever used it). Products: add
-- 'refinance'. Deals: add gross_lvr (%), a display-only figure like loan_amount
-- (no arithmetic is ever performed on it).
--
-- Enum edits use the rename-swap pattern (rename old → create new → cast column
-- → drop old) so the whole thing is transaction-safe. broker_stats is the only
-- view on deals and references neither column, so the column re-type is clean.

-- ---------------------------------------------------------------------------
-- 1. Pipeline stages: Scenario / Term Sheet / Docs / Settlement (no Credit)
-- ---------------------------------------------------------------------------

drop index if exists public.deals_pipeline_stage_idx;

alter table public.deals alter column pipeline_stage drop default;
alter type public.deal_pipeline_stage rename to deal_pipeline_stage_old;
create type public.deal_pipeline_stage as enum ('scenario', 'term_sheet', 'docs', 'settlement');
alter table public.deals
  alter column pipeline_stage type public.deal_pipeline_stage using (
    -- No 'credit' rows exist; guard anyway by folding any stray value back to
    -- term_sheet (the stage immediately before it).
    case pipeline_stage::text when 'credit' then 'term_sheet' else pipeline_stage::text end::public.deal_pipeline_stage
  );
alter table public.deals alter column pipeline_stage set default 'scenario';
drop type public.deal_pipeline_stage_old;

create index deals_pipeline_stage_idx on public.deals (pipeline_stage) where status = 'live';

-- ---------------------------------------------------------------------------
-- 2. Products: add Refinance (order chosen for the picker)
-- ---------------------------------------------------------------------------

alter type public.deal_product rename to deal_product_old;
create type public.deal_product as enum ('bridging', 'equity_release', 'purchase', 'residual_stock', 'refinance', 'other');
alter table public.deals
  alter column product type public.deal_product using (product::text::public.deal_product);
drop type public.deal_product_old;

-- ---------------------------------------------------------------------------
-- 3. Gross LVR (percentage, display-only)
-- ---------------------------------------------------------------------------

alter table public.deals
  add column gross_lvr numeric check (gross_lvr is null or (gross_lvr >= 0 and gross_lvr <= 200));
