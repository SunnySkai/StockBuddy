import type { BulkColumnHint } from '../types/imports'

export const MEMBER_BULK_COLUMNS: BulkColumnHint[] = [
  {
    key: 'name',
    label: 'name',
    required: true,
    helper: 'Full name used internally and for email communication.',
    example: 'Jamie Carragher'
  },
  {
    key: 'email',
    label: 'email',
    required: true,
    helper: 'Login email address.',
    example: 'jamie@example.com'
  },
  {
    key: 'team_name',
    label: 'team_name',
    required: true,
    helper: 'System resolves the internal team ID and logo from this name automatically.',
    example: 'Liverpool'
  },
  {
    key: 'membership_price',
    label: 'membership_price',
    required: true,
    helper: 'Membership value (numbers or currency formatted strings).',
    example: '250'
  },
  {
    key: 'status',
    label: 'status',
    helper: 'ACTIVE or BANNED. Defaults to ACTIVE when omitted.',
    example: 'ACTIVE'
  },
  {
    key: 'group_label',
    label: 'group_label',
    helper: 'Optional grouping used to cluster rows in the sheet.',
    example: 'Premier clients'
  },
  {
    key: 'account_password',
    label: 'account_password',
    helper: 'Member portal password if prefilling.',
    example: 'changeme123'
  },
  {
    key: 'account_number',
    label: 'account_number',
    helper: 'Membership or fan card number.',
    example: 'ACC-101'
  },
  {
    key: 'phone_number',
    label: 'phone_number',
    helper: 'Primary phone number.',
    example: '+44 7000 123456'
  },
  {
    key: 'date_of_birth',
    label: 'date_of_birth',
    helper: 'YYYY-MM-DD or locale formatted date.',
    example: '1990-03-21'
  },
  {
    key: 'membership_type',
    label: 'membership_type',
    helper: 'Plan or tier name.',
    example: 'Hospitality'
  },
  {
    key: 'member_age_type',
    label: 'member_age_type',
    helper: 'Youth, senior, etc.',
    example: 'Adult'
  },
  { key: 'address', label: 'address', helper: 'Mailing address.', example: '10 Downing St, London' },
  { key: 'post_code', label: 'post_code', helper: 'Postal or zip code.', example: 'SW1A 2AA' }
]

export const VENDOR_BULK_COLUMNS: BulkColumnHint[] = [
  {
    key: 'name',
    label: 'name',
    required: true,
    helper: 'Counterparty or supplier name.',
    example: 'Ticket Partner Ltd.'
  },
  {
    key: 'balance',
    label: 'balance',
    helper: 'Opening balance (positive or negative). Defaults to 0.',
    example: '-1250.50'
  }
]

export const BANK_BULK_COLUMNS: BulkColumnHint[] = [
  {
    key: 'name',
    label: 'name',
    required: true,
    helper: 'Account or wallet name.',
    example: 'Matchday Wallet'
  },
  {
    key: 'balance',
    label: 'balance',
    helper: 'Starting balance for the account. Defaults to 0.',
    example: '5000'
  }
]

export const INVENTORY_EXPORT_COLUMNS: BulkColumnHint[] = [
  { key: 'record_type', label: 'record_type', helper: 'inventory, order, or sale.', example: 'inventory' },
  { key: 'status', label: 'status', helper: 'Available, Reserved, Completed, etc.', example: 'Available' },
  { key: 'game_id', label: 'game_id', helper: 'Fixture identifier tied to the record.', example: 'fixture_1234' },
  { key: 'quantity', label: 'quantity', helper: 'Number of seats or tickets included.', example: '2' },
  { key: 'area', label: 'area', helper: 'Section or block description.', example: 'West Upper' },
  { key: 'row', label: 'row', helper: 'Row or tier label.', example: 'J' },
  { key: 'seats', label: 'seats', helper: 'Seat list when stored as text.', example: '10,11' },
  { key: 'age_group', label: 'age_group', helper: 'Adult, youth, etc.', example: 'Adult' },
  { key: 'bought_from', label: 'bought_from', helper: 'Purchase source.', example: 'Season holder' },
  { key: 'sold_to', label: 'sold_to', helper: 'Selling destination for orders.', example: 'VIP client' },
  { key: 'cost', label: 'cost', helper: 'Purchase amount.', example: '120' },
  { key: 'selling', label: 'selling', helper: 'Target selling price.', example: '220' },
  {
    key: 'seat_assignments',
    label: 'seat_assignments',
    helper: 'Flattened string of seat/member pairings.',
    example: 'A1:member_abc'
  },
  { key: 'notes', label: 'notes', helper: 'Internal notes that appear on the card/grid view.', example: 'Keep together' }
]

export const DIRECTORY_CUSTOMER_BULK_COLUMNS: BulkColumnHint[] = [
  {
    key: 'name',
    label: 'name',
    required: true,
    helper: 'Full customer or group name.',
    example: 'North Stand Group'
  },
  {
    key: 'number',
    label: 'number',
    required: true,
    helper: 'Primary WhatsApp or phone number.',
    example: '+44 7000 000000'
  },
  { key: 'email', label: 'email', helper: 'Optional email for escalations.', example: 'ops@example.com' },
  { key: 'notes', label: 'notes', helper: 'Any internal notes on the customer.', example: 'Needs invoices weekly' }
]

export const DIRECTORY_COUNTERPARTY_BULK_COLUMNS: BulkColumnHint[] = [
  {
    key: 'name',
    label: 'name',
    required: true,
    helper: 'Contact name.',
    example: 'John Smith'
  },
  {
    key: 'phone',
    label: 'phone',
    required: true,
    helper: 'Mobile or WhatsApp.',
    example: '+44 7000 123456'
  },
  { key: 'role', label: 'role', helper: 'Role or function for context.', example: 'Allocation manager' },
  { key: 'email', label: 'email', helper: 'Optional work email.', example: 'john@vendor.com' },
  { key: 'context', label: 'context', helper: 'Notes about the relationship.', example: 'Handles last-minute holds' },
  {
    key: 'vendor_name',
    label: 'vendor_name',
    helper: 'Optional vendor label used for quick reference.',
    example: 'Ticket Supplier LLC'
  }
]
