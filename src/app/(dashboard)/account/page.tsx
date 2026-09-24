'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User, UserRole } from '@/types'

const ROLE_LABEL: Record<UserRole, string> = {
  developer: 'Developer',
  hr_main_admin: 'HR Main Admin',
  hr_admin: 'HR Admin',
}

function canAdd(me: User) { return me.role === 'developer' }

function canDelete(me: User, target: User) {
  if (me.id === target.id) return false
  if (target.role === 'developer') return false
  if (me.role === 'developer') return true
  if (me.role === 'hr_main_admin') return target.role === 'hr_admin'
  return false
}

function canToggle(me: User, target: User) {
  if (me.id === target.id) return false
  if (me.role === 'developer') return true
  if (me.role === 'hr_main_admin') return target.role === 'hr_admin'
  return false
}

function canChangePassword(me: User, target: User) {
  if (me.id === target.id) return true
  return me.role === 'developer'
}

function generatePassword(len = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$'
  return Array.from(crypto.getRandomValues(new Uint8Array(len))).map(b => chars[b % chars.length]).join('')
}

export default function AccountPage() {
  const [users, setUsers] = useState<User[]>([])
  const [me, setMe] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [pwTarget, setPwTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [form, setForm] = useState({ nama: '', username: '', role: 'hr_admin' as UserRole, password: '' })
  const [newPw, setNewPw] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('*').eq('id', user!.id).single()
      setMe(profile)
      if (['developer', 'hr_main_admin'].includes(profile?.role ?? '')) {
        const r = await fetch('/api/users').then(r => r.json())
        setUsers(r.data ?? [])
      } else {
        setUsers([profile])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleAddUser() {
    setSaving(true); setMsg('')
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const r = await res.json()
    if (r.error) { setMsg(r.error); setSaving(false); return }
    setUsers(prev => [r.data, ...prev])
    setShowAdd(false); setForm({ nama: '', username: '', role: 'hr_admin', password: '' }); setSaving(false)
  }

  async function handleToggle(target: User) {
    const newActive = !target.is_active
    const res = await fetch(`/api/users/${target.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newActive }),
    })
    const r = await res.json()
    if (r.error) { alert(r.error); return }
    setUsers(prev => prev.map(u => u.id === target.id ? { ...u, is_active: newActive } : u))
  }

  async function handleChangePw() {
    if (!newPw || !pwTarget) return
    setSaving(true); setMsg('')
    const res = await fetch(`/api/users/${pwTarget.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw }),
    })
    const r = await res.json()
    if (r.error) { setMsg(r.error); setSaving(false); return }
    setPwTarget(null); setNewPw(''); setShowNewPw(false); setSaving(false)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
    const r = await res.json()
    if (r.error) { alert(r.error); setSaving(false); return }
    setUsers(prev => prev.filter(u => u.id !== deleteTarget.id))
    setDeleteTarget(null); setSaving(false)
  }

  if (!me) return null

  return (
    <div className="space-y-6">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Account Management</h1>
        {canAdd(me) && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} />Tambah User</button>
        )}
      </div>

      {/* Modal: Tambah User */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-modal p-6 space-y-4" style={{ width: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700 }}>Tambah User Baru</h2>
              <button onClick={() => { setShowAdd(false); setMsg('') }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {([
              { label: 'Nama Lengkap', key: 'nama', type: 'text', placeholder: 'Nama lengkap' },
              { label: 'Username', key: 'username', type: 'text', placeholder: 'username (tanpa spasi)' },
            ] as const).map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1">
                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{label}</label>
                <input type={type} className="input-glass" placeholder={placeholder}
                  value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Password Sementara</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" className="input-glass" placeholder="Min 8 karakter"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ flex: 1, fontFamily: 'monospace' }} />
                <button className="btn-ghost" style={{ padding: '0 0.75rem', whiteSpace: 'nowrap', fontSize: '0.75rem' }}
                  onClick={() => setForm(f => ({ ...f, password: generatePassword() }))}>
                  <RefreshCw size={13} /> Generate
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Role</label>
              <select className="input-glass" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setShowAdd(false); setMsg('') }}>Batal</button>
              <button className="btn-primary" onClick={handleAddUser} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ganti Password */}
      {pwTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-modal p-6 space-y-4" style={{ width: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700 }}>Ganti Password</h2>
              <button onClick={() => { setPwTarget(null); setNewPw(''); setShowNewPw(false); setMsg('') }} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {pwTarget.id === me.id ? 'Ganti password Anda sendiri' : `Ganti password untuk: ${pwTarget.nama}`}
            </p>
            <div className="space-y-1">
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Password Baru</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type={showNewPw ? 'text' : 'password'} className="input-glass" placeholder="Min 8 karakter"
                  value={newPw} onChange={e => setNewPw(e.target.value)}
                  style={{ flex: 1, fontFamily: newPw && showNewPw ? 'monospace' : undefined }} />
                <button className="btn-ghost" style={{ padding: '0 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setShowNewPw(v => !v)}>
                  {showNewPw ? 'Sembu' : 'Lihat'}
                </button>
                {me.role === 'developer' && pwTarget.id !== me.id && (
                  <button className="btn-ghost" style={{ padding: '0 0.6rem', whiteSpace: 'nowrap', fontSize: '0.75rem' }}
                    onClick={() => { setNewPw(generatePassword()); setShowNewPw(true) }}>
                    <RefreshCw size={13} /> Gen
                  </button>
                )}
              </div>
            </div>
            {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setPwTarget(null); setNewPw(''); setShowNewPw(false); setMsg('') }}>Batal</button>
              <button className="btn-primary" onClick={handleChangePw} disabled={saving || newPw.length < 8}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Hapus */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-modal p-6 space-y-4" style={{ width: 380 }}>
            <h2 style={{ fontWeight: 700 }}>Hapus User</h2>
            <p style={{ fontSize: '0.875rem' }}>
              Yakin ingin menghapus <strong>{deleteTarget.nama}</strong> ({ROLE_LABEL[deleteTarget.role]})?
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Batal</button>
              <button style={{ background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={handleDelete} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabel user */}
      <div className="glass" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.2)', textAlign: 'left' }}>
              {['Nama', 'Username', 'Role', 'Status', 'Last Login', 'Aksi'].map(h => (
                <th key={h} style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Memuat...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                  {u.nama}
                  {u.id === me.id && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>(saya)</span>}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)' }}>{u.username ?? '-'}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className="badge badge-info">{ROLE_LABEL[u.role]}</span>
                  {u.role === 'developer' && (
                    <span style={{ marginLeft: 4, fontSize: '0.65rem', color: 'var(--color-warning)' }}>🔒</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className={u.is_active ? 'badge badge-success' : 'badge badge-muted'}>
                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : '-'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {canChangePassword(me, u) && (
                      <button className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => { setPwTarget(u); setMsg('') }}>
                        Ganti PW
                      </button>
                    )}
                    {canToggle(me, u) && (
                      <button className={u.is_active ? 'btn-ghost' : 'btn-primary'}
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleToggle(u)}>
                        {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                    {canDelete(me, u) && (
                      <button style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setDeleteTarget(u)}>
                        <Trash2 size={12} /> Hapus
                      </button>
                    )}
                    {!canChangePassword(me, u) && !canToggle(me, u) && !canDelete(me, u) && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
