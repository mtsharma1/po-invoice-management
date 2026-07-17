import { readFile } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const fileName = 'PO Upload Template.xlsx';
    const candidatePaths = [
      process.env.PO_UPLOAD_TEMPLATE_PATH,
      path.resolve(process.cwd(), 'templates', fileName),
      path.resolve(process.cwd(), '..', '..', fileName),
      path.resolve(process.cwd(), '..', fileName),
    ].filter(Boolean);

    let buffer;
    let lastError;
    for (const templatePath of candidatePaths) {
      try {
        buffer = await readFile(templatePath);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!buffer) {
      throw new Error(`PO upload template was not found. ${lastError?.message || ''}`.trim());
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
