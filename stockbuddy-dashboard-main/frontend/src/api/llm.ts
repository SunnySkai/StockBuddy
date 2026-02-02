// LLM API Integration for Chatbot
// This uses OpenAI API to analyze natural language and map to backend APIs

export type LLMAnalysisResult = {
  intent: 'purchase' | 'order' | 'manual_transaction' | 'query' | 'query_profit_loss' | 'query_vendor_balance' | 'create_counterparty' | 'unknown'
  confidence: number
  apiEndpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  payload: any
  missingFields: string[]
  explanation: string
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''

const API_SCHEMA = `
Available Backend APIs:

1. CREATE PURCHASE (Buy Tickets)
   POST /inventory-records/purchases
   {
     "game_id": "string (required)",
     "quantity": number (required),
     "area": "string (required)",
     "block": "string (optional)",
     "row": "string (optional)",
     "seats": "string (optional)",
     "bought_from": "string (required - vendor name)",
     "bought_from_vendor_id": "string (required - vendor ID)",
     "cost": number (required - total cost in base currency GBP),
     "currency": "GBP" | "USD" | "EUR" (detected from user input, defaults to user's current currency),
     "notes": "string (default: empty string)"
   }

2. CREATE ORDER (Sell Tickets)
   POST /inventory-records/orders
   {
     "game_id": "string (required)",
     "quantity": number (required),
     "area": "string (required)",
     "block": "string (optional)",
     "row": "string (optional)",
     "seats": "string (optional)",
     "sold_to": "string (required - customer name)",
     "sold_to_vendor_id": "string (required - vendor ID)",
     "selling": number (required - total selling price in base currency GBP),
     "currency": "GBP" | "USD" | "EUR" (detected from user input, defaults to user's current currency),
     "order_number": "string (optional)",
     "notes": "string (default: empty string)"
   }

3. CREATE MANUAL TRANSACTION (Payments, Charges, etc.)
   POST /transactions/manual
   {
     "vendor_name": "string (required - vendor/counterparty name extracted from user input)",
     "vendor_id": "string (required - vendor ID)",
     "type": "manual",
     "amount": number (required - in base currency GBP),
     "currency": "GBP" | "USD" | "EUR" (detected from user input, defaults to user's current currency),
     "category": "shipping" | "ai_bot" | "salary" | "internal" | "other",
     "direction": "in" | "out",
     "mode": "standard" | "journal_voucher",
     "bank_name": "string (optional - bank account name extracted from user input)",
     "bank_account_id": "string (required for standard mode)",
     "notes": "string (default: empty string)"
   }

4. GET INVENTORY RECORDS (Query Profit & Loss for a specific game)
   GET /inventory-records?game_id=xxx
   {
     "game_name": "string (required - event name like 'Arsenal vs Tottenham')"
   }

5. GET TRANSACTIONS (Query P&L, Balance)
   GET /transactions?vendor_id=xxx&status=xxx&type=xxx

6. CREATE COUNTERPARTY
   POST /directory/counterparties
   {
     "name": "string (required)",
     "phone": "string (required)",
     "role": "string (optional)",
     "email": "string (optional)"
   }
`

export async function analyzeWithLLM(userInput: string, vendors: any[], banks: any[] = [], userCurrency: 'GBP' | 'USD' | 'EUR' = 'GBP'): Promise<LLMAnalysisResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set VITE_OPENAI_API_KEY in your .env file.')
  }

  const vendorList = vendors.map(v => `${v.name} (ID: ${v.id})`).join(', ')
  const bankList = banks.map(b => `${b.name} (ID: ${b.id})`).join(', ')

  const systemPrompt = `You are an API assistant for a ticket inventory management system. Analyze user input and map it to the correct backend API call.

${API_SCHEMA}

Available Vendors: ${vendorList || 'None'}
Available Bank Accounts: ${bankList || 'None'}
User's Current Currency: ${userCurrency}

Rules:
1. For purchases (buying tickets): Use POST /inventory-records/purchases
2. For orders (selling tickets): Use POST /inventory-records/orders
3. For payments, charges, fees: Use POST /transactions/manual
3.5. **For profit/loss queries about a specific game**: Use GET /inventory-records with intent "query_profit_loss"
   - Look for keywords: "profit", "loss", "P&L", "profit and loss", "how much did I make", "earnings"
   - Extract the game/event name from the query
   - Examples:
     * "What's my profit on Arsenal vs Tottenham" → intent: "query_profit_loss", game_name: "Arsenal vs Tottenham"
     * "Show me P&L for Chelsea game" → intent: "query_profit_loss", game_name: "Chelsea"
     * "How much did I make on Liverpool vs Manchester United" → intent: "query_profit_loss", game_name: "Liverpool vs Manchester United"
3.6. **For vendor balance queries**: Use GET /vendors/:vendor_id/transactions with intent "query_vendor_balance"
   - Look for keywords: "balance", "position", "owe", "owing", "outstanding", "pending", "unpaid", "exposure", "situation", "status", "debit", "credit", "account"
   - **CRITICAL: Extract the vendor name from the query and put it in the payload as "vendor_name"**
   - Look for patterns: "with [vendor]", "from [vendor]", "[vendor]'s balance", "between me and [vendor]"
   - Examples:
     * "What's my balance with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "What's my position with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "How much do I owe Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "How much does Benny owe me" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Who owes who between me and Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "What's outstanding with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "What's pending with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Am I positive or negative with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Is my balance with Benny debit or credit" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Show me Benny's balance" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Give me a balance summary with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "What's my exposure with Benny" → intent: "query_vendor_balance", payload: { vendor_name: "Benny" }
     * "Show me John's account position" → intent: "query_vendor_balance", payload: { vendor_name: "John" }
4. **CRITICAL - Currency Detection and Price Extraction**:
   - **ALWAYS detect and set the "currency" field based on user input**
   - Detect currency from symbols: £ = GBP, $ = USD, € = EUR
   - Detect currency from text: "pounds" = GBP, "dollars" = USD, "euros" = EUR
   - If no symbol or text detected, use the user's current currency: ${userCurrency}
   - Extract the numeric amount WITHOUT the currency symbol
   - **The "currency" field is REQUIRED for all transactions with amounts**
   - **Price can appear in multiple formats:**
     * With currency symbol: "£100", "$150", "€200"
     * With currency text: "100 dollars", "50 pounds", "200 euros"
     * With keywords: "at £100", "for $150", "cost €200"
     * At the end without keywords: "Bought tickets from Benny Arsenal Spurs Long Lower 130" → cost: 130
     * Per unit: "at £100 each" → multiply by quantity for total cost
   - **Price extraction patterns:**
     * Look for numbers after keywords: "at", "for", "cost", "price", "paid", "received"
     * Look for numbers at the END of the sentence (likely the price)
     * Look for numbers with currency symbols anywhere in the text
     * If "each" is mentioned, multiply by quantity to get total cost
   - **Currency detection examples:**
     * "£100" → amount: 100, currency: "GBP"
     * "$150" → amount: 150, currency: "USD"
     * "€200" → amount: 200, currency: "EUR"
     * "100 dollars" → amount: 100, currency: "USD"
     * "50 pounds" → amount: 50, currency: "GBP"
     * "200 euros" → amount: 200, currency: "EUR"
     * "100" (no symbol/text) → amount: 100, currency: "${userCurrency}"
     * "Bought tickets from Benny Arsenal Spurs Long Lower 130" → cost: 130, currency: "${userCurrency}"
     * "2 tickets at £50 each" → cost: 100 (2 × 50), currency: "GBP"
     * "Sold 3 tickets 45" → selling: 45, currency: "${userCurrency}"
     * "Paid Benny $500" → amount: 500, currency: "USD"
     * "Received 300 euros from John" → amount: 300, currency: "EUR"
5. **CRITICAL - Event Name Extraction**:
   - ALWAYS extract the event/game name from user input as a STRING
   - Look for patterns like "Arsenal vs Spurs", "Chelsea game", "for Arsenal", etc.
   - Put the extracted event name in game_id field (e.g., game_id: "Arsenal vs Spurs")
   - DO NOT leave game_id empty if you can extract any team/event name
   - Examples:
     * "Bought tickets for Arsenal vs Spurs" → game_id: "Arsenal vs Spurs"
     * "Sold Chelsea tickets" → game_id: "Chelsea"
     * "2 tickets for the Arsenal game" → game_id: "Arsenal"
     * "Liverpool vs Manchester United tickets" → game_id: "Liverpool vs Manchester United"
6. **CRITICAL - Vendor Name Extraction**:
   - ALWAYS extract the vendor name EXACTLY as the user typed it
   - For "bought_from": Extract the name after "from" (e.g., "from Benny" → "Benny")
   - For "sold_to": Extract the name after "to" (e.g., "to John" → "John")
   - For "vendor_name" (manual transactions): Extract the name after "paid", "received from", or the person mentioned
   - **IMPORTANT: Distinguish between vendor names and payment descriptions**:
     * Vendor names are typically proper nouns (people or company names): "Benny", "John", "Microsoft", "Adobe"
     * Payment descriptions are generic terms: "software subscription", "rent", "utilities", "salary", "fees"
     * If the input contains a description but NO vendor name, leave vendor_name EMPTY
   - DO NOT try to match or modify the vendor name - just extract it as-is
   - The system will handle matching to the vendor list automatically
   - Examples:
     * "Bought from Benny" → bought_from: "Benny"
     * "Sold to John Smith" → sold_to: "John Smith"
     * "Paid Benny £500" → vendor_name: "Benny"
     * "Received $200 from John" → vendor_name: "John"
     * "Paid software subscription" → vendor_name: "" (empty - no vendor mentioned)
     * "Paid rent" → vendor_name: "" (empty - no vendor mentioned)
     * "Paid Adobe subscription £50" → vendor_name: "Adobe"
     * "Paid subscription to Microsoft" → vendor_name: "Microsoft"
7. **Bank Name Extraction (for manual transactions)**:
   - Extract bank account name from user input if mentioned
   - Look for patterns like "from [bank]", "via [bank]", "using [bank]", "[bank] account"
   - DO NOT try to match or modify the bank name - just extract it as-is
   - The system will handle matching to the bank list automatically
   - If no bank mentioned, leave bank_name empty (system will use first bank)
   - Examples:
     * "Paid Benny £500 from Barclays" → bank_name: "Barclays"
     * "Received $200 via HSBC" → bank_name: "HSBC"
     * "Paid using Chase account" → bank_name: "Chase"
     * "Paid £500" (no bank mentioned) → bank_name: "" (empty)
8. **CRITICAL - Area/Section Extraction**:
   - Extract area/section from user input if mentioned
   - Users can specify ANY custom area name (e.g., "VIP", "Premium", "Executive", etc.)
   - Common predefined areas (use these if they match, but NOT required):
     * "Shortside Upper"
     * "Shortside Lower"
     * "Shortside Hospitality"
     * "Longside Hospitality"
     * "Longside Upper"
     * "Longside Upper Central"
     * "Longside Lower"
     * "Longside Lower Central"
   - Match user input to predefined areas if similar (case-insensitive, fuzzy matching):
     * "short upper", "shortside up" → "Shortside Upper"
     * "long lower", "longside low" → "Longside Lower"
   - **If user input doesn't match predefined areas, use their EXACT input as-is:**
     * "VIP" → area: "VIP"
     * "Premium Section" → area: "Premium Section"
     * "Executive Box" → area: "Executive Box"
     * "North Stand" → area: "North Stand"
   - Examples:
     * "Bought 2 tickets in Shortside Upper" → area: "Shortside Upper"
     * "Tickets at VIP section" → area: "VIP"
     * "Longside hospitality seats" → area: "Longside Hospitality"
     * "Premium area tickets" → area: "Premium"
   - If no area mentioned, leave empty (system will assign random default from predefined list)
9. Extract block, row, seats if mentioned
10. **Calculate total cost/selling price:**
   - If price is "per ticket" or "each", multiply by quantity to get total
   - If price is at the end without keywords, it's likely the TOTAL cost/selling price
   - Examples:
     * "2 tickets at £50 each" → quantity: 2, cost: 100 (2 × 50)
     * "Bought 3 tickets 150" → quantity: 3, cost: 150 (total, not per ticket)
     * "Sold 2 tickets for $100 each" → quantity: 2, selling: 200 (2 × 100)
11. **For manual transactions - CRITICAL**:
   - **Direction detection**:
     * "paid", "payment", "sent", "transferred", "made" → direction: "out"
     * "received", "got", "collected" → direction: "in"
     * Short answers: "made", "paid", "out" → direction: "out"
     * Short answers: "received", "in" → direction: "in"
     * If unclear or not mentioned → leave direction EMPTY (null or undefined)
   - **Mode detection (cash vs bank)**:
     * If bank name mentioned ("from Barclays", "via HSBC", "Barclays", "HSBC") → mode: "standard"
     * If "cash" mentioned → mode: "journal_voucher"
     * Short answers: just bank name like "Barclays" → mode: "standard", bank_name: "Barclays"
     * Short answers: "cash" → mode: "journal_voucher"
     * Short answers: "bank" or "bank transfer" → mode: "standard" (bank_name will be empty, system will use first bank)
     * If neither mentioned → leave mode EMPTY (null or undefined)
   - **Amount detection**:
     * Extract amount using same rules as Rule #4
     * Short answers: just a number with currency like "£500", "$100" → extract amount and currency
     * Short answers: just a number like "500" → amount: 500, currency: user's current currency
     * If no amount found → leave amount as 0 or undefined
   - **Examples with missing fields**:
     * "Paid Benny" → vendor_name: "Benny", direction: "out", amount: undefined, mode: undefined
     * "Received from John" → vendor_name: "John", direction: "in", amount: undefined, mode: undefined
     * "Payment to Benny" → vendor_name: "Benny", direction: "out", amount: undefined, mode: undefined
     * "Paid Benny £500 from Barclays" → vendor_name: "Benny", amount: 500, currency: "GBP", direction: "out", mode: "standard", bank_name: "Barclays"
     * "Received cash £200 from John" → vendor_name: "John", amount: 200, currency: "GBP", direction: "in", mode: "journal_voucher"
   - **Short clarification answers (when user is answering a specific question)**:
     * "£500" → amount: 500, currency: "GBP"
     * "$100" → amount: 100, currency: "USD"
     * "500" → amount: 500, currency: "${userCurrency}"
     * "made" or "paid" → direction: "out"
     * "received" → direction: "in"
     * "cash" → mode: "journal_voucher"
     * "bank" → mode: "standard"
     * "bank transfer" → mode: "standard"
     * "Barclays" → mode: "standard", bank_name: "Barclays"
     * "from Barclays" → mode: "standard", bank_name: "Barclays"
12. Identify missing required fields
13. **DO NOT set vendor IDs** - only extract vendor NAMES, the system will map them to IDs
14. **ALWAYS set "notes" field to empty string ""** - never leave it as null or undefined

**COMPREHENSIVE EXAMPLES:**

Example 1: "Bought tickets from Benny Arsenal Spurs Long Lower 130"
→ intent: "purchase", bought_from: "Benny", game_id: "Arsenal Spurs", area: "Longside Lower", cost: 130, currency: "${userCurrency}", notes: ""

Example 2: "Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each"
→ intent: "purchase", quantity: 2, bought_from: "Benny", game_id: "Arsenal vs Spurs", cost: 200 (2 × 100), currency: "GBP", notes: ""

Example 3: "Sold 3 tickets to John Chelsea game Shortside Upper $45"
→ intent: "order", quantity: 3, sold_to: "John", game_id: "Chelsea", area: "Shortside Upper", selling: 45, currency: "USD", notes: ""

Example 4: "Paid Benny $500"
→ intent: "manual_transaction", vendor_name: "Benny", amount: 500, currency: "USD", direction: "out", notes: ""

Example 5: "Received 300 euros from John"
→ intent: "manual_transaction", vendor_name: "John", amount: 300, currency: "EUR", direction: "in", notes: ""

Example 6: "Bought 2 tickets for Arsenal at 50 pounds each"
→ intent: "purchase", quantity: 2, game_id: "Arsenal", cost: 100 (2 × 50), currency: "GBP", notes: ""

Example 7: "Sold tickets Liverpool €75"
→ intent: "order", game_id: "Liverpool", selling: 75, currency: "EUR", notes: ""

Example 8: "Paid software subscription" (description, no vendor)
→ intent: "manual_transaction", vendor_name: "", direction: "out", amount: undefined, mode: undefined, notes: ""

Example 9: "Paid rent" (description, no vendor)
→ intent: "manual_transaction", vendor_name: "", direction: "out", amount: undefined, mode: undefined, notes: ""

Example 10: "Paid Adobe subscription £50" (vendor + description)
→ intent: "manual_transaction", vendor_name: "Adobe", amount: 50, currency: "GBP", direction: "out", notes: ""

Example 11: "Paid Benny" (missing amount and mode)
→ intent: "manual_transaction", vendor_name: "Benny", direction: "out", amount: undefined, mode: undefined, notes: ""

Example 12: "Received from John" (missing amount and mode)
→ intent: "manual_transaction", vendor_name: "John", direction: "in", amount: undefined, mode: undefined, notes: ""

Example 13: "Payment" (missing everything)
→ intent: "manual_transaction", amount: undefined, direction: undefined, mode: undefined, notes: ""

Example 14: "£500" (short answer for amount question)
→ intent: "manual_transaction", amount: 500, currency: "GBP", notes: ""

Example 15: "made" or "paid" (short answer for direction question)
→ intent: "manual_transaction", direction: "out", notes: ""

Example 16: "received" (short answer for direction question)
→ intent: "manual_transaction", direction: "in", notes: ""

Example 17: "cash" (short answer for mode question)
→ intent: "manual_transaction", mode: "journal_voucher", notes: ""

Example 18: "bank" or "bank transfer" (short answer for mode question, no specific bank)
→ intent: "manual_transaction", mode: "standard", notes: ""

Example 19: "Barclays" or "from Barclays" (short answer for bank question)
→ intent: "manual_transaction", mode: "standard", bank_name: "Barclays", notes: ""

Example 20: "What's my profit on Arsenal vs Tottenham" (profit/loss query)
→ intent: "query_profit_loss", game_name: "Arsenal vs Tottenham"

Example 21: "Show me P&L for Chelsea game" (profit/loss query)
→ intent: "query_profit_loss", game_name: "Chelsea"

Example 22: "What's my balance with Benny" (vendor balance query)
→ intent: "query_vendor_balance", payload: { vendor_name: "Benny" }

Example 23: "How much do I owe Benny" (vendor balance query)
→ intent: "query_vendor_balance", payload: { vendor_name: "Benny" }

Example 24: "Show me John's account position" (vendor balance query)
→ intent: "query_vendor_balance", payload: { vendor_name: "John" }

Respond ONLY with valid JSON in this format:
{
  "intent": "purchase" | "order" | "manual_transaction" | "query_profit_loss" | "query_vendor_balance" | "query" | "create_counterparty" | "unknown",
  "confidence": 0.0-1.0,
  "apiEndpoint": "/path/to/endpoint",
  "method": "GET" | "POST",
  "payload": { ... },
  "missingFields": ["field1", "field2"],
  "explanation": "Brief explanation of what will be done"
}`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInput }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from LLM')
    }

    const result: LLMAnalysisResult = JSON.parse(content)
    
    // Validate and set defaults
    if (!result.intent) result.intent = 'unknown'
    if (!result.confidence) result.confidence = 0
    if (!result.apiEndpoint) result.apiEndpoint = ''
    if (!result.method) result.method = 'POST'
    if (!result.payload) result.payload = {}
    if (!result.missingFields) result.missingFields = []
    if (!result.explanation) result.explanation = 'Processing your request...'

    return result
  } catch (error) {
    console.error('LLM Analysis Error:', error)
    throw error
  }
}
