import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Check,
  Crown,
  Sparkles,
  Star,
  Zap,
  LayoutGrid,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  ShieldCheck,
  Ticket,
  Users,
  Database,
  Globe,
  Headphones
} from 'lucide-react'
import DashboardLayout from './DashboardLayout'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'

type PricingTier = 'free' | 'plus' | 'pro'

type PricingFeature = {
  icon: LucideIcon
  name: string
  description: string
  included: {
    free: boolean
    plus: boolean
    pro: boolean
  }
}

type PricingPlan = {
  id: PricingTier
  name: string
  description: string
  price: number
  period: string
  currency: string
  popular?: boolean
  features: string[]
  limits: {
    events: string
    users: string
    storage: string
    api_calls: string
  }
  cta: string
  badge?: string
}

const pricingFeatures: PricingFeature[] = [
  {
    icon: LayoutGrid,
    name: 'Dashboard analytics',
    description: 'Real-time inventory tracking and performance metrics',
    included: { free: true, plus: true, pro: true }
  },
  {
    icon: Boxes,
    name: 'Inventory management',
    description: 'Track stock levels, reorder points, and turnover rates',
    included: { free: true, plus: true, pro: true }
  },
  {
    icon: Ticket,
    name: 'Event management',
    description: 'Manage fixtures, allocations, and ticket sales',
    included: { free: true, plus: true, pro: true }
  },
  {
    icon: BarChart3,
    name: 'Advanced analytics',
    description: 'Deep insights with custom reports and forecasting',
    included: { free: false, plus: true, pro: true }
  },
  {
    icon: Bell,
    name: 'Smart notifications',
    description: 'Automated alerts for low supply and priority fixtures',
    included: { free: false, plus: true, pro: true }
  },
  {
    icon: Database,
    name: 'Data export',
    description: 'Export data to CSV, Excel, and PDF formats',
    included: { free: false, plus: true, pro: true }
  },
  {
    icon: Globe,
    name: 'Multi-location support',
    description: 'Manage venues and hospitality partners from one hub',
    included: { free: false, plus: true, pro: true }
  },
  {
    icon: Users,
    name: 'Team collaboration',
    description: 'Role-based access with auditable actions',
    included: { free: false, plus: true, pro: true }
  },
  {
    icon: ShieldCheck,
    name: 'Advanced security',
    description: 'SSO, 2FA, and enterprise-grade encryption',
    included: { free: false, plus: false, pro: true }
  },
  {
    icon: Headphones,
    name: 'Priority support',
    description: '24/7 dedicated success operator with SLA',
    included: { free: false, plus: false, pro: true }
  },
  {
    icon: Zap,
    name: 'API access',
    description: 'Full REST API with webhooks and automation triggers',
    included: { free: false, plus: false, pro: true }
  },
  {
    icon: Crown,
    name: 'White-label',
    description: 'Custom branding and partner-ready portals',
    included: { free: false, plus: false, pro: true }
  }
]

const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started with basic inventory management.',
    price: 0,
    period: 'forever',
    currency: 'GBP',
    features: [
      'Up to 5 events per month',
      'Live inventory dashboard',
      'Email support',
      'Mobile access'
    ],
    limits: {
      events: '5/month',
      users: '1 user',
      storage: '1GB',
      api_calls: '100/month'
    },
    cta: 'Get started free',
    badge: 'Current plan'
  },
  {
    id: 'plus',
    name: 'Plus',
    description: 'Ideal for growing ticketing operations that need more automation.',
    price: 49,
    period: 'month',
    currency: 'GBP',
    popular: true,
    features: [
      'Unlimited events',
      'Advanced analytics',
      'Team collaboration',
      'Priority support',
      'Data export tools',
      'Multi-location support'
    ],
    limits: {
      events: 'Unlimited',
      users: '10 users',
      storage: '100GB',
      api_calls: '10,000/month'
    },
    cta: 'Upgrade to Plus',
    badge: 'Most popular'
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Enterprise-grade solution for leagues and global hospitality teams.',
    price: 149,
    period: 'month',
    currency: 'GBP',
    features: [
      'Everything in Plus',
      'Advanced security (SSO, 2FA)',
      'Dedicated success operator',
      'Custom integrations',
      'White-label portals',
      'Uptime SLA'
    ],
    limits: {
      events: 'Unlimited',
      users: 'Unlimited',
      storage: '1TB',
      api_calls: 'Unlimited'
    },
    cta: 'Talk to sales',
    badge: 'Enterprise'
  }
]

