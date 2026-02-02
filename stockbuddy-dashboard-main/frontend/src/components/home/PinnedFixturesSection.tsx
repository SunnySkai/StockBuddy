import { Loader2, MapPin, Pin, Sparkles, Ticket } from 'lucide-react'
import type { PinnedEvent } from '../../types/events'

type PinnedFixturesSectionProps = {
  events: PinnedEvent[]
  gradientClasses: string[]
  isLoading: boolean
  error: string | null
  onRetry: () => void
  onNavigateToEvents: () => void
  onUnpin: (fixtureId: string) => Promise<void>
  pendingIds: string[]
}

const PinnedFixturesSection = ({
  events,
  gradientClasses,
  isLoading,
  error,
  onRetry,
  onNavigateToEvents,
  onUnpin,
  pendingIds
}: PinnedFixturesSectionProps) => {
  const highlighted = events.slice(0, 3)

  return (
    <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_32px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-2 border-b border-white/70 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">My events</h2>
          <p className="text-sm text-slate-500">
            Pinned fixtures stay front and centre for operators. Manage them here or explore new events.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToEvents}
          className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-[#1d4ed8] hover:border-[#1d4ed8]"
        >
          <Sparkles className="h-4 w-4" />
          Add from catalog
        </button>
      </div>

      <div className="space-y-6 pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 rounded-[24px] border border-white/70 bg-white/60 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-[#1d4ed8]" />
            Loading pinned events...
          </div>
        ) : error ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm text-rose-600">
            <p className="text-base font-semibold text-rose-700">Something went wrong</p>
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 hover:border-rose-400"
            >
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#cbd6ff] bg-[#eef2ff] px-6 py-10 text-center text-sm text-slate-500">
            <p className="text-base font-semibold text-slate-700">No fixtures pinned yet</p>
            <p className="mt-2">Use the catalog to pin fixtures you want to monitor closely.</p>
            <button
              type="button"
              onClick={onNavigateToEvents}
              className="cursor-pointer mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white shadow-md hover:shadow-lg"
            >
              <Ticket className="h-4 w-4" />
              Browse events
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {highlighted.map((event, index) => {
                const gradient = gradientClasses[index % gradientClasses.length]
                return (
                  <div
                    key={event.fixture_id}
                    className={`rounded-[24px] border border-white/70 bg-gradient-to-br ${gradient} px-6 py-6 shadow-inner`}
                  >
                    <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-5">
                        <TeamBadge
                          name={event.home_team ?? 'Home'}
                          role="Home"
                          logo={event.home_logo ?? event.homeLogo ?? event.home_team_logo ?? null}
                        />
                        <span className="rounded-full border border-[#cbd6ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.36em] text-[#1d4ed8]">
                          vs
                        </span>
                        <TeamBadge
                          name={event.away_team ?? 'Away'}
                          role="Away"
                          logo={event.away_logo ?? event.awayLogo ?? event.away_team_logo ?? null}
                        />
                      </div>
                      <div className="space-y-2 text-sm text-slate-600 md:text-right">
                        <p className="text-lg font-semibold text-slate-900">{formatDate(event.event_date)}</p>
                        <p>{formatTime(event.event_date)}</p>
                        <p className="inline-flex items-center gap-2 text-slate-600 md:justify-end">
                          <MapPin className="h-4 w-4 text-[#1d4ed8]" />
                          {event.venue_name ?? 'Venue TBC'}
                        </p>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#1d4ed8]">
                          {event.league_name ?? 'Competition'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/70">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Fixture</th>
                    <th className="px-4 py-3">Competition</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Venue</th>
                    <th className="px-4 py-3 text-right">Pinned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {events.map(event => {
                    const pending = pendingIds.includes(event.fixture_id)
                    return (
                      <tr key={event.fixture_id} className="transition hover:bg-indigo-50/40">
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-semibold text-slate-900">{event.title}</span>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <InlineTeamBadge
                                name={event.home_team ?? 'Home'}
                                logo={event.home_logo ?? event.homeLogo ?? event.home_team_logo ?? null}
                              />
                              <span className="text-[10px] uppercase tracking-[0.3em] text-[#1d4ed8]">vs</span>
                              <InlineTeamBadge
                                name={event.away_team ?? 'Away'}
                                logo={event.away_logo ?? event.awayLogo ?? event.away_team_logo ?? null}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{event.league_name ?? 'TBC'}</td>
                        <td className="px-4 py-4 text-slate-600">
                          <div className="flex flex-col">
                            <span>{formatDate(event.event_date)}</span>
                            <span className="text-xs text-slate-400">{formatTime(event.event_date)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{event.venue_name ?? 'Venue TBC'}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => onUnpin(event.fixture_id)}
                            disabled={pending}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              pending
                                ? 'border-[#cbd6ff] bg-[#eef2ff] text-[#1d4ed8] opacity-60'
                                : 'border-[#cbd6ff] bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow-sm hover:shadow-md'
                            }`}
                          >
                            {pending ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Removing...
                              </>
                            ) : (
                              <>
                                <Pin className="h-4 w-4" />
                                Remove
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

const formatDate = (isoDate: string | null) => {
  if (!isoDate) return 'Date TBC'
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return 'Date TBC'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(timestamp))
}

const formatTime = (isoDate: string | null) => {
  if (!isoDate) return 'Time TBC'
  const timestamp = Date.parse(isoDate)
  if (Number.isNaN(timestamp)) return 'Time TBC'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(timestamp))
}

const TeamBadge = ({ name, role, logo }: { name: string; role: string; logo?: string | null }) => {
  const symbol = name.trim().charAt(0).toUpperCase() || 'T'
  return (
    <div className="flex items-center gap-3 rounded-[20px] border border-white/70 bg-white px-4 py-3 shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-[#eef2ff] text-lg font-semibold text-[#1d4ed8]">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="h-full w-full object-contain p-1"
            onError={event => {
              event.currentTarget.style.display = 'none'
              const fallback = event.currentTarget.parentElement?.querySelector('.team-badge-fallback')
              if (fallback) {
                fallback.classList.remove('hidden')
              }
            }}
          />
        ) : null}
        <span className={`team-badge-fallback ${logo ? 'hidden' : ''}`}>{symbol}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{role}</p>
      </div>
    </div>
  )
}

const InlineTeamBadge = ({ name, logo }: { name: string; logo?: string | null }) => {
  const symbol = name.trim().charAt(0).toUpperCase() || 'T'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-[#1d4ed8]">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="h-full w-full object-contain p-0.5"
            onError={event => {
              event.currentTarget.style.display = 'none'
              const fallback = event.currentTarget.parentElement?.querySelector('.inline-team-badge-fallback')
              if (fallback) {
                fallback.classList.remove('hidden')
              }
            }}
          />
        ) : null}
        <span className={`inline-team-badge-fallback ${logo ? 'hidden' : ''}`}>{symbol}</span>
      </div>
      <span className="truncate">{name}</span>
    </div>
  )
}

export default PinnedFixturesSection
