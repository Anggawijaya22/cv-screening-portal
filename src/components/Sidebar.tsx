'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Upload, ClipboardList, ScrollText,
  Users, Settings, LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@/types'

const allMenus = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['developer','hr_main_admin','hr_admin'] },
  { href: '/upload', label: 'Upload CV', icon: Upload, roles: ['developer','hr_main_admin','hr_admin'] },
  { href: '/history', label: 'History', icon: ClipboardList, roles: ['developer','hr_main_admin','hr_admin'] },
  { href: '/log', label: 'Log', icon: ScrollText, roles: ['developer'] },
  { href: '/account', label: 'Account', icon: Users, roles: ['developer','hr_main_admin','hr_admin'] },
  { href: '/setting', label: 'Setting', icon: Settings, roles: ['developer','hr_main_admin'] },
]

export default function Sidebar({ user }: { user: User }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', detail: {} }),
    })
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menus = allMenus.filter(m => m.roles.includes(user.role))

  const roleLabel: Record<string, string> = {
    developer: 'Developer',
    hr_main_admin: 'HR Main Admin',
    hr_admin: 'HR Admin',
  }

  return (
    <aside style={{ width: 240, minHeight: '100vh', background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(16px)', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column' }}>
      {/* Logo — luminance mask on self removes black bg, preserves emblem + text */}
      <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'center' }}>
        <img
          src="/logo-bpi.jpeg"
          alt="BPI"
          style={{
            width: '130px',
            height: 'auto',
            display: 'block',
            WebkitMaskImage: 'url(/logo-bpi.jpeg)',
            maskImage: 'url(/logo-bpi.jpeg)',
            WebkitMaskMode: 'luminance',
            maskMode: 'luminance',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          } as React.CSSProperties}
        />
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {menus.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.625rem 0.875rem', borderRadius: 8, textDecoration: 'none',
              fontWeight: active ? 600 : 400, fontSize: '0.875rem',
              color: active ? '#fff' : 'var(--color-text-muted)',
              background: active ? 'var(--color-primary)' : 'transparent',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div style={{ padding: '1rem 0.75rem', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ padding: '0.75rem', background: 'var(--glass-bg)', borderRadius: 8 }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nama}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{roleLabel[user.role]}</div>
        </div>
        <button onClick={handleLogout} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '0.5rem' }}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  )
}
