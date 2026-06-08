# Product: Coron Grill Diners POS

A **Point-of-Sale web app** built specifically for Coron Grill Diners, a restaurant in the Philippines. It is installed as a PWA on tablets/iPads at the counter.

## Core Capabilities

- **Cashier POS** — browse menu by category, add items to cart, apply discounts, accept cash/card/GCash payment, print receipts and kitchen tickets
- **Shift management** — cashiers open a shift with a starting cash balance and close it at end of service; the system reconciles expected vs actual cash
- **Offline resilience** — pending sales are queued in `localStorage` under the key `cgd-pending-sales` and synced automatically when connectivity is restored
- **Admin dashboard** — daily/shift-level revenue stats, 7-day sales trend, order management (void, restore, delete), shift reports, menu management, staff accounts, activity log, void codes, and security history
- **Role system** — two roles: `admin` (full access) and `cashier` (POS + their own sales only)
- **Audit trail** — every significant action (login, order, void, password change, user CRUD) is written to `public.admin_audit_log`

## Currency & Locale

All monetary values are in **Philippine Peso (₱)**. Dates/times use the **Asia/Manila** timezone. The `en-PH` locale is used for all number and date formatting.

## Business Rules

- Orders carry an optional `discount_percent` and an optional `service_charge`
- Sales have statuses: `completed`, `void`, `cancelled`; soft-deleted sales use `is_deleted = true`
- Shifts track `total_cash_sales` and `total_sales` separately; non-cash payments increment only `total_sales`
- Void codes are single-use tokens required to void an order
- The last admin account cannot be deleted
