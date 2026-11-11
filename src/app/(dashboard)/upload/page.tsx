'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, Send, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Position, ExtractStatus } from '@/types'

// Storage bucket limit; RTF/ODT still pass through Vercel, which caps bodies at 4.5MB
const MAX_DIRECT_BYTES = 10 * 1024 * 1024
const MAX_VIA_SERVER_BYTES = 4 * 1024 * 1024

const DIRECT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
}

interface FileItem {
  id: string
  file: File
  status: ExtractStatus
  ocr_used: boolean
  error_message: string | null
  text_length: number
  note?: string
}

const STATUS_ICON: Record<ExtractStatus, React.ReactNode> = {
  waiting: <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>⏳ Antri</span>,
  processing: <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-secondary)', fontSize: '0.8rem' }}><Loader2 size={12} className="animate-spin" />Extracting</span>,
  success: <span style={{ color: 'var(--color-success)', fontSize: '0.8rem' }}>✅ Selesai</span>,
  failed: <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>❌ Gagal</span>,
  timeout: <span style={{ color: 'var(--color-warning)', fontSize: '0.8rem' }}>⏱ Timeout</span>,
}

export default function UploadPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedPos, setSelectedPos] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [batchId, setBatchId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')
  const [rejected, setRejected] = useState<string[]>([])
  const processingRef = useRef(false)
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/positions').then(r => r.json()).then(r => setPositions((r.data ?? []).filter((p: Position) => p.is_active)))
  }, [])

  // Realtime batch progress
  useEffect(() => {
    if (!batchId) return
    const channel = supabase.channel(`batch-${batchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cv_candidates', filter: `batch_id=eq.${batchId}` }, payload => {
        const updated = payload.new as { id: string; extract_status: ExtractStatus; ocr_used: boolean; error_message: string | null; cv_text: string | null }
        setFiles(prev => prev.map(f => f.id === updated.id ? {
          ...f, status: updated.extract_status, ocr_used: updated.ocr_used,
          error_message: updated.error_message, text_length: updated.cv_text?.length ?? 0
        } : f))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [batchId])

  const processFiles = useCallback(async (newFiles: File[]) => {
    if (!selectedPos || processingRef.current) return
    processingRef.current = true

    const pos = positions.find(p => p.kode === selectedPos)!
    const fileItems: FileItem[] = newFiles.map(f => ({
      id: crypto.randomUUID(), file: f, status: 'waiting', ocr_used: false, error_message: null, text_length: 0
    }))
    setFiles(prev => [...prev, ...fileItems])

    // Create or reuse batch
    let currentBatchId = batchId
    if (!currentBatchId) {
      const { data: batch, error } = await supabase.from('cv_batches').insert({
        posisi_kode: pos.kode, posisi_nama: pos.nama,
        total_files: newFiles.length, processed: 0, success: 0, failed: 0, status: 'processing',
        created_by: (await supabase.auth.getUser()).data.user!.id,
      }).select().single()
      if (error || !batch) { processingRef.current = false; return }
      currentBatchId = batch.id
      setBatchId(batch.id)
    } else {
      await supabase.from('cv_batches').update({ total_files: files.length + newFiles.length }).eq('id', currentBatchId)
    }

    // Insert candidate records
    const inserts = fileItems.map(fi => ({
      id: fi.id, batch_id: currentBatchId!, nama_file: fi.file.name,
      file_type: fi.file.name.split('.').pop()?.toLowerCase() ?? 'pdf',
      extract_status: 'waiting' as ExtractStatus,
    }))
    await supabase.from('cv_candidates').insert(inserts)

    // Process each file sequentially to avoid overwhelming server
    try {
      for (const fi of fileItems) {
        setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, status: 'processing' } : f))

        // PDFs and large Word files go straight to Storage: Vercel caps request bodies at 4.5MB
        const ext = fi.file.name.split('.').pop()?.toLowerCase() ?? ''
        const direct = ext === 'pdf' || (ext in DIRECT_TYPES && fi.file.size > 700 * 1024)
        const storagePath = `cv-files/${currentBatchId!}/${fi.id}_${fi.file.name}`

        const fd = new FormData()
        fd.append('batch_id', currentBatchId!)
        fd.append('candidate_id', fi.id)

        if (direct) {
          // file_url stays null on these failures, so the cleanup cron can't find the file later
          const failDirect = async (msg: string) => {
            await supabase.storage.from('cv-files').remove([storagePath])
            setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, status: 'failed', error_message: msg } : f))
            await supabase.from('cv_candidates').update({ extract_status: 'failed', error_message: msg }).eq('id', fi.id)
            const { data: b } = await supabase.from('cv_batches').select('processed, failed, total_files').eq('id', currentBatchId!).single()
            if (b) {
              await supabase.from('cv_batches').update({
                processed: b.processed + 1,
                failed: b.failed + 1,
                status: b.processed + 1 >= b.total_files ? 'completed' : 'processing',
              }).eq('id', currentBatchId!)
            }
          }

          // storage-js takes the type from the File itself, which browsers sometimes leave empty
          const typed = new File([fi.file], fi.file.name, { type: DIRECT_TYPES[ext] })
          const { error: uploadError } = await supabase.storage
            .from('cv-files').upload(storagePath, typed, { upsert: true })
          if (uploadError) {
            setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, status: 'failed', error_message: 'Upload gagal: ' + uploadError.message } : f))
            await supabase.from('cv_candidates').update({ extract_status: 'failed', error_message: 'Upload gagal' }).eq('id', fi.id)
            continue
          }

          const post = () => fetch('/api/process-cv', { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)

          fd.append('storage_path', storagePath)

          // Read PDF/DOCX here (OCR for scans) so the server only saves text and never hits its time limit
          if (ext === 'pdf' || ext === 'docx') {
            try {
              const reader = await import('@/lib/read-in-browser')
              if (ext === 'pdf') {
                const { text, ocr } = await reader.readPdf(fi.file, (page, total) =>
                  setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, note: `OCR halaman ${page}/${total}` } : f)))
                fd.append('client_text', text)
                if (ocr) fd.append('ocr_used', '1')
              } else {
                fd.append('client_text', await reader.readDocx(fi.file))
              }
            } catch {
              await failDirect('File rusak atau tidak bisa dibaca')
              continue
            }
          }

          const result = await post()
          if (!result?.extract_status) {
            await failDirect('Koneksi ke server gagal')
            continue
          }
          setFiles(prev => prev.map(f => f.id === fi.id ? {
            ...f,
            status: result.extract_status,
            ocr_used: result.ocr_used ?? false,
            error_message: result.error_message,
            text_length: result.text_length ?? 0,
            note: undefined,
          } : f))
          continue
        } else {
          fd.append('file', fi.file)
        }

        const callProcessCv = async (formData: FormData) => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 15000)
          try {
            const res = await fetch('/api/process-cv', { method: 'POST', body: formData, signal: controller.signal })
            clearTimeout(timer)
            if (!res.ok) throw new Error(`Server error ${res.status}`)
            return await res.json()
          } finally {
            clearTimeout(timer)
          }
        }

        try {
          const result = await callProcessCv(fd)
          setFiles(prev => prev.map(f => f.id === fi.id ? {
            ...f,
            status: result.extract_status ?? 'failed',
            ocr_used: result.ocr_used ?? false,
            error_message: result.error_message,
            text_length: result.text_length ?? 0,
          } : f))
        } catch (fetchErr) {
          const msg = String(fetchErr).includes('abort') ? 'Timeout: server tidak merespons' : 'Koneksi ke server gagal'
          setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, status: 'failed', error_message: msg } : f))
          // Also update DB so batch counters stay accurate
          await supabase.from('cv_candidates').update({ extract_status: 'failed', error_message: msg }).eq('id', fi.id)
        }
      }
    } finally {
      processingRef.current = false
      import('@/lib/read-in-browser').then(m => m.stopOcr())
    }
  }, [selectedPos, positions, batchId, files.length])

  const acceptFiles = (list: File[]) => {
    const valid = list.filter(f => /\.(pdf|docx|doc|rtf|odt)$/i.test(f.name))
    const limit = (f: File) => /\.(rtf|odt)$/i.test(f.name) ? MAX_VIA_SERVER_BYTES : MAX_DIRECT_BYTES
    setRejected(valid.filter(f => f.size > limit(f)).map(f =>
      `${f.name} (${(f.size / 1048576).toFixed(2)} MB, maks ${limit(f) / 1048576} MB)`))
    const accepted = valid.filter(f => f.size <= limit(f))
    if (accepted.length) processFiles(accepted)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    acceptFiles(Array.from(e.dataTransfer.files))
  }

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const handleSubmit = async () => {
    if (!batchId) return
    setSubmitting(true)
    const res = await fetch('/api/submit-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchId }) })
    const result = await res.json()
    if (result.ok) {
      setSubmitMsg(`✅ ${result.total} CV berhasil dikirim ke n8n untuk diproses scoring`)
      setSubmitted(true)
      setTimeout(() => { setFiles([]); setBatchId(null); setSelectedPos(''); setSubmitted(false); setSubmitMsg('') }, 3000)
    } else {
      setSubmitMsg(`❌ ${result.error}`)
    }
    setSubmitting(false)
  }

  const allDone = files.length > 0 && files.every(f => ['success','failed','timeout'].includes(f.status))
  const successCount = files.filter(f => f.status === 'success').length
  const failedCount = files.filter(f => f.status !== 'success' && f.status !== 'waiting' && f.status !== 'processing').length
  const progress = files.length > 0 ? Math.round((files.filter(f => !['waiting','processing'].includes(f.status)).length / files.length) * 100) : 0

  return (
    <div className="space-y-6" style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Upload CV</h1>

      {/* Step 1: Select position */}
      <div className="glass p-5 space-y-3">
        <label style={{ fontWeight: 600, display: 'block' }}>1. Pilih Posisi Dilamar</label>
        <select className="input-glass" style={{ maxWidth: 320 }} value={selectedPos}
          onChange={e => { setSelectedPos(e.target.value); setFiles([]); setBatchId(null) }}
          disabled={files.length > 0}>
          <option value="">-- Pilih posisi --</option>
          {positions.map(p => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
        </select>
      </div>

      {/* Step 2: Drop zone */}
      <div className="glass p-5 space-y-3">
        <label style={{ fontWeight: 600, display: 'block' }}>2. Upload File CV</label>
        <div
          onDragOver={e => { e.preventDefault(); if (selectedPos) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--glass-border)'}`,
            borderRadius: 12, padding: '2.5rem',
            textAlign: 'center', transition: 'all 0.2s',
            background: dragging ? 'rgba(0,137,123,0.08)' : selectedPos ? 'transparent' : 'rgba(255,255,255,0.03)',
            cursor: selectedPos ? 'pointer' : 'not-allowed',
            opacity: selectedPos ? 1 : 0.5,
          }}
          onClick={() => selectedPos && document.getElementById('file-input')?.click()}>
          <Upload size={32} style={{ margin: '0 auto 1rem', color: selectedPos ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
          <div style={{ fontWeight: 500 }}>
            {selectedPos ? 'Drag & drop file CV di sini atau klik untuk browse' : 'Pilih posisi dilamar terlebih dahulu'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
            PDF, DOCX, DOC maks 10MB • RTF, ODT maks 4MB • Multiple file didukung<br />
            CV hasil scan dibaca semua halamannya di browser ini, jadi butuh waktu lebih lama
          </div>
          <input id="file-input" type="file" multiple accept=".pdf,.docx,.doc,.rtf,.odt" style={{ display: 'none' }} onChange={handleBrowse} />
        </div>
        {rejected.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>
            Ditolak karena melebihi batas ukuran: {rejected.join(', ')}
          </div>
        )}
      </div>

      {/* Progress */}
      {files.length > 0 && (
        <div className="glass p-5 space-y-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>3. Progress Ekstraksi</span>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              {files.filter(f => !['waiting','processing'].includes(f.status)).length}/{files.length} selesai
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'var(--color-primary)', width: `${progress}%`, transition: 'width 0.3s' }} />
          </div>

          {/* File list */}
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {files.map(fi => (
              <div key={fi.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                <div style={{ flex: 1, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {fi.file.name}
                  {fi.ocr_used && <span className="badge badge-warning" style={{ marginLeft: 6, fontSize: '0.65rem' }}>OCR</span>}
                </div>
                {fi.status === 'processing' && fi.note && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{fi.note}</div>}
                <div>{STATUS_ICON[fi.status]}</div>
                {fi.error_message && <div style={{ fontSize: '0.7rem', color: 'var(--color-danger)', maxWidth: 180, textAlign: 'right' }}>{fi.error_message}</div>}
              </div>
            ))}
          </div>

          {/* Summary */}
          {allDone && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{successCount} berhasil</span>
                {failedCount > 0 && <span style={{ color: 'var(--color-danger)', fontWeight: 600, marginLeft: '0.75rem' }}>{failedCount} gagal</span>}
              </div>
              {submitted ? (
                <div style={{ color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: 600 }}>{submitMsg}</div>
              ) : successCount > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {submitMsg && <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{submitMsg}</span>}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                    onClick={() => document.getElementById('file-input')?.click()}>
                    <RefreshCw size={14} /> Tambah file
                  </label>
                  <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit ke n8n
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
