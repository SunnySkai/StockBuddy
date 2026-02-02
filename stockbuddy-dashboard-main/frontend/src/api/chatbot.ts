import { apiGet, apiPost, type ApiResult } from './client'
import { analyzeWithLLM, type LLMAnalysisResult } from './llm'

export type ClarificationState = {
  step: number // 1, 2, or 3
  missingFields: string[]
  partialPayload: any
  vendorName?: string // Store extracted vendor name from initial input
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
}

export type ChatbotResponse = {
  message: string
  intent: LLMAnalysisResult
  requiresConfirmation: boolean
  payload?: any
  suggestions?: string[]
  clarificationState?: ClarificationState
}

// Helper function to map names to IDs for all entities
const mapNamesToIds = (payload: any, vendors: any[], banks: any[], events: any[]): any => {
  const result = { ...payload }
  
  console.log('🔍 mapNamesToIds called with:', { 
    bought_from: result.bought_from, 
    sold_to: result.sold_to,
    vendorsCount: vendors.length 
  })
  
  // Map vendor names to IDs with exact matching for PURCHASE
  if (result.bought_from) {
    const originalName = result.bought_from
    const vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === result.bought_from.toLowerCase().trim()
    )
    if (vendor) {
      // Exact match found
      result.bought_from_vendor_id = vendor.id
      result.bought_from = vendor.name // Use the actual vendor name (proper casing)
      console.log(`✅ Found exact vendor match for "${originalName}":`, vendor.name)
    } else {
      // No exact match - mark as not found, don't use fallback
      result.bought_from_vendor_id = ''
      result._vendor_not_found = originalName // Store original name for warning
      console.log(`⚠️ No exact match for "${originalName}", vendor not found`)
    }
  }
  
  // Map vendor names to IDs with exact matching for ORDER
  if (result.sold_to) {
    const originalName = result.sold_to
    const vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === result.sold_to.toLowerCase().trim()
    )
    if (vendor) {
      // Exact match found
      result.sold_to_vendor_id = vendor.id
      result.sold_to = vendor.name // Use the actual vendor name (proper casing)
      console.log(`✅ Found exact vendor match for "${originalName}":`, vendor.name)
    } else {
      // No exact match - mark as not found, don't use fallback
      result.sold_to_vendor_id = ''
      result._vendor_not_found = originalName // Store original name for warning
      console.log(`⚠️ No exact match for "${originalName}", vendor not found`)
    }
  }
  
  // Map vendor for MANUAL TRANSACTION
  if (result.type === 'manual' || result.vendor_name) {
    const originalName = result.vendor_name || ''
    if (originalName) {
      const vendor = vendors.find(v => 
        v.name.toLowerCase().trim() === originalName.toLowerCase().trim()
      )
      if (vendor) {
        // Exact match found
        result.vendor_id = vendor.id
        result.vendor_name = vendor.name // Use the actual vendor name (proper casing)
        console.log(`✅ Found exact vendor match for manual transaction "${originalName}":`, vendor.name)
      } else {
        // No exact match - mark as not found, don't use fallback
        result.vendor_id = ''
        result._vendor_not_found = originalName // Store original name for warning
        console.log(`⚠️ No exact match for "${originalName}", vendor not found`)
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
  clarificationState?: ClarificationState
): Promise<ChatbotResponse> => {
  try {
    const intent = await analyzeWithLLM(input, vendors, banks, userCurrency)
    
    // Post-process: ensure all IDs are mapped
    if (intent.payload) {
      intent.payload = mapNamesToIds(intent.payload, vendors, banks, [])
      
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
              // Event found - take first result
              const firstEvent = results[0]
              const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
              console.log('✅ Event found using LLM extraction:', eventName)
              
              intent.payload.game_id = firstEvent.id.toString()
              intent.payload.game_name = eventName
            } else {
              // Event not found - show warning with LLM-extracted name
              console.log('⚠️ Event not found for LLM-extracted name:', llmExtractedGameId)
              warnings.push(`⚠️ No Event Found for "${llmExtractedGameId}"`)
              intent.payload.game_id = ''
              intent.payload.game_name = ''
            }
          } catch (error) {
            console.error('Error searching with LLM-extracted game_id:', error)
            warnings.push(`⚠️ No Event Found for "${llmExtractedGameId}"`)
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
              // Event found
              const firstEvent = results[0]
              const eventName = `${firstEvent.home_team} vs ${firstEvent.away_team}`
              console.log('✅ Event found using regex extraction:', eventName)
              intent.payload.game_id = firstEvent.id.toString()
              intent.payload.game_name = eventName
            } else {
              // Event not found - show warning
              console.log('⚠️ Event not found for regex query:', searchQuery)
              warnings.push(`⚠️ No Event Found for "${searchQuery}"`)
              intent.payload.game_id = ''
              intent.payload.game_name = ''
            }
          } catch (error) {
            console.error('Error searching with regex-extracted query:', error)
            warnings.push(`⚠️ No Event Found for "${searchQuery}"`)
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
    if (intent.intent === 'purchase') {
      if (intent.payload._vendor_not_found) {
        const vendorName = intent.payload._vendor_not_found
        delete intent.payload._vendor_not_found
        // Don't show confirmation, return error message instead
        return {
          message: `❌ Vendor "${vendorName}" not found.\n\nPlease check the vendor name and try again, or create a new vendor first.`,
          intent,
          requiresConfirmation: false
        }
      }
    }
    
    if (intent.intent === 'order') {
      if (intent.payload._vendor_not_found) {
        const vendorName = intent.payload._vendor_not_found
        delete intent.payload._vendor_not_found
        // Don't show confirmation, return error message instead
        return {
          message: `❌ Vendor "${vendorName}" not found.\n\nPlease check the vendor name and try again, or create a new vendor first.`,
          intent,
          requiresConfirmation: false
        }
      }
    }
    
    if (intent.intent === 'manual_transaction' || (clarificationState && clarificationState.partialPayload.type === 'manual')) {
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
        currentPayload = mapNamesToIds(currentPayload, vendors, banks, [])
        
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
      
      if (currentPayload._vendor_not_found) {
        const vendorName = currentPayload._vendor_not_found
        delete currentPayload._vendor_not_found
        // Don't show confirmation, return error message instead
        return {
          message: `❌ Vendor "${vendorName}" not found.\n\nPlease check the vendor name and try again, or create a new vendor first.`,
          intent: { ...intent, payload: currentPayload },
          requiresConfirmation: false
        }
      }
      
      if (currentPayload._vendor_missing) {
        delete currentPayload._vendor_missing
        // Don't show confirmation, return error message instead
        return {
          message: `❌ No vendor specified.\n\nPlease specify a vendor name in your message.`,
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
      return {
        message: "I didn't quite understand that. Try commands like:\n• \"Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each\"\n• \"Sold 2 tickets to John at £150 each\"\n• \"Paid Benny £3,250\"\n• \"What's my profit for Arsenal vs Spurs?\"",
        intent,
        requiresConfirmation: false,
        suggestions: [
          'Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each',
          'Sold 2 tickets to John at £150 each',
          'Paid Benny £3,250'
        ]
      }
    }
    
    // Build payload based on intent type - always show confirmation, even with missing fields
    if (intent.intent === 'purchase' || intent.intent === 'order' || intent.intent === 'manual_transaction') {
      const summary = formatTransactionSummary(intent, formatCurrency)
      const warningMessage = warnings.length > 0 ? `\n\n${warnings.join('\n')}` : ''
      
      console.log('📋 Building response message:')
      console.log('  - Summary:', summary)
      console.log('  - Warnings array:', warnings)
      console.log('  - Warning message:', warningMessage)
      
      const finalMessage = `${intent.explanation}\n\n${summary}${warningMessage}\n\nPlease review and edit if needed.`
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
    lines.push(`📦 Purchase Details:`)
    // Always show required fields, even if empty
    lines.push(`Event: ${payload.game_name || '(not set)'}`)
    lines.push(`Quantity: ${payload.quantity || '(not set)'} ${payload.quantity ? 'tickets' : ''}`)
    lines.push(`Area: ${payload.area || '(not set)'}`)
    lines.push(`Bought From: ${payload.bought_from || '(not set)'}`)
    lines.push(`Total Cost: ${formatAmount(payload.cost)}`)
    // Optional fields - only show if provided
    if (payload.block) lines.push(`Block: ${payload.block}`)
    if (payload.row) lines.push(`Row: ${payload.row}`)
    if (payload.seats) lines.push(`Seats: ${payload.seats}`)
    if (payload.notes) lines.push(`Notes: ${payload.notes}`)
  } else if (intent.intent === 'order') {
    lines.push(`🎫 Sale Details:`)
    // Always show required fields, even if empty
    lines.push(`Event: ${payload.game_name || '(not set)'}`)
    lines.push(`Quantity: ${payload.quantity || '(not set)'} ${payload.quantity ? 'tickets' : ''}`)
    lines.push(`Area: ${payload.area || '(not set)'}`)
    lines.push(`Sold To: ${payload.sold_to || '(not set)'}`)
    lines.push(`Selling Price: ${formatAmount(payload.selling)}`)
    // Optional fields - only show if provided
    if (payload.block) lines.push(`Block: ${payload.block}`)
    if (payload.row) lines.push(`Row: ${payload.row}`)
    if (payload.seats) lines.push(`Seats: ${payload.seats}`)
    if (payload.order_number) lines.push(`Order Number: ${payload.order_number}`)
    if (payload.notes) lines.push(`Notes: ${payload.notes}`)
  } else if (intent.intent === 'manual_transaction') {
    lines.push(`💰 Payment Details:`)
    // Always show required fields, even if empty
    lines.push(`Vendor/Counterparty: ${payload.vendor_name || '(not set)'}`)
    lines.push(`Amount: ${formatAmount(payload.amount)}`)
    lines.push(`Direction: ${payload.direction === 'in' ? 'Money In (Receipt)' : payload.direction === 'out' ? 'Money Out (Payment)' : '(not set)'}`)
    lines.push(`Category: ${payload.category || '(not set)'}`)
    // Bank is required for standard mode - show with balance
    if (payload.mode === 'standard') {
      if (payload.bank_name && payload.bank_balance !== undefined) {
        lines.push(`Bank: ${payload.bank_name} (${formatAmount(payload.bank_balance)})`)
      } else {
        lines.push(`Bank: ${payload.bank_name || '(not set)'}`)
      }
    }
    // Optional fields
    if (payload.notes) lines.push(`Notes: ${payload.notes}`)
  } else if (intent.intent === 'create_counterparty') {
    lines.push(`👤 Counterparty Details:`)
    // Always show required fields
    lines.push(`Name: ${payload.name || '(not set)'}`)
    lines.push(`Phone: ${payload.phone || '(not set)'}`)
    // Optional fields
    if (payload.role) lines.push(`Role: ${payload.role}`)
    if (payload.email) lines.push(`Email: ${payload.email}`)
    if (payload.notes) lines.push(`Notes: ${payload.notes}`)
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
    // Validate vendor name
    if (!vendorName || vendorName.trim().length === 0) {
      return { 
        ok: false, 
        error: 'Please specify a vendor name. For example: "What\'s my balance with Benny?"', 
        status: 400 
      }
    }
    
    // Find the vendor by name
    const vendor = vendors.find(v => 
      v.name.toLowerCase().trim() === vendorName.toLowerCase().trim()
    )
    
    if (!vendor) {
      return { 
        ok: false, 
        error: `I couldn't find a vendor named "${vendorName}". Please check the spelling and try again.`, 
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
