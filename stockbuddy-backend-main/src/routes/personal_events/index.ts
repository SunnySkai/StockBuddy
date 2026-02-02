import express, { Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { requireLoggedInUser } from '../../decorators/require_param'
import { AuthenticatedRequest, Request } from '../../models/request'
import { PersonalEventRepeat } from '../../models/personal_event'
import {
  createPersonalEvent,
  deletePersonalEvent,
  deletePersonalEventsByParent,
  getPersonalEventById,
  listEventsWithPendingReminders,
  listPersonalEventsForUser,
  markReminderSent,
  updatePersonalEvent
} from '../../daos/personal_events'
import { sendEmail } from '../../aws_integration/ses/send'

const route = express.Router()

const parseRepeat = (value: unknown): PersonalEventRepeat => {
  const allowed: PersonalEventRepeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']
  if (typeof value === 'string' && allowed.includes(value as PersonalEventRepeat)) {
    return value as PersonalEventRepeat
  }
  return 'none'
}

const parseInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string' && value.trim().length) {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n)) return n
  }
  return null
}

const isValidIsoDateTime = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return !Number.isNaN(time)
}

const buildOccurrences = (
  startIso: string,
  repeat: PersonalEventRepeat,
  repeatUntil?: string | null
): string[] => {
  if (repeat === 'none') return [startIso]
  const start = new Date(startIso)
  const explicitLimit = (() => {
    if (!repeatUntil || !isValidIsoDateTime(repeatUntil)) return null
    const d = new Date(repeatUntil)
    // Treat repeat_until as inclusive for the whole day
    d.setHours(23, 59, 59, 999)
    return d
  })()
  const maxLimit = new Date(start)
  maxLimit.setFullYear(maxLimit.getFullYear() + 1)
  const limit = explicitLimit && explicitLimit < maxLimit ? explicitLimit : maxLimit
  const dates: string[] = []
  const maxOccurrences = 365

  let current = new Date(start)
  for (let i = 0; i < maxOccurrences; i += 1) {
    if (limit && current > limit) break
    dates.push(current.toISOString())
    const next = new Date(current)
    if (repeat === 'daily') {
      next.setDate(next.getDate() + 1)
    } else if (repeat === 'weekly') {
      next.setDate(next.getDate() + 7)
    } else if (repeat === 'monthly') {
      next.setMonth(next.getMonth() + 1)
    } else if (repeat === 'yearly') {
      next.setFullYear(next.getFullYear() + 1)
    }
    current = next
  }
  return dates
}

route.get(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest
    const user = authReq.user
    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const tenant = req.tenant ?? ''
    const from = typeof req.query.from === 'string' ? req.query.from : undefined
    const to = typeof req.query.to === 'string' ? req.query.to : undefined

    try {
      const events = await listPersonalEventsForUser(tenant, user.id, { from, to })
      res.json({ success: true, data: events })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, message: 'Failed to load personal events' })
    }
  }
)

