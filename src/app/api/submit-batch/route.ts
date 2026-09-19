import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendToN8n, type WebhookPayload } from '@/lib/webhook'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { batch_id } = await req.json()
  if (!batch_id) return NextResponse.json({ error: 'batch_id required' }, { status: 400 })

  // Get batch + all successful candidates
  const { data: batch } = await supabase.from('cv_batches')
    .select('*, users(nama)').eq('id', batch_id).single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  const { data: candidates } = await supabase.from('cv_candidates')
    .select('*').eq('batch_id', batch_id).eq('extract_status', 'success')

  if (!candidates?.length) {
    return NextResponse.json({ error: 'Tidak ada kandidat yang berhasil diproses' }, { status: 400 })
  }

  // Get webhook URL from settings
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', 'webhook_url').single()
  const webhookUrl = setting?.value || process.env.N8N_WEBHOOK_URL || ''

  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook URL belum dikonfigurasi. Atur di menu Setting.' }, { status: 400 })
  }

  const payload: WebhookPayload = {
    batch_id: batch.id,
    posisi: batch.posisi_kode,
    submitted_by: (batch.users as { nama: string })?.nama ?? user.email ?? '',
    submitted_at: new Date().toISOString(),
    total: candidates.length,
    candidates: candidates.map(c => ({
      id: c.id,
      nama_file: c.nama_file,
      file_type: c.file_type,
      ocr_used: c.ocr_used,
      cv_text: c.cv_text ?? '',
    })),
  }

  const { ok, error: webhookError } = await sendToN8n(webhookUrl, payload)

  const newStatus = ok ? 'submitted' : 'webhook_failed'
  await supabase.from('cv_batches').update({
    status: newStatus,
    webhook_url: webhookUrl,
    webhook_sent_at: new Date().toISOString(),
  }).eq('id', batch_id)

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    action: 'submit_batch',
    detail: { batch_id, posisi: batch.posisi_kode, total: candidates.length, ok },
    status: ok ? 'success' : 'failed',
  })

  if (!ok) return NextResponse.json({ error: `Webhook gagal: ${webhookError}` }, { status: 502 })
  return NextResponse.json({ ok: true, total: candidates.length })
}
