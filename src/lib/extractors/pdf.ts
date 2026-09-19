// Server-only: extract text from digital PDF using pdf-parse v1.x
// Import lib directly to bypass index.js debug code that reads a test file
export async function extractPdf(buffer: Buffer): Promise<{ text: string; ocr_used: false }> {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>
  const data = await pdfParse(buffer)
  return { text: data.text?.trim() ?? '', ocr_used: false }
}
