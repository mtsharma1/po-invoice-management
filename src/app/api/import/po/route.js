import { PurchaseOrderValidationError, stagePurchaseOrderWorkbook } from '@/lib/importPO';
import { getImportSessionId } from '@/lib/importSession';
import { recordPOImportErrors } from '@/lib/importLogs';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request) {
  let fileName = 'Unknown file';
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) throw new Error('Please select a purchase order Excel file.');
    fileName = String(file.name || fileName);

    const sessionId = await getImportSessionId({ create: true });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await stagePurchaseOrderWorkbook(sessionId, fileBuffer);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const issues = error instanceof PurchaseOrderValidationError && error.issues?.length
      ? error.issues
      : [{ worksheet: '', row: '', field: '', reason: error.message || 'Import failed.' }];
    const batchId = `SINGLE-${Date.now()}`;
    try {
      await recordPOImportErrors(issues.map((issue) => ({
        batchId,
        fileName,
        worksheet: issue.worksheet,
        row: issue.row,
        field: issue.field,
        reason: issue.reason || error.message || 'Import failed.',
        dateTime: new Date(),
      })));
    } catch {
      // The original import error remains the useful response if logging is unavailable.
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
