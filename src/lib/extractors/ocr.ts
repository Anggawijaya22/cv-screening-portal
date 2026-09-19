// Server-only: PDF text extraction with OCR fallback for scanned/image-only PDFs
// Phase 1: pdfjs-dist v6 getTextContent() — text layer extraction (digital PDFs)
// Phase 2: pdfjs-dist v6 page.render() → @napi-rs/canvas → tesseract.js OCR (scanned PDFs)
export async function extractOcr(buffer: Buffer): Promise<{ text: string; ocr_used: true }> {
  // Pre-load worker module → sets globalThis.pdfjsWorker = { WorkerMessageHandler }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('pdfjs-dist/legacy/build/pdf.worker.mjs')

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist')

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise
  const texts: string[] = []

  // Phase 1: extract text layer
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .filter((item): item is { str: string } => typeof item === 'object' && item !== null && 'str' in item)
        .map(item => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (pageText) texts.push(pageText)
      page.cleanup()
    } catch {
      // skip unreadable page
    }
  }

  const phase1Text = texts.join('\n\n')

  if (phase1Text.length >= 10) {
    await pdf.cleanup()
    await loadingTask.destroy()
    return { text: phase1Text, ocr_used: true }
  }

  // Phase 2: image-only PDF — render pages to canvas → tesseract OCR
  console.log('[extractOcr] Phase 1 empty, switching to image render + OCR, pages:', pdf.numPages)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCanvas } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createWorker } = require('tesseract.js') as typeof import('tesseract.js')

  const ocrWorker = await createWorker('eng', 1, {
    // suppress verbose tesseract logging
    logger: () => {},
  })

  const ocrTexts: string[] = []
  const maxPages = Math.min(pdf.numPages, 5)

  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2.5 })
      const w = Math.round(viewport.width)
      const h = Math.round(viewport.height)

      const canvas = createCanvas(w, h)
      const ctx = canvas.getContext('2d')

      // White background needed for clean OCR
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)

      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise

      const pngBuffer = canvas.toBuffer('image/png')
      const { data: { text, confidence } } = await ocrWorker.recognize(pngBuffer)
      const cleaned = text.replace(/\s+/g, ' ').trim()
      console.log(`[extractOcr] page ${i} OCR: confidence=${confidence.toFixed(0)}% text_len=${cleaned.length}`)
      if (cleaned.length > 5) ocrTexts.push(cleaned)

      page.cleanup()
    } catch (e) {
      console.warn('[extractOcr] OCR page', i, 'error:', e)
    }
  }

  await ocrWorker.terminate()
  await pdf.cleanup()
  await loadingTask.destroy()

  return { text: ocrTexts.join('\n\n'), ocr_used: true }
}
