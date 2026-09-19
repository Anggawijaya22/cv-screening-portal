'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Upload, CheckCircle2, XCircle, Loader2, AlertTriangle, Send, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Position, ExtractStatus } from '@/types'

interface FileItem {
  id: string
  file: File
  status: ExtractStatus
  ocr_used: boolean
  error_message: string | null
  text_length: number
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
    for (const fi of fileItems) {
      setFiles(prev => prev.map(f => f.id === fi.id ? { ...f, status: 'processing' } : f))
      const fd = new FormData()
      fd.append('file', fi.file)
      fd.append('batch_id', currentBatchId!)
      fd.append('candidate_id', fi.id)
      const res = await fetch('/api/process-cv', { method: 'POST', body: fd })
      const result = await res.json()
      setFiles(prev => prev.map(f => f.id === fi.id ? {
        ...f, status: result.extract_status, ocr_used: result.ocr_used,
        error_message: result.error_message, text_length: result.text_length ?? 0
      } : f))
    }
    processingRef.current = false
  }, [selectedPos, positions, batchId, files.length])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => /\.(pdf|docx|doc|rtf|odt)$/i.test(f.name))
    if (dropped.length) processFiles(dropped)
  }, [processFiles])

  const handleBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter(f => /\.(pdf|docx|doc|rtf|odt)$/i.test(f.name))
    if (picked.length) processFiles(picked)
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
            PDF, DOCX, DOC, RTF, ODT • Maksimal 10MB per file • Multiple file didukung
          </div>
          <input id="file-input" type="file" multiple accept=".pdf,.docx,.doc,.rtf,.odt" style={{ display: 'none' }} onChange={handleBrowse} />
        </div>
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
