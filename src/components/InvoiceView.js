import { dateText, dateTimeText, lines as splitLines, money, qty, text } from '@/lib/format';

export default function InvoiceView({ invoice }) {
  const { header, lines, totals } = invoice;
  if (!header) {
    return <div className="empty-state"><strong>Invoice not found</strong></div>;
  }

  return (
    <section className="invoice-paper">
      <div className="invoice-top-grid boxed heavy">
        <div className="irn-block">
          <strong>IRN : {text(header.IRN)}</strong>
          <strong>Ack No. : {text(header.AckNo)}</strong>
          <strong>Ack Date : {dateTimeText(header.AckDate)}</strong>
        </div>
        <div className="qr-box">QR</div>
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
              <td className="num">{money(line.Amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-summary">
        <div className="words-strip">{text(header.TotalInWords)}</div>
        <div className="totals-box">
          <div><strong>TOTAL QTY</strong><strong>{qty(totals.totalQty)}</strong></div>
          <div><span>TAXABLE AMOUNT</span><strong>{money(totals.taxableAmount)}</strong></div>
          {totals.isInterState ? (
            <div><span>IGST {money(totals.igstRate, 0)}%</span><strong>{money(totals.igstAmount)}</strong></div>
          ) : (
            <>
              <div><span>SGST {money(totals.sgstRate, 0)}%</span><strong>{money(totals.sgstAmount)}</strong></div>
              <div><span>CGST {money(totals.cgstRate, 0)}%</span><strong>{money(totals.cgstAmount)}</strong></div>
            </>
          )}
          <div><span>ROUND OFF</span><strong>{money(totals.roundOff)}</strong></div>
          <div><strong>GRAND TOTAL</strong><strong>{money(totals.grandTotal)}</strong></div>
        </div>
      </div>

      <footer className="invoice-footer">
        <div />
        <div className="bank-box">
          <div><strong>ACCOUNT NO.</strong><span>{text(header.AccountNo)}</span></div>
          <div><strong>BANK NAME</strong><span>{text(header.BankName)}</span></div>
          <div><strong>Branch</strong><span>{text(header.BranchName)}</span></div>
          <div><strong>IFSC CODE</strong><span>{text(header.IFSCCode)}</span></div>
        </div>
        <div className="signature">
          <strong>FOR TEAKWOOD</strong>
          <span>AUTH. SIGN</span>
        </div>
      </footer>
    </section>
  );
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
