import { apiGet, apiPost, type ApiResult } from './client'
import { analyzeWithLLM, type LLMAnalysisResult } from './llm'

export type ClarificationState = {
  step: number // 1, 2, or 3
  missingFields: string[]
  partialPayload: any
  vendorName?: string // Store extracted vendor name from initial input
  counterpartyMatches?: any[] // Store multiple counterparty matches for disambiguation
  counterpartySearchName?: string // Store the name being searched for
}

export type ChatbotMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  intent?: LLMAnalysisResult
  requiresConfirmation?: boolean
  apiPayload?: any
  apiResponse?: any
  clarificationState?: ClarificationState
  actionButtons?: Array<{
    label: string
    action: 'create_counterparty' | 'retry_name'
    data?: any
  }>
}

export type ChatbotResponse = {
  message: string
  intent: LLMAnalysisResult
  requiresConfirmation: boolean
  payload?: any
  suggestions?: string[]
  clarificationState?: ClarificationState
  actionButtons?: Array<{
    label: string
    action: 'create_counterparty' | 'retry_name'
    data?: any
  }>
}

// Helper function to find counterparty matches (fuzzy matching)
const findCounterpartyMatches = (searchName: string, vendors: any[], counterparties: any[]): any[] => {
  if (!searchName || searchName.trim().length === 0) {
    return []
  }
  
  const normalizedSearch = searchName.toLowerCase().trim()
  const matches: any[] = []
  
  // First, search in counterparties (directory) that are linked to vendors
  counterparties.forEach(counterparty => {
    const counterpartyName = counterparty.name.toLowerCase().trim()
    if (counterpartyName.includes(normalizedSearch) || normalizedSearch.includes(counterpartyName)) {
      // If this counterparty is linked to a vendor, use the vendor's data
      if (counterparty.vendor_id && counterparty.vendor_name) {
        // Find the actual vendor to get balance
        const linkedVendor = vendors.find(v => v.id === counterparty.vendor_id)
        matches.push({
          id: counterparty.vendor_id, // Use vendor ID for transactions
          name: counterparty.vendor_name, // Use vendor name for transactions
          counterpartyName: counterparty.name, // Store counterparty name for display
          type: 'counterparty_linked',
          source: 'Directory (linked to vendor)',
          balance: linkedVendor?.balance || 0,
          phone: counterparty.phone,
          role: counterparty.role
        })
      } else {
        // Counterparty not linked to vendor - skip it (we only want linked ones)
        console.log(`⚠️ Counterparty "${counterparty.name}" is not linked to a vendor, skipping`)
      }
    }
  })
  
  // Then, search in vendors (balances) - only add if not already added via counterparty
  vendors.forEach(vendor => {
    const vendorName = vendor.name.toLowerCase().trim()
    if (vendorName.includes(normalizedSearch) || normalizedSearch.includes(vendorName)) {
      // Check if already added from counterparties
      const alreadyAdded = matches.some(m => m.id === vendor.id)
      if (!alreadyAdded) {
        matches.push({
          id: vendor.id,
          name: vendor.name,
          type: 'vendor',
          source: 'Balances',
          balance: vendor.balance || 0
        })
      }
    }
  })
  
  console.log(`🔍 Found ${matches.length} counterparty matches for "${searchName}":`, matches)
  return matches
}

// Helper function to map names to IDs for all entities
const mapNamesToIds = (payload: any, vendors: any[], banks: any[], events: any[], counterparties: any[] = []): any => {
  const result = { ...payload }
  
  console.log('🔍 mapNamesToIds called with:', { 
    bought_from: result.bought_from, 
    sold_to: result.sold_to,
    vendor_name: result.vendor_name,
    vendorsCount: vendors.length,
    counterpartiesCount: counterparties.length
  })
  
  // Map vendor names to IDs with fuzzy matching for PURCHASE
  if (result.bought_from) {
    const originalName = result.bought_from
    
    // Try exact match first
    let vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === originalName.toLowerCase().trim()
    )
    
    if (vendor) {
      // Exact match found
      result.bought_from_vendor_id = vendor.id
      result.bought_from = vendor.name
      console.log(`✅ Found exact vendor match for "${originalName}":`, vendor.name)
    } else {
      // Try fuzzy matching
      const matches = findCounterpartyMatches(originalName, vendors, counterparties)
      
      if (matches.length === 1) {
        // Single match - use it
        result.bought_from_vendor_id = matches[0].id
        result.bought_from = matches[0].name
        console.log(`✅ Found single fuzzy match for "${originalName}":`, matches[0].name)
      } else if (matches.length > 1) {
        // Multiple matches - need disambiguation
        result.bought_from_vendor_id = ''
        result._counterparty_multiple_matches = matches
        result._counterparty_search_name = originalName
        console.log(`⚠️ Multiple matches for "${originalName}":`, matches.length)
      } else {
        // No matches - counterparty not found
        result.bought_from_vendor_id = ''
        result._counterparty_not_found = originalName
        console.log(`⚠️ No matches for "${originalName}"`)
      }
    }
  }
  
  // Map vendor names to IDs with fuzzy matching for ORDER
  if (result.sold_to) {
    const originalName = result.sold_to
    
    // Try exact match first
    let vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === originalName.toLowerCase().trim()
    )
    
    if (vendor) {
      // Exact match found
      result.sold_to_vendor_id = vendor.id
      result.sold_to = vendor.name
      console.log(`✅ Found exact vendor match for "${originalName}":`, vendor.name)
    } else {
      // Try fuzzy matching
      const matches = findCounterpartyMatches(originalName, vendors, counterparties)
      
      if (matches.length === 1) {
        // Single match - use it
        result.sold_to_vendor_id = matches[0].id
        result.sold_to = matches[0].name
        console.log(`✅ Found single fuzzy match for "${originalName}":`, matches[0].name)
      } else if (matches.length > 1) {
        // Multiple matches - need disambiguation
        result.sold_to_vendor_id = ''
        result._counterparty_multiple_matches = matches
        result._counterparty_search_name = originalName
        console.log(`⚠️ Multiple matches for "${originalName}":`, matches.length)
      } else {
        // No matches - counterparty not found
        result.sold_to_vendor_id = ''
        result._counterparty_not_found = originalName
        console.log(`⚠️ No matches for "${originalName}"`)
      }
    }
  }
  
  // Map vendor for MANUAL TRANSACTION
  if (result.type === 'manual' || result.vendor_name) {
    const originalName = result.vendor_name || ''
    if (originalName) {
      // Try exact match first
      let vendor = vendors.find(v => 
        v.name.toLowerCase().trim() === originalName.toLowerCase().trim()
      )
      
      if (vendor) {
        // Exact match found
        result.vendor_id = vendor.id
        result.vendor_name = vendor.name
        console.log(`✅ Found exact vendor match for manual transaction "${originalName}":`, vendor.name)
      } else {
        // Try fuzzy matching
        const matches = findCounterpartyMatches(originalName, vendors, counterparties)
        
        if (matches.length === 1) {
          // Single match - use it
          result.vendor_id = matches[0].id
          result.vendor_name = matches[0].name
          console.log(`✅ Found single fuzzy match for "${originalName}":`, matches[0].name)
        } else if (matches.length > 1) {
          // Multiple matches - need disambiguation
          result.vendor_id = ''
          result._counterparty_multiple_matches = matches
          result._counterparty_search_name = originalName
          console.log(`⚠️ Multiple matches for "${originalName}":`, matches.length)
        } else {
          // No matches - counterparty not found
          result.vendor_id = ''
          result._counterparty_not_found = originalName
          console.log(`⚠️ No matches for "${originalName}"`)
        }
      }
    } else {
      // No vendor name provided - mark as missing
      result.vendor_id = ''
      result._vendor_missing = true
      console.log(`ℹ️ No vendor name provided`)
    }
  }
  
  // Map game/event names to game_id and store the display name
  if (result.game_id && events.length > 0) {
    // First, try to find the event by ID (in case LLM already provided correct ID)
    let event = events.find(e => e.id === result.game_id)
    
    // If not found by ID, try to find by name/search term
    if (!event) {
      const searchTerm = result.game_id.toLowerCase()
      event = events.find(e => {
        const homeTeam = e.homeTeam?.name?.toLowerCase() || e.home_team?.toLowerCase() || ''
        const awayTeam = e.awayTeam?.name?.toLowerCase() || e.away_team?.toLowerCase() || ''
        const fullName = `${homeTeam} ${awayTeam}`.toLowerCase()
        return fullName.includes(searchTerm) || searchTerm.includes(homeTeam) || searchTerm.includes(awayTeam)
      })
    }
    
    // If event found, set both ID and display name
    if (event) {
      const homeTeam = event.homeTeam?.name || event.home_team || ''
      const awayTeam = event.awayTeam?.name || event.away_team || ''
      result.game_name = `${homeTeam} vs ${awayTeam}`
      result.game_id = event.id
    }
  }
  
  // Map bank names to bank_account_id and store display name
  if (result.mode === 'standard' && result.bank_name && banks.length > 0) {
    const originalBankName = result.bank_name
    const bank = banks.find(b => 
      b.name.toLowerCase().trim() === result.bank_name.toLowerCase().trim()
    )
    
    if (bank) {
      // Exact match found
      result.bank_account_id = bank.id
      result.bank_name = bank.name // Use the actual bank name (proper casing)
      result.bank_balance = bank.balance || 0 // Store balance for display
      console.log(`✅ Found exact bank match for "${originalBankName}":`, bank.name)
    } else {
      // No exact match - mark as not found, don't use fallback
      result.bank_account_id = ''
      result._bank_not_found = originalBankName // Store original name for warning
      console.log(`⚠️ No exact match for "${originalBankName}", bank not found`)
    }
  } else if (result.mode === 'standard' && !result.bank_account_id && !result.bank_name && banks.length > 0) {
    // No bank name provided for standard mode - mark as missing
    result.bank_account_id = ''
    result._bank_missing = true
    console.log(`ℹ️ No bank name provided for standard mode`)
  } else if (result.bank_account_id && banks.length > 0) {
    // Bank ID already exists, find the display name and balance
    const bank = banks.find(b => b.id === result.bank_account_id)
    if (bank) {
      result.bank_name = bank.name
      result.bank_balance = bank.balance || 0
    }
  }
  
  // Set default category for manual transactions if not provided
  if (result.type === 'manual' && !result.category) {
    result.category = 'other'
    console.log(`ℹ️ No category provided for manual transaction, using default: "other"`)
  }
  
  // Ensure notes is empty string instead of undefined
  if (result.notes === undefined || result.notes === null) {
    result.notes = ''
  }
  
  return result
}

