import { buyingTaxRates, usesBuyingTax } from './buyingTax';
import { query, withTransaction } from './db';
import { validateDispatchQuantity } from './dispatchQuantity';
import { storedIrn } from './invoiceTaxSnapshot';

export class InvoiceQuantityError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function quantityInvoiceHeader(run, invoiceNo, lock = false) {
  const [header] = await run(
    `SELECT InvoiceID, InvoiceNo, POBarcode, IRN, TaxDetailsVersion, InterStateTax, CGST, SGST, IGSTRate
     FROM tblInvoiceHeader WHERE InvoiceNo = ?
     ORDER BY (InvoiceDate IS NOT NULL) DESC, InvoiceID DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
    [invoiceNo]
  );
  if (!header) throw new InvoiceQuantityError('Invoice not found.', 404);
  return header;
}

async function hasIrnRecord(run, sql, value) {
  return (await readIrnRecords(run, sql, value)).length > 0;
}

async function readIrnRecords(run, sql, value) {
  try {
    return await run(sql, [value]);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    return [];
  }
}

export async function markEditableInvoiceRows(rows) {
  const candidates = rows.filter(row => row.InvoiceNo && row.POBarcode && !storedIrn(row.IRN));
  if (!candidates.length) return rows.map(({ IRN, ...row }) => ({ ...row, CanEditQuantities: false }));
  const invoiceNos = [...new Set(candidates.map(row => row.InvoiceNo))];
  const [production, sandbox, snapshots] = await Promise.all([
    readIrnRecords(query, 'SELECT InvoiceNo FROM webWhitebooksProductionIrn WHERE InvoiceNo IN (?)', invoiceNos),
    readIrnRecords(query, 'SELECT InvoiceNo FROM webWhitebooksSandboxIrn WHERE InvoiceNo IN (?)', invoiceNos),
    readIrnRecords(query, "SELECT InvoiceNo FROM webInvoiceTaxSnapshots WHERE InvoiceNo IN (?) AND LOWER(TRIM(COALESCE(IRN, ''))) NOT IN ('', 'null', 'undefined')", invoiceNos),
  ]);
  const key = invoiceNo => String(invoiceNo).trim().toLowerCase();
  const locked = new Set([...production, ...sandbox, ...snapshots].map(row => key(row.InvoiceNo)));
  const editableIds = new Set(candidates.filter(row => !locked.has(key(row.InvoiceNo))).map(row => row.InvoiceID));
  return rows.map(({ IRN, ...row }) => ({ ...row, CanEditQuantities: editableIds.has(row.InvoiceID) }));
}

async function assertEditable(run, header) {
  if (storedIrn(header.IRN)
    || await hasIrnRecord(run, 'SELECT 1 FROM webWhitebooksProductionIrn WHERE InvoiceNo = ?', header.InvoiceNo)
    || await hasIrnRecord(run, 'SELECT 1 FROM webWhitebooksSandboxIrn WHERE InvoiceNo = ?', header.InvoiceNo)
    || await hasIrnRecord(run, "SELECT 1 FROM webInvoiceTaxSnapshots WHERE InvoiceID = ? AND LOWER(TRIM(COALESCE(IRN, ''))) NOT IN ('', 'null', 'undefined')", header.InvoiceID)) {
    throw new InvoiceQuantityError('Quantities are locked because an IRN exists or its submission needs to be resolved.', 409);
  }
  if (!header.POBarcode) throw new InvoiceQuantityError('This invoice has no linked PO.', 409);
}

async function getDispatchRows(run, invoiceNo) {
  return run(
    `SELECT d.DID, d.POID, d.DispatchNo, d.DispatchDate, d.DispatchQty,
            COALESCE(d.DispatchQty, p.Quantity, 0) AS Qty
     FROM tblDispatch d JOIN tblPODetails p ON p.POID = d.POID
     WHERE d.InvoiceNo = ? AND COALESCE(d.DispatchNo, '') <> ''
     ORDER BY d.DID`,
    [invoiceNo]
  );
}

function groupDispatch(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.POID)) groups.set(row.POID, { quantity: 0, rows: [] });
    const group = groups.get(row.POID);
    group.quantity += Number(row.Qty);
    group.rows.push(row);
  }
  return groups;
}

// The IRN reservation holds the same invoice header lock as the editor.
export async function assertCurrentIrnQuantities(run, header, invoice) {
  const groups = groupDispatch(await getDispatchRows(run, header.InvoiceNo));
  if (storedIrn(header.IRN) || Number(header.InvoiceID) !== Number(invoice.header.InvoiceID)
    || invoice.lines.length !== groups.size
    || invoice.lines.some(line => Number(line.Qty) !== groups.get(line.POID)?.quantity)) {
    throw new InvoiceQuantityError('Invoice quantities or IRN status changed. Refresh the invoice before submitting.', 409);
  }
}

async function getPoItems(run, poBarcode) {
  return run(
    `SELECT p.POID, p.SKUCode, p.VendorArticleName, p.Colour, p.Size, p.StyleId, p.HSNCode,
            p.MRP, p.ListPriceFOBTransportExcise AS Rate,
            p.BuyingTaxCGST, p.BuyingTaxIGST, p.BuyingTaxSGST,
            COALESCE(p.Quantity, 0) - COALESCE((
              SELECT SUM(d.DispatchQty) FROM tblDispatch d WHERE d.POID = p.POID
            ), 0) AS Available
     FROM tblPODetails p WHERE p.POBarcode = ? ORDER BY p.POID`,
    [poBarcode]
  );
}

function assertLinkedDispatch(rows, items) {
  const poIds = new Set(items.map(item => item.POID));
  if (!rows.length || rows.some(row => !poIds.has(row.POID))) {
    throw new InvoiceQuantityError('The invoice must have posted dispatch lines tied to its linked PO.', 409);
  }
  if (rows.some(row => row.DispatchQty == null || Number(row.DispatchQty) < 0)) {
    throw new InvoiceQuantityError('The linked dispatch contains missing or invalid quantities. Review the dispatch before editing this invoice.', 409);
  }
}

export async function getInvoiceQuantityOptions(invoiceNo) {
  const header = await quantityInvoiceHeader(query, invoiceNo);
  await assertEditable(query, header);
  const rows = await getDispatchRows(query, header.InvoiceNo);
  const items = await getPoItems(query, header.POBarcode);
  assertLinkedDispatch(rows, items);
  const groups = groupDispatch(rows);
  const { TaxDetailsVersion, InterStateTax, CGST, SGST, IGSTRate } = header;
  const taxHeader = { TaxDetailsVersion, InterStateTax, CGST, SGST, IGSTRate };
  return items.flatMap(item => {
    const quantity = groups.get(item.POID)?.quantity ?? 0;
    const available = Math.max(0, Number(item.Available));
    const onInvoice = groups.has(item.POID);
    const canAdd = Boolean(String(item.SKUCode ?? '').trim());
    if (!onInvoice && (!available || !canAdd)) return [];
    return [{
      poid: item.POID, sku: String(item.SKUCode ?? '').trim() || item.VendorArticleName,
      colour: item.Colour, size: item.Size, quantity, max: quantity + available, onInvoice, canAdd,
      styleId: item.StyleId, hsnCode: item.HSNCode, article: item.VendorArticleName,
      mrp: item.MRP == null ? null : Number(item.MRP),
      rate: item.Rate == null ? null : Number(item.Rate),
      taxHeader,
      taxLine: {
        VendorArticleName: item.VendorArticleName,
        BuyingTaxCGST: item.BuyingTaxCGST, BuyingTaxIGST: item.BuyingTaxIGST, BuyingTaxSGST: item.BuyingTaxSGST,
      },
    }];
  });
}

export async function updateInvoiceQuantities(invoiceNo, changes) {
  if (!Array.isArray(changes) || !changes.length
    || changes.some(change => !change || !Number.isSafeInteger(change.poid) || change.poid <= 0
      || !Number.isSafeInteger(change.quantity) || change.quantity < 0 || change.quantity > 2147483647
      || !Number.isSafeInteger(change.previousQuantity) || change.previousQuantity < 0)
    || new Set(changes.map(change => change.poid)).size !== changes.length) {
    throw new InvoiceQuantityError('Submit one whole-number quantity of zero or more for each edited PO line.');
  }

  await withTransaction(async run => {
    const header = await quantityInvoiceHeader(run, invoiceNo, true);
    await assertEditable(run, header);
    const po = await run('SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1 FOR UPDATE', [header.POBarcode]);
    if (!po.length) throw new InvoiceQuantityError('The linked PO no longer exists.', 409);
    await run('SELECT POID FROM tblPODetails WHERE POBarcode = ? ORDER BY POID FOR UPDATE', [header.POBarcode]);
    const rows = await getDispatchRows(run, header.InvoiceNo);
    const items = await getPoItems(run, header.POBarcode);
    assertLinkedDispatch(rows, items);
    const groups = groupDispatch(rows);
    const byId = new Map(items.map(item => [item.POID, item]));
    const finalQuantities = new Map([...groups].map(([poid, group]) => [poid, group.quantity]));

    for (const { poid, previousQuantity, quantity } of changes) {
      const item = byId.get(poid);
      const current = finalQuantities.get(poid) ?? 0;
      if (!item || (!groups.has(poid) && !String(item.SKUCode ?? '').trim())) {
        throw new InvoiceQuantityError('Every added SKU must belong to this invoice’s PO.');
      }
      if (previousQuantity !== current) {
        throw new InvoiceQuantityError('Invoice quantities changed. Reopen the editor and review the latest quantities.', 409);
      }
      try {
        validateDispatchQuantity(quantity, current + Math.max(0, Number(item.Available)));
        if (quantity > 0 && !groups.has(poid) && usesBuyingTax(header)) buyingTaxRates(item);
      } catch (error) {
        throw new InvoiceQuantityError(`${item.SKUCode || item.VendorArticleName}: ${error.message}`);
      }
      finalQuantities.set(poid, quantity);
    }
    if (![...finalQuantities.values()].some(quantity => quantity > 0)) {
      throw new InvoiceQuantityError('Keep at least one item on the invoice.');
    }

    for (const { poid, quantity, previousQuantity } of changes) {
      const group = groups.get(poid);
      if (quantity === previousQuantity && (quantity > 0 || !group)) continue;
      if (!group) {
        const dispatch = rows[0];
        await run(
          'INSERT INTO tblDispatch (POID, DispatchQty, POBarcode, DispatchNo, InvoiceNo, DispatchDate) VALUES (?, ?, ?, ?, ?, ?)',
          [poid, quantity, header.POBarcode, dispatch.DispatchNo, header.InvoiceNo, dispatch.DispatchDate]
        );
      } else if (!quantity) {
        await run('DELETE FROM tblDispatch WHERE DID IN (?)', [group.rows.map(row => row.DID)]);
      } else if (quantity > previousQuantity) {
        const row = group.rows[0];
        await run('UPDATE tblDispatch SET DispatchQty = ? WHERE DID = ?', [Number(row.Qty) + quantity - previousQuantity, row.DID]);
      } else {
        let reduction = previousQuantity - quantity;
        for (const row of [...group.rows].reverse()) {
          if (reduction === 0) break;
          const updated = Math.max(0, Number(row.Qty) - reduction);
          reduction -= Number(row.Qty) - updated;
          if (updated) await run('UPDATE tblDispatch SET DispatchQty = ? WHERE DID = ?', [updated, row.DID]);
          else await run('DELETE FROM tblDispatch WHERE DID = ?', [row.DID]);
        }
      }
    }
    await run('UPDATE tblInvoiceHeader SET TotalInWords = NULL WHERE InvoiceID = ?', [header.InvoiceID]);
  }, { readCommitted: true });
}
