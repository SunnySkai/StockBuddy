// Test file for NLP Parser
// Run with: npm test nlpParser.test.ts

import { parseNaturalLanguage } from './nlpParser'

describe('NLP Parser', () => {
  describe('Buy Transactions', () => {
    test('should parse buy transaction with all details', () => {
      const result = parseNaturalLanguage('Bought from Benny 2 tickets Arsenal Spurs Short Upper 100 ea')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('buy')
      expect(result.data.counterparty).toBe('Benny')
      expect(result.data.quantity).toBe(2)
      expect(result.data.amount).toBe(100)
      expect(result.missingFields).toHaveLength(0)
    })

    test('should parse buy transaction with different word order', () => {
      const result = parseNaturalLanguage('Bought 2 Arsenal Spurs Short Upper tickets from Benny at 100 each')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('buy')
      expect(result.data.counterparty).toBe('Benny')
    })

    test('should detect missing amount', () => {
      const result = parseNaturalLanguage('Bought from Benny Arsenal Spurs Short Upper')
      expect(result.type).toBe('transaction')
      expect(result.missingFields).toContain('amount')
    })
  })

  describe('Sell Transactions', () => {
    test('should parse sell transaction', () => {
      const result = parseNaturalLanguage('Sold to Benny 2 tickets Arsenal Spurs Short Upper 150 ea')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('sell')
      expect(result.data.counterparty).toBe('Benny')
      expect(result.data.amount).toBe(150)
      expect(result.data.direction).toBe('in')
    })

    test('should parse sell with different format', () => {
      const result = parseNaturalLanguage('Sold 2 Arsenal Spurs Short Upper tickets to Benny at 150 each')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('sell')
    })
  })

  describe('Payment Transactions', () => {
    test('should parse payment made with GBP', () => {
      const result = parseNaturalLanguage('PAID BENNY 3250 GBP')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('payment_made')
      expect(result.data.counterparty).toBe('BENNY')
      expect(result.data.amount).toBe(3250)
      expect(result.data.direction).toBe('out')
    })

    test('should parse payment made with £ symbol', () => {
      const result = parseNaturalLanguage('I paid Benny £3,250')
      expect(result.type).toBe('transaction')
      expect(result.data.amount).toBe(3250)
    })

    test('should parse payment received', () => {
      const result = parseNaturalLanguage('I received £2,000 from Benny')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('payment_received')
      expect(result.data.direction).toBe('in')
    })

    test('should detect missing bank', () => {
      const result = parseNaturalLanguage('Paid Benny 3250')
      expect(result.missingFields).toContain('payment method/bank')
    })
  })

  describe('Bank Charges', () => {
    test('should parse bank charge', () => {
      const result = parseNaturalLanguage('Bank charged me £25')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('bank_charge')
      expect(result.data.amount).toBe(25)
      expect(result.data.direction).toBe('out')
    })

    test('should parse bank charge with bank name', () => {
      const result = parseNaturalLanguage('Bank charges from ENBD')
      expect(result.data.bank).toBe('ENBD')
    })
  })

  describe('Salary Payments', () => {
    test('should parse salary payment', () => {
      const result = parseNaturalLanguage('I paid Ali Saad salary £1,200')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('salary')
      expect(result.data.counterparty).toBe('Ali Saad')
      expect(result.data.amount).toBe(1200)
      expect(result.data.category).toBe('salary')
    })

    test('should parse staff salary', () => {
      const result = parseNaturalLanguage('Paid staff salary')
      expect(result.data.transactionType).toBe('salary')
    })
  })

  describe('Fee Payments', () => {
    test('should parse bot fee', () => {
      const result = parseNaturalLanguage('Paid bot fee £200')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('fee')
      expect(result.data.amount).toBe(200)
      expect(result.data.category).toBe('ai_bot')
    })

    test('should parse API fee', () => {
      const result = parseNaturalLanguage('Paid API usage fee')
      expect(result.data.transactionType).toBe('fee')
    })

    test('should parse subscription', () => {
      const result = parseNaturalLanguage('Monthly subscription paid')
      expect(result.data.transactionType).toBe('fee')
    })
  })

  describe('Queries', () => {
    test('should parse profit query', () => {
      const result = parseNaturalLanguage("What's my profit for Arsenal vs Tottenham")
      expect(result.type).toBe('query')
      expect(result.data.queryType).toBe('profit')
      expect(result.data.event).toContain('Arsenal')
    })

    test('should parse P&L query', () => {
      const result = parseNaturalLanguage("What's my P&L on the Arsenal vs Spurs game")
      expect(result.type).toBe('query')
      expect(result.data.queryType).toBe('profit')
    })

    test('should parse balance query', () => {
      const result = parseNaturalLanguage('Who owes who between me and Benny')
      expect(result.type).toBe('query')
      expect(result.data.queryType).toBe('balance')
      expect(result.data.counterparty).toBe('Benny')
    })

    test('should parse position query', () => {
      const result = parseNaturalLanguage("What's my position with Benny")
      expect(result.type).toBe('query')
      expect(result.data.queryType).toBe('balance')
    })
  })

  describe('Create Counterparty', () => {
    test('should parse create counterparty with all details', () => {
      const result = parseNaturalLanguage('Create new counterparty Ali Saad trader +96176389293')
      expect(result.type).toBe('create_counterparty')
      expect(result.data.name).toBe('Ali Saad')
      expect(result.data.phone).toBe('+96176389293')
      expect(result.data.role).toBe('trader')
      expect(result.missingFields).toHaveLength(0)
    })

    test('should parse create counterparty with natural language', () => {
      const result = parseNaturalLanguage('Ali Saad is a trader, his number is +96176389293')
      expect(result.type).toBe('create_counterparty')
      expect(result.data.name).toBe('Ali Saad')
    })

    test('should detect missing phone', () => {
      const result = parseNaturalLanguage('Create new counterparty Ali Saad trader')
      expect(result.missingFields).toContain('phone')
    })
  })

  describe('Unknown Intent', () => {
    test('should return unknown for unrecognized input', () => {
      const result = parseNaturalLanguage('Hello world')
      expect(result.type).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    test('should return unknown for gibberish', () => {
      const result = parseNaturalLanguage('asdfghjkl')
      expect(result.type).toBe('unknown')
    })
  })

  describe('Edge Cases', () => {
    test('should handle empty input', () => {
      const result = parseNaturalLanguage('')
      expect(result.type).toBe('unknown')
    })

    test('should handle whitespace only', () => {
      const result = parseNaturalLanguage('   ')
      expect(result.type).toBe('unknown')
    })

    test('should handle case insensitivity', () => {
      const result = parseNaturalLanguage('BOUGHT FROM BENNY 100 GBP')
      expect(result.type).toBe('transaction')
      expect(result.data.transactionType).toBe('buy')
    })

    test('should handle amounts with commas', () => {
      const result = parseNaturalLanguage('Paid Benny £3,250.50')
      expect(result.data.amount).toBe(3250.5)
    })

    test('should handle multiple spaces', () => {
      const result = parseNaturalLanguage('Bought   from   Benny   100')
      expect(result.type).toBe('transaction')
    })
  })
})
