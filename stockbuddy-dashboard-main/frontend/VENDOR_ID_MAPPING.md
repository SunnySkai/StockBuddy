# Comprehensive ID Mapping Solution

## Problem
Users input natural language sentences with entity names (vendors, events, banks), but the backend APIs require IDs. This caused API calls to fail because the IDs were missing.

## Solution
Implemented a comprehensive multi-layered approach to handle ALL name-to-ID mappings:

### Entities Handled:
1. **Vendors** → `bought_from_vendor_id`, `sold_to_vendor_id`, `vendor_id`
2. **Events/Games** → `game_id`
3. **Bank Accounts** → `bank_account_id`

### 1. Data Loading
The chatbot now loads all necessary reference data:
- **Vendors**: Fetched via `fetchVendors()`
- **Banks**: Fetched via `fetchBanks()`
- **Events**: Fetched via `searchFixturesByName()` (recent 50 events)

### 2. LLM Context Enhancement (`src/api/llm.ts`)
- Provides complete lists of all entities with IDs to the LLM
- Format: `"Benny (ID: vendor-123), Arsenal vs Spurs (ID: event-456), HSBC (ID: bank-789)"`
- Explicit instructions to map ALL names to IDs
- Handles case-insensitive matching

### 3. Post-Processing Fallback (`src/api/chatbot.ts`)
Added `mapNamesToIds()` function that:
- Maps vendor names to vendor IDs (bought_from, sold_to, vendor_id)
- Maps event names to game_id (searches by team names)
- Maps bank names to bank_account_id (or uses first bank as default)
- Uses case-insensitive matching
- Acts as a safety net if the LLM misses any mapping

### 4. Comprehensive Validation (`src/api/chatbot.ts`)
Added `validateIds()` function that:
- Checks ALL required IDs are present
- Validates vendor IDs for purchases, orders, and manual transactions
- Validates game_id for purchases and orders
- Validates bank_account_id for standard mode manual transactions
- Provides helpful error messages listing available entities

### 5. User-Friendly Edit Forms (`src/components/TransactionEditForm.tsx`)
Enhanced with dropdowns for ALL entities:
- **Vendor fields**: Dropdown showing all vendors
- **Event/Game fields**: Dropdown showing all events (Home vs Away format)
- **Bank Account fields**: Dropdown showing all banks (for manual transactions)
- Falls back to text input if data not loaded
- Automatically updates both name and ID when selected

### 1. LLM Prompt Enhancement (`src/api/llm.ts`)
- Updated the system prompt to explicitly instruct the LLM to map vendor names to IDs
- Provided the full vendor list with IDs in the format: `"Benny (ID: 123), John (ID: 456)"`
- Added specific rules for case-insensitive matching

### 2. Post-Processing Fallback (`src/api/chatbot.ts`)
Added `mapVendorNamesToIds()` function that:
- Maps `bought_from` → `bought_from_vendor_id` for purchases
- Maps `sold_to` → `sold_to_vendor_id` for orders
- Maps vendor names → `vendor_id` for manual transactions
- Uses case-insensitive matching
- Acts as a safety net if the LLM misses the mapping

### 3. Validation (`src/api/chatbot.ts`)
Added `validateVendorIds()` function that:
- Checks if required vendor IDs are present
- Provides helpful error messages if vendor not found
- Lists available vendors to help users
- Suggests creating a new counterparty if needed

### 4. User-Friendly Edit Form (`src/components/TransactionEditForm.tsx`)
- Changed vendor fields from text inputs to dropdowns
- Shows all available vendors in a select menu
- Automatically updates both name and ID when vendor is selected
- Falls back to text input if no vendors are available

## How It Works

### Example Flow: "Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each"

1. **Data Loading**:
   - Vendors: `[{id: "v1", name: "Benny"}, {id: "v2", name: "John"}]`
   - Events: `[{id: "e1", homeTeam: "Arsenal", awayTeam: "Spurs"}]`
   - Banks: `[{id: "b1", name: "HSBC"}, {id: "b2", name: "Barclays"}]`

