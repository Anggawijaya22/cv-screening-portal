import type { CvCandidate } from '@/types'

export interface WebhookPayload {
  batch_id: string
  posisi: string
  submitted_by: string
  submitted_at: string
  total: number
  candidates: Array<{
    id: string
    nama_file: string
    file_type: string
    ocr_used: boolean
    cv_text: string
  }>
}

export async function sendToN8n(url: string, payload: WebhookPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
