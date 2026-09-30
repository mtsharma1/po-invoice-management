# Teakwood PO & Invoice Web

This is the Next.js + Node.js + MySQL migration foundation for `PO and Invoice Management V1.03.accdb`.

## What Is Included

- MySQL connection layer for the existing Hostinger-linked tables.
- Dashboard, PO list/detail, dispatch, shell order, invoice list/detail pages.
- Printable invoice page styled to behave like the Access `rptInvoice` layout.
- Excel invoice export with A4 portrait print settings and fit-to-width printing.
- Hostinger VPS deployment notes.
- Authentication against the existing Access/MySQL users with signed, HTTP-only sessions.

## Local Setup

1. Install packages:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill MySQL credentials.

   Set `APP_SESSION_SECRET` to a long random value before production deployment.
   The application keeps legacy plain-text password compatibility because Access
   still uses those records; passwords are never returned to the browser.

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`.

## WhiteBooks sandbox authentication

Set the seven `WHITEBOOKS_*` variables listed in `.env.example` in your server's
`.env.local` (or deployment environment), then restart the application. Use the
IP address registered with WhiteBooks for `WHITEBOOKS_IP_ADDRESS`.
Administrators can open Settings and select **Test authentication**.

The server calls `GET https://apisandbox.whitebooks.in/einvoice/authenticate`
with the email query parameter and the six credential headers. The browser only
receives a success or sanitized error message; tokens and provider responses are
never returned to the browser or logged. The server helper returns the token for
future API calls; the test does not persist it.

In the e-invoice workbench, validate the invoice and select **Generate sandbox IRN**.
The server revalidates the invoice, obtains a fresh auth token, and posts the single
invoice object to `/einvoice/type/GENERATE/version/V1_03`. Seller GSTIN must match
the configured sandbox GSTIN. No sample invoice values are substituted.

Sandbox requests and allowlisted results (including signed invoice/QR strings) are
stored in `webWhitebooksSandboxIrn`, created on first use. Production `IRN` and
`AckNo` fields remain untouched. Download the sandbox result from the workbench.
Unique invoice/document reservations prevent duplicate concurrent submissions.
Uncertain requests are blocked from resubmission, including after a timeout or
restart; reconcile them through WhiteBooks by document details. Automated lookup
and recovery are not yet implemented. Database access needs CREATE TABLE privileges.

Run the mocked authentication checks with `node scripts/test-whitebooks.mjs`.

## Database tables

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

## Dropbox OAuth

The administrator Settings page includes a Dropbox connection flow. Configure these
server-only environment variables before using it:

```env
DROPBOX_APP_KEY=your_dropbox_app_key
DROPBOX_APP_SECRET=your_dropbox_app_secret
DROPBOX_REDIRECT_URI=http://localhost:3000/api/dropbox/oauth/callback
```

Register the exact `DROPBOX_REDIRECT_URI` in Dropbox App Console under
**Settings → OAuth 2 → Redirect URIs**. Enable the required Dropbox scopes before
connecting. The callback exchanges the one-time authorization code for a refresh
token and stores that token AES-256-GCM encrypted in `webIntegrations`, using
`APP_SESSION_SECRET` as the encryption-key source. Changing `APP_SESSION_SECRET`
after connecting requires reconnecting Dropbox.

## Separate e-way bill generation

The separate button uses a saved IRN with `/einvoice/type/GENERATE_EWAYBILL/version/V1_03` and e-invoice authentication. Production B2B invoices must have a saved IRN; editable invoice fields are not submitted again. The IRN is loaded on the server, checked against the invoice record, and a recorded cancelled IRN is rejected. Sandbox invoices without an IRN retain the standalone mapping and standalone authentication.

Distance `0` requests the provider's PIN-to-PIN distance calculation. The registered invoice supplies its addresses. Transport inputs can be saved independently using **Save transport details**; `webInvoiceEwayBillTransport` stores them by InvoiceNo and reloads them when opening the invoice. Generation also saves transport input before authentication. Saving incomplete transport details is allowed; generation validates them.

## Production e-invoice configuration
Set WHITEBOOKS_EINVOICE_ENV=production and all seven WHITEBOOKS_PRODUCTION_* credential fields (EMAIL, USERNAME, PASSWORD, IP_ADDRESS, CLIENT_ID, CLIENT_SECRET, GSTIN). The production host is fixed to https://api.whitebooks.in. Restart the app after changing settings. Settings authentication follows the selected environment. The separate production e-way bill button uses the saved IRN and this e-invoice account.

Production Generate IRN asks for confirmation and includes EwbDtls when transport inclusion is enabled. Full results, including signed invoice, QR and any e-way bill response, are saved in webWhitebooksProductionIrn. The selected tblInvoiceHeader record receives IRN, AckNo and AckDate. Successful results are retained before invoice-field updates; Save generated IRN retries saving a recorded result without calling generation. Pending or uncertain provider requests must be reconciled rather than resubmitted. No automatic generation retries occur. The application requires CREATE TABLE privileges for the result table. Production credentials must authenticate successfully before generation is available.


## Production e-way bills by IRN

Set `WHITEBOOKS_EWAYBILL_ENV=production` and configure all `WHITEBOOKS_PRODUCTION_*` e-invoice credentials. This IRN-based flow uses the e-invoice client ID, secret and authentication token, not the standalone e-way bill account. Authentication normally returns the IRP; `WHITEBOOKS_PRODUCTION_IRP` is an optional fallback. The UI identifies production and asks for confirmation.

Requests and results are saved in `webWhitebooksProductionEwayBill` by InvoiceNo. ResultJson contains EwbNo, EwbDt and EwbValidTill. Existing bills generated along with IRN are reused from `webWhitebooksProductionIrn`. Pending or uncertain submissions remain blocked for reconciliation, including provider timeouts and database save failures; no automatic generation retries occur. These tables need CREATE TABLE permission on first use. Standalone e-way bill credentials remain separate for the standalone API and are not used for production IRN-based generation.

Run `node scripts/test-irn-ewaybill.mjs` for synthetic, mocked authentication, generation, saving, reload, conflict and uncertain-outcome coverage. Tests do not load database credentials or generate live e-way bills.
