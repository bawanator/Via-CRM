"use client";

import { useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { loseDealAction, moveDealStageAction, reopenDealAction } from "@/app/(app)/deals/actions";
import {
  LOSS_REASON_LABELS,
  LOSS_REASONS,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  PRODUCT_LABELS,
} from "@/lib/domain";
import { formatAmount } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import type { DealWithBroker } from "@/lib/crm/deals";
import type { DealLossReason, DealPipelineStage } from "@/lib/database.types";

const LOST_COLUMN = "lost";
type ColumnId = DealPipelineStage | typeof LOST_COLUMN;

// A stable fingerprint of the server's board state; when it changes (after a
// revalidate) we snap local optimistic state back to the server truth.
function signature(deals: DealWithBroker[]): string {
  return deals.map((d) => `${d.id}:${d.status}:${d.pipeline_stage}:${d.loss_reason ?? ""}`).join("|");
}

function columnOf(deal: DealWithBroker): ColumnId {
  return deal.status === "lost" ? LOST_COLUMN : deal.pipeline_stage;
}

function isPipelineStage(id: string): id is DealPipelineStage {
  return (PIPELINE_STAGES as string[]).includes(id);
}

// Funder is deliberately absent — it never appears on the board.
function CardBody({ deal }: { deal: DealWithBroker }) {
  const amountLine = [
    deal.loan_amount != null ? formatAmount(deal.loan_amount) : null,
    deal.product ? PRODUCT_LABELS[deal.product] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <p className="text-headline text-label">{deal.name}</p>
      {deal.broker ? <p className="text-footnote mt-0.5 text-label-2">{deal.broker.full_name}</p> : null}
      {amountLine ? <p className="text-footnote text-label-2">{amountLine}</p> : null}
      {deal.status === "lost" && deal.loss_reason ? (
        <div className="mt-1.5">
          <Badge tone="gray">{LOSS_REASON_LABELS[deal.loss_reason]}</Badge>
        </div>
      ) : null}
    </>
  );
}

function DealCard({
  deal,
  didDragRef,
}: {
  deal: DealWithBroker;
  didDragRef: MutableRefObject<boolean>;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });

  function open() {
    router.push(`/deals/${deal.id}`);
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="link"
      tabIndex={0}
      aria-label={`Open ${deal.name}`}
      // A drag ends just before the browser fires the click; this flag (reset on
      // every pointerdown) lets the click through only when no drag happened.
      onPointerDownCapture={() => {
        didDragRef.current = false;
      }}
      onClick={() => {
        if (didDragRef.current) return;
        open();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`block cursor-grab rounded-xl bg-card p-3 text-left focus-visible:outline-2 focus-visible:outline-blue active:cursor-grabbing ${
        isDragging ? "opacity-40" : "pressable"
      }`}
    >
      <CardBody deal={deal} />
    </div>
  );
}

function Column({
  id,
  title,
  count,
  children,
}: {
  id: ColumnId;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      aria-label={title}
      className="w-[80vw] max-w-72 shrink-0 snap-center md:w-auto md:min-w-0 md:max-w-none md:flex-1"
    >
      <header className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-footnote uppercase tracking-wide text-label-2">{title}</h2>
        <span className="text-footnote text-label-3">{count}</span>
      </header>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-col gap-2 rounded-xl p-1 transition-colors ${
          isOver ? "bg-fill-2" : ""
        }`}
      >
        {children}
        {count === 0 ? (
          <p className="text-footnote rounded-xl px-3 py-3 text-center text-label-3">Drop here</p>
        ) : null}
      </div>
    </section>
  );
}

export function DealBoard({ deals: initialDeals }: { deals: DealWithBroker[] }) {
  const [deals, setDeals] = useState<DealWithBroker[]>(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [losing, setLosing] = useState<DealWithBroker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const didDragRef = useRef(false);

  // Reconcile to the server's truth whenever it actually changes — the
  // store-previous-value pattern (adjust state during render, no effect), so
  // optimistic local edits aren't clobbered every render but a real server
  // change (new signature) resets the board.
  const sig = useMemo(() => signature(initialDeals), [initialDeals]);
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setDeals(initialDeals);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  function patch(dealId: string, changes: Partial<DealWithBroker>) {
    setDeals((cur) => cur.map((d) => (d.id === dealId ? { ...d, ...changes } : d)));
  }

  async function moveToStage(deal: DealWithBroker, target: DealPipelineStage) {
    const snapshot = deals;
    const wasLost = deal.status === "lost";
    patch(
      deal.id,
      wasLost
        ? { status: "live", loss_reason: null, pipeline_stage: target }
        : { pipeline_stage: target },
    );
    setError(null);
    const res = wasLost
      ? await reopenDealAction(deal.id, target)
      : await moveDealStageAction(deal.id, target);
    if (!res.ok) {
      setDeals(snapshot);
      setError(res.error);
    }
  }

  async function markLost(deal: DealWithBroker, reason: DealLossReason) {
    const snapshot = deals;
    setLosing(null);
    patch(deal.id, { status: "lost", loss_reason: reason });
    setError(null);
    const res = await loseDealAction(deal.id, { loss_reason: reason });
    if (!res.ok) {
      setDeals(snapshot);
      setError(res.error);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    didDragRef.current = true;
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const deal = deals.find((d) => d.id === String(active.id));
    if (!deal) return;
    const target = String(over.id) as ColumnId;
    if (target === columnOf(deal)) return; // dropped back where it started

    if (target === LOST_COLUMN) {
      // A loss always needs a reason — prompt first, only then move.
      setLosing(deal);
      return;
    }
    if (isPipelineStage(target)) {
      void moveToStage(deal, target);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {error ? (
        <p className="text-footnote mb-2 rounded-lg bg-red/10 px-3 py-2 text-red">{error}</p>
      ) : null}

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:overflow-visible md:px-0">
        {PIPELINE_STAGES.map((stage) => {
          const column = deals.filter((d) => d.status === "live" && d.pipeline_stage === stage);
          return (
            <Column key={stage} id={stage} title={PIPELINE_STAGE_LABELS[stage]} count={column.length}>
              {column.map((deal) => (
                <DealCard key={deal.id} deal={deal} didDragRef={didDragRef} />
              ))}
            </Column>
          );
        })}
        {(() => {
          const lost = deals.filter((d) => d.status === "lost");
          return (
            <Column id={LOST_COLUMN} title="Closed / Lost" count={lost.length}>
              {lost.map((deal) => (
                <DealCard key={deal.id} deal={deal} didDragRef={didDragRef} />
              ))}
            </Column>
          );
        })()}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <div className="rounded-xl bg-card p-3 shadow-lg ring-1 ring-separator">
            <CardBody deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>

      <Sheet
        open={losing !== null}
        onOpenChange={(next) => {
          if (!next) setLosing(null);
        }}
        title="Closed / Lost"
      >
        <p className="text-footnote mb-3 px-1 text-label-2">Why did this deal close? Pick a reason.</p>
        <div className="card hairline-rows overflow-hidden rounded-xl bg-card">
          {LOSS_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => losing && void markLost(losing, reason)}
              className="text-body pressable flex min-h-11 w-full items-center px-4 py-2.5 text-left text-label"
            >
              {LOSS_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
      </Sheet>
    </DndContext>
  );
}
