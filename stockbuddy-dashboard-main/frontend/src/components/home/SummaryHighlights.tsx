import type { SummaryHighlight } from './types'

type SummaryHighlightsProps = {
  highlights: SummaryHighlight[]
}

const SummaryHighlights = ({ highlights }: SummaryHighlightsProps) => {
  return (
    <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {highlights.map(highlight => (
        <article
          key={highlight.title}
          className="space-y-4 rounded-[24px] border border-white/70 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_32px_80px_rgba(15,23,42,0.12)]"
        >
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${highlight.accent}`}>
            <highlight.icon className="h-4 w-4" />
            {highlight.title}
          </div>
          <div>
            <p className="text-3xl font-semibold text-slate-900">{highlight.value}</p>
            <p className="mt-1 text-sm font-semibold text-[#1d4ed8]">{highlight.change}</p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.36em] text-slate-400">{highlight.helper}</p>
        </article>
      ))}
    </section>
  )
}

export default SummaryHighlights
