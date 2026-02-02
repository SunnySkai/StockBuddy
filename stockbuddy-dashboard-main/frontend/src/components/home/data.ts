import type { TicketRow } from './types'

export const ticketSeed: TicketRow[] = [
  {
    id: 'INV-001',
    fixture: 'Manchester United vs Liverpool',
    date: '14 Sep 2025',
    time: '17:30 GMT',
    venue: 'Old Trafford, Manchester',
    allocation: 3200,
    sold: 2380,
    hold: 120,
    price: 145,
    status: 'On Track'
  },
  {
    id: 'INV-002',
    fixture: 'Manchester City vs Everton',
    date: '21 Sep 2025',
    time: '16:00 GMT',
    venue: 'Etihad Stadium, Manchester',
    allocation: 2100,
    sold: 1825,
    hold: 65,
    price: 110,
    status: 'Monitor'
  },
  {
    id: 'INV-003',
    fixture: 'Arsenal vs Chelsea',
    date: '28 Sep 2025',
    time: '18:45 GMT',
    venue: 'Emirates Stadium, London',
    allocation: 2300,
    sold: 1950,
    hold: 80,
    price: 132,
    status: 'Low Supply'
  },
  {
    id: 'INV-004',
    fixture: 'Tottenham vs Newcastle',
    date: '04 Oct 2025',
    time: '20:00 GMT',
    venue: 'Tottenham Hotspur Stadium, London',
    allocation: 2600,
    sold: 2600,
    hold: 0,
    price: 165,
    status: 'Sold Out'
  },
  {
    id: 'INV-005',
    fixture: 'Real Madrid vs Barcelona',
    date: '12 Oct 2025',
    time: '19:30 CET',
    venue: 'Santiago Bernabeu, Madrid',
    allocation: 3400,
    sold: 2410,
    hold: 150,
    price: 190,
    status: 'On Track'
  }
]

export const focusGradientClasses = [
  'from-sky-100 via-white to-indigo-100',
  'from-white via-slate-50 to-indigo-50',
  'from-indigo-50 via-white to-sky-50'
]
