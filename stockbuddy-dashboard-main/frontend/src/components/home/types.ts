import type { LucideIcon } from 'lucide-react'

export type TicketStatus = 'On Track' | 'Monitor' | 'Low Supply' | 'Sold Out'

export type TicketRow = {
  id: string
  fixture: string
  date: string
  time: string
  venue: string
  allocation: number
  sold: number
  hold: number
  price: number
  status: TicketStatus
}

export type SummaryHighlight = {
  title: string
  value: string
  change: string
  helper: string
  icon: LucideIcon
  accent: string
}

export type TicketViewMode = 'overview' | 'excel'
