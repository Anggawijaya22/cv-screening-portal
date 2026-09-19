'use client'

import { useEffect, useState } from 'react'
import { FileText, TrendingUp, Users, AlertCircle, Clock } from 'lucide-react'

interface DashboardData {
  total_today: number
  strong_fit: number
  potential_fit: number
  low_fit: number
  hr_review: number
  trend: { date: string; count: number }[]
  per_posisi: { posisi: string; count: number }[]
}

const KPI = ({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) => (
  <div className="glass p-5 flex items-center gap-4">
    <div style={{ width: 48, height: 48, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={22} style={{ color }} />
    </div>
    <div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  </div>
)

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(r => { setData(r); setLoading(false) })
  }, [])

  const maxTrend = data ? Math.max(...data.trend.map(t => t.count), 1) : 1

  return (
    <div className="space-y-6">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '4rem' }}>Memuat data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <KPI label="Total CV Hari Ini" value={data?.total_today ?? 0} icon={FileText} color="#00897B" />
            <KPI label="Strong Fit" value={data?.strong_fit ?? 0} icon={TrendingUp} color="#66BB6A" />
            <KPI label="Potential Fit" value={data?.potential_fit ?? 0} icon={Users} color="#00BCD4" />
            <KPI label="Low Fit" value={data?.low_fit ?? 0} icon={AlertCircle} color="#FFA726" />
            <KPI label="HR Review" value={data?.hr_review ?? 0} icon={Clock} color="#EF5350" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
            {/* Trend chart */}
            <div className="glass p-5">
              <div style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Tren CV 7 Hari Terakhir</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 120 }}>
                {data?.trend.map(({ date, count }) => (
                  <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{count}</div>
                    <div style={{
                      width: '100%', borderRadius: '4px 4px 0 0',
                      height: `${Math.round((count / maxTrend) * 100)}%`,
                      minHeight: count > 0 ? 4 : 0,
                      background: 'var(--color-primary)',
                      opacity: 0.85,
                      transition: 'height 0.3s',
                    }} />
                    <div style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      {new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per posisi */}
            <div className="glass p-5">
              <div style={{ fontWeight: 600, marginBottom: '1.25rem' }}>CV per Posisi (Hari Ini)</div>
              {data?.per_posisi.length === 0 ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Belum ada data hari ini</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data?.per_posisi.map(({ posisi, count }) => (
                    <div key={posisi}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{posisi}</span>
                        <span style={{ fontWeight: 600 }}>{count}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--color-secondary)', width: `${Math.round((count / (data.total_today || 1)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
