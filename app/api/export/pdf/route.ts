import { NextRequest } from 'next/server';
import { err } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { prepareExport, downloadResponse } from '@/lib/export/export-handler';
import { buildManuscriptPdf } from '@/lib/export/pdf-builder';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const log = createRouteLogger({ endpoint: '/api/export/pdf' });
  const prepared = await prepareExport(req);
  if (!prepared.ok) return prepared.response;

  try {
    const buffer = await buildManuscriptPdf(prepared.model);
    return downloadResponse(buffer, 'application/pdf', `${prepared.filenameBase}.pdf`);
  } catch (e) {
    log.error('PDF export failed', e);
    return err('internal_error', 'Failed to generate PDF', 500);
  }
}