// Analyze user input using LLM
export const analyzeInput = async (
  input: string, 
  vendors: any[], 
  banks: any[] = [],
  searchEventsFunc?: (query: string) => Promise<any[]>,
  userCurrency: 'GBP' | 'USD' | 'EUR' = 'GBP',
  convertToBase?: (value: number, fromCurrency?: 'GBP' | 'USD' | 'EUR') => number,
  formatCurrency?: (value: number) => string,
  clarificationState?: ClarificationState,
  counterparties: any[] = [],
  conversationHistory: ChatbotMessage[] = []
): Promise<ChatbotResponse> => {
  try {
    // FIRST: Check if user is responding to counterparty disambiguation BEFORE calling LLM
    if (clarificationState && clarificationState.counterpartyMatches && clarificationState.counterpartyMatches.length > 0) {
      const userResponse = input.trim()
      const matches = clarificationState.counterpartyMatches
      
      console.log('🔍 User is responding to disambiguation, input:', userResponse)
      console.log('🔍 Available matches:', matches.length)
      
      // Check if user selected by number
      const selectedIndex = parseInt(userResponse) - 1
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < matches.length) {
        const selectedMatch = matches[selectedIndex]
        const updatedPayload = { ...clarificationState.partialPayload }
        
        // Determine which field to update based on missing fields
        if (clarificationState.missingFields.includes('bought_from_vendor_id')) {
          updatedPayload.bought_from_vendor_id = selectedMatch.id
          updatedPayload.bought_from = selectedMatch.name
        } else if (clarificationState.missingFields.includes('sold_to_vendor_id')) {
          updatedPayload.sold_to_vendor_id = selectedMatch.id
          updatedPayload.sold_to = selectedMatch.name
        } else if (clarificationState.missingFields.includes('vendor_id')) {
          updatedPayload.vendor_id = selectedMatch.id
          updatedPayload.vendor_name = selectedMatch.name
        }
        
        console.log(`✅ User selected counterparty by number: ${selectedMatch.name}`)
        
        // Create a dummy intent for formatting
        const dummyIntent = {
          intent: clarificationState.partialPayload.bought_from ? 'purchase' : 
                  clarificationState.partialPayload.sold_to ? 'order' : 'manual_transaction',
          confidence: 1,
          apiEndpoint: '',
          method: 'POST',
          payload: updatedPayload,
          missingFields: [],
          explanation: ''
        } as any
        
        // Clear clarification state and proceed to confirmation
        return {
          message: `Perfect! I'll use "${selectedMatch.name}".\n\n${formatTransactionSummary(dummyIntent, formatCurrency)}\n\nLook good? You can edit anything if needed.`,
          intent: dummyIntent,
          requiresConfirmation: true,
          payload: updatedPayload
        }
      }
      
      // Check if user selected by name (exact match)
      const selectedByName = matches.find((m: any) => 
        m.name.toLowerCase().trim() === userResponse.toLowerCase().trim()
      )
      if (selectedByName) {
        const updatedPayload = { ...clarificationState.partialPayload }
        
        // Determine which field to update based on missing fields
        if (clarificationState.missingFields.includes('bought_from_vendor_id')) {
          updatedPayload.bought_from_vendor_id = selectedByName.id
          updatedPayload.bought_from = selectedByName.name
        } else if (clarificationState.missingFields.includes('sold_to_vendor_id')) {
          updatedPayload.sold_to_vendor_id = selectedByName.id
          updatedPayload.sold_to = selectedByName.name
        } else if (clarificationState.missingFields.includes('vendor_id')) {
          updatedPayload.vendor_id = selectedByName.id
          updatedPayload.vendor_name = selectedByName.name
        }
        
        console.log(`✅ User selected counterparty by name: ${selectedByName.name}`)
        
        // Create a dummy intent for formatting
        const dummyIntent = {
          intent: clarificationState.partialPayload.bought_from ? 'purchase' : 
                  clarificationState.partialPayload.sold_to ? 'order' : 'manual_transaction',
          confidence: 1,
          apiEndpoint: '',
          method: 'POST',
          payload: updatedPayload,
          missingFields: [],
          explanation: ''
        } as any
        
        // Clear clarification state and proceed to confirmation
        return {
          message: `Perfect! I'll use "${selectedByName.name}".\n\n${formatTransactionSummary(dummyIntent, formatCurrency)}\n\nLook good? You can edit anything if needed.`,
          intent: dummyIntent,
          requiresConfirmation: true,
          payload: updatedPayload
        }
      }
      
      // Invalid selection - return error without calling LLM
      console.log('❌ Invalid selection, user input did not match any option')
      return {
        message: `I didn't understand that selection. Please reply with a number (1-${matches.length}) or the exact counterparty name from the list above.`,
        intent: {
          intent: 'unknown',
          confidence: 0,
          apiEndpoint: '',
          method: 'POST',
          payload: {},
          missingFields: [],
          explanation: ''
        },
        requiresConfirmation: false,
        clarificationState
      }
    }
    
    // Get partial payload from clarification state if exists
    const partialPayload = clarificationState?.partialPayload || null
    
    const intent = await analyzeWithLLM(input, vendors, banks, userCurrency, conversationHistory, partialPayload)
    
    // If we have partial payload, merge it with the new intent payload
    if (partialPayload && intent.payload) {
      intent.payload = { ...partialPayload, ...intent.payload }
      console.log('🔄 Merged partial payload with new data:', intent.payload)
    }
    
    // CRITICAL: Validate if all required fields are present and override intent if needed
    // This ensures we show confirmation when data collection is complete
    // BUT: Don't override if we're in a query flow (checking clarificationState for query indicators)
    const isQueryFlow = clarificationState?.partialPayload?.intent === 'query_profit_loss' || 
                        clarificationState?.partialPayload?.intent === 'query_vendor_balance'
    
    let skipVendorValidation = false // Flag to skip vendor validation after completing data collection
    
    if (intent.intent === 'unknown' && intent.payload && Object.keys(intent.payload).length > 0 && !isQueryFlow) {
      console.log('🔍 Checking if unknown intent has complete data for auto-detection...')
      console.log('🔍 Current payload:', intent.payload)
      
      // Check for PURCHASE intent (bought_from indicates purchase)
      if (intent.payload.bought_from || intent.payload.bought_from_vendor_id) {
        const hasQuantity = intent.payload.quantity && intent.payload.quantity > 0
        const hasGame = intent.payload.game_id && intent.payload.game_id.length > 0
        const hasVendor = intent.payload.bought_from && intent.payload.bought_from.length > 0
        const hasCost = intent.payload.cost && intent.payload.cost > 0
        
        console.log('📦 Purchase fields check:', { hasQuantity, hasGame, hasVendor, hasCost })
        
        if (hasQuantity && hasGame && hasVendor && hasCost) {
          console.log('✅ All purchase fields present! Overriding intent to "purchase"')
          intent.intent = 'purchase'
          intent.confidence = 1.0
          intent.apiEndpoint = '/inventory-records/purchases'
          intent.method = 'POST'
          intent.explanation = `Got it! I'll record that you bought ${intent.payload.quantity} tickets from ${intent.payload.bought_from}`
          
          // Clear clarification state since we're done collecting data
          clarificationState = undefined
          
          // Skip vendor validation since we already validated the vendor exists
          skipVendorValidation = true
        }
      }
      
      // Check for ORDER intent (sold_to indicates order)
      else if (intent.payload.sold_to || intent.payload.sold_to_vendor_id || 
               (intent.payload.quantity && intent.payload.selling)) {
        // Check if this looks like an order (has quantity and selling price)
        const hasQuantity = intent.payload.quantity && intent.payload.quantity > 0
        const hasGame = intent.payload.game_id && intent.payload.game_id.length > 0
        const hasVendor = intent.payload.sold_to && intent.payload.sold_to.length > 0
        const hasSelling = intent.payload.selling && intent.payload.selling > 0
        
        console.log('🎫 Order fields check:', { hasQuantity, hasGame, hasVendor, hasSelling })
        
        // Only override to "order" if ALL required fields are present
        if (hasQuantity && hasGame && hasVendor && hasSelling) {
          console.log('✅ All order fields present! Overriding intent to "order"')
          intent.intent = 'order'
          intent.confidence = 1.0
          intent.apiEndpoint = '/inventory-records/orders'
          intent.method = 'POST'
          intent.explanation = `Perfect! I'll log that sale of ${intent.payload.quantity} tickets to ${intent.payload.sold_to}`
          
          // Clear clarification state since we're done collecting data
          clarificationState = undefined
          
          // Skip vendor validation since we already validated the vendor exists
          skipVendorValidation = true
        } else {
          // Missing some fields - keep intent as "unknown" to continue asking
          console.log('⚠️ Order has missing fields, keeping intent as "unknown"')
        }
      }
      
      // Check for MANUAL_TRANSACTION intent (vendor_name + amount + direction indicates manual transaction)
      else if (intent.payload.vendor_name || intent.payload.type === 'manual') {
        const hasVendor = intent.payload.vendor_name && intent.payload.vendor_name.length > 0
        const hasAmount = intent.payload.amount && intent.payload.amount > 0
        const hasDirection = intent.payload.direction && (intent.payload.direction === 'in' || intent.payload.direction === 'out')
        const hasMode = intent.payload.mode && (intent.payload.mode === 'standard' || intent.payload.mode === 'journal_voucher')
        const hasBankIfNeeded = intent.payload.mode !== 'standard' || (intent.payload.bank_account_id || intent.payload.bank_name)
        
        console.log('💰 Manual transaction fields check:', { hasVendor, hasAmount, hasDirection, hasMode, hasBankIfNeeded })
        
        if (hasVendor && hasAmount && hasDirection && hasMode && hasBankIfNeeded) {
          console.log('✅ All manual transaction fields present! Overriding intent to "manual_transaction"')
          intent.intent = 'manual_transaction'
          intent.confidence = 1.0
          intent.apiEndpoint = '/transactions/manual'
          intent.method = 'POST'
          intent.payload.type = 'manual'
          const directionText = intent.payload.direction === 'in' ? 'received from' : 'paid to'
          intent.explanation = `Alright! I'll record that ${intent.payload.currency || 'GBP'} ${intent.payload.amount} ${directionText} ${intent.payload.vendor_name}`
          
          // Clear clarification state since we're done collecting data
          clarificationState = undefined
          
          // Skip vendor validation since we already validated the vendor exists
          skipVendorValidation = true
        }
      }
    }
    
    // Post-process: ensure all IDs are mapped
    if (intent.payload) {
      intent.payload = mapNamesToIds(intent.payload, vendors, banks, [], counterparties)
      
      console.log('🔍 After mapNamesToIds, payload:', intent.payload)
      console.log('🔍 Counterparty flags:', {
        _counterparty_not_found: intent.payload._counterparty_not_found,
        _counterparty_multiple_matches: intent.payload._counterparty_multiple_matches
      })
      
      // Convert currency amounts to base currency (GBP) if needed
      // Use the detected currency from payload, fallback to userCurrency
      const detectedCurrency = (intent.payload.currency || userCurrency) as 'GBP' | 'USD' | 'EUR'
      
      if (convertToBase && detectedCurrency !== 'GBP') {
        console.log(`💱 Converting amounts from ${detectedCurrency} to GBP (base currency)`)
        
        if (intent.payload.cost) {
          const originalCost = intent.payload.cost
          intent.payload.cost = Math.round(convertToBase(intent.payload.cost, detectedCurrency) * 100) / 100
          console.log(`  - Cost: ${detectedCurrency} ${originalCost} → GBP ${intent.payload.cost.toFixed(2)}`)
        }
        if (intent.payload.selling) {
          const originalSelling = intent.payload.selling
          intent.payload.selling = Math.round(convertToBase(intent.payload.selling, detectedCurrency) * 100) / 100
          console.log(`  - Selling: ${detectedCurrency} ${originalSelling} → GBP ${intent.payload.selling.toFixed(2)}`)
        }
        if (intent.payload.amount) {
          const originalAmount = intent.payload.amount
          intent.payload.amount = Math.round(convertToBase(intent.payload.amount, detectedCurrency) * 100) / 100
          console.log(`  - Amount: ${detectedCurrency} ${originalAmount} → GBP ${intent.payload.amount.toFixed(2)}`)
        }
      } else if (detectedCurrency === 'GBP') {
        console.log(`💷 Amounts already in GBP (base currency), no conversion needed`)
        // Round to 2 decimal places even if already in GBP
        if (intent.payload.cost) {
          intent.payload.cost = Math.round(intent.payload.cost * 100) / 100
        }
        if (intent.payload.selling) {
          intent.payload.selling = Math.round(intent.payload.selling * 100) / 100
        }
        if (intent.payload.amount) {
          intent.payload.amount = Math.round(intent.payload.amount * 100) / 100
        }
      }
    }
    
    // Track warnings for missing data
    const warnings: string[] = []
    
    console.log('🔍 Starting analyzeInput for intent:', intent.intent)
    console.log('🔍 Initial payload:', intent.payload)
    
    // Set default area if not provided (for purchase and order)
    if ((intent.intent === 'purchase' || intent.intent === 'order') && !intent.payload.area) {
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
      // Select a random area from the list
      const randomArea = areaOptions[Math.floor(Math.random() * areaOptions.length)]
      intent.payload.area = randomArea
      console.log('ℹ️ No area mentioned, setting random default:', randomArea)
    }
    
    // If this is a purchase or order, try to auto-detect event from user input
    if ((intent.intent === 'purchase' || intent.intent === 'order')) {
      // First check if LLM already extracted a game_id
      const llmExtractedGameId = intent.payload.game_id
      console.log('🔍 LLM extracted game_id:', llmExtractedGameId)
      
      // If LLM extracted a game_id, use it as the search query
      if (llmExtractedGameId && typeof llmExtractedGameId === 'string' && llmExtractedGameId.length > 2) {
        console.log('🔍 Using LLM-extracted game_id as search query:', llmExtractedGameId)
        
        // Use the provided search function (same as TransactionEditForm)
        if (searchEventsFunc) {
          try {
            const results = await searchEventsFunc(llmExtractedGameId)
            console.log('🔍 Search results:', results)
            
            if (results && results.length > 0) {
              // Event found - use first result (most similar match)
              const firstEvent = results[0]
              const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
              console.log('✅ Event found using LLM extraction:', eventName)
              
              intent.payload.game_id = firstEvent.id.toString()
              intent.payload.game_name = eventName
            } else {
              // No results - try broader search with just first word
              console.log('⚠️ No exact match, trying broader search for:', llmExtractedGameId)
              const firstWord = llmExtractedGameId.split(/\s+/)[0]
              if (firstWord && firstWord.length >= 3) {
                const broadResults = await searchEventsFunc(firstWord)
                if (broadResults && broadResults.length > 0) {
                  const firstEvent = broadResults[0]
                  const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
                  console.log('✅ Using similar event from broad search:', eventName)
                  intent.payload.game_id = firstEvent.id.toString()
                  intent.payload.game_name = eventName
                } else {
                  // Still no results - leave empty
                  console.log('⚠️ No events found even with broad search')
                  intent.payload.game_id = ''
                  intent.payload.game_name = ''
                }
              } else {
                intent.payload.game_id = ''
                intent.payload.game_name = ''
              }
            }
          } catch (error) {
            console.error('Error searching with LLM-extracted game_id:', error)
            intent.payload.game_id = ''
            intent.payload.game_name = ''
          }
        } else {
          console.log('⚠️ No search function provided')
          intent.payload.game_id = ''
          intent.payload.game_name = ''
        }
      } else {
        // LLM didn't extract game_id, try regex-based extraction and use searchEventsFunc
        console.log('🔍 LLM did not extract game_id, attempting regex extraction from input:', input)
        
        // Extract search query using regex patterns
        let searchQuery = ''
        
        // Pattern 1: "Team1 vs Team2" or "Team1 v Team2"
        const vsPattern = input.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:vs?\.?|versus)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i)
        if (vsPattern) {
          searchQuery = `${vsPattern[1].trim()} vs ${vsPattern[2].trim()}`
        }
        
        // Pattern 2: "for [Team/Event]"
        if (!searchQuery) {
          const forPattern = input.match(/\bfor\s+([A-Z][a-z]+(?:\s+(?:vs?\.?|versus)\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\b/i)
          if (forPattern) {
            searchQuery = forPattern[1].trim()
          }
        }
        
        // Pattern 3: Extract team names
        if (!searchQuery) {
          const cleaned = input
            .replace(/\b(bought|sold|purchase|order|tickets?|from|to|at|for|£|\d+|each)\b/gi, ' ')
            .replace(/\bvs?\b/gi, ' ')
            .trim()
          const teamWords = cleaned.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g)
          if (teamWords && teamWords.length > 0) {
            searchQuery = teamWords.slice(0, 2).join(' ')
          }
        }
        
        if (searchQuery && searchQuery.length >= 3 && searchEventsFunc) {
          console.log('🔍 Using regex-extracted query with searchEventsFunc:', searchQuery)
          try {
            const results = await searchEventsFunc(searchQuery)
            console.log('🔍 Search results:', results)
            
            if (results && results.length > 0) {
              // Event found - use first result (most similar match)
              const firstEvent = results[0]
              const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
              console.log('✅ Event found using regex extraction:', eventName)
              intent.payload.game_id = firstEvent.id.toString()
              intent.payload.game_name = eventName
            } else {
              // No results - try broader search with just first word
              console.log('⚠️ No exact match, trying broader search for:', searchQuery)
              const firstWord = searchQuery.split(/\s+/)[0]
              if (firstWord && firstWord.length >= 3) {
                const broadResults = await searchEventsFunc(firstWord)
                if (broadResults && broadResults.length > 0) {
                  const firstEvent = broadResults[0]
                  const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
                  console.log('✅ Using similar event from broad search:', eventName)
                  intent.payload.game_id = firstEvent.id.toString()
                  intent.payload.game_name = eventName
                } else {
                  // Still no results - leave empty
                  console.log('⚠️ No events found even with broad search')
                  intent.payload.game_id = ''
                  intent.payload.game_name = ''
                }
              } else {
                intent.payload.game_id = ''
                intent.payload.game_name = ''
              }
            }
          } catch (error) {
            console.error('Error searching with regex-extracted query:', error)
            intent.payload.game_id = ''
            intent.payload.game_name = ''
          }
        } else {
          // No search query could be extracted - don't show warning, just leave empty
          console.log('ℹ️ No search query extracted from regex, leaving fields empty')
          intent.payload.game_id = ''
          intent.payload.game_name = ''
        }
      }
    }
    
    // Validate vendor IDs and add warnings
    if (intent.intent === 'purchase' && !skipVendorValidation) {
      // Handle clarification for counterparty creation (purchase)
      if (clarificationState && clarificationState.counterpartySearchName && !clarificationState.counterpartyMatches) {
        const userResponse = input.trim()
        
        // Check if user provided new name
        if (clarificationState.step === 2 && clarificationState.missingFields.includes('bought_from')) {
          const newName = userResponse
          const newPayload = { ...clarificationState.partialPayload, bought_from: newName }
          const mappedPayload = mapNamesToIds(newPayload, vendors, banks, [], counterparties)
          
          if (mappedPayload._counterparty_not_found) {
            delete mappedPayload._counterparty_not_found
            return {
              message: `❌ I still couldn't find a counterparty named "${newName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: false,
              clarificationState: {
                step: 1,
                missingFields: ['bought_from_vendor_id'],
                partialPayload: mappedPayload,
                counterpartySearchName: newName
              },
              actionButtons: [
                {
                  label: `Create "${newName}"`,
                  action: 'create_counterparty',
                  data: { name: newName }
                }
              ]
            }
          } else if (mappedPayload._counterparty_multiple_matches) {
            // Handle multiple matches
            const matches = mappedPayload._counterparty_multiple_matches
            delete mappedPayload._counterparty_multiple_matches
            delete mappedPayload._counterparty_search_name
            
            let message = `I found multiple counterparties matching "${newName}":\n\n`
            matches.forEach((match: any, index: number) => {
              message += `${index + 1}. ${match.name}`
              if (match.counterpartyName && match.counterpartyName !== match.name) {
                message += ` (Contact: ${match.counterpartyName})`
              }
              if (match.balance !== undefined) {
                message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
              }
              if (match.phone) {
                message += ` - ${match.phone}`
              }
              if (match.source) {
                message += ` [${match.source}]`
              }
              message += `\n`
            })
            message += `\nWhich one did you mean? Please reply with the number or the full name.`
            
            return {
              message,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: false,
              clarificationState: {
                step: 1,
                missingFields: ['bought_from_vendor_id'],
                partialPayload: mappedPayload,
                counterpartyMatches: matches,
                counterpartySearchName: newName
              }
            }
          } else {
            // Found match - proceed to confirmation
            return {
              message: `Great! I'll use "${mappedPayload.bought_from}".\n\n${formatTransactionSummary({ ...intent, payload: mappedPayload }, formatCurrency)}\n\nPlease review and edit if needed.`,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: true,
              payload: mappedPayload
            }
          }
        }
      }
      
      // Handle multiple counterparty matches
      if (intent.payload._counterparty_multiple_matches) {
        const matches = intent.payload._counterparty_multiple_matches
        const searchName = intent.payload._counterparty_search_name
        delete intent.payload._counterparty_multiple_matches
        delete intent.payload._counterparty_search_name
        
        // Build disambiguation message
        let message = `I found multiple counterparties matching "${searchName}":\n\n`
        matches.forEach((match: any, index: number) => {
          message += `${index + 1}. ${match.name}`
          
          // Show counterparty name if it's linked
          if (match.counterpartyName && match.counterpartyName !== match.name) {
            message += ` (Contact: ${match.counterpartyName})`
          }
          
          if (match.balance !== undefined) {
            message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
          }
          
          if (match.phone) {
            message += ` - ${match.phone}`
          }
          
          if (match.source) {
            message += ` [${match.source}]`
          }
          
          message += `\n`
        })
        message += `\nWhich one did you mean? Please reply with the number or the full name.`
        
        // Store matches in clarification state
        return {
          message,
          intent,
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['bought_from_vendor_id'],
            partialPayload: intent.payload,
            counterpartyMatches: matches,
            counterpartySearchName: searchName
          }
        }
      }
      
      // Handle counterparty not found
      if (intent.payload._counterparty_not_found) {
        const counterpartyName = intent.payload._counterparty_not_found
        delete intent.payload._counterparty_not_found
        
        // Show message with action button to create counterparty
        const message = `❌ I couldn't find a counterparty named "${counterpartyName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`
        
        return {
          message,
          intent,
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['bought_from_vendor_id'],
            partialPayload: intent.payload,
            counterpartySearchName: counterpartyName
          },
          actionButtons: [
            {
              label: `Create "${counterpartyName}"`,
              action: 'create_counterparty',
              data: { name: counterpartyName }
            }
          ]
        }
      }
    }
    
    if (intent.intent === 'order' && !skipVendorValidation) {
      // Handle clarification for counterparty creation (order)
      if (clarificationState && clarificationState.counterpartySearchName && !clarificationState.counterpartyMatches) {
        const userResponse = input.trim()
        
        // Check if user provided new name
        if (clarificationState.step === 2 && clarificationState.missingFields.includes('sold_to')) {
          const newName = userResponse
          const newPayload = { ...clarificationState.partialPayload, sold_to: newName }
          const mappedPayload = mapNamesToIds(newPayload, vendors, banks, [], counterparties)
          
          if (mappedPayload._counterparty_not_found) {
            delete mappedPayload._counterparty_not_found
            return {
              message: `❌ I still couldn't find a counterparty named "${newName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: false,
              clarificationState: {
                step: 1,
                missingFields: ['sold_to_vendor_id'],
                partialPayload: mappedPayload,
                counterpartySearchName: newName
              },
              actionButtons: [
                {
                  label: `Create "${newName}"`,
                  action: 'create_counterparty',
                  data: { name: newName }
                }
              ]
            }
          } else if (mappedPayload._counterparty_multiple_matches) {
            // Handle multiple matches
            const matches = mappedPayload._counterparty_multiple_matches
            delete mappedPayload._counterparty_multiple_matches
            delete mappedPayload._counterparty_search_name
            
            let message = `I found multiple counterparties matching "${newName}":\n\n`
            matches.forEach((match: any, index: number) => {
              message += `${index + 1}. ${match.name}`
              if (match.counterpartyName && match.counterpartyName !== match.name) {
                message += ` (Contact: ${match.counterpartyName})`
              }
              if (match.balance !== undefined) {
                message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
              }
              if (match.phone) {
                message += ` - ${match.phone}`
              }
              if (match.source) {
                message += ` [${match.source}]`
              }
              message += `\n`
            })
            message += `\nWhich one did you mean? Please reply with the number or the full name.`
            
            return {
              message,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: false,
              clarificationState: {
                step: 1,
                missingFields: ['sold_to_vendor_id'],
                partialPayload: mappedPayload,
                counterpartyMatches: matches,
                counterpartySearchName: newName
              }
            }
          } else {
            // Found match - proceed to confirmation
            return {
              message: `Great! I'll use "${mappedPayload.sold_to}".\n\n${formatTransactionSummary({ ...intent, payload: mappedPayload }, formatCurrency)}\n\nPlease review and edit if needed.`,
              intent: { ...intent, payload: mappedPayload },
              requiresConfirmation: true,
              payload: mappedPayload
            }
          }
        }
      }
      
      // Handle multiple counterparty matches
      if (intent.payload._counterparty_multiple_matches) {
        const matches = intent.payload._counterparty_multiple_matches
        const searchName = intent.payload._counterparty_search_name
        delete intent.payload._counterparty_multiple_matches
        delete intent.payload._counterparty_search_name
        
        // Build disambiguation message
        let message = `I found multiple counterparties matching "${searchName}":\n\n`
        matches.forEach((match: any, index: number) => {
          message += `${index + 1}. ${match.name}`
          
          // Show counterparty name if it's linked
          if (match.counterpartyName && match.counterpartyName !== match.name) {
            message += ` (Contact: ${match.counterpartyName})`
          }
          
          if (match.balance !== undefined) {
            message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
          }
          
          if (match.phone) {
            message += ` - ${match.phone}`
          }
          
          if (match.source) {
            message += ` [${match.source}]`
          }
          
          message += `\n`
        })
        message += `\nWhich one did you mean? Please reply with the number or the full name.`
        
        // Store matches in clarification state
        return {
          message,
          intent,
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['sold_to_vendor_id'],
            partialPayload: intent.payload,
            counterpartyMatches: matches,
            counterpartySearchName: searchName
          }
        }
      }
      
      // Handle counterparty not found
      if (intent.payload._counterparty_not_found) {
        const counterpartyName = intent.payload._counterparty_not_found
        delete intent.payload._counterparty_not_found
        
        // Show message with action button to create counterparty
        const message = `❌ I couldn't find a counterparty named "${counterpartyName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`
        
        return {
          message,
          intent,
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['sold_to_vendor_id'],
            partialPayload: intent.payload,
            counterpartySearchName: counterpartyName
          },
          actionButtons: [
            {
              label: `Create "${counterpartyName}"`,
              action: 'create_counterparty',
              data: { name: counterpartyName }
            }
          ]
        }
      }
    }
    
    if ((intent.intent === 'manual_transaction' || (clarificationState && clarificationState.partialPayload.type === 'manual')) && !skipVendorValidation) {
      // Handle step-by-step clarification flow
      let currentPayload = intent.payload
      let currentStep = 1
      let allMissingFields: string[] = []
      
      // If we're in a clarification flow, merge with previous data
      if (clarificationState) {
        console.log('📝 Continuing clarification flow, step:', clarificationState.step)
        console.log('📝 Previous payload:', clarificationState.partialPayload)
        console.log('📝 New intent:', intent.intent)
        console.log('📝 New payload:', intent.payload)
        
        // Check if user is responding to counterparty disambiguation
        if (clarificationState.counterpartyMatches && clarificationState.counterpartyMatches.length > 0) {
          const userResponse = input.trim()
          const matches = clarificationState.counterpartyMatches
          
          // Check if user selected by number
          const selectedIndex = parseInt(userResponse) - 1
          if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < matches.length) {
            const selectedMatch = matches[selectedIndex]
            currentPayload = { ...clarificationState.partialPayload }
            currentPayload.vendor_id = selectedMatch.id
            currentPayload.vendor_name = selectedMatch.name
            console.log(`✅ User selected counterparty by number: ${selectedMatch.name}`)
            
            // Clear clarification state and proceed to confirmation
            return {
              message: `Great! I'll use "${selectedMatch.name}".\n\n${formatTransactionSummary({ ...intent, payload: currentPayload }, formatCurrency)}\n\nPlease review and edit if needed.`,
              intent: { ...intent, payload: currentPayload },
              requiresConfirmation: true,
              payload: currentPayload
            }
          }
          
          // Check if user selected by name
          const selectedByName = matches.find((m: any) => 
            m.name.toLowerCase().trim() === userResponse.toLowerCase().trim()
          )
          if (selectedByName) {
            currentPayload = { ...clarificationState.partialPayload }
            currentPayload.vendor_id = selectedByName.id
            currentPayload.vendor_name = selectedByName.name
            console.log(`✅ User selected counterparty by name: ${selectedByName.name}`)
            
            // Clear clarification state and proceed to confirmation
            return {
              message: `Great! I'll use "${selectedByName.name}".\n\n${formatTransactionSummary({ ...intent, payload: currentPayload }, formatCurrency)}\n\nPlease review and edit if needed.`,
              intent: { ...intent, payload: currentPayload },
              requiresConfirmation: true,
              payload: currentPayload
            }
          }
          
          // Invalid selection
          return {
            message: `I didn't understand that selection. Please reply with a number (1-${matches.length}) or the full name.`,
            intent,
            requiresConfirmation: false,
            clarificationState
          }
        }
        
        // Check if user is responding to "create new counterparty" question
        if (clarificationState.counterpartySearchName && !clarificationState.counterpartyMatches) {
          const userResponse = input.trim()
          
          // Check if user provided new name
          if (clarificationState.step === 2 && clarificationState.missingFields.includes('vendor_name')) {
            const newName = userResponse
            const newPayload = { ...clarificationState.partialPayload, vendor_name: newName, type: 'manual' }
            const mappedPayload = mapNamesToIds(newPayload, vendors, banks, [], counterparties)
            
            if (mappedPayload._counterparty_not_found) {
              delete mappedPayload._counterparty_not_found
              return {
                message: `❌ I still couldn't find a counterparty named "${newName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`,
                intent: { ...intent, payload: mappedPayload },
                requiresConfirmation: false,
                clarificationState: {
                  step: 1,
                  missingFields: ['vendor_id'],
                  partialPayload: mappedPayload,
                  counterpartySearchName: newName
                },
                actionButtons: [
                  {
                    label: `Create "${newName}"`,
                    action: 'create_counterparty',
                    data: { name: newName }
                  }
                ]
              }
            } else if (mappedPayload._counterparty_multiple_matches) {
              // Handle multiple matches
              const matches = mappedPayload._counterparty_multiple_matches
              delete mappedPayload._counterparty_multiple_matches
              delete mappedPayload._counterparty_search_name
              
              let message = `I found multiple counterparties matching "${newName}":\n\n`
              matches.forEach((match: any, index: number) => {
                message += `${index + 1}. ${match.name}`
                if (match.counterpartyName && match.counterpartyName !== match.name) {
                  message += ` (Contact: ${match.counterpartyName})`
                }
                if (match.balance !== undefined) {
                  message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
                }
                if (match.phone) {
                  message += ` - ${match.phone}`
                }
                if (match.source) {
                  message += ` [${match.source}]`
                }
                message += `\n`
              })
              message += `\nWhich one did you mean? Please reply with the number or the full name.`
              
              return {
                message,
                intent: { ...intent, payload: mappedPayload },
                requiresConfirmation: false,
                clarificationState: {
                  step: 1,
                  missingFields: ['vendor_id'],
                  partialPayload: mappedPayload,
                  counterpartyMatches: matches,
                  counterpartySearchName: newName
                }
              }
            } else {
              // Found match - continue with transaction flow
              currentPayload = mappedPayload
            }
          }
        }
        
        // Start with previous payload
        currentPayload = { ...clarificationState.partialPayload }
        currentStep = clarificationState.step
        
        // Update with newly extracted data from user's answer
        // Only update if the new value is valid
        if (intent.payload.amount && intent.payload.amount > 0) {
          currentPayload.amount = intent.payload.amount
          if (intent.payload.currency) {
            currentPayload.currency = intent.payload.currency
          }
          console.log('📝 Updated amount:', currentPayload.amount, currentPayload.currency)
        }
        
        if (intent.payload.direction && (intent.payload.direction === 'in' || intent.payload.direction === 'out')) {
          currentPayload.direction = intent.payload.direction
          console.log('📝 Updated direction:', currentPayload.direction)
        }
        
        if (intent.payload.mode && (intent.payload.mode === 'standard' || intent.payload.mode === 'journal_voucher')) {
          currentPayload.mode = intent.payload.mode
          console.log('📝 Updated mode:', currentPayload.mode)
        }
        
        if (intent.payload.bank_name) {
          currentPayload.bank_name = intent.payload.bank_name
          console.log('📝 Updated bank_name:', currentPayload.bank_name)
        }
        
        // If mode is standard but no bank specified, use first bank
        if (currentPayload.mode === 'standard' && !currentPayload.bank_name && banks.length > 0) {
          currentPayload.bank_name = banks[0].name
          console.log('📝 Mode is standard but no bank specified, using first bank:', currentPayload.bank_name)
        }
        
        if (intent.payload.vendor_name && !currentPayload.vendor_name) {
          currentPayload.vendor_name = intent.payload.vendor_name
          console.log('📝 Updated vendor_name:', currentPayload.vendor_name)
        }
        
        // Ensure type is set
        currentPayload.type = 'manual'
        
        // Re-map IDs with updated payload
        currentPayload = mapNamesToIds(currentPayload, vendors, banks, [], counterparties)
        
        // Convert currency if needed
        const detectedCurrency = (currentPayload.currency || userCurrency) as 'GBP' | 'USD' | 'EUR'
        if (convertToBase && detectedCurrency !== 'GBP' && currentPayload.amount && currentPayload.amount > 0) {
          const originalAmount = currentPayload.amount
          currentPayload.amount = Math.round(convertToBase(currentPayload.amount, detectedCurrency) * 100) / 100
          console.log(`📝 Converted amount: ${detectedCurrency} ${originalAmount} → GBP ${currentPayload.amount.toFixed(2)}`)
        } else if (currentPayload.amount && currentPayload.amount > 0) {
          // Round to 2 decimal places even if no conversion needed
          currentPayload.amount = Math.round(currentPayload.amount * 100) / 100
        }
      } else {
        // First time - ensure type is set
        currentPayload.type = 'manual'
      }
      
      // Handle multiple counterparty matches
      if (currentPayload._counterparty_multiple_matches) {
        const matches = currentPayload._counterparty_multiple_matches
        const searchName = currentPayload._counterparty_search_name
        delete currentPayload._counterparty_multiple_matches
        delete currentPayload._counterparty_search_name
        
        // Build disambiguation message
        let message = `I found multiple counterparties matching "${searchName}":\n\n`
        matches.forEach((match: any, index: number) => {
          message += `${index + 1}. ${match.name}`
          
          // Show counterparty name if it's linked
          if (match.counterpartyName && match.counterpartyName !== match.name) {
            message += ` (Contact: ${match.counterpartyName})`
          }
          
          if (match.balance !== undefined) {
            message += ` - Balance: ${formatCurrency ? formatCurrency(match.balance) : `£${match.balance.toFixed(2)}`}`
          }
          
          if (match.phone) {
            message += ` - ${match.phone}`
          }
          
          if (match.source) {
            message += ` [${match.source}]`
          }
          
          message += `\n`
        })
        message += `\nWhich one did you mean? Please reply with the number or the full name.`
        
        // Store matches in clarification state
        return {
          message,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['vendor_id'],
            partialPayload: currentPayload,
            counterpartyMatches: matches,
            counterpartySearchName: searchName
          }
        }
      }
      
      // Handle counterparty not found
      if (currentPayload._counterparty_not_found) {
        const counterpartyName = currentPayload._counterparty_not_found
        delete currentPayload._counterparty_not_found
        
        // Show message with action button to create counterparty
        const message = `❌ I couldn't find a counterparty named "${counterpartyName}".\n\nYou can create a new counterparty with this name, or try searching with a different name.`
        
        return {
          message,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields: ['vendor_id'],
            partialPayload: currentPayload,
            counterpartySearchName: counterpartyName
          },
          actionButtons: [
            {
              label: `Create "${counterpartyName}"`,
              action: 'create_counterparty',
              data: { name: counterpartyName }
            }
          ]
        }
      }
      
      // Check what's still missing
      if (!currentPayload.amount || currentPayload.amount <= 0) {
        allMissingFields.push('amount')
      }
      if (!currentPayload.direction || (currentPayload.direction !== 'in' && currentPayload.direction !== 'out')) {
        allMissingFields.push('direction')
      }
      
      // Check mode and bank together - they're asked in the same question
      const modeResolved = currentPayload.mode && (currentPayload.mode === 'standard' || currentPayload.mode === 'journal_voucher')
      const bankResolved = currentPayload.mode === 'journal_voucher' || (currentPayload.mode === 'standard' && currentPayload.bank_account_id)
      
      if (!modeResolved || !bankResolved) {
        allMissingFields.push('mode_bank')
      }
      
      console.log('📝 Missing fields:', allMissingFields)
      console.log('📝 Current step:', currentStep)
      console.log('📝 Current payload:', currentPayload)
      console.log('📝 Mode resolved:', modeResolved, 'Bank resolved:', bankResolved)
      
      // If there are missing fields and we haven't exceeded 3 steps, ask next question
      if (allMissingFields.length > 0 && currentStep <= 3) {
        const nextField = allMissingFields[0]
        let question = ''
        let nextStep = currentStep + 1
        
        // If this is the first step, use a more conversational intro
        if (currentStep === 1) {
          const vendorName = currentPayload.vendor_name || clarificationState?.vendorName
          if (vendorName) {
            question = `I understand you want to record a payment for ${vendorName}. `
          } else {
            question = `I understand you want to record a payment. `
          }
        }
        
        // Ask the appropriate question based on missing field
        if (nextField === 'amount') {
          question += 'How much was the payment?'
        } else if (nextField === 'direction') {
          question += 'Was this a payment you made or received?'
        } else if (nextField === 'mode_bank') {
          question += 'Was this paid by cash or bank transfer? If bank, which account?'
        }
        
        // Create new clarification state
        const newClarificationState: ClarificationState = {
          step: nextStep,
          missingFields: allMissingFields,
          partialPayload: currentPayload,
          vendorName: currentPayload.vendor_name || clarificationState?.vendorName
        }
        
        console.log('📝 Returning clarification question, next step:', nextStep)
        
        return {
          message: question,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false,
          payload: currentPayload,
          clarificationState: newClarificationState
        }
      }
      
      // All required fields present or exceeded 3 steps - proceed with validation and warnings
      console.log('📝 All fields collected or max steps reached, proceeding to confirmation')
      
      if (currentPayload._vendor_missing) {
        delete currentPayload._vendor_missing
        // Don't show confirmation, return error message instead
        return {
          message: `❌ No counterparty specified.\n\nPlease specify a counterparty name in your message.`,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false
        }
      }
      
      // Check for bank not found warning
      if (currentPayload._bank_not_found) {
        const bankName = currentPayload._bank_not_found
        delete currentPayload._bank_not_found
        // Don't show confirmation, return error message instead
        return {
          message: `❌ Bank account "${bankName}" not found.\n\nPlease check the bank name and try again, or use a different bank account.`,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false
        }
      }
      
      if (currentPayload._bank_missing) {
        delete currentPayload._bank_missing
        // Don't show confirmation, return error message instead
        return {
          message: `❌ No bank account specified for bank transfer.\n\nPlease specify which bank account to use.`,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false
        }
      }
      
      // Update intent payload with merged data
      intent.payload = currentPayload
    }
    
    if (intent.intent === 'unknown' || intent.confidence < 0.5) {
      // If LLM provided a natural conversational response in explanation, use it
      if (intent.confidence >= 0.8 && intent.explanation && intent.explanation.length > 20) {
        // Check if this is a follow-up question for data collection
        const isFollowUpQuestion = intent.explanation.match(/(who|what|which|how much|how many)/i) && 
                                   intent.payload && 
                                   Object.keys(intent.payload).length > 0
        
        if (isFollowUpQuestion) {
          // This is asking for more information - create clarification state
          console.log('📝 Detected follow-up question, creating clarification state')
          console.log('📝 Partial payload:', intent.payload)
          
          // Check if this is a query follow-up (profit/loss or balance)
          // CRITICAL: Only mark as query if payload has NO transaction fields
          const hasTransactionFields = intent.payload.quantity || intent.payload.bought_from || 
                                       intent.payload.sold_to || intent.payload.cost || 
                                       intent.payload.selling || intent.payload.vendor_name
          
          const isQueryFollowUp = !hasTransactionFields && 
                                  intent.explanation.match(/(profit|loss|balance|which game for profit|which match for profit)/i)
          
          // Store the intent type in partial payload so we know what we're collecting data for
          const partialPayload = { ...intent.payload }
          if (isQueryFollowUp && !partialPayload.intent) {
            // This is likely a query follow-up, mark it
            partialPayload.intent = 'query_profit_loss'
            console.log('📝 Detected query follow-up, marking as query_profit_loss')
          }
          
          return {
            message: intent.explanation,
            intent,
            requiresConfirmation: false,
            clarificationState: {
              step: 1,
              missingFields: [],
              partialPayload
            }
          }
        }
        
        // This is a conversational query with a natural response from the LLM
        return {
          message: intent.explanation,
          intent,
          requiresConfirmation: false
        }
      }
      
      // Otherwise, generate a natural, human-like response with personality
      const naturalResponses = [
        "Hmm, I'm not quite sure what you're asking for. 🤔\n\nI can help you with things like:\n• Recording ticket purchases (e.g., \"Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each\")\n• Recording sales (e.g., \"Sold 2 tickets to John at £150 each\")\n• Making payments (e.g., \"Paid Benny £3,250\")\n• Checking profit & loss (e.g., \"What's my profit for Arsenal vs Spurs?\")\n• Checking balances (e.g., \"What's my balance with Benny?\")",
        
        "I'm not entirely sure what you mean by that. 😅\n\nLet me know if you want to:\n• Record a purchase: \"Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each\"\n• Record a sale: \"Sold 2 tickets to John at £150 each\"\n• Make a payment: \"Paid Benny £3,250\"\n• Check profit/loss: \"What's my profit for Arsenal vs Spurs?\"\n• Check vendor balance: \"What's my balance with Benny?\"",
        
        "Sorry, I didn't catch that! 🙈\n\nI'm here to help with:\n• Recording purchases and sales of tickets\n• Making payments to vendors\n• Checking profit & loss for events\n• Viewing vendor balances\n\nTry something like \"Bought 2 tickets from Benny at £100 each\" or \"What's my balance with John?\"",
        
        "I'm having trouble understanding that request. 🤷\n\nHere's what I can do for you:\n• Track ticket purchases: \"Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each\"\n• Track sales: \"Sold 2 tickets to John at £150 each\"\n• Record payments: \"Paid Benny £3,250\"\n• Show profit/loss: \"What's my profit for Arsenal vs Spurs?\"\n• Show balances: \"What's my balance with Benny?\"",
        
        "Oops, I'm not sure what you're looking for there! 😬\n\nI can help you:\n• Record ticket transactions (purchases and sales)\n• Make payments to vendors\n• Check how much profit you're making on events\n• See your balance with any vendor\n\nJust tell me in plain English what you'd like to do!"
      ]
      
      const randomResponse = naturalResponses[Math.floor(Math.random() * naturalResponses.length)]
      
      return {
        message: randomResponse,
        intent,
        requiresConfirmation: false,
        suggestions: [
          'Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each',
          'Sold 2 tickets to John at £150 each',
          'Paid Benny £3,250'
        ]
      }
    }
    
    // Build payload based on intent type - show confirmation ONLY if all required fields are present
    if (intent.intent === 'purchase' || intent.intent === 'order' || intent.intent === 'manual_transaction') {
      // Validate required fields before showing confirmation
      let missingFields: string[] = []
      
      if (intent.intent === 'purchase') {
        if (!intent.payload.quantity || intent.payload.quantity <= 0) missingFields.push('quantity')
        if (!intent.payload.game_id) missingFields.push('game')
        if (!intent.payload.bought_from || intent.payload.bought_from === '(not set)') missingFields.push('bought_from')
        if (!intent.payload.cost || intent.payload.cost <= 0) missingFields.push('cost')
      } else if (intent.intent === 'order') {
        if (!intent.payload.quantity || intent.payload.quantity <= 0) missingFields.push('quantity')
        if (!intent.payload.game_id) missingFields.push('game')
        if (!intent.payload.sold_to || intent.payload.sold_to === '(not set)') missingFields.push('sold_to')
        if (!intent.payload.selling || intent.payload.selling <= 0) missingFields.push('selling')
      } else if (intent.intent === 'manual_transaction') {
        if (!intent.payload.vendor_name || intent.payload.vendor_name === '(not set)') missingFields.push('vendor_name')
        if (!intent.payload.amount || intent.payload.amount <= 0) missingFields.push('amount')
        if (!intent.payload.direction) missingFields.push('direction')
      }
      
      // If there are missing fields, return error instead of showing confirmation
      if (missingFields.length > 0) {
        console.log('❌ Cannot show confirmation, missing required fields:', missingFields)
        
        // Generate natural language message based on missing fields
        let naturalMessage = ''
        
        if (intent.intent === 'purchase') {
          if (missingFields.includes('bought_from')) {
            naturalMessage = 'Who did you buy the tickets from?'
          } else if (missingFields.includes('cost')) {
            naturalMessage = 'What was the total cost?'
          } else if (missingFields.includes('game')) {
            naturalMessage = 'Which game was this for?'
          } else if (missingFields.includes('quantity')) {
            naturalMessage = 'How many tickets did you buy?'
          }
        } else if (intent.intent === 'order') {
          if (missingFields.includes('sold_to')) {
            naturalMessage = 'Who did you sell the tickets to?'
          } else if (missingFields.includes('selling')) {
            naturalMessage = 'What was the selling price?'
          } else if (missingFields.includes('game')) {
            naturalMessage = 'Which game was this for?'
          } else if (missingFields.includes('quantity')) {
            naturalMessage = 'How many tickets did you sell?'
          }
        } else if (intent.intent === 'manual_transaction') {
          if (missingFields.includes('vendor_name')) {
            naturalMessage = 'Who was this payment with?'
          } else if (missingFields.includes('amount')) {
            naturalMessage = 'How much was the payment?'
          } else if (missingFields.includes('direction')) {
            naturalMessage = 'Was this a payment you made or received?'
          }
        }
        
        // Fallback if no specific message
        if (!naturalMessage) {
          naturalMessage = 'I need a bit more information to complete this transaction.'
        }
        
        return {
          message: naturalMessage,
          intent: { ...intent, intent: 'unknown' },
          requiresConfirmation: false,
          clarificationState: {
            step: 1,
            missingFields,
            partialPayload: intent.payload
          }
        }
      }
      
      const summary = formatTransactionSummary(intent, formatCurrency)
      const warningMessage = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : ''
      
      console.log('📋 Building response message:')
      console.log('  - Summary:', summary)
      console.log('  - Warnings array:', warnings)
      console.log('  - Warning message:', warningMessage)
      
      const finalMessage = `${intent.explanation}\n\n${summary}${warningMessage}\n\nLook good? Feel free to edit anything before confirming!`
      console.log('  - Final message:', finalMessage)
      
      return {
        message: finalMessage,
        intent,
        requiresConfirmation: true,
        payload: intent.payload
      }
    }
    
    if (intent.intent === 'create_counterparty') {
      return {
        message: `I'll create this counterparty:\n\n${formatCounterpartySummary(intent)}\n\nIs this correct?`,
        intent,
        requiresConfirmation: true,
        payload: intent.payload
      }
    }
    
    if (intent.intent === 'query' || intent.intent === 'query_profit_loss') {
      // Queries don't need confirmation, execute immediately
      return {
        message: `Fetching information...`,
        intent,
        requiresConfirmation: false
      }
    }
    
    return {
      message: 'Processing your request...',
      intent,
      requiresConfirmation: false
    }
  } catch (error) {
    console.error('Analysis error:', error)
    return {
      message: `Error: ${error instanceof Error ? error.message : 'Failed to analyze input'}`,
      intent: {
        intent: 'unknown',
        confidence: 0,
        apiEndpoint: '',
        method: 'POST',
        payload: {},
        missingFields: [],
        explanation: 'Error occurred'
      },
      requiresConfirmation: false
    }
  }
}

