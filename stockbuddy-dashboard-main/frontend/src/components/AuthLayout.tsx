import { PropsWithChildren, ReactNode } from 'react'
import AuthMarketingPanel from './AuthMarketingPanel'

type AuthLayoutProps = PropsWithChildren<{
  headline?: string
  subheadline?: string
  headingSlot?: ReactNode
}>

const AuthLayout = ({ children, headline, subheadline, headingSlot }: AuthLayoutProps) => (
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#06102a] via-[#091b40] to-[#0f2d66] px-4 py-12 font-sans text-brand-900 sm:px-6 lg:px-10">
    <div className="absolute inset-0 bg-hero-mesh opacity-25" />
    <div className="absolute -top-52 left-[-18rem] h-[32rem] w-[32rem] rounded-full bg-brand-400/35 blur-[150px]" />
    <div className="absolute bottom-[-20rem] right-[-20rem] h-[34rem] w-[34rem] rounded-full bg-brand-700/25 blur-[170px]" />

    <div className="relative z-10 flex w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-white/10 shadow-[0_60px_140px_rgba(5,18,45,0.58)] backdrop-blur-[28px]">
      <AuthMarketingPanel />
      <section className="flex-1 bg-white p-8 sm:p-10 md:p-12 lg:p-16">
        <div className="mx-auto flex max-w-xl flex-col gap-10">
          <div className="flex flex-col gap-6">
            {headingSlot}
            {headline && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.32rem] text-brand-500">
                  Gateway to my Stock Buddy
                </p>
                <h2 className="font-display text-3xl font-semibold text-[#0a1635] sm:text-4xl">{headline}</h2>
                {subheadline && <p className="text-base text-brand-500 sm:text-lg">{subheadline}</p>}
              </div>
            )}
          </div>
          {children}
        </div>
      </section>
    </div>
  </div>
)

export default AuthLayout
