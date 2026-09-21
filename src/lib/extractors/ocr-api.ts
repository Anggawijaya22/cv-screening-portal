// Cloud OCR via OCR.space API — works within Vercel free tier 10s limit
// Free tier: 25,000 req/month, max 1MB per file
// Register at https://ocr.space/OCRAPI to get a free API key
export async function extractScannedPdf(buffer: Buffer): Promise<{ text: string; ocr_used: true }> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'

  const form = new FormData()
  form.append('base64Image', `data:application/pdf;base64,${buffer.toString('base64')}`)
  form.append('apikey', apiKey)
  form.append('language', 'eng')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2') // Engine 2: better accuracy for dense text
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) throw new Error(`OCR.space API error: ${res.status}`)

  const data = await res.json() as {
    IsErroredOnProcessing: boolean
    ErrorMessage?: string[]
    ParsedResults?: Array<{ ParsedText: string }>
  }

  if (data.IsErroredOnProcessing) {
    throw new Error(data.ErrorMessage?.[0] ?? 'OCR.space processing failed')
  }

  const text = (data.ParsedResults ?? []).map(r => r.ParsedText).join('\n').trim()
  return { text, ocr_used: true }
}
