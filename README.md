# Teakwood PO & Invoice Web

This is the Next.js + Node.js + MySQL migration foundation for `PO and Invoice Management V1.03.accdb`.

## What Is Included

- MySQL connection layer for the existing Hostinger-linked tables.
- Dashboard, PO list/detail, dispatch, shell order, invoice list/detail pages.
- Printable invoice page styled to behave like the Access `rptInvoice` layout.
- Excel invoice export with A4 portrait print settings and fit-to-width printing.
- Hostinger VPS deployment notes.

## Local Setup

1. Install packages:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill MySQL credentials.

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## Database

The app expects the existing production MySQL tables and views used by Access:

- `tblPOHeaders`
- `tblPODetails`
- `tblAvailableStock`
- `tblDispatch`
- `tblDispatchHeader`
- `tblInvoiceHeader`
- `tblShellOrders`
- `tblUsers`
- `tblAccessType`
- `vwDispatchDetails`
- `vwInvoiceDetails`
- `vwPoDetails`
- `vwPOHeader`
- `vwShellOrders`

If creating a fresh database, start from `database/schema.sql` and then import data.

## Invoice Duplicate Protection

The web invoice query does not join invoice lines directly to all matching header records. It chooses one usable header per invoice number and groups lines by PO item, which prevents the duplicate-row issue seen earlier when `tblInvoiceHeader` contained duplicate `InvoiceNo` records.
