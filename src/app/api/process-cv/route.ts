import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cleanCvText } from '@/lib/extractors/clean-text'

export const maxDuration = 10

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const batch_id = formData.get('batch_id') as string
  const candidate_id = formData.get('candidate_id') as string

  if (!file || !batch_id || !candidate_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const fileName = file.name.toLowerCase()
  const ext = fileName.split('.').pop() ?? ''

  const storagePath = `cv-files/${batch_id}/${candidate_id}_${file.name}`
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${storagePath}`

  // Start upload immediately — fire-and-forget, but keep a ref we can also await
  const uploadPromise = supabase.storage.from('cv-files')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    .catch(() => null)  // never rejects; null = failed

  let result: { text: string; ocr_used: boolean } = { text: '', ocr_used: false }
  let extract_status: 'success' | 'failed' | 'timeout' = 'success'
  let error_message: string | null = null

  try {
    if (ext === 'pdf') {
      let pdfText = ''
      try {
        const { extractPdf } = await import('@/lib/extractors/pdf')
        const pdfResult = await extractPdf(buffer)
        pdfText = pdfResult.text
        result = pdfResult
      } catch (pdfErr) {
        console.log('[process-cv] extractPdf failed:', String(pdfErr).slice(0, 100))
      }

      if (pdfText.length < 50) {
        const elapsed = Date.now() - startTime
        const remaining = 7500 - elapsed

        if (remaining < 2000) throw new Error('timeout')

        const isLargePdf = buffer.length > 700 * 1024 // >700 KB → base64 would hit OCR.space limit

        if (isLargePdf) {
          // Upload must finish before we can get a signed URL
          const uploadRes = await uploadPromise
          if (!uploadRes?.data) throw new Error('Gagal mengupload file, coba ulangi')

          const { data: signed } = await supabase.storage
            .from('cv-files').createSignedUrl(storagePath, 300) // 5-minute URL
          if (!signed?.signedUrl) throw new Error('Gagal membuat akses OCR, coba ulangi')

          const elapsed2 = Date.now() - startTime
          const remaining2 = 7500 - elapsed2
          if (remaining2 < 1000) throw new Error('timeout')

          const { extractScannedPdfByUrl } = await import('@/lib/extractors/ocr-api')
          result = await Promise.race([
            extractScannedPdfByUrl(signed.signedUrl, remaining2),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), remaining2)
            ),
          ])
        } else {
          const { extractScannedPdf } = await import('@/lib/extractors/ocr-api')
          result = await Promise.race([
            extractScannedPdf(buffer, remaining),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), remaining)
            ),
          ])
        }
      }
    } else if (ext === 'docx' || ext === 'doc' || ext === 'rtf' || ext === 'odt') {
      const { extractDocx } = await import('@/lib/extractors/docx')
      result = await extractDocx(buffer, ext)
    } else {
      throw new Error(`Format tidak didukung: .${ext}`)
    }

    if (!result.text || result.text.length < 10) {
      throw new Error('Teks tidak dapat diekstrak dari file ini')
    }

    result = { ...result, text: cleanCvText(result.text) }
  } catch (err) {
    console.error('[process-cv] extraction error:', err)
    extract_status = String(err).includes('timeout') ? 'timeout' : 'failed'
    error_message = String(err).replace('Error: ', '')
    result = { text: '', ocr_used: false }
  }

  const extractedText = result.text
  const ocrUsed = result.ocr_used
  const finalStatus = extract_status
  const finalError = error_message

  // DB updates deferred — run after response is sent
  after(async () => {
    await uploadPromise  // no-op if already resolved (large PDF path)
    const [, { data: batch }, { data: total }] = await Promise.all([
      supabase.from('cv_candidates').update({
        file_url: publicUrl,
        ocr_used: ocrUsed,
        cv_text: extractedText || null,
        extract_status: finalStatus,
        error_message: finalError,
      }).eq('id', candidate_id),

      supabase.from('cv_batches')
        .select('processed, success, failed').eq('id', batch_id).single(),

      supabase.from('cv_candidates')
        .select('id', { count: 'exact' }).eq('batch_id', batch_id),
    ])

    if (batch) {
      const newProcessed = batch.processed + 1
      await supabase.from('cv_batches').update({
        processed: newProcessed,
        success: finalStatus === 'success' ? batch.success + 1 : batch.success,
        failed: finalStatus !== 'success' ? batch.failed + 1 : batch.failed,
        status: newProcessed >= (total?.length ?? 0) ? 'completed' : 'processing',
      }).eq('id', batch_id)
    }
  })

  return NextResponse.json({
    ok: extract_status === 'success',
    extract_status,
    ocr_used: result.ocr_used,
    text_length: result.text.length,
    error_message,
    file_url: publicUrl,
  })
}