// Format transaction summary for confirmation
export const formatTransactionSummary = (
  intent: LLMAnalysisResult, 
  formatCurrency?: (value: number) => string
): string => {
  const { payload } = intent
  const lines: string[] = []
  
  // Helper to format currency - use provided formatter or default to GBP
  const formatAmount = (amount: number | undefined): string => {
    if (!amount) return '(not set)'
    if (formatCurrency) return formatCurrency(amount)
    return `£${amount.toFixed(2)}`
  }
  
  if (intent.intent === 'purchase') {
    lines.push(`📦 Here's what I've got:`)
    // Always show required fields, even if empty
    lines.push(`• Event: ${payload.game_name || '(not set)'}`)
    lines.push(`• Quantity: ${payload.quantity || '(not set)'} ${payload.quantity ? 'tickets' : ''}`)
    lines.push(`• Section: ${payload.area || '(not set)'}`)
    lines.push(`• Buying from: ${payload.bought_from || '(not set)'}`)
    lines.push(`• Total cost: ${formatAmount(payload.cost)}`)
    // Optional fields - only show if provided
    if (payload.block) lines.push(`• Block: ${payload.block}`)
    if (payload.row) lines.push(`• Row: ${payload.row}`)
    if (payload.seats) lines.push(`• Seats: ${payload.seats}`)
    if (payload.notes) lines.push(`• Notes: ${payload.notes}`)
  } else if (intent.intent === 'order') {
    lines.push(`🎫 Here's what I've got:`)
    // Always show required fields, even if empty
    lines.push(`• Event: ${payload.game_name || '(not set)'}`)
    lines.push(`• Quantity: ${payload.quantity || '(not set)'} ${payload.quantity ? 'tickets' : ''}`)
    lines.push(`• Section: ${payload.area || '(not set)'}`)
    lines.push(`• Selling to: ${payload.sold_to || '(not set)'}`)
    lines.push(`• Selling price: ${formatAmount(payload.selling)}`)
    // Optional fields - only show if provided
    if (payload.block) lines.push(`• Block: ${payload.block}`)
    if (payload.row) lines.push(`• Row: ${payload.row}`)
    if (payload.seats) lines.push(`• Seats: ${payload.seats}`)
    if (payload.order_number) lines.push(`• Order #: ${payload.order_number}`)
    if (payload.notes) lines.push(`• Notes: ${payload.notes}`)
  } else if (intent.intent === 'manual_transaction') {
    lines.push(`💰 Here's what I've got:`)
    // Always show required fields, even if empty
    lines.push(`• ${payload.direction === 'in' ? 'Receiving from' : payload.direction === 'out' ? 'Paying to' : 'Counterparty'}: ${payload.vendor_name || '(not set)'}`)
    lines.push(`• Amount: ${formatAmount(payload.amount)}`)
    lines.push(`• Type: ${payload.direction === 'in' ? 'Money coming in' : payload.direction === 'out' ? 'Money going out' : '(not set)'}`)
    lines.push(`• Category: ${payload.category || '(not set)'}`)
    // Bank is required for standard mode - show with balance
    if (payload.mode === 'standard') {
      if (payload.bank_name && payload.bank_balance !== undefined) {
        lines.push(`• Bank account: ${payload.bank_name} (Balance: ${formatAmount(payload.bank_balance)})`)
      } else {
        lines.push(`• Bank account: ${payload.bank_name || '(not set)'}`)
      }
    }
    // Optional fields
    if (payload.notes) lines.push(`• Notes: ${payload.notes}`)
  } else if (intent.intent === 'create_counterparty') {
    lines.push(`👤 New contact details:`)
    // Always show required fields
    lines.push(`• Name: ${payload.name || '(not set)'}`)
    lines.push(`• Phone: ${payload.phone || '(not set)'}`)
    // Optional fields
    if (payload.role) lines.push(`• Role: ${payload.role}`)
    if (payload.email) lines.push(`• Email: ${payload.email}`)
    if (payload.notes) lines.push(`• Notes: ${payload.notes}`)
  }
  
  return lines.join('\n')
}

