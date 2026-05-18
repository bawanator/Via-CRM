'use client'

import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import type { Deal, DealStage } from '@/lib/supabase/types'
import { DEAL_STAGES } from '@/lib/supabase/types'

interface KanbanBoardProps {
  deals: Deal[]
  onStageChange: (dealId: string, newStage: DealStage) => Promise<void>
  onAdd: (stage: DealStage) => void
}

export function KanbanBoard({ deals, onStageChange, onAdd }: KanbanBoardProps) {
  const router = useRouter()

  const byStage = (stage: DealStage) => deals.filter((d) => d.stage === stage)

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newStage = destination.droppableId as DealStage
    const deal = deals.find((d) => d.id === draggableId)
    if (deal && deal.stage !== newStage) {
      onStageChange(draggableId, newStage)
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto px-4 py-4">
        {DEAL_STAGES.map(({ value: stage, label, color }) => {
          const stageDeals = byStage(stage)
          const totalValue = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)

          return (
            <div key={stage} className="flex w-64 shrink-0 flex-col rounded-xl border border-[#E8E8E8] bg-[#F9F9F9]">
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[12px] font-semibold text-[#111111]">{label}</span>
                  <span className="rounded bg-[#EBEBEB] px-1.5 py-0.5 text-[10px] font-medium text-[#6B7280]">
                    {stageDeals.length}
                  </span>
                </div>
                <button
                  onClick={() => onAdd(stage)}
                  className="rounded p-0.5 text-[#9CA3AF] hover:bg-[#E8E8E8] hover:text-[#111111] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {totalValue > 0 && (
                <div className="px-3 pb-2">
                  <span className="text-[11px] text-[#9CA3AF]">{formatCurrency(totalValue)}</span>
                </div>
              )}

              {/* Cards */}
              <Droppable droppableId={stage}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[120px] transition-colors',
                      snapshot.isDraggingOver && 'bg-[#EDE9FE]/30'
                    )}
                  >
                    {stageDeals.map((deal, index) => (
                      <Draggable key={deal.id} draggableId={deal.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => router.push(`/deals/${deal.id}`)}
                            className={cn(
                              'rounded-lg border border-[#E8E8E8] bg-white p-3 cursor-pointer',
                              'hover:border-[#D1D5DB] hover:shadow-sm transition-all duration-100',
                              snapshot.isDragging && 'shadow-lg border-[#7C3AED]/30 rotate-1'
                            )}
                          >
                            <p className="text-[13px] font-medium text-[#111111] leading-snug">{deal.name}</p>
                            {deal.value && (
                              <p className="mt-1 text-[12px] font-semibold text-[#7C3AED]">
                                {formatCurrency(deal.value, deal.currency)}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              {deal.company && (
                                <span className="text-[11px] text-[#9CA3AF] truncate">{deal.company.name}</span>
                              )}
                              {deal.close_date && (
                                <span className="shrink-0 text-[10px] text-[#9CA3AF]">
                                  {new Date(deal.close_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                            {deal.owner && (
                              <div className="mt-2 flex justify-end">
                                <Avatar name={deal.owner.full_name} size="xs" />
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
