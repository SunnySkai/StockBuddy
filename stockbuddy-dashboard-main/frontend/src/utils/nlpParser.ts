// Natural Language Parser for StockBuddy Chatbot
// Analyzes user input and maps to API calls without LLM

export type ParsedIntent = {
  type: 'transaction' | 'query' | 'create_counterparty' | 'unknown'
  confidence: number
  data: any
  missingFields: string[]
  apiEndpoint?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
}

type TransactionType = 'buy' | 'sell' | 'payment_made' | 'payment_received' | 'bank_charge' | 'salary' | 'fee'

// Keywords for different transaction types
const TRANSACTION_KEYWORDS = {
  buy: ['bought', 'purchase', 'purchased', 'buy'],
  sell: ['sold', 'sell', 'sale'],
  payment_made: ['paid', 'payment made', 'transferred', 'sent', 'transfer'],
  payment_received: ['received', 'payment received', 'got paid'],
  bank_charge: ['bank charge', 'charged by', 'bank fee', 'bank deducted'],
  salary: ['salary', 'staff salary', 'paid salary'],
  fee: ['bot fee', 'api fee', 'subscription', 'monthly fee']
}

const QUERY_KEYWORDS = {
  profit: ['profit', 'p&l', 'p & l', 'profit and loss', 'break down'],
  balance: ['who owes', 'balance', 'position', 'debit', 'credit', 'status']
}

const CREATE_KEYWORDS = ['create', 'new counterparty', 'add counterparty']

// Extract currency amount from text
const extractAmount = (text: string): number | null => {
  // Match patterns like: £3,250, 3250 GBP, 100 ea, 100 each, £25
  const patterns = [
    /£\s*([0-9,]+(?:\.[0-9]{2})?)/,
    /([0-9,]+(?:\.[0-9]{2})?)\s*(?:GBP|gbp)/,
    /([0-9,]+(?:\.[0-9]{2})?)\s*(?:ea|each)/,
    /\b([0-9,]+(?:\.[0-9]{2})?)\b/
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const numStr = match[1].replace(/,/g, '')
      const num = parseFloat(numStr)
      if (!isNaN(num) && num > 0) {
        return num
      }
    }
  }
  return null
}

// Extract counterparty/vendor name
const extractCounterparty = (text: string): string | null => {
  // Patterns: "from Benny", "to Benny", "Benny paid", "paid Benny"
  const patterns = [
    /(?:from|to)\s+([A-Z][a-zA-Z\s]+?)(?:\s+\d|$|\s+today|\s+tickets|\s+£|\s+gbp)/i,
    /([A-Z][a-zA-Z\s]+?)\s+(?:paid|owes)/i,
    /(?:paid|received from)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$)/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Filter out common words
      const excludeWords = ['tickets', 'today', 'arsenal', 'spurs', 'short', 'upper', 'gbp', 'cash', 'bank']
      if (!excludeWords.some(word => name.toLowerCase() === word) && name.length > 2) {
        return name
      }
    }
  }
  return null
}

// Extract ticket quantity
const extractQuantity = (text: string): number | null => {
  const match = text.match(/\b(\d+)\s*(?:tickets?|tix)\b/i)
  if (match) {
    return parseInt(match[1])
  }
  return null
}

// Extract event details (e.g., "Arsenal Spurs Short Upper")
const extractEventDetails = (text: string): string | null => {
  // Look for team names and sections
  const eventPattern = /(?:Arsenal|Spurs|Chelsea|Liverpool|Manchester|Tottenham)[\w\s]*/i
  const match = text.match(eventPattern)
  if (match) {
    return match[0].trim()
  }
  return null
}

// Extract bank/payment method
const extractBank = (text: string): string | null => {
  const lowerText = text.toLowerCase()
  
  // Look for bank names or "cash"
  if (lowerText.includes('cash')) return 'Cash'
  if (lowerText.includes('enbd')) return 'ENBD'
  
  // Pattern: "from X bank", "X account"
  const bankPattern = /(?:from|via)\s+([A-Z][a-zA-Z\s]+?)\s+(?:bank|account)/i
  const match = text.match(bankPattern)
  if (match) {
    return match[1].trim()
  }
  
  return null
}

// Extract phone number
const extractPhone = (text: string): string | null => {
  const phonePattern = /\+?\d{10,15}/
  const match = text.match(phonePattern)
  return match ? match[0] : null
}

// Extract role/context
const extractRole = (text: string): string | null => {
  const rolePattern = /(?:is a|role:|trader|vendor|customer|supplier)/i
  if (rolePattern.test(text)) {
    const match = text.match(/(?:is a|role:)\s*(\w+)/i)
    return match ? match[1] : 'trader'
  }
  return null
}

// Determine transaction type
const determineTransactionType = (text: string): TransactionType | null => {
  const lowerText = text.toLowerCase()
  
  for (const [type, keywords] of Object.entries(TRANSACTION_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return type as TransactionType
    }
  }
  
  return null
}

