'use client'

import { useEffect, useState } from 'react'
import type { ActivityLog } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  login: 'Login', logout: 'Logout', upload_batch: 'Upload Batch', submit_batch: 'Submit Batch',
  add_user: 'Tambah User', update_user: 'Update User', reset_password: 'Reset Password',
  update_setting: 'Update Setting', add_position: 'Tambah Posisi', update_position: 'Update Posisi',
}

export default function LogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ action: '', from: '', to: '' })

  async function loadLogs() {
    setLoading(true)
    const params = new URLSearchParams({ limit: '200' })
    if (filters.action) params.set('action', filters.action)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to + 'T23:59:59')
    const res = await fetch('/api/logs?' + params)
    const r = await res.json()
    setLogs(r.data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [])

  return (
    <div className="space-y-6">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Activity Log</h1>

      <div className="glass p-4" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Aksi</label>
          <select className="input-glass" style={{ width: 200 }} value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}>
            <option value="">Semua Aksi</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Dari</label>
          <input type="date" className="input-glass" style={{ width: 160 }} value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Sampai</label>
          <input type="date" className="input-glass" style={{ width: 160 }} value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <button className="btn-primary" onClick={loadLogs}>Filter</button>
      </div>

      <div className="glass" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
              {['Timestamp', 'User', 'Aksi', 'Status', 'Detail'].map(h => (
                <th key={h} style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Memuat...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Belum ada log</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(log.created_at).toLocaleString('id-ID')}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {(log.users as { nama: string; email: string } | undefined)?.nama ?? '-'}
                  {(log.users as { email: string } | undefined)?.email && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{(log.users as { email: string }).email}</div>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>{ACTION_LABELS[log.action] ?? log.action}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className={log.status === 'success' ? 'badge badge-success' : 'badge badge-danger'}>{log.status}</span>
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.75rem', maxWidth: 300 }}>
                  {log.detail ? JSON.stringify(log.detail).slice(0, 120) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
