import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Minimize2, Maximize2, Maximize } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { analyzeInput, executePurchase, executeOrder, executeManualTransaction, executeCreateCounterparty, executeQuery, executeProfitLossQuery, executeVendorBalanceQuery, formatTransactionSummary, type ChatbotMessage, type ClarificationState } from '../api/chatbot'
import { useSession } from '../context/SessionContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchVendors } from '../api/vendors'
import { fetchBanks } from '../api/banks'
import { searchFixturesByName } from '../api/events'
import { TransactionEditForm } from './TransactionEditForm'

export const FloatingChatbot: React.FC = () => {
  const { token } = useSession()
  const { currency, formatCurrency, convertToBase, convertFromBase } = useCurrency()
  const navigate = useNavigate()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  
  // Load messages from localStorage on mount
  const loadMessagesFromStorage = () => {
    try {
      const saved = localStorage.getItem('chatbot_messages')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Convert timestamp strings back to Date objects
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }
    } catch (error) {
      console.error('Error loading chat history:', error)
    }
    return [
      {
        id: '1',
        role: 'assistant' as const,
        content: 'Hi! I\'m Buddy, your StockBuddy assistant! 👋',
        timestamp: new Date()
      }
    ]
  }
  
  const [messages, setMessages] = useState<ChatbotMessage[]>(loadMessagesFromStorage())
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<ChatbotMessage | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editedPayload, setEditedPayload] = useState<any>(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clarificationState, setClarificationState] = useState<ClarificationState | undefined>(undefined)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [vendors, setVendors] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  
  // Message history navigation
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [tempInput, setTempInput] = useState('')
  
  // Track current conversation tile (session)
  const [currentTileIndex, setCurrentTileIndex] = useState(0)
  
  // Get user message history (only user messages, not assistant or system)
  const getUserMessageHistory = () => {
    return messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .reverse() // Most recent first
  }
  
  // Helper function to convert technical errors to friendly messages
  const getFriendlyErrorMessage = (technicalError: string, transactionType: 'purchase' | 'order' | 'manual_transaction' | 'counterparty'): string => {
    const errorLower = technicalError.toLowerCase()
    
    // Common error patterns
    if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
      if (transactionType === 'purchase') {
        return "Hmm, I couldn't find that vendor or event in the system. Could you double-check the names and try again?"
      } else if (transactionType === 'order') {
        return "I couldn't find that customer or event. Mind checking the details and trying once more?"
      } else if (transactionType === 'counterparty') {
        return "Looks like there's an issue creating that contact. The name might already exist or there's missing information."
      }
      return "I couldn't find that in the system. Could you verify the details?"
    }
    
    if (errorLower.includes('already exists') || errorLower.includes('duplicate')) {
      return "Looks like that already exists in the system. Maybe try a different name?"
    }
    
    if (errorLower.includes('invalid') || errorLower.includes('validation')) {
      return "Some of the information doesn't look quite right. Could you check the details and try again?"
    }
    
    if (errorLower.includes('required') || errorLower.includes('missing')) {
      return "I'm missing some required information. Let's try filling in all the details again."
    }
    
    if (errorLower.includes('unauthorized') || errorLower.includes('permission')) {
      return "Oops, looks like you don't have permission to do that. You might need to check with an admin."
    }
    
    if (errorLower.includes('network') || errorLower.includes('connection')) {
      return "I'm having trouble connecting right now. Could you try again in a moment?"
    }
    
    // Generic friendly error
    return `Something went wrong on my end. Here's what I know: ${technicalError}\n\nWant to try again?`
  }
  
  // Get messages for current tile only (after last tile separator)
  const getCurrentTileMessages = () => {
    // Find the last tile separator or start from beginning
    let startIndex = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'system' && messages[i].content === '__TILE_SEPARATOR__') {
        startIndex = i + 1
        break
      }
    }
    return messages.slice(startIndex)
  }
  
  // Start a new conversation tile (invisible separator for context management)
  const startNewTile = () => {
    const newTileMessage: ChatbotMessage = {
      id: Date.now().toString(),
      role: 'system',
      content: '__TILE_SEPARATOR__', // Internal marker, not displayed
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newTileMessage])
    setCurrentTileIndex(prev => prev + 1)
  }
  
  // Auto-focus input when chatbot opens or messages change
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current && !isProcessing) {
      inputRef.current.focus()
    }
  }, [isOpen, isMinimized, messages, isProcessing])
  
  // Save messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('chatbot_messages', JSON.stringify(messages))
    } catch (error) {
      console.error('Error saving chat history:', error)
    }
  }, [messages])
  
  // Save pendingConfirmation to localStorage
  useEffect(() => {
    try {
      if (pendingConfirmation) {
        localStorage.setItem('chatbot_pending_confirmation', JSON.stringify(pendingConfirmation))
      } else {
        localStorage.removeItem('chatbot_pending_confirmation')
      }
    } catch (error) {
      console.error('Error saving pending confirmation:', error)
    }
  }, [pendingConfirmation])
  
  // Load pendingConfirmation from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chatbot_pending_confirmation')
      if (saved) {
        const parsed = JSON.parse(saved)
        setPendingConfirmation({
          ...parsed,
          timestamp: new Date(parsed.timestamp)
        })
      }
    } catch (error) {
      console.error('Error loading pending confirmation:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  useEffect(() => {
    // Load vendors and banks for name resolution
    if (token && isOpen) {
      fetchVendors(token).then(result => {
        if (result.ok) {
          setVendors(result.data.data.vendors)
        }
      })
      
      fetchBanks(token).then(result => {
        if (result.ok) {
          setBanks(result.data.data)
        }
      })
      
      console.log('Chatbot ready - events will be auto-detected from user input')
    }
  }, [token, isOpen])
  
  // Search for events dynamically - matches FixtureSearch component logic exactly
  const searchEvents = async (query: string): Promise<any[]> => {
    if (!token || !query || query.length < 2) {
      return []
    }
    
    try {
      const trimmed = query.replace(/\s+/g, ' ').trim()
      
      // Parse query into tokens (same as FixtureSearch)
      const splitRegex = /\s+(?:vs|vs\.|v|v\.|@)\s+/i
      const [homeSegment, awaySegment] = trimmed.split(splitRegex)
      
      const sanitizeTokens = (segment?: string) =>
        segment
          ? segment.toLowerCase().split(/\s+/).filter(Boolean)
          : []
      
      const homeTokens = sanitizeTokens(homeSegment)
      const awayTokens = sanitizeTokens(awaySegment)
      
      const normalizedQuery = trimmed
        .replace(/\b(?:vs|vs\.|v|v\.|@)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      const normalizedTokens = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean)
      
      // Generate candidate queries (same as FixtureSearch)
      const candidates = new Set<string>()
      if (normalizedQuery) candidates.add(normalizedQuery)
      if (homeTokens.length) candidates.add(homeTokens.join(' '))
      if (awayTokens.length) candidates.add(awayTokens.join(' '))
      normalizedTokens.forEach(token => candidates.add(token))
      
      const candidateQueries = Array.from(candidates).filter(entry => entry.trim().length).slice(0, 4)
      
      if (candidateQueries.length === 0) {
        console.log('❌ No valid candidate queries generated')
        return []
      }
      
      console.log('🔍 Searching with candidate queries:', candidateQueries)
      
      // Search with all candidate queries in parallel (same as FixtureSearch)
      const responses = await Promise.all(
        candidateQueries.map(candidate =>
          searchFixturesByName(token, candidate, { upcomingOnly: true, limit: 50 })
        )
      )
      
      // Collect and deduplicate results (same as FixtureSearch)
      const collected: any[] = []
      const seen = new Set<string>()
      
      responses.forEach(result => {
        if (result.ok && result.data.data) {
          result.data.data.forEach((item: any) => {
            const key = item.id ?? `${item.home_team}-${item.away_team}-${item.date}`
            if (!seen.has(key)) {
              seen.add(key)
              collected.push(item)
            }
          })
        }
      })
      
      // Filter results to match original query tokens (same as FixtureSearch)
      const filtered = collected.filter(fixture => {
        const homeName = fixture.home_team.toLowerCase()
        const awayName = fixture.away_team.toLowerCase()
        
        // If we have home tokens, they must all match home team
        if (homeTokens.length && !homeTokens.every(token => homeName.includes(token))) {
          return false
        }
        
        // If we have away tokens, they must all match away team
        if (awayTokens.length && !awayTokens.every(token => awayName.includes(token))) {
          return false
        }
        
        // If no specific home/away split, all tokens must match somewhere
        if (!homeTokens.length && !awayTokens.length) {
          const haystack = `${homeName} ${awayName}`
          return normalizedTokens.every(token => haystack.includes(token))
        }
        
        return true
      })
      
      console.log(`✅ Found ${filtered.length} matches after filtering`)
      return filtered
    } catch (error) {
      console.error('Error searching events:', error)
      return []
    }
  }

  const addMessage = (role: 'user' | 'assistant' | 'system', content: string, extra?: Partial<ChatbotMessage>) => {
    const newMessage: ChatbotMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
      ...extra
    }
    setMessages(prev => [...prev, newMessage])
    return newMessage
  }

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return
    if (!token) {
      addMessage('system', 'Please log in to use the chatbot.')
      return
    }

    const userInput = input.trim()
    setInput('')
    addMessage('user', userInput)
    setIsProcessing(true)
    
    // Check for greetings and respond with personality
    const greetingPatterns = /^(hi|hello|hey|hiya|howdy|greetings|good morning|good afternoon|good evening|what's up|whats up|sup|yo)\b/i
    if (greetingPatterns.test(userInput)) {
      const greetingResponses = [
        'Hey there! 👋 I\'m Buddy, ready to help with your ticket inventory. What can I do for you today?',
        'Hello! 😊 Buddy here! Need help with purchases, sales, or checking balances? Just let me know!',
        'Hi! 🎫 I\'m Buddy, your ticket management assistant. How can I help you today?',
        'Hey! 👋 Buddy at your service! Whether it\'s recording transactions or checking vendor balances, I\'ve got you covered!',
        'Hello there! 😊 I\'m Buddy! Ready to help you manage your inventory. What would you like to do?'
      ]
      const randomGreeting = greetingResponses[Math.floor(Math.random() * greetingResponses.length)]
      addMessage('assistant', randomGreeting)
      setIsProcessing(false)
      return
    }
    
    // Add a temporary "typing" message
    addMessage('assistant', '...', { id: 'typing-indicator' })

    try {
      // Pass clarification state and only current tile messages for context
      const currentTileMessages = getCurrentTileMessages()
      const response = await analyzeInput(
        userInput, 
        vendors, 
        banks, 
        searchEvents, 
        currency, 
        convertToBase, 
        formatCurrency,
        clarificationState,
        [],
        currentTileMessages // Pass only current tile messages
      )
      
      // Remove typing indicator
      setMessages(prev => prev.filter(msg => msg.id !== 'typing-indicator'))
      
      // Handle clarification state from response
      if (response.clarificationState) {
        console.log('📝 Received clarification state:', response.clarificationState)
        setClarificationState(response.clarificationState)
        addMessage('assistant', response.message, {
          intent: response.intent,
          clarificationState: response.clarificationState
        })
      } else if (response.requiresConfirmation) {
        // Clear clarification state when we reach confirmation
        setClarificationState(undefined)
        const confirmMsg = addMessage('assistant', response.message, {
          intent: response.intent,
          requiresConfirmation: true,
          apiPayload: response.payload
        })
        setPendingConfirmation(confirmMsg)
      } else if (response.intent.intent === 'query') {
        // Clear clarification state
        setClarificationState(undefined)
        // Execute query immediately
        const result = await executeQuery(token, response.intent)
        if (result.ok) {
          const formattedResult = formatQueryResult(result.data)
          addMessage('assistant', formattedResult)
        } else {
          addMessage('assistant', result.error)
        }
      } else if (response.intent.intent === 'query_profit_loss') {
        // Clear clarification state
        setClarificationState(undefined)
        // Execute profit/loss query
        const gameName = response.intent.payload?.game_name || ''
        const result = await executeProfitLossQuery(token, gameName, searchEvents)
        if (result.ok && result.data) {
          const { eventName, totalQuantity, totalCost, targetSelling, projectedProfit, recordCount } = result.data
          const formattedResult = `📊 Profit & Loss for ${eventName}\n\n` +
            `Total Records: ${recordCount}\n` +
            `Total Quantity: ${totalQuantity} tickets\n` +
            `Total Cost: ${formatCurrency(totalCost)} (Purchase price)\n` +
            `Target Selling: ${formatCurrency(targetSelling)} (Asking price)\n` +
            `Projected Profit: ${formatCurrency(projectedProfit)} (Based on target sell)`
          addMessage('assistant', formattedResult)
          
          // Clear clarification state before starting new tile
          setClarificationState(undefined)
          
          // Start a new conversation tile after showing P&L results
          setTimeout(() => startNewTile(), 500)
        } else {
          const errorMsg = result.ok ? 'Failed to fetch profit/loss data' : result.error
          addMessage('assistant', errorMsg)
        }
      } else if (response.intent.intent === 'query_vendor_balance') {
        // Clear clarification state
        setClarificationState(undefined)
        // Execute vendor balance query
        const vendorName = response.intent.payload?.vendor_name || ''
        const result = await executeVendorBalanceQuery(token, vendorName, vendors)
        if (result.ok && result.data) {
          const { vendorName: name, balance, totals } = result.data
          
          // Interpret balance: positive = they owe you, negative = you owe them
          const absBalance = Math.abs(balance)
          let balanceInterpretation = ''
          let positionDescription = ''
          
          if (balance > 0) {
            balanceInterpretation = `${name} owes you ${formatCurrency(absBalance)}`
            positionDescription = 'You are in CREDIT (positive position)'
          } else if (balance < 0) {
            balanceInterpretation = `You owe ${name} ${formatCurrency(absBalance)}`
            positionDescription = 'You are in DEBIT (negative position)'
          } else {
            balanceInterpretation = 'Account is settled (zero balance)'
            positionDescription = 'No outstanding balance'
          }
          
          const formattedResult = `💰 Balance with ${name}\n\n` +
            `Current Balance: ${formatCurrency(balance)}\n` +
            `${balanceInterpretation}\n` +
            `${positionDescription}\n\n` +
            `Transaction Summary:\n` +
            `Total: ${formatCurrency(totals.total)}\n` +
            `Paid: ${formatCurrency(totals.paid)}\n` +
            `Pending: ${formatCurrency(totals.pending)}\n` +
            `Outstanding (Owed): ${formatCurrency(totals.owed)}`
          
          addMessage('assistant', formattedResult)
          
          // Clear clarification state before starting new tile
          setClarificationState(undefined)
          
          // Start a new conversation tile after showing balance results
          setTimeout(() => startNewTile(), 500)
        } else if (!result.ok) {
          addMessage('assistant', result.error)
        } else {
          addMessage('assistant', 'Failed to fetch vendor balance data')
        }
      } else {
        // Clear clarification state
        setClarificationState(undefined)
        addMessage('assistant', response.message, {
          intent: response.intent
        })
      }
    } catch (error) {
      // Remove typing indicator on error
      setMessages(prev => prev.filter(msg => msg.id !== 'typing-indicator'))
      // Clear clarification state on error
      setClarificationState(undefined)
      addMessage('assistant', `Sorry, something went wrong: ${error instanceof Error ? error.message : 'Please try again.'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirm = async () => {
    if (!pendingConfirmation || !token) return

    // Use editedPayload if it exists (user made edits), otherwise use original
    let payload = editedPayload || pendingConfirmation.apiPayload
    const intent = pendingConfirmation.intent!
    
    console.log('Confirming with payload:', payload)

    // Validate required fields before submission
    const validationErrors: string[] = []
    
    if (intent.intent === 'purchase') {
      if (!payload.game_id) validationErrors.push('Event/Game is required')
      if (!payload.quantity || payload.quantity < 1) validationErrors.push('Quantity must be at least 1')
      if (!payload.area) validationErrors.push('Area/Section is required')
      if (!payload.bought_from_vendor_id) validationErrors.push('Vendor (Bought From) is required')
      if (!payload.cost || payload.cost <= 0) validationErrors.push('Total Cost must be greater than 0')
    } else if (intent.intent === 'order') {
      if (!payload.game_id) validationErrors.push('Event/Game is required')
      if (!payload.quantity || payload.quantity < 1) validationErrors.push('Quantity must be at least 1')
      if (!payload.area) validationErrors.push('Area/Section is required')
      if (!payload.sold_to_vendor_id) validationErrors.push('Vendor (Sold To) is required')
      if (!payload.selling || payload.selling <= 0) validationErrors.push('Selling Price must be greater than 0')
    } else if (intent.intent === 'manual_transaction') {
      if (!payload.amount || payload.amount <= 0) validationErrors.push('Amount must be greater than 0')
      if (payload.mode === 'standard' && !payload.bank_account_id) validationErrors.push('Bank Account is required')
      if (!payload.vendor_id) validationErrors.push('Vendor is required')
    } else if (intent.intent === 'create_counterparty') {
      if (!payload.name) validationErrors.push('Name is required')
      if (!payload.phone) validationErrors.push('Phone is required')
    }
    
    // If validation fails, show error message
    if (validationErrors.length > 0) {
      const errorMessage = `❌ Cannot submit - please fix the following:\n\n${validationErrors.map(e => `• ${e}`).join('\n')}\n\nPlease click "Edit" to update the required fields.`
      addMessage('assistant', errorMessage)
      return
    }

    setIsProcessing(true)
    setPendingConfirmation(null)

    try {
      if (intent.intent === 'purchase') {
        const result = await executePurchase(token, payload)
        
        if (result.ok) {
          addMessage('assistant', '✅ Purchase created successfully!')
          // Start a new conversation tile after successful transaction
          setTimeout(() => startNewTile(), 500)
        } else {
          const friendlyError = getFriendlyErrorMessage(result.error || 'Unknown error', 'purchase')
          addMessage('assistant', friendlyError)
        }
      } else if (intent.intent === 'order') {
        const result = await executeOrder(token, payload)
        
        if (result.ok) {
          addMessage('assistant', '✅ Order created successfully!')
          // Start a new conversation tile after successful transaction
          setTimeout(() => startNewTile(), 500)
        } else {
          const friendlyError = getFriendlyErrorMessage(result.error || 'Unknown error', 'order')
          addMessage('assistant', friendlyError)
        }
      } else if (intent.intent === 'manual_transaction') {
        const result = await executeManualTransaction(token, payload)
        
        if (result.ok) {
          addMessage('assistant', '✅ Transaction created successfully!')
          // Start a new conversation tile after successful transaction
          setTimeout(() => startNewTile(), 500)
        } else {
          const friendlyError = getFriendlyErrorMessage(result.error || 'Unknown error', 'manual_transaction')
          addMessage('assistant', friendlyError)
        }
      } else if (intent.intent === 'create_counterparty') {
        const result = await executeCreateCounterparty(token, payload)
        
        if (result.ok) {
          addMessage('assistant', '✅ Counterparty created successfully!')
          // Reload vendors
          const vendorsResult = await fetchVendors(token)
          if (vendorsResult.ok) {
            setVendors(vendorsResult.data.data.vendors)
          }
        } else {
          const friendlyError = getFriendlyErrorMessage(result.error || 'Unknown error', 'counterparty')
          addMessage('assistant', friendlyError)
        }
      }
    } catch (error) {
      addMessage('assistant', 'Failed to execute the action. Please try again.')
    } finally {
      setIsProcessing(false)
      setEditMode(false)
      setEditedPayload(null)
    }
  }

  const handleEdit = () => {
    if (!pendingConfirmation) return
    console.log('Edit clicked, current payload:', pendingConfirmation.apiPayload)
    setEditMode(true)
    setEditedPayload(JSON.parse(JSON.stringify(pendingConfirmation.apiPayload)))
  }

  const handleCancel = () => {
    setPendingConfirmation(null)
    setEditMode(false)
    setEditedPayload(null)
    addMessage('assistant', 'Action cancelled.')
  }
  
  const handleClearHistory = () => {
    const initialMessage: ChatbotMessage = {
      id: '1',
      role: 'assistant',
      content: 'Hi! I\'m Buddy, your StockBuddy assistant! 👋',
      timestamp: new Date()
    }
    setMessages([initialMessage])
    setPendingConfirmation(null)
    setEditMode(false)
    setEditedPayload(null)
    localStorage.removeItem('chatbot_messages')
    localStorage.removeItem('chatbot_pending_confirmation')
    setShowClearModal(false)
  }

  const formatQueryResult = (data: any): string => {
    // Format transaction data
    if (data.data?.summary) {
      const summary = data.data.summary
      return `📊 Transaction Summary:\n\nTotal: £${summary.total?.toFixed(2) || 0}\nPaid: £${summary.paid?.toFixed(2) || 0}\nPending: £${summary.pending?.toFixed(2) || 0}\nOwed: £${summary.owed?.toFixed(2) || 0}`
    }
    
    // Format vendor data
    if (data.data?.vendors) {
      const vendorsList = data.data.vendors.map((v: any) => 
        `${v.name}: £${v.balance?.toFixed(2) || 0}`
      ).join('\n')
      return `💰 Vendors:\n\n${vendorsList}`
    }

    return 'Query executed.'
  }

  const toggleOpen = () => {
    setIsOpen(!isOpen)
    setIsMinimized(false)
  }

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized)
  }

  const openFullPage = () => {
    navigate('/chatbot')
  }

  // Don't show floating chatbot on the chatbot page itself
  if (location.pathname === '/chatbot') {
    return null
  }

  if (!token) {
    return null // Don't show chatbot if not logged in
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={toggleOpen}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg transition-all hover:scale-110 hover:shadow-xl"
          aria-label="Open chatbot"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Chatbot Window */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-lg shadow-2xl transition-all ${
            isMinimized ? 'h-14 w-80' : 'h-[600px] w-[420px]'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 rounded-t-lg">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <h3 className="font-semibold">Buddy - Your AI Assistant</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearModal(true)}
                className="hover:bg-white/20 rounded p-1 transition"
                aria-label="Clear chat history"
                title="Clear chat history"
              >
                <span className="text-sm">🗑️</span>
              </button>
              <button
                onClick={openFullPage}
                className="hover:bg-white/20 rounded p-1 transition"
                aria-label="Open in full page"
                title="Open in full page"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <button
                onClick={toggleMinimize}
                className="hover:bg-white/20 rounded p-1 transition"
                aria-label={isMinimized ? 'Maximize' : 'Minimize'}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={toggleOpen}
                className="hover:bg-white/20 rounded p-1 transition"
                aria-label="Close chatbot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages - Only show when not minimized */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => {
                  // Skip tile separator (internal marker, not displayed)
                  if (msg.role === 'system' && msg.content === '__TILE_SEPARATOR__') {
                    return null
                  }
                  
                  return (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : msg.role === 'system'
                          ? 'bg-yellow-100 text-yellow-900'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {msg.id === 'typing-indicator' ? (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}
                      {msg.requiresConfirmation && msg.id === pendingConfirmation?.id && (
                        <div className="mt-3 space-y-2">
                          {editMode && editedPayload ? (
                            <TransactionEditForm
                              intent={msg.intent?.intent || 'manual_transaction'}
                              initialPayload={editedPayload}
                              vendors={vendors}
                              banks={banks}
                              onSearchEvents={searchEvents}
                              userCurrency={currency}
                              formatCurrency={formatCurrency}
                              convertFromBase={convertFromBase}
                              convertToBase={convertToBase}
                              onSave={(payload) => {
                                console.log('Save clicked, new payload:', payload)
                                
                                // Round amounts to 2 decimal places
                                const roundedPayload = { ...payload }
                                if (roundedPayload.cost) {
                                  roundedPayload.cost = Math.round(roundedPayload.cost * 100) / 100
                                }
                                if (roundedPayload.selling) {
                                  roundedPayload.selling = Math.round(roundedPayload.selling * 100) / 100
                                }
                                if (roundedPayload.amount) {
                                  roundedPayload.amount = Math.round(roundedPayload.amount * 100) / 100
                                }
                                
                                setEditedPayload(roundedPayload)
                                
                                // Update the message content with the new payload
                                if (pendingConfirmation && pendingConfirmation.intent) {
                                  const updatedIntent = {
                                    ...pendingConfirmation.intent,
                                    payload: roundedPayload
                                  }
                                  
                                  // Generate new explanation based on intent type
                                  let newExplanation = updatedIntent.explanation
                                  if (updatedIntent.intent === 'purchase') {
                                    newExplanation = `I'll create a purchase record for ${roundedPayload.quantity || 0} ticket(s).`
                                  } else if (updatedIntent.intent === 'order') {
                                    newExplanation = `I'll create a sale record for ${roundedPayload.quantity || 0} ticket(s).`
                                  } else if (updatedIntent.intent === 'manual_transaction') {
                                    const direction = roundedPayload.direction === 'in' ? 'receipt' : 'payment'
                                    newExplanation = `I'll record this ${direction} transaction.`
                                  } else if (updatedIntent.intent === 'create_counterparty') {
                                    newExplanation = `I'll create a new counterparty named '${roundedPayload.name || ''}' with the role of ${roundedPayload.role || 'trader'}.`
                                  }
                                  
                                  const newSummary = formatTransactionSummary(updatedIntent, formatCurrency)
                                  const updatedMessage = `${newExplanation}\n\n${newSummary}\n\nPlease review and edit if needed.`
                                  
                                  console.log('Updated message:', updatedMessage)
                                  
                                  // Create updated confirmation object with completely new reference
                                  const updatedConfirmation = { 
                                    id: pendingConfirmation.id,
                                    role: pendingConfirmation.role,
                                    timestamp: pendingConfirmation.timestamp,
                                    content: updatedMessage, 
                                    requiresConfirmation: true,
                                    apiPayload: roundedPayload,
                                    intent: updatedIntent
                                  }
                                  
                                  console.log('Updating message with ID:', pendingConfirmation.id)
                                  console.log('New content:', updatedMessage)
                                  console.log('Updated confirmation object:', updatedConfirmation)
                                  
                                  // Update the message in the messages array
                                  setMessages(prev => {
                                    const newMessages = prev.map(m => {
                                      if (m.id === pendingConfirmation.id) {
                                        console.log('Found matching message, updating...')
                                        return updatedConfirmation
                                      }
                                      return m
                                    })
                                    console.log('Messages after update:', newMessages)
                                    return newMessages
                                  })
                                  
                                  // Update pendingConfirmation
                                  setPendingConfirmation(updatedConfirmation)
                                  
                                  // Close edit mode AFTER state updates with a small delay
                                  setTimeout(() => {
                                    console.log('Closing edit mode')
                                    setEditMode(false)
                                  }, 0)
                                } else {
                                  // If no pendingConfirmation, just close edit mode
                                  setEditMode(false)
                                }
                              }}
                              onCancel={() => {
                                console.log('Edit cancelled')
                                setEditMode(false)
                              }}
                            />
                          ) : null}
                          {!editMode && (
                            <div className="flex gap-1.5">
                              <button
                                onClick={handleConfirm}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs font-medium"
                              >
                                ✓ Confirm
                              </button>
                              <button
                                onClick={handleEdit}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-xs font-medium"
                              >
                                ✎ Edit
                              </button>
                              <button
                                onClick={handleCancel}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-xs font-medium"
                              >
                                ✕ Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-3">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSend()
                        setHistoryIndex(-1)
                        setTempInput('')
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        const history = getUserMessageHistory()
                        if (history.length === 0) return
                        
                        // Save current input when starting to navigate
                        if (historyIndex === -1) {
                          setTempInput(input)
                        }
                        
                        const newIndex = Math.min(historyIndex + 1, history.length - 1)
                        setHistoryIndex(newIndex)
                        setInput(history[newIndex])
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        const history = getUserMessageHistory()
                        
                        if (historyIndex === -1) return
                        
                        const newIndex = historyIndex - 1
                        if (newIndex === -1) {
                          // Restore the original input
                          setInput(tempInput)
                          setHistoryIndex(-1)
                          setTempInput('')
                        } else {
                          setHistoryIndex(newIndex)
                          setInput(history[newIndex])
                        }
                      }
                    }}
                    placeholder="Type your message..."
                    disabled={isProcessing}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isProcessing || !input.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
                  >
                    {isProcessing ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]" style={{ background: 'rgba(128, 128, 128, 0.3)' }}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Clear Chat History?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to clear all chat history? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition"
                >
                  Clear History
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
