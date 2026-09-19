'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User, UserRole } from '@/types'

const ROLE_LABEL: Record<UserRole, string> = { developer: 'Developer', hr_main_admin: 'HR Main Admin', hr_admin: 'HR Admin' }

export default function AccountPage() {
  const [users, setUsers] = useState<User[]>([])
  const [myProfile, setMyProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showChangePw, setShowChangePw] = useState<string | null>(null)
  const [form, setForm] = useState({ nama: '', username: '', role: 'hr_admin' as UserRole, password: '' })
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('*').eq('id', user!.id).single()
      setMyProfile(profile)

      if (['developer', 'hr_main_admin'].includes(profile?.role ?? '')) {
        const res = await fetch('/api/users')
        const r = await res.json()
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
    setShowAdd(false); setForm({ nama: '', username: '', role: 'hr_admin', password: '' })
    setSaving(false)
  }

  async function toggleActive(userId: string, is_active: boolean) {
    await fetch(`/api/users/${userId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active } : u))
  }

  async function handleChangePw() {
    if (!newPw || !showChangePw) return
    setSaving(true); setMsg('')
    const res = await fetch(`/api/users/${showChangePw}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPw }) })
    const r = await res.json()
    if (r.error) { setMsg(r.error); setSaving(false); return }
    setShowChangePw(null); setNewPw(''); setSaving(false)
  }

  const isAdmin = ['developer', 'hr_main_admin'].includes(myProfile?.role ?? '')

  return (
    <div className="space-y-6">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Account Management</h1>
        {isAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} />Tambah User</button>}
      </div>

      {/* Add user modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-modal p-6 space-y-4" style={{ width: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700 }}>Tambah User Baru</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {[
              { label: 'Nama Lengkap', key: 'nama', type: 'text', placeholder: 'Nama lengkap' },
              { label: 'Username', key: 'username', type: 'text', placeholder: 'username (tanpa spasi)' },
              { label: 'Password Sementara', key: 'password', type: 'password', placeholder: 'Min 8 karakter' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1">
                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{label}</label>
                <input type={type} className="input-glass" placeholder={placeholder}
                  value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Role</label>
              <select className="input-glass" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>Batal</button>
              <button className="btn-primary" onClick={handleAddUser} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePw && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="glass-modal p-6 space-y-4" style={{ width: 360 }}>
            <h2 style={{ fontWeight: 700 }}>Ganti Password</h2>
            <div className="space-y-1">
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Password Baru</label>
              <input type="password" className="input-glass" placeholder="Min 8 karakter" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            {msg && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => { setShowChangePw(null); setNewPw('') }}>Batal</button>
              <button className="btn-primary" onClick={handleChangePw} disabled={saving || newPw.length < 8}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User table */}
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
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{u.nama}</td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)' }}>{u.username ?? '-'}</td>
                <td style={{ padding: '0.75rem 1rem' }}><span className="badge badge-info">{ROLE_LABEL[u.role]}</span></td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className={u.is_active ? 'badge badge-success' : 'badge badge-muted'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </td>
                <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleString('id-ID') : '-'}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-ghost" style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }} onClick={() => setShowChangePw(u.id)}>
                      Ganti PW
                    </button>
                    {isAdmin && u.id !== myProfile?.id && (
                      <button className={u.is_active ? 'btn-ghost' : 'btn-primary'}
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => toggleActive(u.id, !u.is_active)}>
                        {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
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
