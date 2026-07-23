import {
  getPOTemplateFromDatabase,
  poTemplateDefaults,
  readBundledPOTemplate,
} from '../../../../lib/fileTemplates';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let template;
    try {
      template = await getPOTemplateFromDatabase();
    } catch (databaseError) {
      // Keep downloads available if MySQL is temporarily unreachable. The normal
      // path seeds and serves this exact workbook from webFileTemplates.
      template = {
        fileName: poTemplateDefaults.fileName,
        mimeType: poTemplateDefaults.mimeType,
        fileData: await readBundledPOTemplate(),
      };
      console.error('PO template database fallback:', databaseError);
    }

    return new Response(template.fileData, {
      headers: {
        'Content-Type': template.mimeType,
        'Content-Disposition': `attachment; filename="${template.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
