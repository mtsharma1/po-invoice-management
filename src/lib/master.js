import { query, withTransaction } from './db';
import { findDropboxImage } from './dropbox';
import { ensurePODetailImageColumns, ensurePOImportDateColumn } from './poSchema';

const editableLineFields = Object.freeze({
  StyleId: 'StyleId',
  SKUCode: 'SKUCode',
  HSNCode: 'HSNCode',
  Brand: 'Brand',
  GTIN: 'GTIN',
  VendorArticleNumber: 'VendorArticleNumber',
  VendorArticleName: 'VendorArticleName',
  Size: 'Size',
  Colour: 'Colour',
  MRP: 'MRP',
  Quantity: 'Quantity',
  Rate: 'ListPriceFOBTransportExcise',
  LandingPrice: 'LandingPrice',
  EstimatedDeliveryDate: 'EstimatedDeliveryDate',
  FactoryDispatchDate: 'FactoryDispatchDate',
  path_display: 'path_display',
  ImageUrl: 'ImageUrl',
});

export async function getMasterScreenData(poBarcode = '') {
  await Promise.all([ensurePOImportDateColumn(), ensurePODetailImageColumns()]);

  const selectedPO = String(poBarcode || '').trim();
  const where = selectedPO ? 'WHERE d.POBarcode = ?' : '';
  const params = selectedPO ? [selectedPO] : [];

  const [purchaseOrders, countRows, rows] = await Promise.all([
    query(
      `SELECT h.POBarcode, COUNT(d.POID) AS lineCount, COALESCE(SUM(d.Quantity), 0) AS totalQty
       FROM tblPOHeaders h
       LEFT JOIN tblPODetails d ON d.POBarcode = h.POBarcode
       GROUP BY h.POBarcode
       ORDER BY COALESCE(MAX(h.CreatedOn), MAX(h.POApprovedDate)) DESC, h.POBarcode DESC`
    ),
    query(
      `SELECT COUNT(*) AS totalRows
       FROM tblPODetails d
       ${where}`,
      params
    ),
    query(
      `SELECT
         d.POID,
         d.POBarcode,
         h.POImportDate,
         d.StyleId,
         d.SKUCode,
         d.HSNCode,
         d.Brand,
         d.GTIN,
         d.VendorArticleNumber,
         d.VendorArticleName,
         d.Size,
         d.Colour,
         d.MRP,
         d.Quantity,
         d.ListPriceFOBTransportExcise AS Rate,
         d.LandingPrice,
         d.EstimatedDeliveryDate,
         h.BillTo,
         h.ShipTo,
         CASE
           WHEN LOWER(COALESCE(h.ShipTo, '')) REGEXP 'delhi|haryana' THEN 1
           WHEN LOWER(COALESCE(h.ShipTo, '')) REGEXP 'uttar[[:space:].-]*pradesh|(^|[^a-z])u[.]?[[:space:]]*p[.]?([^a-z]|$)|rajasthan' THEN 2
           WHEN LOWER(COALESCE(h.ShipTo, '')) REGEXP 'maharash?tra|mumbai' THEN 5
           ELSE 7
         END AS DeliveryDuration,
         d.FactoryDispatchDate,
         d.path_display,
         d.ImageUrl
       FROM tblPODetails d
       INNER JOIN tblPOHeaders h ON h.POBarcode = d.POBarcode
       ${where}
       ORDER BY d.POBarcode DESC, d.POID
       LIMIT 5000`,
      params
    ),
  ]);

  return {
    purchaseOrders,
    rows,
    totalRows: Number(countRows[0]?.totalRows || 0),
    rowLimit: 5000,
  };
}

export async function saveMasterLine(payload) {
  await ensurePODetailImageColumns();
  const poid = Number(payload?.POID || 0);
  if (!Number.isInteger(poid) || poid <= 0) throw new Error('A valid PO line is required.');

  return withTransaction(async (run) => {
    const currentRows = await run(
      'SELECT POBarcode FROM tblPODetails WHERE POID = ? LIMIT 1 FOR UPDATE',
      [poid]
    );
    if (!currentRows.length) throw new Error('The selected PO line no longer exists.');

    const assignments = [];
    const values = [];
    for (const [payloadField, column] of Object.entries(editableLineFields)) {
      assignments.push(`\`${column}\` = ?`);
      values.push(normalizeMasterValue(payloadField, payload?.[payloadField]));
    }
    assignments.push('ModifiedDate = NOW()');
    values.push(poid);

    await run(
      `UPDATE tblPODetails SET ${assignments.join(', ')} WHERE POID = ?`,
      values
    );

    await run(
      `UPDATE tblPOHeaders SET BillTo = ?, ShipTo = ? WHERE POBarcode = ?`,
      [String(payload?.BillTo || ''), String(payload?.ShipTo || ''), currentRows[0].POBarcode]
    );

    return { message: `PO line ${poid} updated successfully.` };
  });
}

