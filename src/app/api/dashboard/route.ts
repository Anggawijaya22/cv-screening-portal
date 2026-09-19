import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Batches today
  const { data: todayBatches } = await supabase.from('cv_batches')
    .select('id, posisi_kode, posisi_nama, success, failed, total_files')
    .gte('created_at', today)

  const total_today = todayBatches?.reduce((a, b) => a + b.total_files, 0) ?? 0

  // Trend: last 7 days
  const { data: trendData } = await supabase.from('cv_batches')
    .select('created_at, total_files')
    .gte('created_at', sevenDaysAgo)
    .order('created_at')

  const trendMap: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    trendMap[d] = 0
  }
  trendData?.forEach(b => {
    const d = b.created_at.split('T')[0]
    if (trendMap[d] !== undefined) trendMap[d] += b.total_files
  })
  const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count }))

  // Per posisi today
  const posisiMap: Record<string, number> = {}
  todayBatches?.forEach(b => {
    posisiMap[b.posisi_nama] = (posisiMap[b.posisi_nama] ?? 0) + b.total_files
  })
  const per_posisi = Object.entries(posisiMap).map(([posisi, count]) => ({ posisi, count }))

  // Recent submitted candidates
  const { data: recentCandidates } = await supabase.from('cv_candidates')
    .select('*').eq('extract_status', 'success').order('created_at', { ascending: false }).limit(5)

  return NextResponse.json({
    total_today,
    strong_fit: 0,
    potential_fit: 0,
    low_fit: 0,
    hr_review: 0,
    trend,
    per_posisi,
    top_candidates: recentCandidates ?? [],
  })
}
