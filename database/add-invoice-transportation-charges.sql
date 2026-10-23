-- Run once when deploying the transportation charges feature.
-- Existing invoices retain zero charges. No invoice amounts are updated here.
ALTER TABLE tblInvoiceHeader
  ADD COLUMN TransportationCharges DECIMAL(18,2) NOT NULL DEFAULT 0;
