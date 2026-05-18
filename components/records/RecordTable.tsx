'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown, MoreHorizontal, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface Column<T> {
  key: string
  label: string
  width?: string
  render: (row: T) => React.ReactNode
  sortable?: boolean
}

interface RecordTableProps<T extends { id: string }> {
  data: T[]
  columns: Column<T>[]
  href: (row: T) => string
  onAdd?: () => void
  addLabel?: string
  emptyState?: React.ReactNode
  loading?: boolean
}

type SortDir = 'asc' | 'desc' | null

export function RecordTable<T extends { id: string }>({
  data,
  columns,
  href,
  onAdd,
  addLabel = 'Add',
  emptyState,
  loading,
}: RecordTableProps<T>) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc')
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-[#E8E8E8] bg-white px-4 py-2">
        <span className="text-[12px] text-[#9CA3AF]">
          {loading ? 'Loading…' : `${data.length} record${data.length !== 1 ? 's' : ''}`}
        </span>
        {onAdd && (
          <Button variant="primary" size="xs" onClick={onAdd}>
            <Plus className="h-3 w-3" />
            {addLabel}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#E8E8E8]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF] select-none whitespace-nowrap',
                    col.sortable && 'cursor-pointer hover:text-[#6B7280]'
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="text-[#D1D5DB]">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="h-3 w-3 text-[#7C3AED]" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-[#7C3AED]" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[#F0F0F0]">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-3 rounded bg-[#F0F0F0] animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                    </td>
                  ))}
                  <td />
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-20 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-[13px] text-[#9CA3AF]">No records yet</p>
                      {onAdd && (
                        <Button variant="secondary" size="sm" onClick={onAdd}>
                          <Plus className="h-3.5 w-3.5" />
                          {addLabel}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className="record-row group border-b border-[#F5F5F5] cursor-pointer"
                  onClick={() => router.push(href(row))}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 text-[13px] text-[#111111]">
                      {col.render(row)}
                    </td>
                  ))}
                  <td className="pr-3">
                    <div className="row-actions flex justify-end">
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="rounded p-1 text-[#9CA3AF] hover:bg-[#EBEBEB] hover:text-[#111111] transition-colors"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
