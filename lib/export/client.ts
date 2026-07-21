'use client';

/**
 * MP-04 — client helper to request a manuscript export and trigger the
 * browser download. POSTs the selected chapters to /api/export/{docx,pdf} and
 * saves the returned binary.
 */

export interface ExportAuthor {
  name: string;
  email?: string;
  address?: string;
}

export interface ExportRequest {
  format: 'docx' | 'pdf';
  title: string;
  author: ExportAuthor;
  options: { titlePage: boolean };
  chapters: { title: string; content: string }[];
}

/**
 * Stable error codes — translated by the rendering component (ExportDialog).
 * `serverMessage` carries the API's own error detail when the body had one.
 */
export type ExportErrorCode = 'network' | 'rate_limited' | 'http' | 'interrupted';

export type ExportResult =
  | { ok: true }
  | { ok: false; code: ExportErrorCode; status?: number; serverMessage?: string };

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match?.[1] ?? fallback;
}

export async function requestManuscriptExport(req: ExportRequest): Promise<ExportResult> {
  let res: Response;
  try {
    res = await fetch(`/api/export/${req.format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: req.title,
        author: req.author,
        options: req.options,
        chapters: req.chapters,
      }),
    });
  } catch {
    return { ok: false, code: 'network' };
  }

  if (!res.ok) {
    if (res.status === 429) {
      return { ok: false, code: 'rate_limited', status: res.status };
    }
    let serverMessage: string | undefined;
    try {
      const body = await res.json();
      if (body?.message || body?.error) serverMessage = body.message || body.error;
    } catch {
      // non-JSON error body — no server detail
    }
    return { ok: false, code: 'http', status: res.status, serverMessage };
  }

  // A body-stream failure mid-download rejects blob(); report it instead of
  // letting the rejection escape to the caller.
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    return { ok: false, code: 'interrupted' };
  }
  const filename = filenameFromDisposition(
    res.headers.get('Content-Disposition'),
    `manuscript.${req.format}`,
  );
  downloadBlob(blob, filename);
  return { ok: true };
}
