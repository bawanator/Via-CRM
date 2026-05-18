'use client'

import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { DEAL_STAGES, type Deal, type DealStage } from '@/lib/supabase/types'

interface StageMetric {
  stage: DealStage
  label: string
  color: string
  count: number
  value: number
  conversion: number
}

export default function PipelineReportPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('deals').select('*').then(({ data }) => {
      setDeals((data as Deal[]) || [])
      setLoading(false)
    })
  }, [])

  const activeStages = DEAL_STAGES.filter((s) => s.value !== 'lost')
  const openDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage))
  const wonDeals = deals.filter((d) => d.stage === 'won')
  const lostDeals = deals.filter((d) => d.stage === 'lost')
  const totalOpen = openDeals.reduce((s, d) => s + (d.value || 0), 0)
  const totalWon = wonDeals.reduce((s, d) => s + (d.value || 0), 0)
  const winRate = deals.length ? Math.round((wonDeals.length / Math.max(wonDeals.length + lostDeals.length, 1)) * 100) : 0

  const metrics: StageMetric[] = DEAL_STAGES.filter((s) => !['won', 'lost'].includes(s.value)).map((s) => {
    const stageDeals = deals.filter((d) => d.stage === s.value)
    const total = deals.filter((d) => d.stage !== 'lost').length
    return {
      stage: s.value,
      label: s.label,
      color: s.color,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
      conversion: total ? Math.round((stageDeals.length / total) * 100) : 0,
    }
  })

  const maxCount = Math.max(...metrics.map((m) => m.count), 1)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Pipeline" subtitle="Deal funnel and stage breakdown" />
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-[#7C3AED] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-4xl space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Open pipeline', value: formatCurrency(totalOpen) },
                { label: 'Won', value: formatCurrency(totalWon) },
                { label: 'Open deals', value: openDeals.length.toString() },
                { label: 'Win rate', value: `${winRate}%` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9CA3AF]">{label}</p>
                  <p className="mt-1.5 text-[24px] font-semibold text-[#111111] tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {/* Funnel */}
            <div className="rounded-xl border border-[#E8E8E8] bg-white p-6">
              <h2 className="mb-5 text-[13px] font-semibold text-[#111111]">Funnel by stage</h2>
              <div className="space-y-3">
                {metrics.map((m) => (
                  <div key={m.stage} className="flex items-center gap-4">
                    <div className="w-24 shrink-0 text-right text-[12px] font-medium text-[#6B7280]">{m.label}</div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-7 rounded-md bg-[#F5F5F5] overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-500"
                          style={{
                            width: `${(m.count / maxCount) * 100}%`,
                            backgroundColor: m.color,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <div className="w-24 shrink-0 flex items-center gap-2 text-[12px]">
                        <span className="font-semibold text-[#111111] tabular-nums">{m.count}</span>
                        {m.value > 0 && (
                          <span className="text-[#9CA3AF]">{formatCurrency(m.value)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage table */}
            <div className="rounded-xl border border-[#E8E8E8] bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#F0F0F0]">
                    {['Stage', 'Deals', 'Total value', 'Avg value', '% of open'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.stage} className="border-b border-[#F5F5F5] hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
                          <span className="text-[13px] font-medium text-[#111111]">{m.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums">{m.count}</td>
                      <td className="px-4 py-3 text-[13px] tabular-nums">{m.value ? formatCurrency(m.value) : '—'}</td>
                      <td className="px-4 py-3 text-[13px] tabular-nums">
                        {m.count ? formatCurrency(m.value / m.count) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-[#6B7280]">{m.conversion}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
