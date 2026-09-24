import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Role = 'developer' | 'hr_main_admin' | 'hr_admin'

function canToggleActive(actorRole: Role, actorId: string, target: { id: string; role: Role }): boolean {
  if (actorId === target.id) return false
  if (actorRole === 'developer') return true
  if (actorRole === 'hr_main_admin') return target.role === 'hr_admin'
  return false
}

function canDelete(actorRole: Role, actorId: string, target: { id: string; role: Role }): boolean {
  if (actorId === target.id) return false
  if (target.role === 'developer') return false // developer tidak bisa dihapus siapapun
  if (actorRole === 'developer') return true
  if (actorRole === 'hr_main_admin') return target.role === 'hr_admin'
  return false
}

function canChangePassword(actorRole: Role, actorId: string, targetId: string): boolean {
  if (actorId === targetId) return true
  return actorRole === 'developer'
}

async function getActorAndTarget(supabase: Awaited<ReturnType<typeof createClient>>, actorAuthId: string, targetId: string) {
  const [{ data: actor }, { data: target }] = await Promise.all([
    supabase.from('users').select('role, nama, username').eq('id', actorAuthId).single(),
    supabase.from('users').select('role, nama, username, is_active').eq('id', targetId).single(),
  ])
  return { actor, target }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { actor, target } = await getActorAndTarget(supabase, user.id, id)
  if (!actor || !target) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

  // --- Ganti password ---
  if (body.password !== undefined) {
    if (!canChangePassword(actor.role as Role, user.id, id)) {
      await supabase.from('activity_logs').insert({
        user_id: user.id, action: 'reset_password', status: 'failed',
        detail: { target_id: id, target_nama: target.nama, reason: 'forbidden' },
      })
      return NextResponse.json({ error: 'Tidak punya izin untuk ubah password user ini' }, { status: 403 })
    }
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await supabase.from('activity_logs').insert({
      user_id: user.id, action: 'reset_password', status: 'success',
      detail: { target_id: id, target_nama: target.nama, target_role: target.role, oleh: actor.nama, self: user.id === id },
    })
    return NextResponse.json({ ok: true })
  }

  // --- Toggle aktif/nonaktif ---
  if (body.is_active !== undefined) {
    if (!canToggleActive(actor.role as Role, user.id, { id, role: target.role as Role })) {
      await supabase.from('activity_logs').insert({
        user_id: user.id, action: body.is_active ? 'activate_user' : 'deactivate_user', status: 'failed',
        detail: { target_id: id, target_nama: target.nama, reason: 'forbidden' },
      })
      return NextResponse.json({ error: 'Tidak punya izin untuk mengubah status user ini' }, { status: 403 })
    }
    const { error } = await supabase.from('users').update({ is_active: body.is_active }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('activity_logs').insert({
      user_id: user.id, action: body.is_active ? 'activate_user' : 'deactivate_user', status: 'success',
      detail: { target_id: id, target_nama: target.nama, target_role: target.role, oleh: actor.nama },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Request tidak valid' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { actor, target } = await getActorAndTarget(supabase, user.id, id)
  if (!actor || !target) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

  if (!canDelete(actor.role as Role, user.id, { id, role: target.role as Role })) {
    await supabase.from('activity_logs').insert({
      user_id: user.id, action: 'delete_user', status: 'failed',
      detail: { target_id: id, target_nama: target.nama, target_role: target.role, reason: 'forbidden' },
    })
    return NextResponse.json({ error: 'Tidak punya izin untuk menghapus user ini' }, { status: 403 })
  }

  const admin = createAdminClient()
  // Hapus dari public.users dulu agar FK tidak conflict
  await admin.from('users').delete().eq('id', id)
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.from('activity_logs').insert({
    user_id: user.id, action: 'delete_user', status: 'success',
    detail: { target_id: id, target_nama: target.nama, target_username: target.username, target_role: target.role, oleh: actor.nama },
  })
  return NextResponse.json({ ok: true })
}