route.post(
  '/',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest
    const user = authReq.user
    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const tenant = req.tenant ?? ''
    const { title, description, start_time, end_time, location, repeat: repeatRaw, repeat_until, remind_before_minutes } = req.body ?? {}

    if (!title || typeof title !== 'string' || !title.trim().length) {
      res.status(400).json({ success: false, message: 'Title is required' })
      return
    }

    if (!isValidIsoDateTime(start_time)) {
      res.status(400).json({ success: false, message: 'Start time must be a valid ISO date-time string' })
      return
    }

    const repeat = parseRepeat(repeatRaw)
    const repeatUntil = typeof repeat_until === 'string' ? repeat_until : null

    if (repeat !== 'none') {
      if (!repeatUntil || !isValidIsoDateTime(repeatUntil)) {
        res.status(400).json({
          success: false,
          message: 'Repeat until is required and must be a valid ISO date when repeat is enabled'
        })
        return
      }
      if (!isValidIsoDateTime(start_time)) {
        res.status(400).json({
          success: false,
          message: 'Start time must be a valid ISO date-time string'
        })
        return
      }
      const startDate = new Date(start_time)
      const untilDate = new Date(repeatUntil)
      if (untilDate < startDate) {
        res.status(400).json({
          success: false,
          message: 'Repeat until must be on or after the event start date'
        })
        return
      }
    }
    const remindMinutes = parseInteger(remind_before_minutes)

    const occurrences = buildOccurrences(start_time, repeat, repeatUntil)

    const parentEventId = occurrences.length > 1 ? uuidv4() : null
    const createdEvents = []

    for (const occurrence of occurrences) {
      const eventId = uuidv4()
      let reminderAt: string | null = null
      if (remindMinutes !== null && remindMinutes >= 0) {
        const dt = new Date(occurrence)
        dt.setMinutes(dt.getMinutes() - remindMinutes)
        reminderAt = dt.toISOString()
      }

      const event = await createPersonalEvent(tenant, {
        id: eventId,
        user_id: user.id,
        title: title.trim(),
        description: typeof description === 'string' && description.trim().length ? description.trim() : null,
        start_time: occurrence,
        end_time: isValidIsoDateTime(end_time) ? end_time : null,
        location: typeof location === 'string' && location.trim().length ? location.trim() : null,
        repeat,
        parent_event_id: parentEventId,
        remind_before_minutes: remindMinutes,
        reminder_at: reminderAt,
        reminder_sent_at: null
      })
      createdEvents.push(event)
    }

    res.status(201).json({ success: true, data: createdEvents })
  }
)

route.patch(
  '/:eventId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest
    const user = authReq.user
    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const tenant = req.tenant ?? ''
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : ''
    if (!eventId) {
      res.status(400).json({ success: false, message: 'eventId is required' })
      return
    }

    const { title, description, start_time, end_time, location, remind_before_minutes } = req.body ?? {}

    const updates: any = {}
    if (typeof title === 'string') {
      updates.title = title.trim()
    }
    if (typeof description === 'string') {
      updates.description = description.trim().length ? description.trim() : null
    }
    if (isValidIsoDateTime(start_time)) {
      updates.start_time = start_time
    }
    if (isValidIsoDateTime(end_time)) {
      updates.end_time = end_time
    }
    if (typeof location === 'string') {
      updates.location = location.trim().length ? location.trim() : null
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'remind_before_minutes')) {
      const remindMinutes = parseInteger(remind_before_minutes)
      if (remindMinutes === null) {
        // Explicitly clear reminder
        updates.remind_before_minutes = null
        updates.reminder_at = null
      } else {
        updates.remind_before_minutes = remindMinutes
        if (isValidIsoDateTime(start_time)) {
          const dt = new Date(start_time)
          dt.setMinutes(dt.getMinutes() - remindMinutes)
          updates.reminder_at = dt.toISOString()
        }
      }
    }

    try {
      await updatePersonalEvent(tenant, user.id, eventId, updates)
      res.json({ success: true })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, message: 'Failed to update personal event' })
    }
  }
)

route.delete(
  '/:eventId',
  requireLoggedInUser(),
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest
    const user = authReq.user
    if (!user) {
      res.status(401).json({ success: false, message: 'Access denied.' })
      return
    }

    const tenant = req.tenant ?? ''
    const eventId = typeof req.params.eventId === 'string' ? req.params.eventId : ''
    if (!eventId) {
      res.status(400).json({ success: false, message: 'eventId is required' })
      return
    }

    try {
      const series = typeof req.query.series === 'string' ? req.query.series : undefined

      if (series === 'all') {
        // Delete all occurrences in the series, based on parent_event_id of the target event
        const existing = await getPersonalEventById(tenant, user.id, eventId)
        if (!existing) {
          res.status(404).json({ success: false, message: 'Event not found' })
          return
        }
        const parentId = existing.parent_event_id ?? existing.id
        await deletePersonalEventsByParent(tenant, user.id, parentId)
      } else {
        await deletePersonalEvent(tenant, user.id, eventId)
      }

      res.json({ success: true })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, message: 'Failed to delete personal event' })
    }
  }
)

export = route
