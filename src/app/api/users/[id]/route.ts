import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // HR Admin may only change own password
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role === 'hr_admin' && id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (body.password) {
    // Use SECURITY DEFINER function — no service role key needed
    const { error } = await supabase.rpc('admin_update_password', {
      p_user_id: id,
      p_new_password: body.password,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    delete body.password
  }

  if (Object.keys(body).length > 0) {
    const { error } = await supabase.from('users').update(body).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    action: 'update_user',
    detail: { target_id: id, ...body },
  })
  return NextResponse.json({ ok: true })
}
