import mammoth from "mammoth";

export interface DocxExtraction {
  text: string;
}

/** L2 specialist: DOCX text extraction (headings/paragraphs flattened to plain text). */
export async function extractDocx(buffer: Buffer): Promise<DocxExtraction> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
