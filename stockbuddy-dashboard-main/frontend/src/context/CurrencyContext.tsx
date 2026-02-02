import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

type CurrencyCode = 'GBP' | 'USD' | 'EUR'

type RateSnapshot = {
  timestamp: number
  rates: Record<CurrencyCode, number>
}

type CurrencyContextValue = {
  currency: CurrencyCode
  supportedCurrencies: CurrencyCode[]
  setCurrency: (currency: CurrencyCode) => void
  formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string
  convertToBase: (value: number, fromCurrency?: CurrencyCode) => number
  convertFromBase: (value: number, toCurrency?: CurrencyCode) => number
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined)

const BASE_CURRENCY: CurrencyCode = 'GBP'
const SUPPORTED_CURRENCIES: CurrencyCode[] = ['GBP', 'USD', 'EUR']
const STORAGE_KEY = 'stockbuddy.currency'
const RATE_STORAGE_KEY = 'stockbuddy.fxRates'
const RATE_TTL_MS = 12 * 60 * 60 * 1000

const getStoredCurrency = (): CurrencyCode => {
  if (typeof window === 'undefined') return BASE_CURRENCY
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && SUPPORTED_CURRENCIES.includes(stored as CurrencyCode)) {
    return stored as CurrencyCode
  }
  return BASE_CURRENCY
}

const storeCurrency = (value: CurrencyCode) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, value)
}

const readStoredRates = (): RateSnapshot | null => {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(RATE_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as RateSnapshot
    if (!parsed || typeof parsed.timestamp !== 'number' || !parsed.rates) return null
    return parsed
  } catch {
    return null
  }
}

const storeRates = (snapshot: RateSnapshot) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(snapshot))
}

const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>(getStoredCurrency)
  const [rates, setRates] = useState<Record<CurrencyCode, number>>({
    GBP: 1,
    USD: 1,
    EUR: 1
  })

  useEffect(() => {
    const snapshot = readStoredRates()
    if (snapshot?.rates) {
      setRates(snapshot.rates)
    }
  }, [])

  useEffect(() => {
    const snapshot = readStoredRates()
    const now = Date.now()
    if (snapshot && now - snapshot.timestamp < RATE_TTL_MS) {
      return
    }

    const appId = import.meta.env.VITE_OPENEXCHANGE_APP_ID
    if (!appId) {
      return
    }

    const controller = new AbortController()
    const loadRates = async () => {
      try {
        const response = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${appId}`, {
          signal: controller.signal
        })
        if (!response.ok) return
        const data = await response.json()
        if (!data?.rates) return
        const nextRates: Record<CurrencyCode, number> = {
          GBP: Number(data.rates.GBP) || 1,
          USD: Number(data.rates.USD) || 1,
          EUR: Number(data.rates.EUR) || 1
        }
        const snapshotNext: RateSnapshot = { timestamp: Date.now(), rates: nextRates }
        setRates(nextRates)
        storeRates(snapshotNext)
      } catch {
        // Keep cached rates if fetch fails.
      }
    }

    loadRates()
    return () => controller.abort()
  }, [])

  const setCurrency = useCallback((value: CurrencyCode) => {
    setCurrencyState(value)
    storeCurrency(value)
  }, [])

  const getRate = useCallback(
    (fromCurrency: CurrencyCode, toCurrency: CurrencyCode): number => {
      if (fromCurrency === toCurrency) return 1
      const fromRate = rates[fromCurrency]
      const toRate = rates[toCurrency]
      if (!fromRate || !toRate) return 1
      return toRate / fromRate
    },
    [rates]
  )

  const formatCurrency = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      const safeValue = Number.isFinite(value) ? value : 0
      const converted = safeValue * getRate(BASE_CURRENCY, currency)
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        ...options
      })
      return formatter.format(converted)
    },
    [currency, getRate]
  )

  const convertToBase = useCallback(
    (value: number, fromCurrency: CurrencyCode = currency): number => {
      const safeValue = Number.isFinite(value) ? value : 0
      if (fromCurrency === BASE_CURRENCY) return safeValue
      const rate = getRate(fromCurrency, BASE_CURRENCY)
      return safeValue * rate
    },
    [currency, getRate]
  )

  const convertFromBase = useCallback(
    (value: number, toCurrency: CurrencyCode = currency): number => {
      const safeValue = Number.isFinite(value) ? value : 0
      if (toCurrency === BASE_CURRENCY) return safeValue
      const rate = getRate(BASE_CURRENCY, toCurrency)
      return safeValue * rate
    },
    [currency, getRate]
  )

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      setCurrency,
      formatCurrency,
      convertToBase,
      convertFromBase
    }),
    [currency, formatCurrency, setCurrency, convertToBase, convertFromBase]
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

const useCurrency = (): CurrencyContextValue => {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}

export { CurrencyProvider, useCurrency }
