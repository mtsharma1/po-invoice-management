import { dateText, dateTimeText, lines as splitLines, money, qty, text } from '@/lib/format';
import { invoiceQrUrl } from '@/lib/invoiceQr';
import { lineTaxRates, usesItemTaxDetails } from '@/lib/invoiceTax';

export default function InvoiceView({ invoice }) {
  const { header, lines, totals } = invoice;
  const showTaxDetails = usesItemTaxDetails(header);
  if (!header) {
    return <div className="empty-state"><strong>Invoice not found</strong></div>;
  }

  return (
    <section className={`invoice-paper${showTaxDetails ? ' invoice-item-tax' : ''}`}>
      <div className="invoice-main-block">
      <div className="invoice-top-grid boxed heavy">
        <div className="irn-block">
          <strong>IRN : {text(header.IRN)}</strong>
          <strong>Ack No. : {text(header.AckNo)}</strong>
          <strong>Ack Date : {dateTimeText(header.AckDate)}</strong>
        </div>
        <div className="qr-box">
          <img src={invoiceQrUrl(header)} alt={`QR code for invoice ${text(header.InvoiceNo)}`} />
        </div>
      </div>

      <div className="invoice-title boxed heavy">TAX INVOICE</div>
      <div className="invoice-meta boxed heavy">
        <strong>INVOICE NO: {text(header.InvoiceNo)}</strong>
        <strong>DATE- {dateText(header.InvoiceDate)}</strong>
      </div>

      <div className="party-grid boxed heavy">
        <PartyBlock title="BILL FROM" name={header.BillFromName} address={header.BillFromAddress} />
        <PartyBlock
          title="DISPATCH FROM"
          name={header.DispatchFromName}
          address={header.DispatchFromAddress}
          extra={[
            header.OrderNumber ? `ORDER NO: ${header.OrderNumber}` : '',
            header.OrderDate ? `ORDER DATE- ${dateText(header.OrderDate)}` : '',
            header.SealNo ? `SEAL NO : ${header.SealNo}` : '',
          ]}
        />
        <PartyBlock title="CONSIGNEE" name={header.ConsigneeName} address={header.ConsigneeAddress} />
        <PartyBlock title="DELIVERED TO" name={header.DeliveredToName} address={header.DeliveredToAddress} />
      </div>

      <table className="invoice-lines">
        <thead>
          <tr>
            <th>Sl.No.</th>
            <th>SKU CODE</th>
            <th>Style Id</th>
            <th>HSN CODE</th>
            <th>VENDOR ARTICLE NAME</th>
            <th>COLOR</th>
            <th>SIZE</th>
            <th>QTY</th>
            <th>MRP</th>
            <th>RATE</th>
            {showTaxDetails ? <th>Tax %</th> : null}
            <th>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.POID}-${index}`}>
              <td>{index + 1}</td>
              <td>{text(line.SKUCode)}</td>
              <td>{text(line.StyleId)}</td>
              <td>{text(line.HSNCode)}</td>
              <td>{text(line.VendorArticleName)}</td>
              <td>{text(line.Colour)}</td>
              <td>{text(line.Size)}</td>
              <td className="num">{qty(line.Qty)}</td>
              <td className="num">{money(line.MRP)}</td>
              <td className="num">{money(line.Rate)}</td>
              {showTaxDetails ? <td className="num">{lineTaxRates(header, line).taxRate}%</td> : null}
              <td className="num">{money(line.Amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-summary">
        <div className="quantity-total-row">
          <strong>TOTAL QTY</strong>
          <span>{qty(totals.totalQty)}</span>
        </div>
        <div className="invoice-financial-row">
        {showTaxDetails ? <div className="invoice-tax-summary">
          <table>
            <caption>Tax summary</caption>
            <thead><tr>{['Tax Rate', 'Taxable Amount', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amount'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{(totals.taxSummary || []).map((group) => (
              <tr key={group.taxRate}>
                <td>{group.taxRate}%</td>
                {[group.taxableAmount, group.igstAmount, group.cgstAmount, group.sgstAmount, group.totalTax, group.totalAmount].map((amount, index) => <td key={index}>{money(amount)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div> : null}
        <div className="totals-box">
          <div><strong>TAXABLE AMOUNT</strong><span /><span>{money(totals.taxableAmount)}</span></div>
          {totals.isInterState ? (
            <>
              <div><strong>CGST</strong><span>{taxRateLabel(totals.cgstRate, showTaxDetails)}</span><span>{money(totals.cgstAmount)}</span></div>
              <div><strong>SGST</strong><span>{taxRateLabel(totals.sgstRate, showTaxDetails)}</span><span>{money(totals.sgstAmount)}</span></div>
            </>
          ) : (
            <div><strong>IGST</strong><span>{taxRateLabel(totals.igstRate, showTaxDetails)}</span><span>{money(totals.igstAmount)}</span></div>
          )}
          <div><strong>ROUND OFF</strong><span /><span>{money(totals.roundOff)}</span></div>
          <div className="grand-total"><strong>GRAND TOTAL</strong><span /><strong>{money(totals.grandTotal)}</strong></div>
        </div>
        </div>
        {!showTaxDetails ? <div className="words-strip">{text(header.TotalInWords)}</div> : null}
      </div>
      </div>

      <div className="invoice-bottom-block">
      {showTaxDetails ? <div className="words-strip">{text(header.TotalInWords)}</div> : null}
      <footer className="invoice-footer">
        <div className="invoice-note-cell">{showTaxDetails || header.InvoiceNote ? <InvoiceNote value={header.InvoiceNote} /> : null}</div>
        <div className="invoice-footer-details">
          <div className="bank-box">
            {showTaxDetails ? <div><strong>BENEFICIARY NAME</strong><span>{header.BeneficiaryName || 'TEAKWOOD'}</span></div> : null}
            <div><strong>ACCOUNT NO.</strong><span>{text(header.AccountNo)}</span></div>
            {showTaxDetails ? <div><strong>IFSC CODE</strong><span>{text(header.IFSCCode)}</span></div> : null}
            <div><strong>BANK NAME</strong><span>{text(header.BankName)}</span></div>
            <div><strong>Branch</strong><span>{text(header.BranchName)}</span></div>
            {!showTaxDetails ? <div><strong>IFSC CODE</strong><span>{text(header.IFSCCode)}</span></div> : null}
          </div>
          {!showTaxDetails ? <InvoiceSignature /> : null}
        </div>
        {showTaxDetails ? <InvoiceSignature /> : null}
      </footer>
      </div>
    </section>
  );
}

function InvoiceNote({ value }) {
  return <div className="invoice-printed-note"><strong>Note</strong><div>{value || ''}</div></div>;
}

function InvoiceSignature() {
  return <div className="signature"><strong>FOR TEAKWOOD</strong><span><b>AUTH. SIGN</b></span></div>;
}

function taxRateLabel(rate, showTaxDetails) {
  if (!showTaxDetails) return `${money(rate, 0)}%`;
  return rate === null ? '' : `${Number(rate || 0)}%`;
}

function PartyBlock({ title, name, address, extra = [] }) {
  return (
    <div className="party-block">
      <h3>{title}</h3>
      <div className="party-address">
        <strong>{text(name)}</strong>
        {splitLines(address).map((line) => <span key={line}>{line}</span>)}
        {extra.filter(Boolean).map((line) => <strong key={line}>{line}</strong>)}
      </div>
    </div>
  );
}
