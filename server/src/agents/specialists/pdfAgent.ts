import { PDFParse } from "pdf-parse";

export interface PdfExtraction {
  text: string;
  pageCount: number;
}

/** L2 specialist: PDF text extraction. No OCR — scanned/image-only PDFs will yield little or no text (see the "image" capability, currently planned). */
export async function extractPdf(buffer: Buffer): Promise<PdfExtraction> {
  // pdf-parse ships a worker-thread pipeline that transfers `data` across
  // postMessage — a Node Buffer (a view over a possibly-pooled ArrayBuffer)
  // isn't transferable as-is and throws "Cannot transfer object of
  // unsupported type"; a plain Uint8Array copy is.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    // getInfo/getText must run sequentially on one parser instance — calling
    // them concurrently (e.g. via Promise.all) breaks the underlying
    // worker's message-passing and throws "Cannot transfer object of
    // unsupported type".
    const info = await parser.getInfo({ parsePageInfo: true });
    const textResult = await parser.getText();
    return { text: textResult.text, pageCount: info.total ?? 0 };
  } finally {
    await parser.destroy();
  }
}
