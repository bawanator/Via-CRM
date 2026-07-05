"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import type { ReportMetric } from "@/lib/crm/reports";
import {
  FUNDER_LABELS,
  FUNDERS,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  PRODUCT_LABELS,
  PRODUCTS,
} from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { DateField, FieldGroup, SelectField, TextField } from "@/components/ui/Field";
import { createReportAction, updateReportAction } from "@/app/(app)/reports/actions";
import {
  METRIC_HELP,
  METRIC_LABELS,
  REPORT_METRICS,
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  coerceStoredSpec,
  defaultGroupBy,
  groupByOptions,
  metricUsesBroker,
  metricUsesFunder,
  metricUsesGroupBy,
  metricUsesInteractionType,
  metricUsesProduct,
  metricUsesRange,
  metricUsesTargetStage,
  resolveRange,
  type RangePreset,
} from "@/components/reports/spec";

type BrokerOption = { id: string; full_name: string };
type ReportForEdit = { id: string; name: string; spec: Record<string, unknown> };

// The no-code report builder. Pick a metric, a date window and metric-relevant
// options; save creates or edits a saved_reports row. Funders appear only as
// 1 / 2 / 3 via FUNDER_LABELS — a real funder name is never rendered.
export function ReportBuilderSheet({
  brokers,
  trigger,
  report,
}: {
  brokers: BrokerOption[];
  trigger: ReactNode;
  report?: ReportForEdit;
}) {
  const router = useRouter();
  const initial = report ? coerceStoredSpec(report.spec) : null;

  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<ReportMetric>(initial?.metric ?? "deals_submitted");
  const [preset, setPreset] = useState<RangePreset>(
    initial?.range_preset ?? (initial?.from || initial?.to ? "custom" : "last_90"),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const formId = `report-form-${report?.id ?? "new"}`;

  function buildSpec(fd: FormData): Record<string, unknown> {
    const spec: Record<string, unknown> = { metric };

    if (metricUsesRange(metric)) {
      spec.range_preset = preset;
      if (preset === "custom") {
        const from = String(fd.get("from") ?? "").trim();
        const to = String(fd.get("to") ?? "").trim();
        if (from) spec.from = from;
        if (to) spec.to = to;
      } else {
        const range = resolveRange({ metric, range_preset: preset });
        if (range.from) spec.from = range.from;
        if (range.to) spec.to = range.to;
      }
    } else {
      spec.range_preset = "none";
    }

    const pick = (name: string): string | undefined => {
      const v = String(fd.get(name) ?? "").trim();
      return v.length > 0 ? v : undefined;
    };
    if (metricUsesProduct(metric)) spec.product = pick("product");
    if (metricUsesFunder(metric)) spec.funder = pick("funder");
    if (metricUsesBroker(metric)) spec.broker_id = pick("broker_id");
    if (metricUsesInteractionType(metric)) spec.interaction_type = pick("interaction_type");
    if (metricUsesTargetStage(metric)) spec.target_stage = pick("target_stage");
    if (metricUsesGroupBy(metric)) spec.group_by = pick("group_by");

    // Drop the keys that came back undefined so the stored spec stays tidy.
    for (const key of Object.keys(spec)) {
      if (spec[key] === undefined) delete spec[key];
    }
    return spec;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const name = String(fd.get("name") ?? "");
    const spec = buildSpec(fd);
    setError(null);
    startTransition(async () => {
      const res = report
        ? await updateReportAction(report.id, { name, spec })
        : await createReportAction({ name, spec });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const groupOpts = groupByOptions(metric);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
      title={report ? "Edit Report" : "New Report"}
      trigger={trigger}
      action={
        <Button type="submit" form={formId} disabled={pending} className="font-semibold">
          Save
        </Button>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <FieldGroup footer={METRIC_HELP[metric]}>
          <TextField
            label="Name"
            name="name"
            required
            maxLength={120}
            defaultValue={report?.name ?? ""}
            placeholder="Deals submitted — last 90 days"
            autoFocus={!report}
          />
          <SelectField
            label="Metric"
            name="metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as ReportMetric)}
          >
            {REPORT_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </SelectField>
        </FieldGroup>

        {/* Keyed by metric so the option fields reset to metric-appropriate
            defaults whenever the metric changes. */}
        <div key={metric}>
          {metricUsesRange(metric) ? (
            <FieldGroup>
              <SelectField
                label="Range"
                name="range_preset_display"
                value={preset}
                onChange={(e) => setPreset(e.target.value as RangePreset)}
              >
                {RANGE_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {RANGE_PRESET_LABELS[p]}
                  </option>
                ))}
              </SelectField>
              {preset === "custom" ? (
                <>
                  <DateField label="From" name="from" defaultValue={initial?.from ?? ""} />
                  <DateField label="To" name="to" defaultValue={initial?.to ?? ""} />
                </>
              ) : null}
            </FieldGroup>
          ) : null}

          {metricUsesTargetStage(metric) ? (
            <FieldGroup footer="Counts distinct deals that entered this stage during the range — e.g. scenarios that reached Term Sheet.">
              <SelectField label="Target stage" name="target_stage" defaultValue={initial?.target_stage ?? "term_sheet"}>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PIPELINE_STAGE_LABELS[s]}
                  </option>
                ))}
              </SelectField>
            </FieldGroup>
          ) : null}

          {metricUsesProduct(metric) ||
          metricUsesFunder(metric) ||
          metricUsesBroker(metric) ||
          metricUsesInteractionType(metric) ||
          metricUsesGroupBy(metric) ? (
            <FieldGroup header="Filters">
              {metricUsesGroupBy(metric) ? (
                <SelectField label="Group by" name="group_by" defaultValue={initial?.group_by ?? defaultGroupBy(metric)}>
                  {groupOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {metricUsesInteractionType(metric) ? (
                <SelectField label="Type" name="interaction_type" defaultValue={initial?.interaction_type ?? ""}>
                  <option value="">Any type</option>
                  {INTERACTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INTERACTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {metricUsesProduct(metric) ? (
                <SelectField label="Product" name="product" defaultValue={initial?.product ?? ""}>
                  <option value="">Any product</option>
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>
                      {PRODUCT_LABELS[p]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {metricUsesFunder(metric) ? (
                <SelectField label="Funder" name="funder" defaultValue={initial?.funder ?? ""}>
                  <option value="">Any funder</option>
                  {FUNDERS.map((f) => (
                    <option key={f} value={f}>
                      {FUNDER_LABELS[f]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {metricUsesBroker(metric) ? (
                <SelectField label="Broker" name="broker_id" defaultValue={initial?.broker_id ?? ""}>
                  <option value="">Any broker</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.full_name}
                    </option>
                  ))}
                </SelectField>
              ) : null}
            </FieldGroup>
          ) : null}
        </div>

        {error ? <p className="text-footnote px-4 text-red">{error}</p> : null}
      </form>
    </Sheet>
  );
}
