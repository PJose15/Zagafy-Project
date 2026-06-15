import { NextRequest } from 'next/server';
import { err } from '@/lib/api-response';
import { createRouteLogger } from '@/lib/logger';
import { prepareExport, downloadResponse } from '@/lib/export/export-handler';
import { buildManuscriptDocx } from '@/lib/export/docx-builder';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function POST(req: NextRequest) {
  const log = createRouteLogger({ endpoint: '/api/export/docx' });
  const prepared = await prepareExport(req);
  if (!prepared.ok) return prepared.response;

  try {
    const buffer = await buildManuscriptDocx(prepared.model);
    return downloadResponse(buffer, DOCX_MIME, `${prepared.filenameBase}.docx`);
  } catch (e) {
    log.error('DOCX export failed', e);
    return err('internal_error', 'Failed to generate DOCX', 500);
  }
}