// Determine query type
const determineQueryType = (text: string): 'profit' | 'balance' | null => {
  const lowerText = text.toLowerCase()
  
  for (const [type, keywords] of Object.entries(QUERY_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return type as 'profit' | 'balance'
    }
  }
  
  return null
}

// Main parser function
export const parseNaturalLanguage = (input: string): ParsedIntent => {
  const text = input.trim()
  const lowerText = text.toLowerCase()
  
  // Check for create counterparty intent
  if (CREATE_KEYWORDS.some(keyword => lowerText.includes(keyword))) {
    const name = extractCounterparty(text)
    const phone = extractPhone(text)
    const role = extractRole(text)
    
    const missingFields: string[] = []
    if (!name) missingFields.push('name')
    if (!phone) missingFields.push('phone')
    
    return {
      type: 'create_counterparty',
      confidence: 0.9,
      data: {
        name,
        phone,
        role: role || 'trader'
      },
      missingFields,
      apiEndpoint: '/directory/counterparties',
      method: 'POST'
    }
  }
  
  // Check for query intent
  const queryType = determineQueryType(text)
  if (queryType) {
    const counterparty = extractCounterparty(text)
    const eventDetails = extractEventDetails(text)
    
    if (queryType === 'profit' && eventDetails) {
      return {
        type: 'query',
        confidence: 0.85,
        data: {
          queryType: 'profit',
          event: eventDetails,
          counterparty
        },
        missingFields: [],
        apiEndpoint: '/transactions',
        method: 'GET'
      }
    }
    
    if (queryType === 'balance' && counterparty) {
      return {
        type: 'query',
        confidence: 0.85,
        data: {
          queryType: 'balance',
          counterparty
        },
        missingFields: [],
        apiEndpoint: '/vendors',
        method: 'GET'
      }
    }
  }
  
  // Check for transaction intent
  const transactionType = determineTransactionType(text)
  if (transactionType) {
    const amount = extractAmount(text)
    const counterparty = extractCounterparty(text)
    const quantity = extractQuantity(text)
    const eventDetails = extractEventDetails(text)
    const bank = extractBank(text)
    
    const missingFields: string[] = []
    
    // Build transaction data based on type
    if (transactionType === 'buy' || transactionType === 'sell') {
      // Ticket transaction
      if (!counterparty) missingFields.push('vendor/counterparty')
      if (!amount) missingFields.push('amount')
      
      return {
        type: 'transaction',
        confidence: 0.9,
        data: {
          transactionType,
          counterparty,
          amount,
          quantity,
          eventDetails,
          category: transactionType === 'buy' ? 'ticket_purchase' : 'ticket_sale',
          direction: transactionType === 'buy' ? 'out' : 'in'
        },
        missingFields,
        apiEndpoint: '/transactions/manual',
        method: 'POST'
      }
    }
    
    if (transactionType === 'payment_made' || transactionType === 'payment_received') {
      if (!counterparty) missingFields.push('vendor/counterparty')
      if (!amount) missingFields.push('amount (GBP)')
      if (!bank) missingFields.push('payment method/bank')
      
      return {
        type: 'transaction',
        confidence: 0.85,
        data: {
          transactionType,
          counterparty,
          amount,
          bank,
          category: 'other',
          direction: transactionType === 'payment_made' ? 'out' : 'in',
          mode: 'standard'
        },
        missingFields,
        apiEndpoint: '/transactions/manual',
        method: 'POST'
      }
    }
    
    if (transactionType === 'bank_charge') {
      if (!amount) missingFields.push('amount')
      if (!bank) missingFields.push('bank name')
      
      return {
        type: 'transaction',
        confidence: 0.8,
        data: {
          transactionType,
          amount,
          bank,
          counterparty: bank || 'Bank',
          category: 'other',
          direction: 'out',
          notes: 'Bank charges'
        },
        missingFields,
        apiEndpoint: '/transactions/manual',
        method: 'POST'
      }
    }
    
    if (transactionType === 'salary') {
      if (!counterparty) missingFields.push('employee name')
      if (!amount) missingFields.push('amount')
      
      return {
        type: 'transaction',
        confidence: 0.85,
        data: {
          transactionType,
          counterparty,
          amount,
          category: 'salary',
          direction: 'out',
          notes: 'Salary payment'
        },
        missingFields,
        apiEndpoint: '/transactions/manual',
        method: 'POST'
      }
    }
    
    if (transactionType === 'fee') {
      if (!amount) missingFields.push('amount')
      
      const feeType = lowerText.includes('bot') ? 'AI Bot Fee' : 
                      lowerText.includes('api') ? 'API Usage Fee' : 
                      'Subscription Fee'
      
      return {
        type: 'transaction',
        confidence: 0.8,
        data: {
          transactionType,
          amount,
          category: lowerText.includes('bot') ? 'ai_bot' : 'other',
          direction: 'out',
          notes: feeType,
          counterparty: 'System'
        },
        missingFields,
        apiEndpoint: '/transactions/manual',
        method: 'POST'
      }
    }
  }
  
  // Unknown intent
  return {
    type: 'unknown',
    confidence: 0,
    data: {},
    missingFields: [],
  }
}
