import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const toWibDate = (ms: number) => new Date(ms + WIB_OFFSET_MS).toISOString().split('T')[0]

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = toWibDate(Date.now())
  const param = new URL(req.url).searchParams.get('date')
  const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : today

  const dayStart = `${date}T00:00:00+07:00`
  const dayEnd = `${date}T23:59:59.999+07:00`
  const trendStart = `${toWibDate(Date.now() - 6 * DAY_MS)}T00:00:00+07:00`

  const [{ data: dayBatches }, { data: trendData }] = await Promise.all([
    supabase.from('cv_batches')
      .select('posisi_nama, total_files')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),

    supabase.from('cv_batches')
      .select('created_at, total_files')
      .gte('created_at', trendStart)
      .order('created_at'),
  ])

  const total_today = dayBatches?.reduce((a, b) => a + b.total_files, 0) ?? 0

  const trendMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) trendMap[toWibDate(Date.now() - i * DAY_MS)] = 0
  trendData?.forEach(b => {
    const d = toWibDate(new Date(b.created_at).getTime())
    if (trendMap[d] !== undefined) trendMap[d] += b.total_files
  })
  const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count }))

  const posisiMap: Record<string, number> = {}
  dayBatches?.forEach(b => {
    posisiMap[b.posisi_nama] = (posisiMap[b.posisi_nama] ?? 0) + b.total_files
  })
  const per_posisi = Object.entries(posisiMap).map(([posisi, count]) => ({ posisi, count }))

  return NextResponse.json({
    date,
    total_today,
    strong_fit: 0,
    potential_fit: 0,
    low_fit: 0,
    hr_review: 0,
    trend,
    per_posisi,
  })
}
