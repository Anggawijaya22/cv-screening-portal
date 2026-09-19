import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const posisi = searchParams.get('posisi')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = ['developer', 'hr_main_admin'].includes(profile?.role ?? '')

  let q = supabase.from('cv_batches')
    .select('*, users(nama)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!isAdmin) q = q.eq('created_by', user.id)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)
  if (posisi) q = q.eq('posisi_kode', posisi)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
}