// Format counterparty summary
const formatCounterpartySummary = (intent: LLMAnalysisResult): string => {
  const { payload } = intent
  const lines: string[] = []
  
  // Always show required fields, even if empty
  lines.push(`Name: ${payload.name || '(not set)'}`)
  lines.push(`Phone: ${payload.phone || '(not set)'}`)
  // Optional fields - only show if provided
  if (payload.role) lines.push(`Role: ${payload.role}`)
  if (payload.email) lines.push(`Email: ${payload.email}`)
  
  return lines.join('\n')
}

// Execute purchase API call
export const executePurchase = async (
  token: string,
  payload: any
): Promise<ApiResult<any>> => {
  return apiPost('/inventory-records/purchases', payload, { token })
}

// Execute order API call
export const executeOrder = async (
  token: string,
  payload: any
): Promise<ApiResult<any>> => {
  return apiPost('/inventory-records/orders', payload, { token })
}

// Execute manual transaction API call
export const executeManualTransaction = async (
  token: string,
  payload: any
): Promise<ApiResult<any>> => {
  return apiPost('/transactions/manual', payload, { token })
}

// Execute counterparty creation
export const executeCreateCounterparty = async (
  token: string,
  payload: any
): Promise<ApiResult<any>> => {
  return apiPost('/directory/counterparties', payload, { token })
}

