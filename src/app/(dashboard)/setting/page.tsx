'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Loader2, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Position } from '@/types'

export default function SettingPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [webhookUrl, setWebhookUrl] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [editPos, setEditPos] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [newPos, setNewPos] = useState({ kode: '', nama: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [savingWebhook, setSavingWebhook] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('role').eq('id', user!.id).single()
      setRole(profile?.role ?? '')

      const [posRes, settingRes] = await Promise.all([
        fetch('/api/positions').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
      ])
      setPositions(posRes.data ?? [])
      const wh = (settingRes.data ?? []).find((s: { key: string; value: string }) => s.key === 'webhook_url')
      setWebhookUrl(wh?.value ?? '')
      setLoading(false)
    }
    load()
  }, [])

  async function savePosition(id: string) {
    await fetch(`/api/positions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nama: editVal }) })
    setPositions(prev => prev.map(p => p.id === id ? { ...p, nama: editVal } : p))
    setEditPos(null)
  }

  async function togglePositionActive(id: string, is_active: boolean) {
    await fetch(`/api/positions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) })
    setPositions(prev => prev.map(p => p.id === id ? { ...p, is_active } : p))
  }

  async function deletePosition(id: string, kode: string) {
    if (!confirm(`Hapus posisi "${kode}" secara permanen? Tindakan ini tidak bisa dibatalkan.`)) return
    const res = await fetch(`/api/positions/${id}`, { method: 'DELETE' })
    if (res.ok) setPositions(prev => prev.filter(p => p.id !== id))
  }

  async function addPosition() {
    if (!newPos.kode || !newPos.nama) return
    const res = await fetch('/api/positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPos) })
    const r = await res.json()
    if (r.data) { setPositions(prev => [...prev, r.data]); setNewPos({ kode: '', nama: '' }); setShowAdd(false) }
  }

  async function saveWebhook() {
    setSavingWebhook(true); setWebhookMsg('')
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'webhook_url', value: webhookUrl }) })
    setSavingWebhook(false)
    setWebhookMsg(res.ok ? '✅ Webhook URL tersimpan' : '❌ Gagal menyimpan')
    setTimeout(() => setWebhookMsg(''), 3000)
  }

  const isDev = role === 'developer'
  const isAdmin = ['developer', 'hr_main_admin'].includes(role)

  if (loading) return <div style={{ color: 'var(--color-text-muted)', padding: '4rem', textAlign: 'center' }}>Memuat...</div>

  return (
    <div className="space-y-6" style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Setting</h1>

      {/* Positions */}
      <div className="glass p-5 space-y-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>Manajemen Posisi</div>
          {isAdmin && (
            <button className="btn-primary" style={{ padding: '0.4rem 0.875rem', fontSize: '0.8rem' }} onClick={() => setShowAdd(!showAdd)}>
              <Plus size={14} /> Tambah Posisi
            </button>
          )}
        </div>

        {showAdd && isAdmin && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', background: 'rgba(0,137,123,0.08)', borderRadius: 8, padding: '0.75rem' }}>
            <div className="space-y-1" style={{ flex: '0 0 120px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Kode (otomatis uppercase)</label>
              <input className="input-glass" placeholder="PCH" value={newPos.kode} onChange={e => setNewPos(p => ({ ...p, kode: e.target.value }))} />
            </div>
            <div className="space-y-1" style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Nama Posisi</label>
              <input className="input-glass" placeholder="Nama lengkap posisi" value={newPos.nama} onChange={e => setNewPos(p => ({ ...p, nama: e.target.value }))} />
            </div>
            <button className="btn-primary" style={{ padding: '0.5rem 0.875rem' }} onClick={addPosition}><Check size={14} /></button>
            <button className="btn-ghost" style={{ padding: '0.5rem 0.875rem' }} onClick={() => setShowAdd(false)}><X size={14} /></button>
          </div>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)' }}>
              {['Kode', 'Nama Posisi', 'Status', 'Aksi'].map(h => (
                <th key={h} style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: 'var(--color-secondary)' }}>{p.kode}</td>
                <td style={{ padding: '0.75rem' }}>
                  {editPos === p.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input className="input-glass" value={editVal} onChange={e => setEditVal(e.target.value)} style={{ width: 240 }} />
                      <button className="btn-primary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => savePosition(p.id)}><Check size={14} /></button>
                      <button className="btn-ghost" style={{ padding: '0.3rem 0.6rem' }} onClick={() => setEditPos(null)}><X size={14} /></button>
                    </div>
                  ) : p.nama}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <span className={p.is_active ? 'badge badge-success' : 'badge badge-muted'}>{p.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button className="btn-ghost" style={{ padding: '0.3rem 0.5rem' }}
                        title="Edit nama posisi"
                        onClick={() => { setEditPos(p.id); setEditVal(p.nama) }}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn-ghost" style={{ padding: '0.3rem 0.5rem' }}
                        title={p.is_active ? 'Nonaktifkan posisi' : 'Aktifkan posisi'}
                        onClick={() => togglePositionActive(p.id, !p.is_active)}>
                        {p.is_active ? <ToggleRight size={16} style={{ color: 'var(--color-success)' }} /> : <ToggleLeft size={16} />}
                      </button>
                      {isDev && (
                        <button className="btn-ghost" style={{ padding: '0.3rem 0.5rem', color: 'var(--color-danger)' }}
                          title="Hapus posisi permanen"
                          onClick={() => deletePosition(p.id, p.kode)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Webhook URL — developer only */}
      {isDev && (
        <div className="glass p-5 space-y-3">
          <div style={{ fontWeight: 600 }}>Webhook URL (n8n)</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>URL endpoint n8n yang menerima data CV. Hanya Developer yang bisa mengubah.</div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input className="input-glass" style={{ flex: 1 }} placeholder="https://n8n.rsup.co.id/webhook/cv-screening"
              value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
            <button className="btn-primary" onClick={saveWebhook} disabled={savingWebhook}>
              {savingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
            </button>
          </div>
          {webhookMsg && <p style={{ fontSize: '0.8rem', color: webhookMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-danger)' }}>{webhookMsg}</p>}
        </div>
      )}
    </div>
  )
}
