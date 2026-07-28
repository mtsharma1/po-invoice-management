import { importPurchaseOrderWorkbook, PurchaseOrderValidationError } from '@/lib/importPO';
import { recordPOImportErrors } from '@/lib/importLogs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const maxBatchFiles = 25;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((file) => file && typeof file.arrayBuffer === 'function');
    if (!files.length) {
      return Response.json({ ok: false, error: 'Please select one or more PO .xlsx files.' }, { status: 400 });
    }
    if (files.length > maxBatchFiles) {
      return Response.json(
        { ok: false, error: `A maximum of ${maxBatchFiles} PO files can be imported in one batch.` },
        { status: 400 }
      );
    }

    const batchId = createBatchId();
    const results = [];
    const errors = [];

    for (const file of files) {
      const importedAt = new Date().toISOString();
      const fileName = String(file.name || 'Unnamed workbook');
      if (!fileName.toLowerCase().endsWith('.xlsx')) {
        const reason = 'Only Excel .xlsx purchase-order files are supported.';
        results.push({ fileName, status: 'failed', reason });
        errors.push(logEntry({ batchId, fileName, reason, importedAt, field: 'File format' }));
        continue;
      }

      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const result = await importPurchaseOrderWorkbook(fileBuffer);
        results.push({
          fileName,
          status: 'success',
          poBarcode: result.poBarcode,
          importedRows: result.insertedRows,
          assignedDispatchRows: result.assignedDispatchRows,
        });
      } catch (error) {
        const issues = error instanceof PurchaseOrderValidationError && error.issues?.length
          ? error.issues
          : [{ worksheet: '', row: '', field: '', reason: error.message || 'Import failed.' }];
        const poBarcode = extractPOBarcode(error.message);
        results.push({
          fileName,
          status: 'failed',
          poBarcode,
          reason: issues[0]?.reason || error.message || 'Import failed.',
          issueCount: issues.length,
        });
        errors.push(...issues.map((issue) => logEntry({
          batchId,
          fileName,
          poBarcode,
          importedAt,
          worksheet: issue.worksheet,
          row: issue.row,
          field: issue.field,
          reason: issue.reason || error.message || 'Import failed.',
        })));
      }
    }

    const successfulFiles = results.filter((result) => result.status === 'success').length;
    const failedFiles = results.length - successfulFiles;
    let logWarning = '';
    if (errors.length) {
      try {
        await recordPOImportErrors(errors);
      } catch (error) {
        logWarning = ` Error log could not be saved: ${error.message}`;
      }
    }
    return Response.json({
      ok: true,
      batchId,
      processedFiles: results.length,
      successfulFiles,
      failedFiles,
      results,
      errors,
      logWarning,
      message: `${successfulFiles} PO file${successfulFiles === 1 ? '' : 's'} imported; ${failedFiles} failed.${logWarning}`,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || 'Batch import failed.' }, { status: 500 });
  }
}

function logEntry({
  batchId,
  fileName,
  poBarcode = '',
  importedAt,
  worksheet = '',
  row = '',
  field = '',
  reason,
}) {
  return {
    batchId,
    fileName,
    poBarcode,
    worksheet,
    row,
    field,
    reason,
    dateTime: importedAt,
  };
}

function createBatchId() {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  return `PO-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function extractPOBarcode(message) {
  const match = String(message || '').match(/\bPO\s+([A-Z0-9_-]+)/i);
  return match?.[1] || '';
}
