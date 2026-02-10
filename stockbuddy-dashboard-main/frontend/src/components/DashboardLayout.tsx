import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  BarChart3,
  Boxes,
  CalendarSearch,
  LayoutGrid,
  LogOut,
  Settings,
  Users,
  UsersRound,
  Bot,
  Calendar,
  MessageCircle,
  Wallet,
  ChevronDown,
  CreditCard,
  BadgeDollarSign,
  Receipt
} from 'lucide-react'
import { useSession } from '../context/SessionContext'
import CurrencySwitcher from './CurrencySwitcher'
import { FloatingChatbot } from './FloatingChatbot'

type DashboardLayoutProps = {
  header: ReactNode
  headerActions?: ReactNode
  children: ReactNode
}

type NavChildItem = {
  label: string
  to: string
  icon?: typeof LayoutGrid
  disabled?: boolean
}

type NavItem = {
  label: string
  to?: string
  icon: typeof LayoutGrid
  disabled?: boolean
  children?: NavChildItem[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutGrid },
  { label: 'Events', to: '/events', icon: CalendarSearch },
  { label: 'Inventory', to: '/inventory', icon: Boxes },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, disabled: true },
  { label: 'Calendar', to: '/calendar', icon: Calendar },
  { label: 'Directory', to: '/directory', icon: MessageCircle },
  { label: 'AI Assistant', to: '/chatbot', icon: Bot },
  {
    label: 'Accounting',
    icon: Wallet,
    children: [
      { label: 'Balances', to: '/vendors', icon: CreditCard },
      { label: 'Transactions', to: '/accounting/transactions', icon: Receipt },
      { label: 'Banks & Wallets', to: '/accounting/banks', icon: BadgeDollarSign }
    ]
  },
  { label: 'Memberships', to: '/members', icon: UsersRound },
  { label: 'Organizations', to: '/organizations', icon: Users }
]

const DashboardLayout = ({ header, headerActions, children }: DashboardLayoutProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useSession()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const initials = (() => {
    if (!user) return '??'
    const displayName = (user.full_name ?? user.username ?? user.email ?? '')
      .trim()
      .split(/\s+/)
      .map(part => part.charAt(0).toUpperCase())
      .join('')
    return displayName.slice(0, 2) || user.email.slice(0, 2).toUpperCase()
  })()

  const isPricingRoute = location.pathname.startsWith('/pricing')

  const handleNavigate = (to: string | undefined, disabled?: boolean) => {
    if (!to || disabled) return
    if (to === location.pathname) return
    navigate(to)
  }

  const isActivePath = (target: string | undefined) => {
    if (!target) return false
    if (target === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(target)
  }

  const resolveExpandedState = (item: NavItem): boolean => {
    if (!item.children) return false
    if (typeof expandedSections[item.label] === 'boolean') {
      return expandedSections[item.label]
    }
    return item.children.some(child => isActivePath(child.to))
  }

  const toggleSection = (item: NavItem) => {
    if (!item.children) {
      handleNavigate(item.to, item.disabled)
      return
    }
    setExpandedSections(prev => {
      const current = typeof prev[item.label] === 'boolean'
        ? prev[item.label]
        : item.children!.some(child => isActivePath(child.to))
      return {
        ...prev,
        [item.label]: !current
      }
    })
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] text-slate-900">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/40 bg-white/70 px-5 py-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-3 text-white shadow-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-white/80">Stockbuddy</p>
            <p className="text-base font-semibold leading-tight">Inventory Manager</p>
          </div>
        </div>

        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {navItems.map(item => {
            const hasChildren = Boolean(item.children?.length)
            const sectionActive = hasChildren
              ? item.children!.some(child => isActivePath(child.to))
              : isActivePath(item.to)
            const expanded = hasChildren ? resolveExpandedState(item) : false
            return (
              <div key={item.label} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleSection(item)}
                  disabled={item.disabled && !hasChildren}
                  className={clsx(
                    'cursor-pointer flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    sectionActive
                      ? 'bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow-lg'
                      : 'text-slate-600 hover:bg-white',
                    item.disabled && !hasChildren && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'h-4 w-4',
                      sectionActive ? 'text-white' : 'text-slate-500'
                    )}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasChildren && (
                    <ChevronDown
                      className={clsx(
                        'h-4 w-4 transition-transform',
                        sectionActive ? 'text-white' : 'text-slate-400',
                        expanded && 'rotate-180'
                      )}
                    />
                  )}
                </button>
                {hasChildren && expanded && (
                  <div className="mt-1 flex flex-col gap-1">
                    {item.children!.map(child => {
                      const childActive = isActivePath(child.to)
                      return (
                        <button
                          key={child.label}
                          type="button"
                          onClick={() => handleNavigate(child.to, child.disabled)}
                          disabled={child.disabled}
                          className={clsx(
                            'cursor-pointer rounded-2xl px-4 py-2 text-left text-sm font-semibold transition',
                            childActive
                              ? 'bg-white text-[#1d4ed8] shadow-sm'
                              : 'text-slate-500 hover:bg-white',
                            child.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {child.icon && <child.icon className="h-4 w-4" />}
                            <span>{child.label}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="mt-10 text-xs text-slate-400">
          <p className="font-semibold uppercase tracking-[0.3em]">Support</p>
          <p className="mt-2 leading-relaxed">
            Need help? Ping us any time at{' '}
            <span className="font-semibold text-slate-500">ops@mystockbuddy.com</span>
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-10 pb-14 pt-12">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-3xl">{header}</div>
          <div className="flex flex-col items-end gap-4">
            <div className="flex items-center gap-3">
              {headerActions}
              <CurrencySwitcher />
              {!isPricingRoute && (
                <button
                  type="button"
                  onClick={() => navigate('/pricing')}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-sm font-semibold text-[#1d4ed8] shadow-sm transition hover:border-[#1d4ed8] hover:text-[#1d4ed8]"
                >
                  <span className="whitespace-nowrap">View Pricing</span>
                </button>
              )}

              <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-base font-semibold text-white">
                  {initials}
                </div>
                <div className="hidden text-left text-sm font-semibold text-slate-700 md:block">
                  <p>{user?.full_name ?? user?.email ?? 'Operator'}</p>
                  <p className="text-xs font-medium text-slate-400">{user?.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10 flex-1 min-w-0 overflow-x-hidden">
          {children}
        </div>
      </div>

      {/* Floating Chatbot */}
      <FloatingChatbot />
    </div>
  )
}

export default DashboardLayout