export async function fetchAndSaveMasterLineImage(payload) {
  await ensurePODetailImageColumns();
  const poid = Number(payload?.POID || 0);
  if (!Number.isInteger(poid) || poid <= 0) throw new Error('A valid PO line is required.');

  const rows = await query(
    `SELECT VendorArticleName, VendorArticleNumber, StyleId, SKUCode
     FROM tblPODetails
     WHERE POID = ?
     LIMIT 1`,
    [poid]
  );
  if (!rows.length) throw new Error('The selected PO line no longer exists.');

  const productName = String(
    payload?.productName ||
    rows[0].VendorArticleName ||
    rows[0].VendorArticleNumber ||
    rows[0].StyleId ||
    rows[0].SKUCode ||
    ''
  ).trim();
  const image = await findDropboxImage(productName);

  const vendorArticleName = String(rows[0].VendorArticleName || '').trim();
  const updateResult = vendorArticleName
    ? await query(
        `UPDATE tblPODetails
         SET path_display = ?, ImageUrl = ?, ModifiedDate = NOW()
         WHERE VendorArticleName = ?`,
        [image.path_display, image.ImageUrl, vendorArticleName]
      )
    : await query(
        `UPDATE tblPODetails
         SET path_display = ?, ImageUrl = ?, ModifiedDate = NOW()
         WHERE POID = ?`,
        [image.path_display, image.ImageUrl, poid]
      );
  const updatedRows = Number(updateResult.affectedRows || 0);

  return {
    ...image,
    updatedRows,
    message: vendorArticleName
      ? `Dropbox image "${image.fileName}" saved to ${updatedRows} PO line${updatedRows === 1 ? '' : 's'} for vendor article "${vendorArticleName}".`
      : `Dropbox image "${image.fileName}" saved for PO line ${poid}.`,
  };
}

export async function syncMissingMasterImages() {
  await ensurePODetailImageColumns();
  const rows = await query(
    `SELECT DISTINCT TRIM(VendorArticleName) AS VendorArticleName
     FROM tblPODetails
     WHERE NULLIF(TRIM(VendorArticleName), '') IS NOT NULL
       AND (
         NULLIF(TRIM(path_display), '') IS NULL
         OR NULLIF(TRIM(ImageUrl), '') IS NULL
         OR ImageUrl LIKE '%/cd/0/get/%'
       )
     ORDER BY VendorArticleName`
  );

  const articles = rows.map((row) => row.VendorArticleName);
  const results = await mapWithConcurrency(articles, 3, async (vendorArticleName) => {
    try {
      const image = await findDropboxImage(vendorArticleName);
      const updateResult = await query(
        `UPDATE tblPODetails
         SET path_display = ?, ImageUrl = ?, ModifiedDate = NOW()
         WHERE VendorArticleName = ?`,
        [image.path_display, image.ImageUrl, vendorArticleName]
      );
      return {
        ok: true,
        vendorArticleName,
        updatedRows: Number(updateResult.affectedRows || 0),
      };
    } catch (error) {
      return {
        ok: false,
        vendorArticleName,
        error: error.message,
      };
    }
  });

  const synced = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  return {
    checkedArticles: articles.length,
    syncedArticles: synced.length,
    updatedRows: synced.reduce((total, result) => total + result.updatedRows, 0),
    failures,
    message: articles.length
      ? `Image URL update completed: ${synced.length} vendor article${synced.length === 1 ? '' : 's'} synced, ${failures.length} not found.`
      : 'All vendor article image URLs are already up to date.',
  };
}

export async function deleteMasterPurchaseOrder(poBarcode) {
  const value = String(poBarcode || '').trim();
  if (!value) throw new Error('Please select a purchase order to delete.');

  return withTransaction(async (run) => {
    const headers = await run(
      'SELECT POBarcode FROM tblPOHeaders WHERE POBarcode = ? LIMIT 1 FOR UPDATE',
      [value]
    );
    if (!headers.length) throw new Error('The selected purchase order no longer exists.');

    const shellResult = await run('DELETE FROM tblShellOrders WHERE POBarcode = ?', [value]);
    const dispatchResult = await run('DELETE FROM tblDispatch WHERE POBarcode = ?', [value]);
    const detailResult = await run('DELETE FROM tblPODetails WHERE POBarcode = ?', [value]);
    await run('DELETE FROM tblPOHeaders WHERE POBarcode = ?', [value]);

    return {
      message: `Purchase order ${value} deleted successfully.`,
      deleted: {
        shellOrders: shellResult.affectedRows,
        dispatchRows: dispatchResult.affectedRows,
        poLines: detailResult.affectedRows,
      },
    };
  });
}

async function mapWithConcurrency(values, concurrency, work) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await work(values[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker()
    )
  );
  return results;
}

function normalizeMasterValue(field, value) {
  if (field === 'MRP' || field === 'Rate' || field === 'LandingPrice') {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a valid non-negative number.`);
    return number;
  }
  if (field === 'Quantity') {
    const number = Number(value || 0);
    if (!Number.isInteger(number) || number < 0) throw new Error('Quantity must be a valid non-negative whole number.');
    return number;
  }
  if (field === 'EstimatedDeliveryDate' || field === 'FactoryDispatchDate') {
    return value ? String(value).slice(0, 10) : null;
  }
  if (field === 'path_display') {
    const text = String(value || '').trim();
    if (text.length > 1024) throw new Error('Dropbox path must be 1,024 characters or fewer.');
    return text;
  }
  if (field === 'ImageUrl') {
    const text = String(value || '').trim();
    if (text.length > 2048) throw new Error('Image URL must be 2,048 characters or fewer.');
    if (text && !/^https?:\/\//i.test(text)) {
      throw new Error('Image URL must begin with http:// or https://.');
    }
    return text;
  }
  return String(value || '').trim();
}
