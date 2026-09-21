// Cloud OCR via OCR.space API — works within Vercel free tier 10s limit
// Free tier: 25,000 req/month

async function callOcrSpace(
  form: FormData,
  timeoutMs: number,
): Promise<{ text: string; ocr_used: true }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`OCR.space API error: ${res.status}`)
    const data = await res.json() as {
      IsErroredOnProcessing: boolean
      ErrorMessage?: string[]
      ParsedResults?: Array<{ ParsedText: string }>
    }
    const text = (data.ParsedResults ?? []).map(r => r.ParsedText).join('\n').trim()
    // "max page limit" sets IsErroredOnProcessing=true but still returns partial text — use it
    if (!text && data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] ?? 'OCR.space processing failed')
    }
    return { text, ocr_used: true }
  } finally {
    clearTimeout(timer)
  }
}

// For large files (>700KB): upload to storage first, pass signed URL to OCR.space
// OCR.space fetches the file directly — no base64 size limit
export async function extractScannedPdfByUrl(
  signedUrl: string,
  timeoutMs = 7000,
): Promise<{ text: string; ocr_used: true }> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'
  const form = new FormData()
  form.append('url', signedUrl)
  form.append('apikey', apiKey)
  form.append('language', 'eng')
  form.append('filetype', 'PDF')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '1')
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  return callOcrSpace(form, timeoutMs)
}

// For small files (≤700KB): send PDF as base64
export async function extractScannedPdf(
  buffer: Buffer,
  timeoutMs = 7000,
): Promise<{ text: string; ocr_used: true }> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'
  const form = new FormData()
  form.append('base64Image', `data:application/pdf;base64,${buffer.toString('base64')}`)
  form.append('apikey', apiKey)
  form.append('language', 'eng')
  form.append('filetype', 'PDF')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '1')
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  return callOcrSpace(form, timeoutMs)
}
