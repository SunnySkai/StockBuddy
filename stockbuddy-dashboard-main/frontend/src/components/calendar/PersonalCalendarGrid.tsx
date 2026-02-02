import { useState } from 'react'
import type { PersonalEvent } from '../../types/personalEvents'

const formatLocalDateKey = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

type Props = {
  weeks: Date[][]
  currentMonth: number
  currentYear: number
  today: Date
  personalEvents: PersonalEvent[]
  onNewEvent: (dateKey: string) => void
  onEditEvent: (event: PersonalEvent) => void
}

const PersonalCalendarGrid = ({
  weeks,
  currentMonth,
  currentYear,
  today,
  personalEvents,
  onNewEvent,
  onEditEvent
}: Props) => {
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)

  const personalEventsByDate = (() => {
    const map = new Map<string, PersonalEvent[]>()
    personalEvents.forEach(event => {
      const key = event.start_time.split('T')[0]
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)?.push(event)
    })
    return map
  })()

  const todayKey = formatLocalDateKey(today)

  const renderPersonalDayCell = (date: Date) => {
    const key = formatLocalDateKey(date)
    const dayEvents = personalEventsByDate.get(key) ?? []
    const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
    const isToday = key === todayKey
    const isExpanded = expandedDayKey === key
    const VISIBLE_LIMIT = 3
    const showExpandBtn = !isExpanded && dayEvents.length > VISIBLE_LIMIT
    const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, VISIBLE_LIMIT)
    const moreCount = !isExpanded && (dayEvents.length - VISIBLE_LIMIT)

    return (
      <div
        key={key}
        role="button"
        tabIndex={0}
        aria-label={`Add event on ${date.toDateString()}`}
        onClick={() => onNewEvent(key)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onNewEvent(key)
          }
        }}
        className={`relative flex min-h-[96px] flex-col rounded-xl border bg-white/80 p-1.5 shadow-sm ${
          isCurrentMonth ? 'border-slate-200/80' : 'border-slate-100/80 opacity-60'
        }`}
        style={{
          transition: 'box-shadow 180ms, background 180ms',
          cursor: 'pointer'
        }}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onNewEvent(key)
            }}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              isToday ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700'
            }`}
            style={{ cursor: 'pointer' }}
          >
            {date.getDate()}
          </button>
          {dayEvents.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-all duration-150">
              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-1 flex-col gap-1 relative">
          {visibleEvents.map(calendarEvent => (
            <button
              key={calendarEvent.id}
              type="button"
              onClick={event => {
                event.stopPropagation()
                onEditEvent(calendarEvent)
              }}
              className="group relative flex w-full items-center gap-1.5 rounded-lg bg-sky-50/90 px-1.5 py-1 text-left text-[10px] text-sky-900 ring-offset-1 
                transition-all duration-200 ease-in-out 
                hover:bg-sky-200 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500
                cursor-pointer shadow-sm active:scale-97"
              style={{
                cursor: 'pointer',
                transitionProperty: 'background, color, transform, box-shadow',
                transform: `translateY(0) scale(1)`
              }}
            >
              <div className="inline-flex items-center justify-center rounded-full bg-sky-600 px-2 py-0.5 text-[9px] font-semibold text-white">
                {calendarEvent.start_time.substring(11, 16)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{calendarEvent.title}</span>
                {calendarEvent.description && (
                  <span className="truncate text-[9px] text-sky-800/80">
                    {calendarEvent.description}
                  </span>
                )}
              </div>
            </button>
          ))}
          {showExpandBtn && moreCount && (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                setExpandedDayKey(key)
              }}
              className="mt-0.5 flex items-center text-[10px] font-medium text-sky-700 rounded-lg px-1 py-0.5 bg-white/60 hover:bg-sky-100 shadow transition-all duration-150 cursor-pointer"
              style={{ cursor: 'pointer' }}
            >
              <span>Show {moreCount} more</span>
            </button>
          )}
          {isExpanded && dayEvents.length > VISIBLE_LIMIT && (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                setExpandedDayKey(null)
              }}
              className="mt-0.5 flex items-center text-[10px] font-medium text-slate-600 rounded-lg px-1 py-0.5 bg-slate-50 hover:bg-slate-100 shadow transition-all duration-150 cursor-pointer"
              style={{ cursor: 'pointer' }}
            >
              <span>Show less</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 grid grid-cols-7 gap-1.5">
      {weeks.map(week => week.map(date => renderPersonalDayCell(date)))}
    </div>
  )
}

export default PersonalCalendarGrid
