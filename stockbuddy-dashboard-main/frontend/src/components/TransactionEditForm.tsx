import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, Loader2 } from 'lucide-react'

type TransactionEditFormProps = {
  intent: string
  initialPayload: any
  onSave: (payload: any) => void
  onCancel: () => void
  vendors?: any[]
  banks?: any[]
  onSearchEvents?: (query: string) => Promise<any[]>
  userCurrency?: 'GBP' | 'USD' | 'EUR'
  formatCurrency?: (value: number) => string
  convertFromBase?: (value: number, toCurrency?: 'GBP' | 'USD' | 'EUR') => number
  convertToBase?: (value: number, fromCurrency?: 'GBP' | 'USD' | 'EUR') => number
}

export const TransactionEditForm: React.FC<TransactionEditFormProps> = ({
  intent,
  initialPayload,
  onSave,
  onCancel,
  vendors = [],
  banks = [],
  onSearchEvents,
  userCurrency = 'GBP',
  formatCurrency,
  convertFromBase,
  convertToBase
}) => {
  const [formData, setFormData] = useState<any>(initialPayload)
  const [eventSearchQuery, setEventSearchQuery] = useState('')
  const [eventSearchResults, setEventSearchResults] = useState<any[]>([])
  const [isSearchingEvents, setIsSearchingEvents] = useState(false)
  const [showEventDropdown, setShowEventDropdown] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const eventSearchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<number | null>(null)
  
  // Display amounts in user's currency (converted from base GBP)
  const [displayCost, setDisplayCost] = useState<number>(0)
  const [displaySelling, setDisplaySelling] = useState<number>(0)
  const [displayAmount, setDisplayAmount] = useState<number>(0)

  console.log('TransactionEditForm rendered:', { intent, initialPayload, formData, vendorsCount: vendors.length, banksCount: banks.length })

  // Parse and normalize search query (copied from FixtureSearch)
  const {
    normalizedQuery,
    normalizedTokens,
    homeTokens,
    awayTokens
  } = useMemo(() => {
    const trimmed = eventSearchQuery.replace(/\s+/g, ' ').trim()
    if (!trimmed) {
      return { normalizedQuery: '', normalizedTokens: [], homeTokens: [], awayTokens: [] }
    }
    const splitRegex = /\s+(?:vs|vs\.|v|v\.|@)\s+/i
    const [homeSegment, awaySegment] = trimmed.split(splitRegex)
    const sanitizeTokens = (segment?: string) =>
      segment
        ? segment
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
        : []
    const homeTokens = sanitizeTokens(homeSegment)
    const awayTokens = sanitizeTokens(awaySegment)
    const normalizedQuery = trimmed
      .replace(/\b(?:vs|vs\.|v|v\.|@)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const normalizedTokens = normalizedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    return { normalizedQuery, normalizedTokens, homeTokens, awayTokens }
  }, [eventSearchQuery])

  // Generate candidate queries (copied from FixtureSearch)
  const candidateQueries = useMemo(() => {
    const candidates = new Set<string>()
    if (normalizedQuery) candidates.add(normalizedQuery)
    if (homeTokens.length) candidates.add(homeTokens.join(' '))
    if (awayTokens.length) candidates.add(awayTokens.join(' '))
    normalizedTokens.forEach(token => candidates.add(token))
    return Array.from(candidates).filter(entry => entry.trim().length)
  }, [awayTokens, homeTokens, normalizedQuery, normalizedTokens])

  // Filter suggestions based on tokens (copied from FixtureSearch)
  const filterSuggestions = useCallback(
    (fixtures: any[]) => {
      if (!normalizedTokens.length) {
        return fixtures
      }
      return fixtures.filter(fixture => {
        const homeName = (fixture.homeTeam?.name || fixture.home_team || '').toLowerCase()
        const awayName = (fixture.awayTeam?.name || fixture.away_team || '').toLowerCase()
        if (homeTokens.length && !homeTokens.every(token => homeName.includes(token))) {
          return false
        }
        if (awayTokens.length && !awayTokens.every(token => awayName.includes(token))) {
          return false
        }
        if (!homeTokens.length && !awayTokens.length) {
          const haystack = `${homeName} ${awayName}`
          return normalizedTokens.every(token => haystack.includes(token))
        }
        return true
      })
    },
    [awayTokens, homeTokens, normalizedTokens]
  )

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (eventSearchRef.current && !eventSearchRef.current.contains(event.target as Node)) {
        setShowEventDropdown(false)
      }
    }

    if (showEventDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showEventDropdown])

  // Handle event search with debounce (full engine from FixtureSearch)
  useEffect(() => {
    if (!candidateQueries.length) {
      setEventSearchResults([])
      setShowEventDropdown(false)
      setIsSearchingEvents(false)
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
      return
    }

    if (!onSearchEvents) return

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }

    debounceRef.current = window.setTimeout(async () => {
      setIsSearchingEvents(true)
      try {
        // Search with multiple candidate queries (up to 4)
        const queries = candidateQueries.slice(0, 4)
        const responses = await Promise.all(
          queries.map(candidate => onSearchEvents(candidate))
        )
        
        // Collect and deduplicate results
        const collected: any[] = []
        const seen = new Set<string>()
        
        responses.forEach(results => {
          if (results && Array.isArray(results)) {
            results.forEach(item => {
              const key = item.id ?? `${item.home_team}-${item.away_team}-${item.date}`
              if (!seen.has(key)) {
                seen.add(key)
                collected.push(item)
              }
            })
          }
        })
        
        // Filter results based on tokens
        const filtered = filterSuggestions(collected)
        setEventSearchResults(filtered)
        setShowEventDropdown(filtered.length > 0)
      } catch (error) {
        console.error('Error searching events:', error)
        setEventSearchResults([])
        setShowEventDropdown(false)
      } finally {
        setIsSearchingEvents(false)
      }
    }, 350) // Debounce 350ms (same as FixtureSearch)
    
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [candidateQueries, onSearchEvents, filterSuggestions])
  
  useEffect(() => {
    // When initialPayload changes, update formData and search for event if needed
    const updatedPayload = { ...initialPayload }
    
    // If we have bank_account_id but no bank_name, try to find it from banks
    if (updatedPayload.bank_account_id && !updatedPayload.bank_name && banks.length > 0) {
      const bank = banks.find(b => b.id === updatedPayload.bank_account_id)
      if (bank) {
        updatedPayload.bank_name = bank.name
      }
    }
    
    // Convert amounts from base currency (GBP) to user's display currency
    if (convertFromBase) {
      if (updatedPayload.cost) {
        setDisplayCost(convertFromBase(updatedPayload.cost, userCurrency))
      }
      if (updatedPayload.selling) {
        setDisplaySelling(convertFromBase(updatedPayload.selling, userCurrency))
      }
      if (updatedPayload.amount) {
        setDisplayAmount(convertFromBase(updatedPayload.amount, userCurrency))
      }
    } else {
      // No conversion function - use values as-is
      setDisplayCost(updatedPayload.cost || 0)
      setDisplaySelling(updatedPayload.selling || 0)
      setDisplayAmount(updatedPayload.amount || 0)
    }
    
    // If we have a game_id but it's not a valid UUID (it's a search term), search for it
    if (updatedPayload.game_id && typeof updatedPayload.game_id === 'string' && !updatedPayload.game_id.match(/^[0-9a-f-]{36}$/i)) {
      // game_id is a search term, not an actual ID - search for it
      const searchTerm = updatedPayload.game_id
      console.log('🔍 Initial game_id is a search term, searching for:', searchTerm)
      // Don't set the search query - keep it empty so user sees clean input
      setEventSearchQuery('')
      
      // Trigger search automatically and auto-select first result
      if (onSearchEvents) {
        onSearchEvents(searchTerm).then(results => {
          if (results && results.length > 0) {
            // Auto-select first result - inline the logic to avoid dependency issues
            const firstEvent = results[0]
            const homeTeam = firstEvent.homeTeam?.name || firstEvent.home_team || ''
            const awayTeam = firstEvent.awayTeam?.name || firstEvent.away_team || ''
            const homeLogo = firstEvent.homeTeam?.logo || firstEvent.home_logo || null
            const awayLogo = firstEvent.awayTeam?.logo || firstEvent.away_logo || null
            
            console.log('✅ Auto-selecting first event:', `${homeTeam} vs ${awayTeam}`)
            
            setFormData((prev: any) => ({
              ...prev,
              game_id: firstEvent.id,
              game_name: `${homeTeam} vs ${awayTeam}`,
              home_logo: homeLogo,
              away_logo: awayLogo,
              game_date: firstEvent.date
            }))
            
            // Keep search input empty - user will see the selected event in the display area
          } else {
            console.log('❌ No events found for search term:', searchTerm)
          }
        }).catch(error => {
          console.error('Error auto-searching event:', error)
        })
      }
    } else if (updatedPayload.game_id && updatedPayload.game_id.match(/^[0-9a-f-]{36}$/i)) {
      // It's already a valid UUID - clear the search input
      setEventSearchQuery('')
    }
    
    setFormData(updatedPayload)
  }, [initialPayload, banks, onSearchEvents, convertFromBase, userCurrency])

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: value
    }))
  }
  
  // Predefined area/section options
  const areaOptions = [
    'Shortside Upper',
    'Shortside Lower',
    'Shortside Hospitality',
    'Longside Hospitality',
    'Longside Upper',
    'Longside Upper Central',
    'Longside Lower',
    'Longside Lower Central'
  ]
  
  // Handle vendor selection - update both name and ID
  const handleVendorChange = (nameField: string, idField: string, vendorId: string) => {
    const vendor = vendors.find(v => v.id === vendorId)
    setFormData((prev: any) => ({
      ...prev,
      [nameField]: vendor?.name || '',
      [idField]: vendorId
    }))
  }
  
  // Handle event selection - update both game_id and game_name
  const handleEventChange = (event: any) => {
    const homeTeam = event.homeTeam?.name || event.home_team || ''
    const awayTeam = event.awayTeam?.name || event.away_team || ''
    const homeLogo = event.homeTeam?.logo || event.home_logo || null
    const awayLogo = event.awayTeam?.logo || event.away_logo || null
    
    setFormData((prev: any) => ({
      ...prev,
      game_id: event.id,
      game_name: `${homeTeam} vs ${awayTeam}`,
      home_logo: homeLogo,
      away_logo: awayLogo,
      game_date: event.date
    }))
    
    // Update search query to show selected event
    setEventSearchQuery(`${homeTeam} vs ${awayTeam}`)
    
    // Close dropdown
    setShowEventDropdown(false)
  }
  
  // Handle bank selection - update both bank_account_id and bank_name
  const handleBankChange = (bankId: string) => {
    const bank = banks.find(b => b.id === bankId)
    setFormData((prev: any) => ({
      ...prev,
      bank_account_id: bankId,
      bank_name: bank?.name || ''
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate required fields
    const errors: string[] = []
    
    if (intent === 'purchase') {
      if (!formData.game_id) errors.push('Event/Game is required')
      if (!formData.quantity || formData.quantity < 1) errors.push('Quantity must be at least 1')
      if (!formData.area) errors.push('Area/Section is required')
      if (!formData.bought_from_vendor_id) errors.push('Bought From is required')
      if (displayCost <= 0) errors.push('Total Cost must be greater than 0')
    } else if (intent === 'order') {
      if (!formData.game_id) errors.push('Event/Game is required')
      if (!formData.quantity || formData.quantity < 1) errors.push('Quantity must be at least 1')
      if (!formData.area) errors.push('Area/Section is required')
      if (!formData.sold_to_vendor_id) errors.push('Sold To is required')
      if (displaySelling <= 0) errors.push('Selling Price must be greater than 0')
    } else if (intent === 'manual_transaction') {
      if (displayAmount <= 0) errors.push('Amount must be greater than 0')
      if (!formData.vendor_id) errors.push('Vendor/Counterparty is required')
      if (formData.mode === 'standard' && !formData.bank_account_id) errors.push('Bank Account is required')
    } else if (intent === 'create_counterparty') {
      if (!formData.name) errors.push('Name is required')
      if (!formData.phone) errors.push('Phone is required')
    }
    
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    
    setValidationErrors([])
    
    // Convert display amounts back to base currency (GBP) before saving
    const payloadToSave = { ...formData }
    if (convertToBase) {
      if (displayCost > 0) {
        payloadToSave.cost = convertToBase(displayCost, userCurrency)
      }
      if (displaySelling > 0) {
        payloadToSave.selling = convertToBase(displaySelling, userCurrency)
      }
      if (displayAmount > 0) {
        payloadToSave.amount = convertToBase(displayAmount, userCurrency)
      }
    } else {
      // No conversion - use display values as-is
      payloadToSave.cost = displayCost
      payloadToSave.selling = displaySelling
      payloadToSave.amount = displayAmount
    }
    
    console.log('Form submitted with data (converted to base currency):', payloadToSave)
    onSave(payloadToSave)
  }
  
  // Get currency symbol for display
  const getCurrencySymbol = () => {
    switch (userCurrency) {
      case 'USD': return '$'
      case 'EUR': return '€'
      case 'GBP':
      default: return '£'
    }
  }

  // Render form based on intent type
  const renderPurchaseForm = () => (
    <div className="space-y-4">
      <div className="relative" ref={eventSearchRef}>
        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-2">
          Event/Game *
        </label>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-600">
          <Search className="h-5 w-5 text-blue-600" />
          <input
            type="text"
            value={eventSearchQuery}
            onChange={(e) => setEventSearchQuery(e.target.value)}
            onFocus={() => {
              if (eventSearchResults.length > 0) {
                setShowEventDropdown(true)
              }
            }}
            placeholder="Search fixtures by club or matchup..."
            className="flex-1 border-none bg-transparent text-sm text-slate-700 outline-none"
          />
          {isSearchingEvents && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>
        {formData.game_name && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-600">
            {formData.home_logo && (
              <img
                src={formData.home_logo}
                alt="Home team logo"
                className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            )}
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{formData.game_name}</p>
              {formData.game_date && (
                <p className="text-xs text-slate-500">
                  {new Date(formData.game_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
            {formData.away_logo && (
              <img
                src={formData.away_logo}
                alt="Away team logo"
                className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            )}
          </div>
        )}
        {showEventDropdown && eventSearchResults.length > 0 && (
          <ul className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
            {eventSearchResults.map(event => {
              const homeTeam = event.homeTeam?.name || event.home_team || ''
              const awayTeam = event.awayTeam?.name || event.away_team || ''
              const homeLogo = event.homeTeam?.logo || event.home_logo || null
              const awayLogo = event.awayTeam?.logo || event.away_logo || null
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleEventChange(event)
                    }}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                  >
                    <div className="flex items-center gap-3">
                      {homeLogo ? (
                        <img
                          src={homeLogo}
                          alt={`${homeTeam} logo`}
                          className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          {homeTeam.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">{homeTeam} vs {awayTeam}</p>
                        {event.date && (
                          <p className="text-xs text-slate-500">
                            {new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>
                    {awayLogo ? (
                      <img
                        src={awayLogo}
                        alt={`${awayTeam} logo`}
                        className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        {awayTeam.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantity *
          </label>
          <input
            type="number"
            value={formData.quantity || ''}
            onChange={(e) => handleChange('quantity', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Area/Section * <span className="text-xs text-gray-500">(Select from list or type custom)</span></label>
        <input type="text" list="area-options" value={formData.area || ''} onChange={(e) => handleChange('area', e.target.value)} placeholder="Select or type custom area..." className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /><datalist id="area-options">{areaOptions.map(area => (<option key={area} value={area} />))}</datalist>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Block
          </label>
          <input
            type="text"
            value={formData.block || ''}
            onChange={(e) => handleChange('block', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Row
          </label>
          <input
            type="text"
            value={formData.row || ''}
            onChange={(e) => handleChange('row', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seats
          </label>
          <input
            type="text"
            value={formData.seats || ''}
            onChange={(e) => handleChange('seats', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bought From *
          </label>
          {vendors.length > 0 ? (
            <select
              value={formData.bought_from_vendor_id || ''}
              onChange={(e) => handleVendorChange('bought_from', 'bought_from_vendor_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select vendor...</option>
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.bought_from || ''}
              onChange={(e) => handleChange('bought_from', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Cost ({getCurrencySymbol()}) *
          </label>
          <input
            type="number"
            value={displayCost || ''}
            onChange={(e) => setDisplayCost(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
    </div>
  )

  const renderOrderForm = () => (
    <div className="space-y-4">
      <div className="relative" ref={eventSearchRef}>
        <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-2">
          Event/Game *
        </label>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-600">
          <Search className="h-5 w-5 text-blue-600" />
          <input
            type="text"
            value={eventSearchQuery}
            onChange={(e) => setEventSearchQuery(e.target.value)}
            onFocus={() => {
              if (eventSearchResults.length > 0) {
                setShowEventDropdown(true)
              }
            }}
            placeholder="Search fixtures by club or matchup..."
            className="flex-1 border-none bg-transparent text-sm text-slate-700 outline-none"
          />
          {isSearchingEvents && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>
        {formData.game_name && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-600">
            {formData.home_logo && (
              <img
                src={formData.home_logo}
                alt="Home team logo"
                className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            )}
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{formData.game_name}</p>
              {formData.game_date && (
                <p className="text-xs text-slate-500">
                  {new Date(formData.game_date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
            {formData.away_logo && (
              <img
                src={formData.away_logo}
                alt="Away team logo"
                className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            )}
          </div>
        )}
        {showEventDropdown && eventSearchResults.length > 0 && (
          <ul className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
            {eventSearchResults.map(event => {
              const homeTeam = event.homeTeam?.name || event.home_team || ''
              const awayTeam = event.awayTeam?.name || event.away_team || ''
              const homeLogo = event.homeTeam?.logo || event.home_logo || null
              const awayLogo = event.awayTeam?.logo || event.away_logo || null
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleEventChange(event)
                    }}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                  >
                    <div className="flex items-center gap-3">
                      {homeLogo ? (
                        <img
                          src={homeLogo}
                          alt={`${homeTeam} logo`}
                          className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                          {homeTeam.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900">{homeTeam} vs {awayTeam}</p>
                        {event.date && (
                          <p className="text-xs text-slate-500">
                            {new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>
                    {awayLogo ? (
                      <img
                        src={awayLogo}
                        alt={`${awayTeam} logo`}
                        className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                        {awayTeam.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quantity *
          </label>
          <input
            type="number"
            value={formData.quantity || ''}
            onChange={(e) => handleChange('quantity', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Area/Section * <span className="text-xs text-gray-500">(Select from list or type custom)</span></label>
        <input type="text" list="area-options" value={formData.area || ''} onChange={(e) => handleChange('area', e.target.value)} placeholder="Select or type custom area..." className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /><datalist id="area-options">{areaOptions.map(area => (<option key={area} value={area} />))}</datalist>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Block
          </label>
          <input
            type="text"
            value={formData.block || ''}
            onChange={(e) => handleChange('block', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Row
          </label>
          <input
            type="text"
            value={formData.row || ''}
            onChange={(e) => handleChange('row', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Seats
          </label>
          <input
            type="text"
            value={formData.seats || ''}
            onChange={(e) => handleChange('seats', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sold To *
          </label>
          {vendors.length > 0 ? (
            <select
              value={formData.sold_to_vendor_id || ''}
              onChange={(e) => handleVendorChange('sold_to', 'sold_to_vendor_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select vendor...</option>
              {vendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.sold_to || ''}
              onChange={(e) => handleChange('sold_to', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Selling Price ({getCurrencySymbol()}) *
          </label>
          <input
            type="number"
            value={displaySelling || ''}
            onChange={(e) => setDisplaySelling(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Order Number
        </label>
        <input
          type="text"
          value={formData.order_number || ''}
          onChange={(e) => handleChange('order_number', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
    </div>
  )

  const renderManualTransactionForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount ({getCurrencySymbol()}) *
          </label>
          <input
            type="number"
            value={displayAmount || ''}
            onChange={(e) => setDisplayAmount(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Direction *
          </label>
          <select
            value={formData.direction || 'out'}
            onChange={(e) => handleChange('direction', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="out">Money Out (Payment)</option>
            <option value="in">Money In (Receipt)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category *
        </label>
        <select
          value={formData.category || 'other'}
          onChange={(e) => handleChange('category', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="other">Other</option>
          <option value="shipping">Shipping</option>
          <option value="ai_bot">AI Bot Fee</option>
          <option value="salary">Salary</option>
          <option value="internal">Internal Transfer</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Vendor/Counterparty *
        </label>
        {vendors.length > 0 ? (
          <select
            value={formData.vendor_id || ''}
            onChange={(e) => {
              const vendor = vendors.find(v => v.id === e.target.value)
              setFormData((prev: any) => ({
                ...prev,
                vendor_id: e.target.value,
                vendor_name: vendor?.name || ''
              }))
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select vendor...</option>
            {vendors.map(vendor => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={formData.vendor_name || ''}
            onChange={(e) => handleChange('vendor_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Vendor name"
          />
        )}
      </div>

      {formData.mode === 'standard' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Bank Account *
          </label>
          {banks.length > 0 ? (
            <select
              value={formData.bank_account_id || ''}
              onChange={(e) => handleBankChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select bank account...</option>
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({formatCurrency ? formatCurrency(bank.balance || 0) : `£${(bank.balance || 0).toFixed(2)}`})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.bank_name || formData.bank_account_id || ''}
              onChange={(e) => handleChange('bank_account_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      </div>
    </div>
  )

  const renderCounterpartyForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phone *
        </label>
        <input
          type="tel"
          value={formData.phone || ''}
          onChange={(e) => handleChange('phone', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <input
            type="text"
            value={formData.role || ''}
            onChange={(e) => handleChange('role', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg p-4 border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Transaction Details</h3>
      
      {validationErrors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm font-medium text-red-800 mb-1">Please fix the following errors:</p>
          <ul className="list-disc list-inside text-sm text-red-700">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      
      {intent === 'purchase' && renderPurchaseForm()}
      {intent === 'order' && renderOrderForm()}
      {intent === 'manual_transaction' && renderManualTransactionForm()}
      {intent === 'create_counterparty' && renderCounterpartyForm()}

      <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium transition"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}


