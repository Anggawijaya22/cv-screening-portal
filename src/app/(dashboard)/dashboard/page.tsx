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

const wibDate = (offsetDays = 0) =>
  new Date(Date.now() + 7 * 3600_000 - offsetDays * 86400_000).toISOString().split('T')[0]

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(wibDate())

  const today = wibDate()
  const minDate = wibDate(6)
  const isToday = date === today
  const dateLabel = isToday ? 'Hari Ini' : new Date(date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

  useEffect(() => {
    setLoading(true)
    fetch('/api/dashboard?date=' + date)
      .then(r => r.json())
      .then(r => setData(r))
      .finally(() => setLoading(false))
  }, [date])

  const maxTrend = data ? Math.max(...data.trend.map(t => t.count), 1) : 1

  return (
    <div className="space-y-6">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Dashboard</h1>
        <div className="space-y-1">
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block' }}>Tanggal</label>
          <input
            type="date"
            className="input-glass"
            style={{ width: 170 }}
            value={date}
            min={minDate}
            max={today}
            onChange={e => e.target.value && setDate(e.target.value)}
          />
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '-0.75rem' }}>
        Data CV otomatis dihapus permanen 7 hari setelah upload — hanya 7 hari terakhir yang bisa dipilih.
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '4rem' }}>Memuat data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <KPI label={`Total CV ${dateLabel}`} value={data?.total_today ?? 0} icon={FileText} color="#00897B" />
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
                {data?.trend.map(({ date: d, count }) => (
                  <div key={d} onClick={() => setDate(d)} title="Klik untuk lihat tanggal ini"
                    style={{ flex: 1, height: '100%', justifyContent: 'flex-end', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{count}</div>
                    <div style={{
                      width: '100%', borderRadius: '4px 4px 0 0',
                      height: `${Math.round((count / maxTrend) * 100)}%`,
                      minHeight: count > 0 ? 4 : 0,
                      background: 'var(--color-primary)',
                      opacity: date === d ? 1 : 0.45,
                      transition: 'height 0.3s',
                    }} />
                    <div style={{ fontSize: '0.6rem', color: date === d ? 'inherit' : 'var(--color-text-muted)', fontWeight: date === d ? 700 : 400, textAlign: 'center' }}>
                      {new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per posisi */}
            <div className="glass p-5">
              <div style={{ fontWeight: 600, marginBottom: '1.25rem' }}>CV per Posisi ({dateLabel})</div>
              {data?.per_posisi.length === 0 ? (
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Belum ada data {isToday ? 'hari ini' : 'di tanggal ini'}</div>
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
