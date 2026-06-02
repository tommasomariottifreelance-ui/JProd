import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'

const fmt  = (n) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const fmtK = (n) => n >= 1000 ? `€ ${(n/1000).toFixed(1)}k` : `€ ${fmt(n)}`

function KpiCard({ label, value, sub, color = 'blue' }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 22 }}>{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
      fontFamily: 'var(--font)', fontSize: 14, fontWeight: active ? 600 : 400,
      color: active ? 'var(--blue)' : 'var(--gray-500)',
      borderBottom: `2px solid ${active ? 'var(--blue)' : 'transparent'}`,
      transition: 'all var(--transition)', marginBottom: -1
    }}>{children}</button>
  )
}

function MissingDataWarning({ count }) {
  if (!count) return null
  return (
    <div style={{ marginBottom: 20, padding: '12px 16px', background: '#FEF3E2', borderRadius: 10, border: '1px solid #F5C880' }}>
      <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 500 }}>
        ⚠ {count} ordini non hanno prezzo di vendita, tempo/pz o costo orario linea configurati.
        I dati economici potrebbero essere incompleti — configura le Anagrafiche per completare il quadro.
      </span>
    </div>
  )
}

// ─── TAB CONSUNTIVO ──────────────────────────────────────────
function Consuntivo({ orders, lines }) {
  const lineMap = {}
  lines.forEach(l => { lineMap[l.id] = l })

  // Usa i campi calcolati dalla VIEW
  const data = orders.filter(o => (o.quantity_produced || 0) > 0).map(o => ({
    ...o,
    costo:  parseFloat(o.costo_produzione || 0),
    ricavo: parseFloat(o.ricavo_produzione || 0),
    get margine() { return this.ricavo - this.costo },
    get marginePct() { return this.ricavo > 0 ? (this.margine / this.ricavo) * 100 : null }
  }))

  const totCosto  = data.reduce((s, o) => s + o.costo, 0)
  const totRicavo = data.reduce((s, o) => s + o.ricavo, 0)
  const totMargine = totRicavo - totCosto
  const totMarginePct = totRicavo > 0 ? (totMargine / totRicavo) * 100 : 0

  const missingCount = orders.filter(o =>
    (o.quantity_produced || 0) > 0 &&
    (!o.selling_price || !o.time_per_piece)
  ).length

  // Brand data
  const brandMap = {}
  data.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!brandMap[b]) brandMap[b] = { brand: b, costo: 0, ricavo: 0, margine: 0 }
    brandMap[b].costo   += o.costo
    brandMap[b].ricavo  += o.ricavo
    brandMap[b].margine += o.margine
  })
  const brandData = Object.values(brandMap).map(b => ({
    ...b,
    costo: Math.round(b.costo),
    ricavo: Math.round(b.ricavo),
    margine: Math.round(b.margine)
  }))

  return (
    <div>
      <MissingDataWarning count={missingCount} />
      <div className="kpi-grid mb-6">
        <KpiCard label="Costo produzione reale" value={`€ ${fmt(totCosto)}`} color="warning"
          sub="pz prodotti × tempo/pz × costo orario linea" />
        <KpiCard label="Ricavo reale" value={`€ ${fmt(totRicavo)}`} color="celeste"
          sub="pz prodotti × prezzo vendita" />
        <KpiCard label="Margine lordo" value={`€ ${fmt(totMargine)}`}
          color={totMargine >= 0 ? 'success' : 'warning'} />
        <KpiCard label="Margine %" value={`${fmt(totMarginePct)}%`}
          color={totMarginePct >= 30 ? 'success' : totMarginePct >= 10 ? 'celeste' : 'warning'} />
      </div>

      <div className="charts-grid mb-4">
        <div className="card">
          <div className="card-header"><div className="card-title">Costo vs Ricavo per brand</div></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={brandData} barSize={18} barGap={4}>
                <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }} formatter={v => [`€ ${fmt(v)}`]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="costo"  fill="#D4820A" name="Costo"  radius={[4,4,0,0]} />
                <Bar dataKey="ricavo" fill="#1A5FA8" name="Ricavo" radius={[4,4,0,0]} />
                <Bar dataKey="margine" fill="#1A9E6E" name="Margine" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Top ordini per margine</div></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Ordine</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>Margine</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>%</th>
                </tr>
              </thead>
              <tbody>
                {data.sort((a,b) => b.margine - a.margine).slice(0,6).map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{o.order_code}</div>
                      <div className="text-xs text-muted">{o.product}</div>
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600, color: o.margine >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      € {fmt(o.margine)}
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                      {o.marginePct !== null ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                          background: o.marginePct >= 30 ? '#E8F8F2' : o.marginePct >= 10 ? 'var(--ice)' : '#FEF3E2',
                          color: o.marginePct >= 30 ? 'var(--success)' : o.marginePct >= 10 ? 'var(--blue)' : 'var(--warning)'
                        }}>{fmt(o.marginePct)}%</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: '20px 24px 16px' }}>
          <div className="card-title">Dettaglio economico consuntivo</div>
          <div className="card-sub">Solo ordini con pezzi prodotti</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th><th>Prodotto</th><th>Brand</th>
                <th>Pz prodotti</th><th>Costo (€)</th><th>Ricavo (€)</th>
                <th>Margine (€)</th><th>Margine %</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a,b) => b.margine - a.margine).map(o => (
                <tr key={o.id}>
                  <td><span className="mono">{o.order_code}</span></td>
                  <td className="font-medium">{o.product}</td>
                  <td>{o.brand_name ?? '—'}</td>
                  <td style={{ fontWeight: 600 }}>{(o.quantity_produced||0).toLocaleString()}</td>
                  <td style={{ color: 'var(--warning)', fontWeight: 500 }}>{o.costo > 0 ? `€ ${fmt(o.costo)}` : '—'}</td>
                  <td style={{ color: 'var(--blue)', fontWeight: 500 }}>{o.ricavo > 0 ? `€ ${fmt(o.ricavo)}` : '—'}</td>
                  <td style={{ fontWeight: 600, color: o.margine >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {o.costo > 0 && o.ricavo > 0 ? `€ ${fmt(o.margine)}` : '—'}
                  </td>
                  <td>{o.marginePct !== null && o.costo > 0 ? (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                      background: o.marginePct >= 30 ? '#E8F8F2' : o.marginePct >= 10 ? 'var(--ice)' : '#FEF3E2',
                      color: o.marginePct >= 30 ? 'var(--success)' : o.marginePct >= 10 ? 'var(--blue)' : 'var(--warning)'
                    }}>{fmt(o.marginePct)}%</span>
                  ) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── TAB FORECAST ────────────────────────────────────────────
function Forecast({ orders }) {
  const data = orders.filter(o => o.status !== 'completed').map(o => ({
    ...o,
    forecastCosto:  parseFloat(o.forecast_costo || 0),
    forecastRicavo: parseFloat(o.forecast_ricavo || 0),
    get forecastMargine() { return this.forecastRicavo - this.forecastCosto },
    get forecastMarginePct() { return this.forecastRicavo > 0 ? (this.forecastMargine / this.forecastRicavo) * 100 : null }
  }))

  const totCosto   = data.reduce((s, o) => s + o.forecastCosto, 0)
  const totRicavo  = data.reduce((s, o) => s + o.forecastRicavo, 0)
  const totMargine = totRicavo - totCosto
  const totMarginePct = totRicavo > 0 ? (totMargine / totRicavo) * 100 : 0

  const missingCount = data.filter(o => !o.selling_price || !o.time_per_piece || o.forecast_costo === 0).length

  const brandMap = {}
  data.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!brandMap[b]) brandMap[b] = { brand: b, costo: 0, ricavo: 0, margine: 0, ordini: 0 }
    brandMap[b].costo   += o.forecastCosto
    brandMap[b].ricavo  += o.forecastRicavo
    brandMap[b].margine += o.forecastMargine
    brandMap[b].ordini++
  })
  const brandData = Object.values(brandMap).map(b => ({
    ...b, costo: Math.round(b.costo), ricavo: Math.round(b.ricavo), margine: Math.round(b.margine)
  }))

  return (
    <div>
      <div style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--ice-light)', borderRadius: 10, border: '1px solid var(--ice)' }}>
        <span style={{ fontSize: 13, color: 'var(--blue)' }}>
          📊 Il Forecast è basato sulle assegnazioni di pianificazione ({orders.filter(o=>o.quantity_assigned>0).length} ordini pianificati).
          Assegna gli ordini nella tab Pianificazione per vedere le previsioni complete.
        </span>
      </div>
      <MissingDataWarning count={missingCount} />

      <div className="kpi-grid mb-6">
        <KpiCard label="Costo previsto" value={`€ ${fmt(totCosto)}`} color="warning"
          sub="pz pianificati × tempo/pz × costo orario linea" />
        <KpiCard label="Ricavo previsto" value={`€ ${fmt(totRicavo)}`} color="celeste"
          sub="pz pianificati × prezzo vendita" />
        <KpiCard label="Margine previsto" value={`€ ${fmt(totMargine)}`}
          color={totMargine >= 0 ? 'success' : 'warning'} />
        <KpiCard label="Margine % previsto" value={`${fmt(totMarginePct)}%`}
          color={totMarginePct >= 30 ? 'success' : totMarginePct >= 10 ? 'celeste' : 'warning'} />
      </div>

      <div className="card mb-4">
        <div className="card-header"><div className="card-title">Forecast per brand</div></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={brandData} barSize={18} barGap={4}>
              <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }} formatter={v => [`€ ${fmt(v)}`]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="costo"   fill="#D4820A" name="Costo prev."  radius={[4,4,0,0]} />
              <Bar dataKey="ricavo"  fill="#1A5FA8" name="Ricavo prev." radius={[4,4,0,0]} />
              <Bar dataKey="margine" fill="#1A9E6E" name="Margine prev." radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: '20px 24px 16px' }}>
          <div className="card-title">Dettaglio forecast per ordine</div>
          <div className="card-sub">Ordini con assegnazione di pianificazione</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ordine</th><th>Prodotto</th><th>Brand</th>
                <th>Pz pianificati</th><th>Costo prev. (€)</th>
                <th>Ricavo prev. (€)</th><th>Margine prev.</th>
              </tr>
            </thead>
            <tbody>
              {data.filter(o => o.quantity_assigned > 0).sort((a,b) => b.forecastMargine - a.forecastMargine).map(o => (
                <tr key={o.id}>
                  <td><span className="mono">{o.order_code}</span></td>
                  <td className="font-medium">{o.product}</td>
                  <td>{o.brand_name ?? '—'}</td>
                  <td style={{ fontWeight: 600 }}>{(o.quantity_assigned||0).toLocaleString()}</td>
                  <td style={{ color: 'var(--warning)' }}>{o.forecastCosto > 0 ? `€ ${fmt(o.forecastCosto)}` : '—'}</td>
                  <td style={{ color: 'var(--blue)' }}>{o.forecastRicavo > 0 ? `€ ${fmt(o.forecastRicavo)}` : '—'}</td>
                  <td style={{ fontWeight: 600, color: o.forecastMargine >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {o.forecastCosto > 0 && o.forecastRicavo > 0 ? `€ ${fmt(o.forecastMargine)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN ────────────────────────────────────────────────────
export default function Economy() {
  const [tab, setTab]       = useState('consuntivo')
  const [orders, setOrders] = useState([])
  const [lines, setLines]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: o }, { data: l }] = await Promise.all([
        supabase.from('orders_with_totals').select('*'),
        supabase.from('production_lines').select('id, name, hourly_cost'),
      ])
      setOrders(o || [])
      setLines(l || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Economia</div>
          <div className="topbar-sub">Costi, ricavi e margini di produzione</div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--gray-100)', background: 'white', padding: '0 32px', display: 'flex' }}>
        <TabBtn active={tab === 'consuntivo'} onClick={() => setTab('consuntivo')}>Consuntivo</TabBtn>
        <TabBtn active={tab === 'forecast'}   onClick={() => setTab('forecast')}>Forecast</TabBtn>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
        ) : tab === 'consuntivo' ? (
          <Consuntivo orders={orders} lines={lines} />
        ) : (
          <Forecast orders={orders} lines={lines} />
        )}
      </div>
    </div>
  )
}
