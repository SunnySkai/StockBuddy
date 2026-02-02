import { ArrowRight } from 'lucide-react'
import logo from '../assets/stockbuddy-logo.svg'

type AuthLandingHeroProps = {
  onGetStarted: () => void
}

const AuthLandingHero = ({ onGetStarted }: AuthLandingHeroProps) => (
  <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f5f7fb] px-6 py-16 text-brand-900">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(88,130,255,0.16),_transparent_60%)]" />
    <div className="pointer-events-none absolute left-[-12rem] top-[18%] h-56 w-56 rounded-full bg-brand-200/45 blur-[140px]" />
    <div className="pointer-events-none absolute right-[-14rem] bottom-[12%] h-72 w-72 rounded-full bg-brand-400/35 blur-[160px]" />

    <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-10 rounded-[48px] border border-brand-100/50 bg-white/80 px-10 py-16 text-center shadow-[0_48px_120px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:px-14">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500 shadow-[0_24px_60px_rgba(37,99,235,0.35)]">
        <img src={logo} alt="Stock Buddy Logo" className="h-12 w-12" />
      </div>

      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.42rem] text-brand-600/70">Stock Buddy Dashboard</p>
        <h1 className="font-display text-4xl font-semibold text-[#0a1635] sm:text-5xl">
          Orchestrate your inventory with confidence
        </h1>
        <p className="text-lg leading-relaxed text-brand-600 sm:text-xl">
          Manage stock levels, approve transfers, and oversee operations across every location from one command
          centre.
        </p>
      </div>

      <button
        type="button"
        onClick={onGetStarted}
        className="group inline-flex items-center gap-3 rounded-[22px] bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] px-8 py-4 text-base font-semibold text-white shadow-[0_18px_38px_rgba(37,99,235,0.35)] transition hover:from-[#214fce] hover:to-[#1f62f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <span>Get Started</span>
        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" strokeWidth={2.2} />
      </button>
    </div>
  </main>
)

export default AuthLandingHero

