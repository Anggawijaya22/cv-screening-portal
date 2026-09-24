'use client'

import { useEffect, useState } from 'react'
import type { ActivityLog } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDetail(action: string, detail: any): string {
  if (!detail) return '-'
  const d = detail as Record<string, unknown>
  const s = (k: string) => String(d[k] ?? '')
  const oleh = d.oleh ? ` oleh ${s('oleh')}` : ''
  const target = s('target_nama') || s('username') || s('target_id')
  const role = s('target_role') || s('role')
  const roleLabel = role === 'developer' ? 'Developer' : role === 'hr_main_admin' ? 'HR Main Admin' : role === 'hr_admin' ? 'HR Admin' : role

  switch (action) {
    case 'login': return 'Login berhasil'
    case 'logout': return 'Logout'
    case 'add_user':
      if (d.reason === 'forbidden') return `Gagal — tidak punya izin (role: ${s('actor_role')})`
      if (d.error) return `Gagal menambah user "${target}" — ${s('error')}`
      return `Menambah user "${target}" sebagai ${roleLabel}${oleh}`
    case 'delete_user':
      if (d.reason === 'forbidden') return `Gagal hapus "${target}" — tidak punya izin`
      return `Menghapus user "${target}" (${roleLabel})${oleh}`
    case 'activate_user':
      if (d.reason === 'forbidden') return `Gagal aktifkan "${target}" — tidak punya izin`
      return `Mengaktifkan user "${target}" (${roleLabel})${oleh}`
    case 'deactivate_user':
      if (d.reason === 'forbidden') return `Gagal nonaktifkan "${target}" — tidak punya izin`
      return `Menonaktifkan user "${target}" (${roleLabel})${oleh}`
    case 'reset_password':
      if (d.reason === 'forbidden') return `Gagal reset password "${target}" — tidak punya izin`
      if (d.self) return `Reset password sendiri`
      return `Reset password "${target}" (${roleLabel})${oleh}`
    case 'update_user': return target ? `Update data user "${target}"${oleh}` : `Update data user${oleh}`
    case 'upload_batch': return d.filename ? `Upload batch: ${s('filename')}` : 'Upload batch CV'
    case 'submit_batch': return d.batch_id ? `Submit batch #${s('batch_id')}` : 'Submit batch'
    case 'update_setting': return `Update pengaturan${oleh}`
    case 'add_position': return d.nama ? `Tambah posisi "${s('nama')}"${oleh}` : `Tambah posisi${oleh}`
    case 'update_position': return d.nama ? `Update posisi "${s('nama')}"${oleh}` : `Update posisi${oleh}`
    case 'auto_cleanup': return `Auto cleanup: ${s('files_deleted')} file, ${s('batches_deleted')} batch, ${s('candidates_deleted')} kandidat dihapus`
    default: return JSON.stringify(detail).slice(0, 100)
  }
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Login', logout: 'Logout', upload_batch: 'Upload Batch', submit_batch: 'Submit Batch',
  add_user: 'Tambah User', update_user: 'Update User', delete_user: 'Hapus User',
  activate_user: 'Aktifkan User', deactivate_user: 'Nonaktifkan User',
  reset_password: 'Reset Password',
  update_setting: 'Update Setting', add_position: 'Tambah Posisi', update_position: 'Update Posisi',
  auto_cleanup: 'Auto Cleanup',
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
                  {formatDetail(log.action, log.detail)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
