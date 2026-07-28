import { query, withTransaction } from './db';
import {
  downloadDropboxImage,
  findDropboxImage,
  findDropboxImageFiles,
} from './dropbox';
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
         d.ImageUrl,
         COALESCE((
           SELECT MAX(
             CASE
               WHEN imageRow.ImageData3 IS NOT NULL AND OCTET_LENGTH(imageRow.ImageData3) > 0 THEN 3
               WHEN imageRow.ImageData2 IS NOT NULL AND OCTET_LENGTH(imageRow.ImageData2) > 0 THEN 2
               WHEN imageRow.ImageData IS NOT NULL AND OCTET_LENGTH(imageRow.ImageData) > 0 THEN 1
               ELSE 0
             END
           )
           FROM tblPODetails imageRow
           WHERE (
             NULLIF(TRIM(d.VendorArticleName), '') IS NOT NULL
             AND imageRow.VendorArticleName = d.VendorArticleName
           )
           OR imageRow.POID = d.POID
         ), 0) AS ImageCount
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
  const vendorArticleName = String(rows[0].VendorArticleName || '').trim();
  const files = await findDropboxImageFiles(productName, 3);
  const imageBuffers = await Promise.all(
    files.map((file) => downloadDropboxImage(file.path_display))
  );
  const saved = await saveMasterArticleImageBuffers({
    poid,
    vendorArticleName,
    files,
    imageBuffers,
  });

  return {
    path_display: files[0].path_display,
    ImageUrl: `/api/master/images/${poid}`,
    ImageCount: files.length,
    fileName: files[0].name || '',
    updatedRows: saved.updatedRows,
    message: vendorArticleName
      ? `${files.length} Dropbox image${files.length === 1 ? '' : 's'} saved in the database for vendor article "${vendorArticleName}".`
      : `${files.length} Dropbox image${files.length === 1 ? '' : 's'} saved in the database for PO line ${poid}.`,
  };
}

export async function syncAllMasterDatabaseImagesFromDropbox() {
  await ensurePODetailImageColumns();
  const rows = await query(
    `SELECT MIN(POID) AS POID, TRIM(VendorArticleName) AS VendorArticleName
     FROM tblPODetails
     WHERE NULLIF(TRIM(VendorArticleName), '') IS NOT NULL
     GROUP BY VendorArticleName
     ORDER BY VendorArticleName`
  );

  const results = await mapWithConcurrency(rows, 2, async (row) => {
    try {
      const result = await fetchAndSaveMasterLineImage({
        POID: row.POID,
        productName: row.VendorArticleName,
      });
      return { ok: true, vendorArticleName: row.VendorArticleName, ...result };
    } catch (error) {
      return {
        ok: false,
        vendorArticleName: row.VendorArticleName,
        error: error.message,
      };
    }
  });

  const synced = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  return {
    checkedArticles: rows.length,
    syncedArticles: synced.length,
    savedImages: synced.reduce((total, result) => total + Number(result.ImageCount || 0), 0),
    failures,
    message: `Product image update completed: ${synced.length} vendor article${synced.length === 1 ? '' : 's'} synced with ${synced.reduce((total, result) => total + Number(result.ImageCount || 0), 0)} database images, ${failures.length} not found.`,
  };
}

