import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { supabase } from '../lib/supabase'

const COLORS = ['#1A5FA8', '#4A9FD4', '#7EC8E3', '#2272C3', '#A8BDD0']

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, inProd: 0, planned: 0, completed: 0 })
  const [byBrand, setByBrand] = useState([])
  const [byStatus, setByStatus] = useState([])
  const [weekly, setWeekly] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: orders } = await supabase.from('orders').select('*, brands(name)')
      if (!orders) return

      const total = orders.length
      const inProd = orders.filter(o => o.status === 'in_production').length
      const planned = orders.filter(o => o.status === 'planned').length
      const completed = orders.filter(o => o.status === 'completed').length
      setStats({ total, inProd, planned, completed })

      // By brand
      const brandMap = {}
      orders.forEach(o => {
        const b = o.brands?.name ?? 'N/D'
        brandMap[b] = (brandMap[b] || 0) + 1
      })
      setByBrand(Object.entries(brandMap).map(([name, value]) => ({ name, value })))

      // By status
      setByStatus([
        { name: 'Pianificati', value: planned, color: '#1A5FA8' },
        { name: 'In produzione', value: inProd, color: '#1A9E6E' },
        { name: 'Completati', value: completed, color: '#6B85A0' },
      ])

      // Weekly (by week field)
      const weekMap = {}
      orders.forEach(o => {
        if (o.week) weekMap[`W${o.week}`] = (weekMap[`W${o.week}`] || 0) + (o.quantity || 0)
      })
      const sorted = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-8)
      setWeekly(sorted.map(([week, qty]) => ({ week, qty })))

      setLoading(false)
    }
    load()
  }, [])

  const kpis = [
    { label: 'Ordini totali', value: stats.total, color: 'blue', icon: '≡', delta: null },
    { label: 'In produzione', value: stats.inProd, color: 'success', icon: '◎', delta: null },
    { label: 'Pianificati', value: stats.planned, color: 'celeste', icon: '▷', delta: null },
    { label: 'Completati', value: stats.completed, color: 'warning', icon: '✓', delta: null },
  ]

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-sub">Panoramica produzione</div>
        </div>
        <div className="topbar-actions">
          <span className="text-sm text-muted">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="kpi-grid">
            {[1,2,3,4].map(i => <div key={i} className="kpi-card"><div className="skeleton" style={{height:80}}></div></div>)}
          </div>
        ) : (
          <div className="kpi-grid">
            {kpis.map(k => (
              <div key={k.label} className={`kpi-card ${k.color}`}>
                <div className={`kpi-icon ${k.color}`}>
                  <span style={{ fontSize: 18 }}>{k.icon}</span>
                </div>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value">{k.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="charts-grid">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Quantità per settimana</div>
                <div className="card-sub">Ultime 8 settimane</div>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekly} barSize={24}>
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                  <Bar dataKey="qty" fill="#2272C3" radius={[4, 4, 0, 0]} name="Quantità" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Distribuzione stato ordini</div>
                <div className="card-sub">Situazione attuale</div>
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={byStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" paddingAngle={3}>
                    {byStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byStatus.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--gray-700)', flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <div>
                <div className="card-title">Ordini per Brand</div>
                <div className="card-sub">Distribuzione attuale</div>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byBrand} layout="vertical" barSize={20}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#3D5166' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                  <Bar dataKey="value" fill="#4A9FD4" radius={[0, 4, 4, 0]} name="Ordini" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
