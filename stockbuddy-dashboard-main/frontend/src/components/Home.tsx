import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpRight, CalendarClock, ShieldCheck, Sparkles, Ticket, TrendingUp } from 'lucide-react'
import DashboardLayout from './DashboardLayout'
import SummaryHighlights from './home/SummaryHighlights'
import PinnedFixturesSection from './home/PinnedFixturesSection'
import { ticketSeed, focusGradientClasses } from './home/data'
import type { SummaryHighlight, TicketRow } from './home/types'
import { useSession } from '../context/SessionContext'
import { useNavigate } from 'react-router-dom'
import { useEvents } from '../context/EventsContext'
import { useCurrency } from '../context/CurrencyContext'

const Home = () => {
  const navigate = useNavigate()
  const { user } = useSession()
  const { formatCurrency } = useCurrency()
  const [ticketRows] = useState<TicketRow[]>(ticketSeed)
  const {
    pinnedEvents,
    loading: pinnedLoading,
    error: pinnedError,
    unpinFixture,
    refreshPinned
  } = useEvents()
  const [pendingFixtureIds, setPendingFixtureIds] = useState<string[]>([])
  const [pinnedFeedback, setPinnedFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const firstName = (() => {
    if (!user) return 'operator'
    const raw = (user.full_name ?? user.username ?? '').trim()
    if (!raw.length) {
      return user.email.split('@')[0]
    }
    return raw.split(/\s+/)[0]
  })()

  const totals = useMemo(() => {
    const allocation = ticketRows.reduce((sum, item) => sum + item.allocation, 0)
    const sold = ticketRows.reduce((sum, item) => sum + item.sold, 0)
    const hold = ticketRows.reduce((sum, item) => sum + item.hold, 0)
    const remaining = ticketRows.reduce(
      (sum, item) => sum + Math.max(0, item.allocation - item.sold - item.hold),
      0
    )

    const sellThrough = allocation === 0 ? 0 : Math.round((sold / allocation) * 100)
    const averagePrice =
      ticketRows.length === 0
        ? 0
        : Math.round(ticketRows.reduce((sum, item) => sum + item.price, 0) / ticketRows.length)
    const eventsNeedingAction = ticketRows.filter(row => row.status === 'Monitor' || row.status === 'Low Supply').length
    const soldOutEvents = ticketRows.filter(row => row.status === 'Sold Out').length

    return {
      allocation,
      sold,
      hold,
      remaining,
      sellThrough,
      averagePrice,
      eventsNeedingAction,
      soldOutEvents
    }
  }, [ticketRows])

  const highlights: SummaryHighlight[] = useMemo(
    () => [
      {
        title: 'Tickets available',
        value: totals.remaining.toLocaleString(),
        change: `${totals.sellThrough}% sold through`,
        helper: 'Across active fixtures',
        icon: Ticket,
        accent: 'bg-[#eef2ff] text-[#1d4ed8]'
      },
      {
        title: 'Tickets sold',
        value: totals.sold.toLocaleString(),
        change: totals.soldOutEvents === 0 ? 'No sell outs yet' : `${totals.soldOutEvents} sold out`,
        helper: 'Current reporting window',
        icon: TrendingUp,
        accent: 'bg-emerald-50 text-emerald-600'
      },
      {
        title: 'Events to watch',
        value: totals.eventsNeedingAction.toString(),
        change: `${totals.hold.toLocaleString()} seats on hold`,
        helper: 'Monitor allocations',
        icon: CalendarClock,
        accent: 'bg-amber-50 text-amber-600'
      },
      {
        title: 'Avg ticket price',
        value: formatCurrency(totals.averagePrice || 0, { maximumFractionDigits: 0 }),
        change: `Across ${ticketRows.length} events`,
        helper: 'Blended price',
        icon: ShieldCheck,
        accent: 'bg-slate-100 text-slate-600'
      }
    ],
    [formatCurrency, ticketRows.length, totals.averagePrice, totals.eventsNeedingAction, totals.hold, totals.remaining, totals.sellThrough, totals.sold, totals.soldOutEvents]
  )

  const header = (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white/80 px-4 py-1.5 text-xs font-semibold text-[#1d4ed8] shadow-sm">
        <Ticket className="h-4 w-4" />
        2,020 tickets remaining
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8aa0ff]">Hello, {firstName}</p>
        <h1 className="mt-2 text-4xl font-semibold text-slate-900">Your sales pulse is ready.</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-500">
          Track allocations, detect demand spikes, and keep every hospitality release aligned ahead of match day.
          Pin key fixtures, collaborate in Excel mode, and brief your operators in moments.
        </p>
      </div>
      {pinnedFeedback && (
        <div
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold ${
            pinnedFeedback.type === 'success'
              ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border border-rose-200 bg-rose-50 text-rose-600'
          }`}
        >
          {pinnedFeedback.type === 'success' ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {pinnedFeedback.text}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100/70 px-3 py-1 text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Compliance ready - 0 breaches
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-indigo-600">
          <CalendarClock className="h-3.5 w-3.5" />
          2 fixtures needing attention
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5" />
          Hospitality launch in 3 days
        </span>
      </div>
    </div>
  )


  const handleUnpin = useCallback(
    async (fixtureId: string) => {
      let skip = false
      setPendingFixtureIds(previous => {
        if (previous.includes(fixtureId)) {
          skip = true
          return previous
        }
        return [...previous, fixtureId]
      })
      if (skip) return
      const result = await unpinFixture(fixtureId)
      setPendingFixtureIds(previous => previous.filter(id => id !== fixtureId))
      if (!result.ok) {
        setPinnedFeedback({ type: 'error', text: result.error })
        return
      }
      setPinnedFeedback({ type: 'success', text: 'Event removed from My Events.' })
    },
    [unpinFixture]
  )

  useEffect(() => {
    if (!pinnedFeedback) return
    const timer = window.setTimeout(() => setPinnedFeedback(null), 4000)
    return () => window.clearTimeout(timer)
  }, [pinnedFeedback])

  return (
    <DashboardLayout
      header={header}
      headerActions={
        <button
          type="button"
          onClick={() => navigate('/members')}
          className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl whitespace-nowrap"
        >
          Invite teammate
          <ArrowUpRight className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-10">
        <SummaryHighlights highlights={highlights} />

        <section className="rounded-[30px] border border-white/80 bg-white/80 p-6 shadow-[0_32px_70px_rgba(79,70,229,0.08)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Inventory workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-slate-900">Log tickets against real fixtures.</h3>
              <p className="mt-1 text-sm text-slate-500">
                Switch to the Inventory tab to search matches, upload blocks, and keep pricing transparent for the squad.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl"
            >
              Go to Inventory
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Tracked fixtures" value={ticketRows.length.toString()} helper="Sample data view" />
            <StatCard label="Seats remaining" value={totals.remaining.toLocaleString()} helper="Across mock fixtures" />
            <StatCard label="Need attention" value={totals.eventsNeedingAction.toString()} helper="Monitor sell-through" />
          </div>
        </section>

        <section className="rounded-[30px] border border-white/70 bg-white p-6 shadow-[0_32px_70px_rgba(79,70,229,0.08)] lg:grid lg:grid-cols-[1.2fr_0.8fr] lg:gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm font-semibold text-[#1d4ed8]">
              <TrendingUp className="h-5 w-5" />
              Sell-through momentum
            </div>
            <h3 className="text-2xl font-semibold text-slate-900">Your window is trending up.</h3>
            <p className="text-sm text-slate-500">
              Hospitality conversions accelerated after the latest partner drop. Keep watch on Old Trafford corporate
              boxes and holdback allocations.
            </p>

            <div className="grid gap-3 text-sm font-semibold text-slate-500 md:grid-cols-3">
              <StatCard
                label="Sell through"
                value={`${totals.sellThrough}%`}
                helper="Across current reporting window"
              />
              <StatCard
                label="Allocation"
                value={totals.allocation.toLocaleString()}
                helper="Tickets staged this week"
              />
              <StatCard
                label="On hold"
                value={totals.hold.toLocaleString()}
                helper="Awaiting reconciliation"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-[24px] border border-white/70 bg-white px-6 py-6 shadow-[0_24px_60px_rgba(15,23,42,0.1)] lg:mt-0">
            <h4 className="text-lg font-semibold text-slate-900">Playbook queue</h4>
            <p className="text-sm text-slate-500">
              Keep the squad aligned. These are the high priority moves for the next trading window.
            </p>
            {playbookTasks.map(task => (
              <div key={task.title} className={`rounded-2xl ${task.tone} p-4`}>
                <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                <p className="mt-1 text-xs text-slate-500">{task.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <PinnedFixturesSection
          events={pinnedEvents}
          gradientClasses={focusGradientClasses}
          isLoading={pinnedLoading}
          error={pinnedError}
          onRetry={refreshPinned}
          onNavigateToEvents={() => navigate('/events')}
          onUnpin={handleUnpin}
          pendingIds={pendingFixtureIds}
        />
      </div>
    </DashboardLayout>
  )
}

const StatCard = ({ label, value, helper }: { label: string; value: string; helper: string }) => (
  <div className="rounded-2xl bg-slate-50 p-4">
    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-400">{helper}</p>
  </div>
)

const playbookTasks = [
  {
    title: 'Approve new reseller allocation',
    detail: 'Ensure 260 seats are released before Friday 12:00 GMT.',
    tone: 'bg-indigo-50 border border-indigo-100'
  },
  {
    title: 'Audit VIP hospitality pricing',
    detail: 'Align hospitality pricing with club directive for Q4 fixtures.',
    tone: 'bg-slate-50 border border-slate-100'
  },
  {
    title: 'Brief local operators',
    detail: 'Send playbook update across Manchester & London teams.',
    tone: 'bg-emerald-50 border border-emerald-100'
  }
]

export default Home
