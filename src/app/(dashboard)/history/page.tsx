'use client'

import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CvBatch, CvCandidate, Position } from '@/types'
import { createClient } from '@/lib/supabase/client'

const STATUS_BADGE: Record<string, string> = {
  processing: 'badge badge-warning',
  completed: 'badge badge-info',
  submitted: 'badge badge-success',
  webhook_failed: 'badge badge-danger',
}
const STATUS_LABEL: Record<string, string> = {
  processing: 'Processing', completed: 'Selesai', submitted: 'Terkirim ke n8n', webhook_failed: 'Webhook Gagal',
}

export default function HistoryPage() {
  const [batches, setBatches] = useState<CvBatch[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Record<string, CvCandidate[]>>({})
  const [filters, setFilters] = useState({ from: '', to: '', posisi: '' })

  const supabase = createClient()

  useEffect(() => {
    fetch('/api/positions').then(r => r.json()).then(r => setPositions(r.data ?? []))
    loadBatches()
  }, [])

  async function loadBatches() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to + 'T23:59:59')
    if (filters.posisi) params.set('posisi', filters.posisi)
    const res = await fetch('/api/batches?' + params)
    const r = await res.json()
    setBatches(r.data ?? [])
    setLoading(false)
  }

  async function loadCandidates(batchId: string) {
    if (candidates[batchId]) return
    const { data } = await supabase.from('cv_candidates').select('*').eq('batch_id', batchId).order('created_at')
    setCandidates(prev => ({ ...prev, [batchId]: data ?? [] }))
  }

  function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadCandidates(id)
  }

  return (
    <div className="space-y-6">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>History Batch</h1>

      {/* Filters */}
      <div className="glass p-4" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Dari Tanggal</label>
          <input type="date" className="input-glass" style={{ width: 160 }} value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sampai Tanggal</label>
          <input type="date" className="input-glass" style={{ width: 160 }} value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Posisi</label>
          <select className="input-glass" style={{ width: 200 }} value={filters.posisi} onChange={e => setFilters(f => ({ ...f, posisi: e.target.value }))}>
            <option value="">Semua Posisi</option>
            {positions.map(p => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={loadBatches}>Filter</button>
      </div>

      {/* Batches table */}
      <div className="glass" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
              {['', 'Tanggal', 'Posisi', 'Total CV', 'Berhasil', 'Gagal', 'Status', 'Submitted By'].map(h => (
                <th key={h} style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Memuat...</td></tr>
            ) : batches.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Belum ada batch</td></tr>
            ) : batches.map(batch => (
              <React.Fragment key={batch.id}>
                <tr
                  style={{ borderTop: '1px solid var(--glass-border)', cursor: 'pointer' }}
                  onClick={() => toggleExpand(batch.id)}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td style={{ padding: '0.75rem 0.75rem 0.75rem 1rem' }}>
                    {expanded === batch.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{new Date(batch.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{batch.posisi_nama}</td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{batch.total_files}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--color-success)' }}>{batch.success}</td>
                  <td style={{ padding: '0.75rem 1rem', color: batch.failed > 0 ? 'var(--color-danger)' : 'inherit' }}>{batch.failed}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={STATUS_BADGE[batch.status]}>{STATUS_LABEL[batch.status]}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)' }}>{(batch.users as { nama: string } | undefined)?.nama ?? '-'}</td>
                </tr>
                {expanded === batch.id && (
                  <tr key={batch.id + '-detail'}>
                    <td colSpan={8} style={{ background: 'rgba(0,0,0,0.15)', padding: '0 1rem 1rem 3rem' }}>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
                        <thead>
                          <tr style={{ color: 'var(--color-text-muted)' }}>
                            <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 500 }}>Nama File</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 500 }}>Tipe</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 500 }}>OCR</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 500 }}>Status</th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 500 }}>Preview Teks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(candidates[batch.id] ?? []).map(c => (
                            <tr key={c.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <td style={{ padding: '0.5rem' }}>{c.nama_file}</td>
                              <td style={{ padding: '0.5rem' }}><span className="badge badge-muted">{c.file_type.toUpperCase()}</span></td>
                              <td style={{ padding: '0.5rem' }}>{c.ocr_used ? <span className="badge badge-warning">OCR</span> : '-'}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <span className={c.extract_status === 'success' ? 'badge badge-success' : 'badge badge-danger'}>
                                  {c.extract_status}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem', color: 'var(--color-text-muted)', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {c.cv_text ? c.cv_text.slice(0, 100) + '...' : c.error_message ?? '-'}
                              </td>
                            </tr>
                          ))}
                          {!candidates[batch.id] && <tr><td colSpan={5} style={{ padding: '0.5rem', color: 'var(--color-text-muted)' }}>Memuat...</td></tr>}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
