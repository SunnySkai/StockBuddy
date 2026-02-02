import { listEventsWithPendingReminders, markReminderSent } from '../../daos/personal_events'
import { getUserById } from '../../daos/user'
import { sendEmail } from '../../aws_integration/ses/send'

interface LambdaResult {
  success: boolean
  processedEvents: number
  remindersSent: number
  errors: { eventId: string; error: any }[]
}

export const handler = async (): Promise<LambdaResult> => {
  const nowIso = new Date().toISOString()
  const defaultTenant = process.env.DEFAULT_TENANT || 'STOCKBUDDY'

  let remindersSent = 0
  let processedEvents = 0
  let errors: { eventId: string; error: any }[] = []

  try {
    const events = await listEventsWithPendingReminders(defaultTenant, nowIso)

    console.info('EVENTS COUNT: ', events.length)
    console.info('EVENTS: ', JSON.stringify(events)) // remove after testing

    await Promise.all(events.map(async (event) => {
      processedEvents++
      if (!event.reminder_at || (event.reminder_sent_at && event.reminder_sent_at.length)) {
        return
      }

      try {
        const user = await getUserById(defaultTenant, event.user_id)
        if (!user?.email) {
          console.warn(`Reminder not sent: user ${event.user_id} has no email for event ${event.id}`)
          return
        }

        console.info('SEND TO USER: ', JSON.stringify(user));

        await Promise.all([
          sendEmail(
            user.email,
            `Reminder: ${event.title}`,
            `<p>This is a reminder for your event:</p>
             <p><strong>${event.title}</strong></p>
             <p>${event.description ?? ''}</p>
             <p>When: ${event.start_time}</p>
             ${event.location ? `<p>Where: ${event.location}</p>` : ''}`
          ),
          markReminderSent(defaultTenant, event.user_id, event.id, nowIso)
        ])
        remindersSent++
      } catch (error) {
        console.error('Failed to send reminder email: ', error)
        errors.push({ eventId: event.id, error: error instanceof Error ? error.message : String(error) })
      }
    }))

    const lambdaResult: LambdaResult = {
      success: errors.length === 0,
      processedEvents,
      remindersSent,
      errors
    }

    return lambdaResult
  } catch (topError) {
    console.error('Handler failed:', topError)
    return {
      success: false,
      processedEvents,
      remindersSent,
      errors: [{ eventId: 'all', error: topError instanceof Error ? topError.message : String(topError) }]
    }
  }
}
