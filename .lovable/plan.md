## Add Financial Tracking + Accounting Report to Material Receipts

Extend Material Receipts (controlled + uncontrolled) with financial fields and a date-range Accounting Report that exports to CSV and PDF for the accounting department.

### 1. Database migration

Add columns to `public.material_receipts`:
- `unit_price numeric(14,4)` — price per unit
- `total_price numeric(14,2)` — total cost (optional override; otherwise derived from `quantity * unit_price`)
- `currency text default 'USD'`
- `invoice_number text`
- `invoice_date date`
- `gl_account text` — accounting / GL / cost center code
- `tax_amount numeric(14,2)`
- `shipping_cost numeric(14,2)`

All nullable so existing rows keep working. Index on `invoice_date` and existing `received_at` for report queries. No RLS changes needed (existing policies cover new columns).

### 2. Form & types

Update `src/components/material-receipts/receipt-form-logic.ts`:
- Add the financial fields to `ReceiptFormValues`, `emptyValues()`, and `valuesToPayload()` (string→number conversion, empty→null).

Add a new card `src/components/material-receipts/receipt-financial-card.tsx` rendered for **both** controlled and uncontrolled receipts (inserted in `receipt-form.tsx` after the common card). Fields: Unit price, Currency (default USD), Total price (auto-calculated from qty × unit price, editable override), Tax, Shipping, Invoice number, Invoice date, GL/Cost center account.

### 3. Detail view

Update `src/components/material-receipts/edit-view.tsx` (and `receipt-info-cards.tsx` as needed) to display the financial card in both view and edit modes. Show computed grand total = total + tax + shipping.

### 4. Server function for report

Add `getMaterialReceiptsForAccounting` in `src/lib/material-receipts/receipts-crud.functions.ts`:
- Inputs: `from`, `to` (dates), optional `material_type`, optional `date_field` (`received_at` | `invoice_date`, default `received_at`).
- Returns rows with: receipt_number, received_at, invoice_date, invoice_number, material_name, supplier, manufacturer, po_number, quantity, unit, unit_price, total_price, tax_amount, shipping_cost, currency, gl_account, material_type, receiver_name.
- Uses `requireSupabaseAuth` (any authenticated user; tighten to admin/reviewer if preferred — confirm below).

### 5. Accounting Report page

New route `src/routes/_authenticated/material-receipts/accounting-report.tsx`:
- Date-range picker (from / to), date-field toggle (Received date vs Invoice date), material-type filter.
- Table preview with totals row (sum of total_price + tax + shipping, grouped by currency).
- Buttons: **Export CSV** and **Export PDF** (uses existing `jsPDF` + `jspdf-autotable` stack, similar to `src/lib/material-receipt-pdf.ts` and `src/lib/timesheet-exports.ts`).
- New helper `src/lib/material-receipts/accounting-export.ts` for CSV + PDF generation. PDF includes header (date range, generated-on, by), table, totals.

Add a link/button "Accounting Report" on the Material Receipts list page header.

### 6. Query keys

Add `qk.materialReceipts.accountingReport(params)` to `src/lib/query-keys.ts`.

### Out of scope (Phase 1)
- Multi-currency conversion (totals grouped per currency).
- Approval workflow specific to financials.
- Direct email send to accounting (export-and-attach instead).

### Questions before build
1. Should the Accounting Report be restricted to **admin/reviewer** roles only, or available to any authenticated user?
2. Any required field among the financial inputs (e.g., should unit price be mandatory), or all optional?
