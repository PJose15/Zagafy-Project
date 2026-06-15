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

export type ExportResult = { ok: true } | { ok: false; message: string };

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
    return { ok: false, message: 'Network request failed. Check your connection and try again.' };
  }

  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    if (res.status === 429) message = 'Export limit reached. Upgrade for unlimited exports, or try again later.';
    try {
      const body = await res.json();
      if (body?.message || body?.error) message = body.message || body.error;
    } catch {
      // non-JSON error body — keep the status-based message
    }
    return { ok: false, message };
  }

  const blob = await res.blob();
  const filename = filenameFromDisposition(
    res.headers.get('Content-Disposition'),
    `manuscript.${req.format}`,
  );
  downloadBlob(blob, filename);
  return { ok: true };
}
