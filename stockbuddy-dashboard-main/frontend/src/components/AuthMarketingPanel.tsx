import { Building2, TrendingUp, TicketCheck } from 'lucide-react'
import logo from '../assets/stockbuddy-logo.svg'

const metricCards = [
  { label: 'Live Locations', value: '128', Icon: Building2 },
  { label: 'Fill Rate', value: '98%', Icon: TrendingUp },
  { label: 'Tickets Today', value: '54', Icon: TicketCheck }
]

const highlightPoints = [
  'Zero stockouts on top SKUs this week',
  'Automated replenishment triggered 42 times',
  'Seller KYC queue cleared in under 6 hours'
]

const AuthMarketingPanel = () => (
  <aside className="relative hidden w-full max-w-2xl flex-col gap-10 overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-b from-[#0a1a3b] via-[#0c2452] to-[#103673] p-14 text-white shadow-[0_50px_140px_rgba(8,20,50,0.65)] lg:flex">
    <div className="pointer-events-none absolute inset-0 bg-hero-mesh opacity-35" />
    <div className="pointer-events-none absolute -top-24 -left-28 h-60 w-60 rounded-full bg-brand-300/40 blur-[130px]" />
    <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-brand-600/35 blur-[150px]" />

    <header className="relative z-10 flex items-start gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 shadow-[0_24px_60px_rgba(37,99,235,0.45)]">
        <img src={logo} alt="My Stock Buddy" className="h-10 w-10 drop-shadow" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.42rem] text-white/70">StockBuddy Command</p>
        <h1 className="font-display text-[30px] font-semibold text-white drop-shadow">
          Orchestrate inventory with confidence
        </h1>
      </div>
    </header>

    <section className="relative z-10 grid gap-6 rounded-3xl border border-white/20 bg-white/5 p-6 shadow-inner shadow-black/30 backdrop-blur">
      <div className="grid grid-cols-3 gap-4">
        {metricCards.map(({ label, value, Icon }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1 rounded-2xl border border-white/20 bg-white/5 px-4 py-5 text-center shadow-[0_24px_46px_rgba(10,23,55,0.55)] backdrop-blur-lg"
          >
            <Icon className="h-6 w-6 text-[#9ab8ff]" strokeWidth={1.8} />
            <p className="mt-2 text-[11px] uppercase tracking-[0.24rem] text-white/60">{label}</p>
            <p className="text-2xl font-semibold text-white drop-shadow-sm">{value}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-2 text-sm leading-relaxed text-white">
        {highlightPoints.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#34d399]" />
            <span className="text-white/85">{item}</span>
          </li>
        ))}
      </ul>
    </section>

    <section className="relative z-10 space-y-5">
      <div className="overflow-hidden rounded-3xl border border-white/18 bg-gradient-to-br from-[#0c2555] via-[#10367c] to-[#1a53c0] p-6 shadow-[0_32px_70px_rgba(3,12,30,0.55)]">
        <div className="flex h-40 items-end justify-between gap-3 sm:h-48 sm:gap-4">
          {[76, 108, 92, 138, 104, 170, 156, 140, 126, 132].map((height, index) => (
            <div key={index} className="flex w-6 flex-col items-center sm:w-7">
              <div
                className="w-full rounded-full bg-gradient-to-t from-[#1d4fd8] via-[#3a74f4] to-[#84b7ff] shadow-[0_16px_28px_rgba(12,34,82,0.5)]"
                style={{ height }}
              />
            </div>
          ))}
        </div>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.32rem] text-white/70">
          Live inventory pulse
        </p>
      </div>

      <blockquote className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm italic leading-relaxed text-white/85 shadow-lg shadow-black/40 backdrop-blur">
        "Stock Buddy turns weekly firefighting into proactive wins. Our franchise partners swear by it."
        <footer className="mt-3 text-[11px] font-semibold uppercase tracking-[0.34rem] text-white/65">
          Sofia Mendes - Retail Operations Director
        </footer>
      </blockquote>
    </section>
  </aside>
)

export default AuthMarketingPanel
