'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!username || !password) { setError('Username dan password wajib diisi'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()

    // Lookup email by username via secure RPC
    const { data: email, error: lookupError } = await supabase.rpc('get_email_by_username', { p_username: username })
    if (lookupError || !email) {
      setError('Username atau password salah')
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Username atau password salah')
      setLoading(false)
      return
    }

    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', detail: { username } }),
    })
    window.location.href = '/dashboard'
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 w-full max-w-sm space-y-6">
        {/* Logo — crop to show only the emblem, hide the text inside the image */}
        <div className="text-center">
          <div style={{ width: 150, height: 92, overflow: 'hidden', margin: '0 auto 18px' }}>
            <img
              src="/logo-bpi.jpeg"
              alt="BPI"
              style={{
                width: '150px',
                height: '150px',
                objectFit: 'cover',
                objectPosition: 'center top',
                mixBlendMode: 'screen',
                display: 'block',
              }}
            />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '0.06em' }}>HR SCREENING</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
            PT Balarama Prajakarsaka Indonesia
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Username</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                className="input-glass"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type={showPass ? 'text' : 'password'}
                className="input-glass"
                style={{ paddingLeft: '2.25rem', paddingRight: '2.5rem' }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}

          <button className="btn-primary w-full justify-center py-2.5" onClick={handleLogin} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </div>
      </div>
    </div>
  )
}