// Execute query
export const executeQuery = async (
  token: string,
  intent: LLMAnalysisResult
): Promise<ApiResult<any>> => {
  return apiGet(intent.apiEndpoint, { token })
}

// Execute profit/loss query for a specific game
export const executeProfitLossQuery = async (
  token: string,
  gameName: string,
  searchEventsFunc?: (query: string) => Promise<any[]>
): Promise<ApiResult<any>> => {
  try {
    // First, search for the game to get its ID
    if (!searchEventsFunc) {
      return { ok: false, error: 'Event search function not available', status: 400 }
    }
    
    const events = await searchEventsFunc(gameName)
    if (!events || events.length === 0) {
      return { ok: false, error: `No event found for "${gameName}"`, status: 404 }
    }
    
    const event = events[0]
    const gameId = event.id.toString()
    const eventName = `${event.home_team} vs ${event.away_team}`
    
    // Fetch inventory records for this game
    const result = await apiGet(`/inventory-records?game_id=${gameId}`, { token })
    
    if (!result.ok) {
      return { ok: false, error: result.error, status: result.status }
    }
    
    // Calculate profit/loss from the records
    // Access data from the successful result
    const responseData = result.data as any
    // API returns { success: true, data: [...] } where data is the array of records
    const allRecords = responseData?.data || []
    
    // Filter to visible records only (same logic as inventory page)
    // Show records where record_type === 'sale' OR sale_id is null/empty
    // This prevents double-counting when inventory is assigned to orders
    const visibleRecords = allRecords.filter((record: any) => 
      record.record_type === 'sale' || !record.sale_id
    )
    
    // Calculate totals matching inventory page logic
    let totalQuantity = 0
    let totalCost = 0
    let targetSelling = 0
    let projectedProfit = 0
    
    visibleRecords.forEach((record: any) => {
      // Total quantity: all tickets logged
      if (record.quantity) {
        totalQuantity += record.quantity
      }
      
      // Total cost: purchase price (from inventory/sale records with cost)
      if (typeof record.cost === 'number') {
        totalCost += record.cost
      }
      
      // Target selling: asking price (from all records with selling price)
      if (typeof record.selling === 'number') {
        targetSelling += record.selling
      }
      
      // Projected profit: based on target sell (selling - cost)
      if (typeof record.cost === 'number' && typeof record.selling === 'number') {
        projectedProfit += record.selling - record.cost
      }
    })
    
    return {
      ok: true,
      status: 200,
      data: {
        eventName,
        gameId,
        totalQuantity,
        totalCost,
        targetSelling,
        projectedProfit,
        recordCount: visibleRecords.length
      }
    }
  } catch (error) {
    console.error('Error executing profit/loss query:', error)
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to fetch profit/loss data', status: 500 }
  }
}

