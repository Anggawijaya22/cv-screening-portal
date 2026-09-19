import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanCvText } from '@/lib/extractors/clean-text'

export const maxDuration = 10 // Vercel free tier max is 10s

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

  // Upload to Supabase Storage
  const admin = createAdminClient()
  const storagePath = `cv-files/${batch_id}/${candidate_id}_${file.name}`
  await admin.storage.from('cv-files').upload(storagePath, buffer, {
    contentType: file.type,
    upsert: true,
  })
  const { data: { publicUrl } } = admin.storage.from('cv-files').getPublicUrl(storagePath)

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
        // pdf-parse may throw on scanned/corrupt PDFs — fall through to OCR
        console.log('[process-cv] extractPdf failed, falling back to OCR:', String(pdfErr).slice(0, 100))
      }

      // Fall back to OCR only if pdf-parse returned little/no text
      if (pdfText.length < 50) {
        const elapsed = Date.now() - startTime
        const remaining = 8000 - elapsed
        if (remaining > 1500) {
          const { extractOcr } = await import('@/lib/extractors/ocr')
          result = await Promise.race([
            extractOcr(buffer, Date.now() + remaining),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), remaining)
            ),
          ])
        } else {
          throw new Error('timeout')
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

  // Parallel: update candidate + fetch batch counters + count total
  const [, { data: batch }, { data: total }] = await Promise.all([
    supabase.from('cv_candidates').update({
      file_url: publicUrl,
      ocr_used: result.ocr_used,
      cv_text: result.text || null,
      extract_status,
      error_message,
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
      success: extract_status === 'success' ? batch.success + 1 : batch.success,
      failed: extract_status !== 'success' ? batch.failed + 1 : batch.failed,
      status: newProcessed >= (total?.length ?? 0) ? 'completed' : 'processing',
    }).eq('id', batch_id)
  }

  return NextResponse.json({
    ok: extract_status === 'success',
    extract_status,
    ocr_used: result.ocr_used,
    text_length: result.text.length,
    error_message,
    file_url: publicUrl,
  })
}
