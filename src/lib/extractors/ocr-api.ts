// Cloud OCR via OCR.space API — works within Vercel free tier 10s limit
// Free tier: 25,000 req/month
// URL approach avoids base64 size limits (1MB limit); buffer approach for small files
export async function extractScannedPdfByUrl(url: string, timeoutMs = 7000): Promise<{ text: string; ocr_used: true }> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const form = new FormData()
    form.append('url', url)
    form.append('apikey', apiKey)
    form.append('language', 'eng')
    form.append('isOverlayRequired', 'false')
    form.append('OCREngine', '2')
    form.append('scale', 'true')
    form.append('detectOrientation', 'true')

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

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] ?? 'OCR.space processing failed')
    }

    const text = (data.ParsedResults ?? []).map(r => r.ParsedText).join('\n').trim()
    return { text, ocr_used: true }
  } finally {
    clearTimeout(timer)
  }
}

export async function extractScannedPdf(buffer: Buffer, timeoutMs = 7000): Promise<{ text: string; ocr_used: true }> {
  const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const form = new FormData()
    form.append('base64Image', `data:application/pdf;base64,${buffer.toString('base64')}`)
    form.append('apikey', apiKey)
    form.append('language', 'eng')
    form.append('isOverlayRequired', 'false')
    form.append('OCREngine', '2')
    form.append('scale', 'true')
    form.append('detectOrientation', 'true')

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

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage?.[0] ?? 'OCR.space processing failed')
    }

    const text = (data.ParsedResults ?? []).map(r => r.ParsedText).join('\n').trim()
    return { text, ocr_used: true }
  } finally {
    clearTimeout(timer)
  }
}
