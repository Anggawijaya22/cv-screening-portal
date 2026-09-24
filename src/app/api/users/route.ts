import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).single()

  let q = supabase.from('users').select('*').order('created_at', { ascending: false })
  if (actor?.role !== 'developer') q = q.neq('role', 'developer')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: actor } = await supabase.from('users').select('role, nama').eq('id', user.id).single()
  if (actor?.role !== 'developer') {
    await supabase.from('activity_logs').insert({
      user_id: user.id, action: 'add_user', status: 'failed',
      detail: { reason: 'forbidden', actor_role: actor?.role },
    })
    return NextResponse.json({ error: 'Hanya Developer yang bisa menambah user' }, { status: 403 })
  }

  const body = await req.json()
  const username = (body.username ?? '').toLowerCase().replace(/\s+/g, '')
  if (!username) return NextResponse.json({ error: 'Username wajib diisi' }, { status: 400 })
  if (!body.password || body.password.length < 8) return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 })

  const { data: profile, error } = await supabase.rpc('admin_create_user', {
    p_username: username,
    p_nama: body.nama || username,
    p_role: body.role || 'hr_admin',
    p_password: body.password,
    p_created_by: user.id,
  })

  if (error) {
    await supabase.from('activity_logs').insert({
      user_id: user.id, action: 'add_user', status: 'failed',
      detail: { username, role: body.role, error: error.message },
    })
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from('activity_logs').insert({
    user_id: user.id, action: 'add_user', status: 'success',
    detail: { username, role: body.role, oleh: actor.nama },
  })
  return NextResponse.json({ data: profile })
}
