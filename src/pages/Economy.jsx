import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'

function KpiCard({ label, value, sub, color = 'blue', prefix = '' }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{prefix}{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const fmt = (n) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export default function Economy() {
  const [orders, setOrders]   = useState([])
  const [lines, setLines]     = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: o }, { data: l }, { data: p }] = await Promise.all([
        supabase.from('orders_with_totals').select('*'),
        supabase.from('production_lines').select('id, name, hourly_cost, available_hours_per_day, efficiency'),
        supabase.from('products').select('id, name, time_per_piece, selling_price'),
      ])
      setOrders(o || [])
      setLines(l || [])
      setProducts(p || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div>
      <div className="topbar"><div><div className="topbar-title">Economia</div></div></div>
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
    </div>
  )

  // Mappa prodotto per nome
  const productMap = {}
  products.forEach(p => { productMap[p.name?.toLowerCase()] = p })

  // Mappa linea per id
  const lineMap = {}
  lines.forEach(l => { lineMap[l.id] = l })

  // Calcola costo e ricavo per ordine
  const orderEcon = orders.map(o => {
    const prod = productMap[o.product?.toLowerCase()]
    const line = lineMap[o.assigned_line_id]
    const tpp = parseFloat(prod?.time_per_piece || 0)
    const hc  = parseFloat(line?.hourly_cost || 0)
    const sp  = parseFloat(prod?.selling_price || 0)
    const pzProdotti = o.quantity_produced || 0

    const costoOrdine   = pzProdotti * (tpp / 60) * hc
    const ricavoOrdine  = pzProdotti * sp
    const margine       = ricavoOrdine - costoOrdine
    const marginePct    = ricavoOrdine > 0 ? (margine / ricavoOrdine) * 100 : null

    return { ...o, costoOrdine, ricavoOrdine, margine, marginePct, tpp, hc, sp, pzProdotti }
  })

  // KPI totali
  const totalCosto   = orderEcon.reduce((s, o) => s + o.costoOrdine, 0)
  const totalRicavo  = orderEcon.reduce((s, o) => s + o.ricavoOrdine, 0)
  const totalMargine = totalRicavo - totalCosto
  const marginePct   = totalRicavo > 0 ? (totalMargine / totalRicavo) * 100 : 0

  // Warning: ordini senza dati economici
  const ordiniSenzaDati = orderEcon.filter(o => o.sp === 0 || o.tpp === 0).length

  // Dati per grafico per brand
  const brandEcon = {}
  orderEcon.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!brandEcon[b]) brandEcon[b] = { brand: b, costo: 0, ricavo: 0, margine: 0 }
    brandEcon[b].costo   += o.costoOrdine
    brandEcon[b].ricavo  += o.ricavoOrdine
    brandEcon[b].margine += o.margine
  })
  const brandData = Object.values(brandEcon)

  // Dati per grafico settimane
  const weekEcon = {}
  orderEcon.forEach(o => {
    if (!o.week) return
    const key = `W${o.week}`
    if (!weekEcon[key]) weekEcon[key] = { week: key, costo: 0, ricavo: 0, margine: 0 }
    weekEcon[key].costo   += o.costoOrdine
    weekEcon[key].ricavo  += o.ricavoOrdine
    weekEcon[key].margine += o.margine
  })
  const weekData = Object.values(weekEcon)
    .sort((a, b) => parseInt(a.week.replace('W','')) - parseInt(b.week.replace('W','')))
    .slice(-8)
    .map(w => ({ ...w, costo: Math.round(w.costo), ricavo: Math.round(w.ricavo), margine: Math.round(w.margine) }))

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Economia</div>
          <div className="topbar-sub">Costi, ricavi e margini di produzione</div>
        </div>
      </div>

      <div className="page-content">
        {/* Warning dati mancanti */}
        {ordiniSenzaDati > 0 && (
          <div style={{ marginBottom: 20, padding: '12px 16px', background: '#FEF3E2', borderRadius: 10, border: '1px solid #F5C880' }}>
            <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 500 }}>
              ⚠ {ordiniSenzaDati} ordini non hanno prezzo di vendita o tempo/pz configurato.
              Configura i prodotti nelle Anagrafiche per vedere i dati economici completi.
            </span>
          </div>
        )}

        {/* KPI */}
        <div className="kpi-grid mb-6">
          <KpiCard label="Costo totale produzione" value={`€ ${fmt(totalCosto)}`} color="warning"
            sub="Basato su pz prodotti × tempo × costo orario linea" />
          <KpiCard label="Ricavo totale" value={`€ ${fmt(totalRicavo)}`} color="celeste"
            sub="Basato su pz prodotti × prezzo vendita" />
          <KpiCard label="Margine lordo" value={`€ ${fmt(totalMargine)}`}
            color={totalMargine >= 0 ? 'success' : 'warning'}
            sub={`Margine %: ${fmt(marginePct)}%`} />
          <KpiCard label="Margine %" value={`${fmt(marginePct)}%`}
            color={marginePct >= 30 ? 'success' : marginePct >= 10 ? 'celeste' : 'warning'} />
        </div>

        {/* Grafici */}
        <div className="charts-grid mb-4">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Costi vs Ricavi per settimana</div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekData} barSize={18} barGap={4}>
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `€${v}`} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }}
                    formatter={v => [`€ ${fmt(v)}`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="costo" fill="#D4820A" name="Costo" radius={[4,4,0,0]} />
                  <Bar dataKey="ricavo" fill="#1A5FA8" name="Ricavo" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Margine per brand</div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={brandData} layout="vertical" barSize={18}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `€${v}`} />
                  <YAxis type="category" dataKey="brand" tick={{ fontSize: 12, fill: '#3D5166' }}
                    axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }}
                    formatter={v => [`€ ${fmt(v)}`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="ricavo" fill="#1A5FA8" name="Ricavo" radius={[0,4,4,0]} />
                  <Bar dataKey="costo" fill="#D4820A" name="Costo" radius={[0,4,4,0]} />
                  <Bar dataKey="margine" fill="#1A9E6E" name="Margine" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tabella ordini con economics */}
        <div className="card">
          <div className="card-header" style={{ padding: '20px 24px 16px' }}>
            <div className="card-title">Dettaglio economico per ordine</div>
            <div className="card-sub">Solo ordini con almeno un pezzo prodotto</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ordine</th>
                  <th>Prodotto</th>
                  <th>Brand</th>
                  <th>Pz prodotti</th>
                  <th>Costo (€)</th>
                  <th>Ricavo (€)</th>
                  <th>Margine (€)</th>
                  <th>Margine %</th>
                </tr>
              </thead>
              <tbody>
                {orderEcon
                  .filter(o => o.pzProdotti > 0)
                  .sort((a, b) => b.margine - a.margine)
                  .map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">{o.order_code}</span></td>
                      <td className="font-medium" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.product}
                      </td>
                      <td>{o.brand_name ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>{o.pzProdotti.toLocaleString()}</td>
                      <td style={{ color: 'var(--warning)', fontWeight: 500 }}>
                        {o.costoOrdine > 0 ? `€ ${fmt(o.costoOrdine)}` : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ color: 'var(--blue)', fontWeight: 500 }}>
                        {o.ricavoOrdine > 0 ? `€ ${fmt(o.ricavoOrdine)}` : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontWeight: 600, color: o.margine >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {o.costoOrdine > 0 && o.ricavoOrdine > 0 ? `€ ${fmt(o.margine)}` : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {o.marginePct !== null && o.costoOrdine > 0 && o.ricavoOrdine > 0 ? (
                          <span style={{
                            fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 99,
                            background: o.marginePct >= 30 ? '#E8F8F2' : o.marginePct >= 10 ? 'var(--ice)' : '#FEF3E2',
                            color: o.marginePct >= 30 ? 'var(--success)' : o.marginePct >= 10 ? 'var(--blue)' : 'var(--warning)'
                          }}>
                            {fmt(o.marginePct)}%
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
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
