import { ClipboardList, PenSquare } from 'lucide-react'
import type { TicketRow, TicketStatus, TicketViewMode } from './types'

type TicketInventorySectionProps = {
  viewMode: TicketViewMode
  onViewModeChange: (mode: TicketViewMode) => void
  ticketRows: TicketRow[]
  onTicketChange: (rowId: string, field: keyof TicketRow, value: string) => void
  seatsRemaining: number
  fixturesNeedingAction: number
  currencyFormatter: Intl.NumberFormat
  statusTone: Record<TicketStatus, string>
}

const TicketInventorySection = ({
  viewMode,
  onViewModeChange,
  ticketRows,
  onTicketChange,
  seatsRemaining,
  fixturesNeedingAction,
  currencyFormatter,
  statusTone
}: TicketInventorySectionProps) => {
  return (
    <section className="rounded-[30px] border border-white/80 bg-white/80 shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 border-b border-white/70 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Ticket inventory</h2>
          <p className="text-sm text-slate-500">
            Keep allocations, sell-through, and pricing aligned. Use Excel mode for rapid adjustments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewModeChange('overview')}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'overview'
                ? 'border-[#cbd6ff] bg-[#eef2ff] text-[#1d4ed8] shadow-sm'
                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Table view
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('excel')}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              viewMode === 'excel'
                ? 'border-[#cbd6ff] bg-[#eef2ff] text-[#1d4ed8] shadow-sm'
                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <PenSquare className="h-4 w-4" />
            Excel view
          </button>
        </div>
      </div>

      <div className="border-b border-white/70 bg-slate-50 px-6 py-4 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{seatsRemaining.toLocaleString()}</span> seats remaining ·{' '}
        <span className="font-semibold text-slate-900">{fixturesNeedingAction}</span> fixtures to watch
      </div>

      <div className="overflow-x-auto">
        {viewMode === 'overview' ? (
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.3em] text-slate-500">
              <tr>
                <th className="px-6 py-4">Fixture</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Time</th>
                <th className="px-6 py-4">Venue</th>
                <th className="px-6 py-4">Allocation</th>
                <th className="px-6 py-4">Sold</th>
                <th className="px-6 py-4">Holdbacks</th>
                <th className="px-6 py-4">Remaining</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
              {ticketRows.map(row => {
                const remaining = Math.max(0, row.allocation - row.sold - row.hold)
                return (
                  <tr key={row.id} className="transition hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-slate-900">
                      <div>
                        {row.fixture}
                        <span className="block text-xs font-normal text-slate-400">{row.id}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{row.date}</td>
                    <td className="whitespace-nowrap px-6 py-4">{row.time}</td>
                    <td className="whitespace-nowrap px-6 py-4">{row.venue}</td>
                    <td className="whitespace-nowrap px-6 py-4">{row.allocation.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-6 py-4">{row.sold.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-6 py-4">{row.hold.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-[#1d4ed8]">
                      {remaining.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">{currencyFormatter.format(row.price)}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.3em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Fixture</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Venue</th>
                <th className="px-4 py-3">Allocation</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Hold</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-700">
              {ticketRows.map(row => (
                <tr key={row.id}>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.fixture}
                      onChange={event => onTicketChange(row.id, 'fixture', event.target.value)}
                    />
                    <p className="mt-1 text-xs font-medium text-slate-400">{row.id}</p>
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.date}
                      onChange={event => onTicketChange(row.id, 'date', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.time}
                      onChange={event => onTicketChange(row.id, 'time', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="text"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.venue}
                      onChange={event => onTicketChange(row.id, 'venue', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.allocation}
                      onChange={event => onTicketChange(row.id, 'allocation', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.sold}
                      onChange={event => onTicketChange(row.id, 'sold', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.hold}
                      onChange={event => onTicketChange(row.id, 'hold', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.price}
                      onChange={event => onTicketChange(row.id, 'price', event.target.value)}
                    />
                  </td>
                  <td className="border-b border-slate-200 px-4 py-3">
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#2563eb]/15"
                      value={row.status}
                      onChange={event => onTicketChange(row.id, 'status', event.target.value)}
                    >
                      <option value="On Track">On Track</option>
                      <option value="Monitor">Monitor</option>
                      <option value="Low Supply">Low Supply</option>
                      <option value="Sold Out">Sold Out</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default TicketInventorySection
