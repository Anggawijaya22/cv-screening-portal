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
  const storagePath_input = formData.get('storage_path') as string | null
  const batch_id = formData.get('batch_id') as string
  const candidate_id = formData.get('candidate_id') as string

  if ((!file && !storagePath_input) || !batch_id || !candidate_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Large PDF already uploaded by the browser: read its text layer only.
  // needs_ocr sends the client to the OCR flow and leaves the DB untouched.
  if (storagePath_input) {
    const storagePath = storagePath_input
    if (!storagePath.startsWith(`cv-files/${batch_id}/${candidate_id}_`)) {
      return NextResponse.json({ error: 'Invalid storage_path' }, { status: 400 })
    }

    let text = ''
    try {
      const { data: blob, error } = await supabase.storage.from('cv-files').download(storagePath)
      if (error || !blob) throw error ?? new Error('File tidak ditemukan')
      const { extractPdf } = await import('@/lib/extractors/pdf')
      text = (await extractPdf(Buffer.from(await blob.arrayBuffer()))).text
    } catch (err) {
      console.error('[process-cv] text layer error:', err)
    }

    if (text.length < 50) return NextResponse.json({ ok: false, needs_ocr: true })

    const cleaned = cleanCvText(text)
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${storagePath}`

    after(async () => {
      const [, { data: batch }, { data: total }] = await Promise.all([
        supabase.from('cv_candidates').update({
          file_url: publicUrl,
          ocr_used: false,
          cv_text: cleaned,
          extract_status: 'success',
          error_message: null,
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
          success: batch.success + 1,
          status: newProcessed >= (total?.length ?? 0) ? 'completed' : 'processing',
        }).eq('id', batch_id)
      }
    })

    return NextResponse.json({
      ok: true,
      extract_status: 'success',
      ocr_used: false,
      text_length: cleaned.length,
      error_message: null,
      file_url: publicUrl,
    })
  }

  // Normal path: file sent directly (small files and non-PDF documents)
  const arrayBuffer = await file!.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const fileName = file!.name.toLowerCase()
  const ext = fileName.split('.').pop() ?? ''

  const storagePath = `cv-files/${batch_id}/${candidate_id}_${file!.name}`
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${storagePath}`

  // Upload starts immediately in background — keep ref to await when needed
  const uploadPromise = supabase.storage.from('cv-files')
    .upload(storagePath, buffer, { contentType: file!.type, upsert: true })
    .catch(() => null)

  let result: { text: string; ocr_used: boolean } = { text: '', ocr_used: false }
  let extract_status: 'success' | 'failed' | 'timeout' = 'success'
  let error_message: string | null = null

  try {
    if (ext === 'pdf') {
      // Small PDF: try fast text layer extraction first
      try {
        const { extractPdf } = await import('@/lib/extractors/pdf')
        result = await extractPdf(buffer)
      } catch {
        // no text layer — will fall through to OCR
      }

      // If no text found: OCR via base64
      if (result.text.length < 50) {
        const elapsed = Date.now() - startTime
        const remaining = 9500 - elapsed
        if (remaining < 2000) throw new Error('timeout')

        const { extractScannedPdf } = await import('@/lib/extractors/ocr-api')
        result = await Promise.race([
          extractScannedPdf(buffer, remaining),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), remaining)
          ),
        ])
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
    const errStr = String(err)
    const isTimeout = errStr.includes('timeout') || errStr.includes('AbortError')
    extract_status = isTimeout ? 'timeout' : 'failed'
    error_message = isTimeout
      ? 'Timeout: OCR melebihi batas waktu, coba upload ulang'
      : errStr.replace(/^(AbortError|Error): /, '')
    result = { text: '', ocr_used: false }
  }

  const extractedText = result.text
  const ocrUsed = result.ocr_used
  const finalStatus = extract_status
  const finalError = error_message

  // DB updates run after response is sent — won't block the response
  after(async () => {
    await uploadPromise
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