// Execute vendor balance query
export const executeVendorBalanceQuery = async (
  token: string,
  vendorName: string,
  vendors: any[]
): Promise<ApiResult<any>> => {
  try {
    // Validate counterparty name
    if (!vendorName || vendorName.trim().length === 0) {
      return { 
        ok: false, 
        error: 'Please specify a counterparty name. For example: "What\'s my balance with Benny?"', 
        status: 400 
      }
    }
    
    // Find the counterparty by name
    const vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === vendorName.toLowerCase().trim()
    )
    
    if (!vendor) {
      return { 
        ok: false, 
        error: `I couldn't find a counterparty named "${vendorName}". Please check the spelling and try again.`, 
        status: 404 
      }
    }
    
    // Fetch vendor transactions
    const result = await apiGet(`/vendors/${vendor.id}/transactions`, { token })
    
    if (!result.ok) {
      return { 
        ok: false, 
        error: `Unable to fetch balance information for ${vendor.name}. Please try again.`, 
        status: result.status 
      }
    }
    
    // Extract balance and transaction summary
    const responseData = result.data as any
    const vendorData = responseData?.data?.vendor || vendor
    const totals = responseData?.data?.totals || {
      total: 0,
      paid: 0,
      pending: 0,
      partial: 0,
      cancelled: 0,
      owed: 0
    }
    
    const balance = vendorData.balance || 0
    
    return {
      ok: true,
      status: 200,
      data: {
        vendorName: vendor.name,
        vendorId: vendor.id,
        balance,
        totals
      }
    }
  } catch (error) {
    console.error('Error executing vendor balance query:', error)
    return { 
      ok: false, 
      error: 'An unexpected error occurred while fetching vendor balance. Please try again.', 
      status: 500 
    }
  }
}
