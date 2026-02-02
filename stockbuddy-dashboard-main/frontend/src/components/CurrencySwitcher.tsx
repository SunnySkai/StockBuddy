import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCurrency } from '../context/CurrencyContext'

const CURRENCY_SYMBOLS = {
  GBP: '\u00A3',
  USD: '$',
  EUR: '\u20AC'
} as const

const formatCurrencyLabel = (code: keyof typeof CURRENCY_SYMBOLS) => `${CURRENCY_SYMBOLS[code]} ${code}`

const CurrencySwitcher = () => {
  const { currency, supportedCurrencies, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current && containerRef.current.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const options = useMemo(
    () => supportedCurrencies.filter(option => option !== currency),
    [currency, supportedCurrencies]
  )

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-800"
      >
        <span>{formatCurrencyLabel(currency)}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-36 rounded-2xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
          {options.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setCurrency(option)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer"
            >
              <span>{formatCurrencyLabel(option)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CurrencySwitcher
