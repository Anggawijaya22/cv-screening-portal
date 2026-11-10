import { OCR_MAX_BYTES, OCR_MAX_PAGES } from '@/lib/ocr-limits'

const ATTEMPTS = [
  { scale: 2, quality: 0.75 },
  { scale: 2, quality: 0.55 },
  { scale: 1.5, quality: 0.5 },
]

export async function compressScannedPdf(file: File): Promise<Blob> {
  const [pdfjs, { PDFDocument }] = await Promise.all([import('pdfjs-dist'), import('pdf-lib')])
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const source = await task.promise

    for (const { scale, quality } of ATTEMPTS) {
      const output = await PDFDocument.create()

      for (let n = 1; n <= Math.min(source.numPages, OCR_MAX_PAGES); n++) {
        const page = await source.getPage(n)
        const size = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, viewport }).promise

        const jpeg = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Gagal mengompres halaman'))), 'image/jpeg', quality)
        )
        canvas.width = canvas.height = 0

        const image = await output.embedJpg(await jpeg.arrayBuffer())
        output.addPage([size.width, size.height]).drawImage(image, { x: 0, y: 0, width: size.width, height: size.height })
      }

      const bytes = await output.save()
      if (bytes.byteLength <= OCR_MAX_BYTES) return new Blob([bytes as BlobPart], { type: 'application/pdf' })
    }
    throw new Error('Hasil kompres masih di atas batas OCR')
  } finally {
    await task.destroy()
  }
}