async function saveMasterArticleImageBuffers({
  poid,
  vendorArticleName,
  files,
  imageBuffers,
}) {
  return withTransaction(async (run) => {
    let imageOwnerPoid = poid;
    if (vendorArticleName) {
      const ownerRows = await run(
        `SELECT POID
         FROM tblPODetails
         WHERE VendorArticleName = ?
         ORDER BY CASE
           WHEN ImageData IS NOT NULL AND OCTET_LENGTH(ImageData) > 0 THEN 0
           ELSE 1
         END, POID
         LIMIT 1
         FOR UPDATE`,
        [vendorArticleName]
      );
      imageOwnerPoid = Number(ownerRows[0]?.POID || poid);
    }

    await run(
      `UPDATE tblPODetails
       SET ImageData = ?,
           ImageData2 = ?,
           ImageData3 = ?,
           ModifiedDate = NOW()
       WHERE POID = ?`,
      [
        imageBuffers[0] || null,
        imageBuffers[1] || null,
        imageBuffers[2] || null,
        imageOwnerPoid,
      ]
    );

    const firstPath = files[0]?.path_display || null;
    const updateResult = vendorArticleName
      ? await run(
          `UPDATE tblPODetails
           SET path_display = ?,
               ImageUrl = CONCAT('/api/master/images/', POID),
               ModifiedDate = NOW()
           WHERE VendorArticleName = ?`,
          [firstPath, vendorArticleName]
        )
      : await run(
          `UPDATE tblPODetails
           SET path_display = ?, ImageUrl = ?, ModifiedDate = NOW()
           WHERE POID = ?`,
          [firstPath, `/api/master/images/${poid}`, poid]
        );
    return { updatedRows: Number(updateResult.affectedRows || 0) };
  });
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

export async function saveMasterDatabaseImage({ poid, imageBuffer }) {
  await ensurePODetailImageColumns();
  const lineId = Number(poid || 0);
  if (!Number.isInteger(lineId) || lineId <= 0) throw new Error('A valid PO line is required.');
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) throw new Error('Select an image file.');
  if (imageBuffer.length > 5 * 1024 * 1024) throw new Error('Image file must be 5 MB or smaller.');

  return withTransaction(async (run) => {
    const rows = await run(
      `SELECT POID, VendorArticleName
       FROM tblPODetails
       WHERE POID = ?
       LIMIT 1
       FOR UPDATE`,
      [lineId]
    );
    if (!rows.length) throw new Error('The selected PO line no longer exists.');

    const vendorArticleName = String(rows[0].VendorArticleName || '').trim();
    let imageOwnerPoid = lineId;
    if (vendorArticleName) {
      const existingRows = await run(
        `SELECT POID
         FROM tblPODetails
         WHERE VendorArticleName = ?
           AND ImageData IS NOT NULL
           AND OCTET_LENGTH(ImageData) > 0
         ORDER BY POID
         LIMIT 1
         FOR UPDATE`,
        [vendorArticleName]
      );
      imageOwnerPoid = Number(existingRows[0]?.POID || lineId);
    }

    await run(
      `UPDATE tblPODetails
       SET ImageData = ?, ImageData2 = NULL, ImageData3 = NULL, ModifiedDate = NOW()
       WHERE POID = ?`,
      [imageBuffer, imageOwnerPoid]
    );

    const updateResult = vendorArticleName
      ? await run(
          `UPDATE tblPODetails
           SET path_display = NULL,
               ImageUrl = CONCAT('/api/master/images/', POID),
               ModifiedDate = NOW()
           WHERE VendorArticleName = ?`,
          [vendorArticleName]
        )
      : await run(
          `UPDATE tblPODetails
           SET path_display = NULL, ImageUrl = ?, ModifiedDate = NOW()
           WHERE POID = ?`,
          [`/api/master/images/${lineId}`, lineId]
        );

    return {
      ImageUrl: `/api/master/images/${lineId}`,
      updatedRows: Number(updateResult.affectedRows || 0),
      message: vendorArticleName
        ? `Database image saved for vendor article "${vendorArticleName}".`
        : `Database image saved for PO line ${lineId}.`,
    };
  });
}

export async function getMasterDatabaseImage(poid, imagePosition = 1) {
  await ensurePODetailImageColumns();
  const lineId = Number(poid || 0);
  if (!Number.isInteger(lineId) || lineId <= 0) throw new Error('A valid PO line is required.');
  const position = Math.max(1, Math.min(3, Number(imagePosition) || 1));
  const imageColumn = ['ImageData', 'ImageData2', 'ImageData3'][position - 1];

  const rows = await query(
    `SELECT source.\`${imageColumn}\` AS ImageData
     FROM tblPODetails requested
     INNER JOIN tblPODetails source
       ON (
         NULLIF(TRIM(requested.VendorArticleName), '') IS NOT NULL
         AND source.VendorArticleName = requested.VendorArticleName
       )
       OR source.POID = requested.POID
     WHERE requested.POID = ?
       AND source.\`${imageColumn}\` IS NOT NULL
       AND OCTET_LENGTH(source.\`${imageColumn}\`) > 0
     ORDER BY CASE WHEN source.POID = requested.POID THEN 0 ELSE 1 END, source.POID
     LIMIT 1`,
    [lineId]
  );
  if (!rows.length) throw new Error('No database image is saved for this PO line.');
  return Buffer.from(rows[0].ImageData);
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
    if (text && !/^https?:\/\//i.test(text) && !/^\/api\/master\/images\/\d+$/i.test(text)) {
      throw new Error('Image URL must be a web URL or a saved database-image link.');
    }
    return text;
  }
  return String(value || '').trim();
}
