import type { Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null

function getWorker() {
  worker ??= import('tesseract.js')
    .then(t => t.createWorker(['ind', 'eng']))
    .catch(err => { worker = null; throw err })
  return worker
}

// Reads the text layer; scanned PDFs (almost no text) are OCR'd page by page instead
export async function readPdf(file: File, onPage: (page: number, total: number) => void): Promise<{ text: string; ocr: boolean }> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await task.promise
    const layers: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent()
      layers.push(content.items.map(i => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join(''))
    }
    const layerText = layers.join('\n\n')
    if (layerText.trim().length >= 50) return { text: layerText, ocr: false }

    const ocr = await getWorker()
    const pages: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      onPage(n, pdf.numPages)
      const page = await pdf.getPage(n)
      // ~300 DPI for an A4 page, capped so oversized scans don't exhaust browser memory
      const viewport = page.getViewport({ scale: Math.min(4, 2480 / page.getViewport({ scale: 1 }).width) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const { data } = await ocr.recognize(canvas)
      canvas.width = canvas.height = 0
      pages.push(data.text)
    }
    return { text: pages.join('\n\n'), ocr: true }
  } finally {
    await task.destroy()
  }
}

export async function readDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
}

export async function stopOcr() {
  const w = worker
  worker = null
  if (w) await (await w.catch(() => null))?.terminate()
}