const PricingPage = () => {
  const { organization } = useSession()
  const { formatCurrency } = useCurrency()
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  const header = (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-600">
        <Star className="h-4 w-4" />
        Upgrade to unlock your velocity
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.45em] text-[#8aa0ff]">Pricing</p>
        <h1 className="mt-2 text-4xl font-semibold text-slate-900 sm:text-5xl">Choose your command tier.</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-500">
          Scale StockBuddy with the same precision you orchestrate match day. Start free and upgrade once your trading
          pulse demands it.
        </p>
      </div>
      {organization && (
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-xs font-semibold text-indigo-600">
          <ShieldCheck className="h-3.5 w-3.5" />
          {organization.name} workspace
        </span>
      )}
    </div>
  )

  const getPriceDisplay = (plan: PricingPlan) => {
    if (plan.price === 0) return 'Free'
    const annualDiscount = billingCycle === 'yearly' ? 0.2 : 0
    const adjustedPrice = plan.price * (1 - annualDiscount)
    return `${formatCurrency(adjustedPrice, { maximumFractionDigits: 0 })}/month`
  }

  const getYearlySavings = (plan: PricingPlan) => {
    if (plan.price === 0 || billingCycle !== 'yearly') return null
    const yearlyPrice = plan.price * 12 * 0.8
    const monthlyPrice = plan.price * 12
    const savings = monthlyPrice - yearlyPrice
    return formatCurrency(savings, { maximumFractionDigits: 0 })
  }

  return (
    <DashboardLayout header={header}>
      <div className="space-y-16">
        <section className="flex justify-center">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
                billingCycle === 'monthly'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`rounded-xl px-6 py-3 text-sm font-semibold transition ${
                billingCycle === 'yearly'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                Yearly
                <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-white">
                  Save 20%
                </span>
              </div>
            </button>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-3">
          {pricingPlans.map(plan => {
            const yearlySavings = getYearlySavings(plan)
            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl border-2 p-8 shadow-[0_24px_60px_rgba(15,23,42,0.12)] transition-all hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(15,23,42,0.18)] ${
                  plan.popular
                    ? 'border-indigo-500 bg-gradient-to-br from-white via-indigo-50/30 to-sky-50/30'
                    : 'border-slate-200 bg-white'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white shadow-lg shadow-indigo-200">
                      <Sparkles className="h-4 w-4" />
                      {plan.badge}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                      <ClipboardList className="hidden" />
                      {plan.name}
                    </span>
                    {plan.popular && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-600">
                        <Crown className="h-4 w-4" />
                        Team favourite
                      </span>
                    )}
                  </div>
                  <h3 className="text-3xl font-semibold text-slate-900">{getPriceDisplay(plan)}</h3>
                  <p className="text-sm text-slate-500">{plan.description}</p>
                  {yearlySavings && (
                    <p className="text-xs font-semibold text-emerald-600">
                      Save {yearlySavings} per year when billed annually
                    </p>
                  )}
                  <div className="space-y-3 text-sm text-slate-600">
                    {plan.features.map(feature => (
                      <div key={feature} className="flex items-center gap-3">
                        <Check className="h-4 w-4 text-emerald-500" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                    <PlanLimit label="Events" value={plan.limits.events} />
                    <PlanLimit label="Users" value={plan.limits.users} />
                    <PlanLimit label="Storage" value={plan.limits.storage} />
                    <PlanLimit label="API Calls" value={plan.limits.api_calls} />
                  </div>
                  <button
                    type="button"
                    className={`mt-4 w-full rounded-2xl px-6 py-4 text-sm font-semibold transition ${
                      plan.popular
                        ? 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 hover:shadow-xl'
                        : plan.id === 'free'
                        ? 'border-2 border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                        : 'border-2 border-indigo-200 bg-white text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    {plan.cta}
                    {plan.id !== 'free' && <ArrowUpRight className="ml-2 inline h-4 w-4" />}
                  </button>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Why teams upgrade to {plan.name}</p>
                    <p className="mt-1">
                      “StockBuddy keeps our match-day operations aligned. Upgrading to
                      {plan.name === 'Plus' ? ' Plus' : ' Pro'} gave us the breathing room to scale hospitality without
                      losing control.”
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">Compare all features</h2>
            <p className="mt-4 text-lg text-slate-600">See exactly what’s included in each plan</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Features</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">Free</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">Plus</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900">Pro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pricingFeatures.map((feature, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                            <feature.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{feature.name}</p>
                            <p className="text-sm text-slate-600">{feature.description}</p>
                          </div>
                        </div>
                      </td>
                      <PricingFeatureCell value={feature.included.free} />
                      <PricingFeatureCell value={feature.included.plus} />
                      <PricingFeatureCell value={feature.included.pro} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="space-y-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-slate-900">Frequently asked questions</h2>
            <p className="mt-4 text-lg text-slate-600">Everything you need to know about our pricing</p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            {faqs.map(faq => (
              <div key={faq.question} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-semibold text-slate-900">{faq.question}</h3>
                <p className="mt-2 text-sm text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-sky-600 p-12 text-center text-white shadow-[0_32px_80px_rgba(29,78,216,0.45)]">
          <h2 className="text-3xl font-bold">Ready to get started?</h2>
          <p className="mt-4 text-lg text-indigo-100">
            Join thousands of businesses already using StockBuddy to manage their inventory.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <button className="rounded-2xl bg-white px-8 py-4 text-indigo-600 font-semibold transition hover:bg-slate-50">
              Start free trial
            </button>
            <button className="rounded-2xl border-2 border-white/30 bg-white/10 px-8 py-4 font-semibold text-white transition hover:bg-white/20">
              Contact sales
            </button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

const PlanLimit = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between">
    <span className="text-slate-600">{label}</span>
    <span className="font-semibold text-slate-900">{value}</span>
  </div>
)

const PricingFeatureCell = ({ value }: { value: boolean }) => (
  <td className="px-6 py-4 text-center">
    {value ? (
      <Check className="mx-auto h-6 w-6 text-emerald-500" />
    ) : (
      <div className="mx-auto h-6 w-6 rounded-full border-2 border-slate-300" />
    )}
  </td>
)

const faqs = [
  {
    question: 'Can I switch plans anytime?',
    answer:
      'Yes! You can upgrade or downgrade whenever it suits your operations. Changes take effect immediately, and we’ll prorate any differences.'
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Our Free plan is available forever with no time limits. Plus and Pro unlock a 14-day full-feature trial so you can onboard your squad properly.'
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards, PayPal, and bank transfers. Enterprise customers can also pay via invoice with bespoke terms.'
  },
  {
    question: 'Do you offer custom pricing?',
    answer:
      'Absolutely. For league-wide operators or teams with bespoke needs, we tailor pricing and feature bundles. Drop the success desk a note to design the right plan.'
  }
]

export default PricingPage
