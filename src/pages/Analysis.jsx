import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const BRAND_COLORS = ['#1A5FA8','#4A9FD4','#7EC8E3','#2272C3','#0B3D7A','#A8BDD0']
const STATUS_LABELS = { planned: 'Pianificati', in_production: 'In produzione', completed: 'Completati', on_hold: 'In attesa' }

function KpiCard({ label, value, sub, color = 'blue' }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default function Analysis() {
  const [orders, setOrders] = useState([])
  const [logs, setLogs]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: o }, { data: l }] = await Promise.all([
        supabase.from('orders_with_totals').select('*'),
        supabase.from('production_log').select('*, orders(order_code, product, brand_id, brands(name))').order('date')
      ])
      setOrders(o || [])
      setLogs(l || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div>
      <div className="topbar"><div><div className="topbar-title">Analisi produzione</div></div></div>
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
    </div>
  )

  // ── KPI totali ──
  const totalOrders   = orders.length
  const totalPz       = orders.reduce((s, o) => s + (o.quantity || 0), 0)
  const pzProdotti    = orders.reduce((s, o) => s + (o.quantity_produced || 0), 0)
  const pzInProd      = orders.filter(o => o.status === 'in_production').reduce((s, o) => s + ((o.quantity || 0) - (o.quantity_produced || 0)), 0)
  const pzDaPianif    = orders.filter(o => o.status === 'planned').reduce((s, o) => s + (o.quantity || 0), 0)
  const ordiniInRitardo = orders.filter(o => o.due_date && new Date(o.due_date) < new Date() && o.status !== 'completed').length

  // ── Stato ordini per donut ──
  const byStatus = ['planned','in_production','completed','on_hold'].map(s => ({
    name: STATUS_LABELS[s],
    value: orders.filter(o => o.status === s).length,
    color: s === 'planned' ? '#1A5FA8' : s === 'in_production' ? '#1A9E6E' : s === 'completed' ? '#6B85A0' : '#D4820A'
  })).filter(s => s.value > 0)

  // ── Settimane con brand scomposti ──
  const weekBrandMap = {}
  const brandSet = new Set()
  orders.forEach(o => {
    if (!o.week) return
    const key = `W${o.week}`
    if (!weekBrandMap[key]) weekBrandMap[key] = { week: key }
    const brand = o.brand_name ?? 'N/D'
    brandSet.add(brand)
    weekBrandMap[key][brand] = (weekBrandMap[key][brand] || 0) + (o.quantity || 0)
  })
  const brands = [...brandSet]
  const weeklyData = Object.values(weekBrandMap)
    .sort((a, b) => {
      const wa = parseInt(a.week.replace('W',''))
      const wb = parseInt(b.week.replace('W',''))
      return wa - wb
    })
    .slice(-8)

  // ── Performance per brand ──
  const brandPerf = {}
  orders.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!brandPerf[b]) brandPerf[b] = { brand: b, total: 0, completed: 0, in_production: 0, planned: 0, pz_prodotti: 0 }
    brandPerf[b].total++
    brandPerf[b][o.status] = (brandPerf[b][o.status] || 0) + 1
    brandPerf[b].pz_prodotti += (o.quantity_produced || 0)
  })
  const brandData = Object.values(brandPerf)

  // ── Export ──
  const exportExcel = () => {
    const rows = orders.map(o => ({
      'Nr. Ordine': o.order_code,
      'Prodotto': o.product,
      'Brand': o.brand_name ?? '',
      'Collezione': o.collection ?? '',
      'Linea': o.line_name ?? '',
      'Stato': o.status,
      'Quantità totale': o.quantity,
      'Pz prodotti': o.quantity_produced ?? 0,
      'Pz rimanenti': o.quantity_remaining ?? o.quantity,
      'Avanzamento %': o.progress_pct ?? 0,
      'Scadenza': o.due_date ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Analisi')
    XLSX.writeFile(wb, `JProd_Analisi_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Analisi produzione</div>
          <div className="topbar-sub">Panoramica avanzamento e performance</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={exportExcel}>↓ Esporta Excel</button>
        </div>
      </div>

      <div className="page-content">
        {/* KPI */}
        <div className="kpi-grid mb-6">
          <KpiCard label="Ordini totali" value={totalOrders} color="blue" />
          <KpiCard label="Pz totali" value={totalPz.toLocaleString('it-IT')} sub={`${pzProdotti.toLocaleString()} prodotti · ${pzInProd.toLocaleString()} in prod · ${pzDaPianif.toLocaleString()} da pianif.`} color="celeste" />
          <KpiCard label="Avanzamento globale" value={`${totalPz > 0 ? Math.round(pzProdotti/totalPz*100) : 0}%`} sub={`${pzProdotti.toLocaleString()} / ${totalPz.toLocaleString()} pz`} color="success" />
          <KpiCard label="Ordini in ritardo" value={ordiniInRitardo} color="warning" />
        </div>

        {/* Grafici riga 1 */}
        <div className="charts-grid mb-4">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Quantità per settimana per brand</div>
              <div className="card-sub">Ultime 8 settimane</div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} barSize={16}>
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {brands.map((b, i) => (
                    <Bar key={b} dataKey={b} stackId="a"
                      fill={BRAND_COLORS[i % BRAND_COLORS.length]}
                      radius={i === brands.length - 1 ? [4,4,0,0] : [0,0,0,0]}
                      name={b} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Distribuzione stato ordini</div>
            </div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={byStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                    dataKey="value" paddingAngle={3}>
                    {byStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byStatus.map(s => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--gray-700)', flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabella brand */}
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 16px' }}>
            <div className="card-title">Dettaglio per brand</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Totale ordini</th>
                  <th>Pianificati</th>
                  <th>In produzione</th>
                  <th>Completati</th>
                  <th>Pz prodotti</th>
                </tr>
              </thead>
              <tbody>
                {brandData.map(b => (
                  <tr key={b.brand}>
                    <td className="font-medium">{b.brand}</td>
                    <td>{b.total}</td>
                    <td>{b.planned || 0}</td>
                    <td>{b.in_production || 0}</td>
                    <td>{b.completed || 0} ordini</td>
                    <td><span style={{ fontWeight: 600, color: 'var(--blue)' }}>{b.pz_prodotti.toLocaleString()} pz</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
