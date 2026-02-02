export type PersonalEventRepeat =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'

export interface PersonalEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  location: string | null
  repeat: PersonalEventRepeat
  parent_event_id: string | null
  remind_before_minutes: number | null
  reminder_at: string | null
  reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

