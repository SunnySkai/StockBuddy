# StockBuddy API Documentation

## Overview

This directory contains the OpenAPI 3.0 specification and Swagger UI setup for the StockBuddy API. The API provides comprehensive functionality for inventory management, transaction tracking, event management, and user/organization administration.

## Accessing the Documentation

### Local Development
When running the API locally, you can access the documentation at:
- **Swagger UI**: `http://localhost:3000/api/docs/swagger`
- **OpenAPI JSON**: `http://localhost:3000/api/docs/swagger.json`
- **Docs Root**: `http://localhost:3000/api/docs` (redirects to Swagger UI)

### Production
Replace `localhost:3000` with your production domain.

## API Structure

### Base URL
All API endpoints are prefixed with `/api`

### Authentication
Most endpoints require JWT authentication via Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

### Multi-Tenant Architecture
The API supports multi-tenancy via subdomain extraction:
- Default tenant: `STOCKBUDDY`
- Custom tenants: Based on subdomain (e.g., `tixworld.example.com` → `TIXWORLD`)

## API Categories

### 🔐 Authentication (`/auth`)
- User registration and login
- Password reset with OTP
- Email/username verification
- Token management

### 👥 Users (`/users`)
- User profile management
- User listing and search
- Profile updates and password changes

### 🏢 Organizations (`/organizations`)
- Organization creation and management
- Member invitations and management
- Role-based access control

### 👤 Members (`/members`)
- Member CRUD operations
- Bulk import/export via CSV
- Team and membership management

### 🏦 Banks (`/banks`)
- Bank account management
- Balance tracking
- Bulk operations

### 🏪 Vendors (`/vendors`)
- Vendor/counterparty management
- Transaction history
- Balance tracking

### 💰 Transactions (`/transactions`)
- Transaction lifecycle management
- Multiple transaction types (purchase, order, sale, membership, manual)
- Status tracking (Pending, Partial, Paid, Cancelled)
- Partial payment support

### 📦 Inventory (`/inventory-records`)
- Inventory record management
- Seat assignments and splitting
- Purchase and order tracking
- Sales completion workflow

### 🎯 Events (`/events`)
- Sports fixture integration
- Event categories and offerings
- Pinned events management

### 📅 Personal Events (`/personal-events`)
- User-specific event management
- Custom event creation and scheduling

### ☁️ S3 (`/s3`)
- File upload via presigned URLs
- Secure file management

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

### Bulk Operation Response
```json
{
  "success": true,
  "data": {
    "processed": 100,
    "created": 95,
    "failed": 5,
    "errors": [
      {
        "rowNumber": 3,
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Key Features

### 🔄 Bulk Operations
- CSV import/export for members, banks, vendors, and inventory
- Batch processing with error reporting
- Template downloads for proper formatting

### 🔍 Advanced Filtering
- Query parameters for filtering transactions, members, and inventory
- Search functionality across multiple fields
- Status-based filtering

### 📊 Financial Management
- Multi-currency support with precision handling
- Transaction lifecycle tracking
- Partial payment support
- Balance calculations

### 🎫 Inventory Management
- Ticket/inventory tracking with seat assignments
- Inventory splitting and assignment workflows
- Purchase-to-sale lifecycle management

### 📧 Communication
- Email integration via AWS SES
- Organization invitations
- Password reset notifications
- Verification emails

## Error Codes

| Code | Description |
|------|-------------|
| 400  | Bad Request - Invalid parameters or validation errors |
| 401  | Unauthorized - Missing or invalid authentication token |
| 403  | Forbidden - Insufficient permissions |
| 404  | Not Found - Resource doesn't exist |
| 409  | Conflict - Resource already exists or constraint violation |
| 500  | Internal Server Error - Unexpected server error |

## Rate Limiting

Currently, no rate limiting is implemented. Consider implementing rate limiting for production use.

## Versioning

The API currently uses implicit versioning. Consider implementing explicit versioning (e.g., `/api/v1/`) for future releases.

## Support

For API support and questions, please refer to the development team or create an issue in the project repository.