2. **LLM Analysis**:
   - Receives context with all entities and IDs
   - Extracts: `bought_from: "Benny"`, `game_id: "Arsenal Spurs"`
   - Maps to: `bought_from_vendor_id: "v1"`, `game_id: "e1"`

3. **Post-Processing** (if LLM missed anything):
   - Checks if `bought_from_vendor_id` exists → ✓
   - Checks if `game_id` is valid ID format → ✓
   - All mappings complete!

4. **Validation**:
   - Verifies `bought_from_vendor_id` is present → ✓
   - Verifies `game_id` is present → ✓
   - All required IDs validated!

5. **User Confirmation**:
   - Shows transaction details with entity names
   - If user clicks "Edit", shows dropdowns:
     - Vendor dropdown: "Benny", "John"
     - Event dropdown: "Arsenal vs Spurs", "Chelsea vs Liverpool"
   - User can easily change selections

## Files Modified

1. **`src/api/llm.ts`**:
   - Enhanced system prompt with ALL entity types
   - Added banks and events lists to LLM context
   - Updated rules to map all IDs

2. **`src/api/chatbot.ts`**:
   - Renamed `mapVendorNamesToIds()` → `mapNamesToIds()`
   - Added event name → game_id mapping
   - Added bank name → bank_account_id mapping
   - Renamed `validateVendorIds()` → `validateIds()`
   - Added validation for game_id and bank_account_id
   - Updated `analyzeInput()` to accept banks and events

3. **`src/components/TransactionEditForm.tsx`**:
   - Added `banks` and `events` props
   - Changed "Event/Game ID" to dropdown (purchase & order forms)
   - Added "Bank Account" dropdown (manual transaction form)
   - Shows entity names in user-friendly format

4. **`src/components/Chatbot.tsx`** & **`src/components/FloatingChatbot.tsx`**:
   - Added state for banks and events
   - Fetch banks via `fetchBanks()`
   - Fetch events via `searchFixturesByName()`
   - Pass all data to `analyzeInput()` and `TransactionEditForm`

## Benefits

1. **Comprehensive**: Handles ALL entity types (vendors, events, banks)
2. **Robust**: Multiple layers ensure IDs are always mapped
3. **User-Friendly**: Dropdowns make selection easy and error-free
4. **Helpful Errors**: Clear messages when entities not found
5. **Flexible**: Works even if LLM makes mistakes
6. **Case-Insensitive**: "benny", "Benny", "BENNY" all work
7. **Smart Matching**: Finds events by team names (partial matching)
8. **Default Fallback**: Uses first bank if none specified

## Testing

Test with these commands:

```
✅ "Bought 2 tickets from Benny for Arsenal vs Spurs at £100 each"
✅ "Sold 2 tickets to John for Chelsea Liverpool at £150 each"
✅ "Paid benny £3,250" (lowercase vendor name)
✅ "Bought from BENNY arsenal spurs" (uppercase, partial event name)
✅ "Paid Benny £500 from HSBC" (with bank name)
❌ "Bought from UnknownVendor" (should show error with available vendors)
❌ "Bought tickets for UnknownGame" (should show error with available events)
```

## Edge Cases Handled

1. **Entity not found**: Shows error with list of available entities
2. **No data loaded**: Falls back to text input
3. **Case mismatch**: Uses case-insensitive matching
4. **Partial event names**: Matches by team names (e.g., "Arsenal" finds "Arsenal vs Spurs")
5. **LLM misses mapping**: Post-processing catches it
6. **User edits entity**: Dropdown allows easy selection
7. **Multiple events with same teams**: Shows all matches in dropdown
8. **Bank not specified**: Uses first bank as default for standard mode
9. **Event ID already correct**: Doesn't re-map if already in ID format

## Future Improvements

1. Add fuzzy matching for similar names (e.g., "Ben" → "Benny")
2. Add "Create new entity" option in dropdowns
3. Cache entity lists to reduce API calls
4. Add entity search/filter for long lists
5. Show entity details (date, balance) in dropdowns
6. Support event search by date or league
7. Remember recently used entities
8. Add validation for event dates (warn if past event)
