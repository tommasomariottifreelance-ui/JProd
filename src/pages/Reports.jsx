import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

export default function Reports() {
  const [orders, setOrders] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: o }, { data: l }] = await Promise.all([
        supabase.from('orders_with_totals').select('*'),
        supabase.from('production_log').select('*, orders(order_code, product)').order('date')
      ])
      setOrders(o || [])
      setLogs(l || [])
      setLoading(false)
    }
    load()
  }, [])

  // By brand performance
  const byBrand = {}
  orders.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!byBrand[b]) byBrand[b] = { brand: b, total: 0, done: 0, planned: 0, in_production: 0 }
    byBrand[b].total++
    byBrand[b][o.status] = (byBrand[b][o.status] || 0) + 1
    byBrand[b].done += (o.quantity_produced || 0)
  })
  const brandData = Object.values(byBrand)

  // Daily production from log
  const dailyMap = {}
  logs.forEach(l => {
    if (l.date) dailyMap[l.date] = (dailyMap[l.date] || 0) + (l.produced_qt || 0)
  })
  const dailyData = Object.entries(dailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, qty]) => ({ date: new Date(date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), qty }))

  // Summary stats
  const totalQty = orders.reduce((s, o) => s + (o.quantity || 0), 0)
  const doneQty = orders.reduce((s, o) => s + (o.quantity_produced || 0), 0)
  const pctDone = totalQty > 0 ? Math.round((doneQty / totalQty) * 100) : 0

  const exportExcel = () => {
    const rows = orders.map(o => ({
      'Nr. Ordine': o.order_code,
      'Prodotto': o.product,
      'Brand': o.brand_name ?? '',
      'Collezione': o.collection ?? '',
      'Linea': o.line_name ?? '',
      'Stato': o.status,
      'Quantità': o.quantity,
      'Prodotta': o.quantity_produced ?? 0,
      'Residua': o.quantity_remaining ?? o.quantity,
      'Scadenza': o.due_date ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ordini')
    XLSX.writeFile(wb, `JProd_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Report & Analisi</div>
          <div className="topbar-sub">Sintesi avanzamento produzione</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={exportExcel}>
            ↓ Esporta Excel
          </button>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-500)' }}>Caricamento...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="kpi-grid mb-6">
              <div className="kpi-card blue">
                <div className="kpi-label">Avanzamento globale</div>
                <div className="kpi-value">{pctDone}%</div>
                <div className="text-xs text-muted" style={{ marginTop: 6 }}>{doneQty.toLocaleString()} / {totalQty.toLocaleString()} pz</div>
              </div>
              <div className="kpi-card success">
                <div className="kpi-label">Ordini completati</div>
                <div className="kpi-value">{orders.filter(o => o.status === 'completed').length}</div>
              </div>
              <div className="kpi-card celeste">
                <div className="kpi-label">Ordini in ritardo</div>
                <div className="kpi-value" style={{ color: 'var(--danger)' }}>
                  {orders.filter(o => o.due_date && new Date(o.due_date) < new Date() && o.status !== 'completed').length}
                </div>
              </div>
              <div className="kpi-card warning">
                <div className="kpi-label">Pz prodotti (log)</div>
                <div className="kpi-value">{logs.reduce((s, l) => s + (l.produced_qt || 0), 0).toLocaleString()}</div>
              </div>
            </div>

            <div className="charts-grid">
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Produzione giornaliera</div>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                      <Line type="monotone" dataKey="qty" stroke="var(--blue)" strokeWidth={2.5} dot={{ fill: 'var(--blue)', r: 4 }} name="Pz prodotti" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div className="card-title">Performance per Brand</div>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={brandData} barSize={20}>
                      <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 13 }} />
                      <Bar dataKey="done" fill="#1A9E6E" name="Completati" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="in_production" fill="#2272C3" name="In produzione" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="planned" fill="#A8BDD0" name="Pianificati" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detail table */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header" style={{ padding: '20px 24px 16px' }}>
                <div className="card-title">Dettaglio per Brand</div>
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
                        <td>{b.done || 0}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--blue)' }}>
                            {orders.filter(o => o.brand_name === b.brand)
                              .reduce((s, o) => s + (o.quantity_produced || 0), 0).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
