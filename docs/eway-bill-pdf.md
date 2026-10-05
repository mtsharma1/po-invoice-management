# E-way bill PDF layout

The PDF follows measurements from the supplied NIC portal printout: A4,
7.5 pt Verdana text, 187.5 pt between labels and values, 1.5 pt grey rules,
127.5 pt QR, and the seven-column Part B table. The Code 128 barcode is
97.5 × 48.27 pt, with its number printed separately beneath it.

Windows uses the installed Verdana regular and bold fonts. On Linux, install
licensed Verdana fonts in the standard msttcorefonts directory or set
`EWAYBILL_FONT_REGULAR` and `EWAYBILL_FONT_BOLD` to absolute TTF paths readable
by the application. Fonts are embedded in the generated PDF. If neither is
available, Helvetica is used; exact typography requires Verdana. Font files
are not redistributed in this repository.

The download reads the saved invoice and retrieves full e-way bill details from
WhiteBooks using its read-only `getewaybill` API. It verifies both bill number
and invoice number before merging generator identity, actual distance, validity
and Part B history. No invoices or bills are generated or modified by a download.
Provider errors are shown to the user rather than silently exporting missing data.

Production uses the dedicated `WHITEBOOKS_EWAYBILL_PRODUCTION_` credentials.
Email, IP address and GSTIN can fall back to `WHITEBOOKS_PRODUCTION_` values;
API keys fall back only as a pair. E-way bill username/password remain separate.
The provider's optional IRP setting is passed during authentication when configured.

Valid From uses the provider's explicit value or the earliest qualifying Part B
entry, following the NIC validity-start rule. Entered Date/By and transport document
dates come from each history row. For road vehicles without a transport-document
date, the PDF displays the vehicle-entry date beside the vehicle number, marked
with an asterisk and explanatory footnote. The underlying document date remains
unchanged. All returned history rows are printed, with continued
table headings on further pages. Cancelled/non-active status is shown above the form.

The reference QR encodes only the e-way bill number; the footnote identifies this
limitation. The signed **e-invoice** QR is not substituted for the e-way bill QR.

References:
- https://whitebooks.in/developer/e-way-bill-api/get-ewaybillapi-v1.03-ewayapi-getewaybill
- https://docs.ewaybillgst.gov.in/apidocs/version1.03/get-eway-bill-details.html
- https://docs.ewaybillgst.gov.in/html/faq_new.html

Run `node scripts/test-ewaybill-pdf.mjs` to check mapping, dates and route
guards and generate synthetic single-page/multi-page QA PDFs in `tmp/pdfs`.
No provider calls or database writes are made by this test.
Run `node scripts/test-ewaybill-details.mjs` for mocked provider request,
redaction, identity, missing-date and vehicle-history checks.
