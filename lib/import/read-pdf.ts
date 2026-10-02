import { PDFParse } from 'pdf-parse';

/** Parse modern exported PDFs and always release the parser's worker/resources. */
export async function readPdfText(buffer: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}
