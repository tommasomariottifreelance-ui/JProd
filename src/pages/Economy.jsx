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
    if (!brandMap[b]) brandMap[b] = { brand: b, costo: 0, ricavo: 0, margine: 0, pz_prodotti: 0 }
    brandMap[b].costo   += o.costo
    brandMap[b].ricavo  += o.ricavo
    brandMap[b].margine += o.margine
  })
    brandMap[b].pz_prodotti += (o.quantity_produced || 0)
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
          <div className="card-header">
            <div className="card-title">Consuntivo ordini per brand</div>
            <div className="card-sub">Pz prodotti per brand — anno {new Date().getFullYear()}</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={brandData} barSize={22}>
                <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }}
                  formatter={v => [`${v.toLocaleString('it-IT')} pz`]} />
                <Bar dataKey="pz_prodotti" fill="var(--blue)" radius={[4,4,0,0]} name="Pz prodotti" />
              </BarChart>
            </ResponsiveContainer>
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
// Logica: tutti gli ordini aperti (planned + in_production) con quantità rimanente
// Costo atteso = pz_rimanenti × (time_per_piece/60) × hourly_cost_medio linee compatibili
// Ricavo atteso = pz_rimanenti × selling_price
function Forecast({ orders, lines }) {
  const currentYear = new Date().getFullYear()

  // Costo orario medio tra le linee attive (approssimazione per ordini non pianificati)
  const avgHourlyCost = lines.length > 0
    ? lines.filter(l => l.hourly_cost).reduce((s, l) => s + parseFloat(l.hourly_cost || 0), 0) / lines.filter(l => l.hourly_cost).length
    : 0

  const data = orders
    .filter(o => o.status !== 'completed')
    .filter(o => {
      // Includi solo ordini con scadenza entro fine anno corrente (o senza scadenza)
      if (!o.due_date) return true
      return new Date(o.due_date).getFullYear() <= currentYear
    })
    .map(o => {
      const tpp      = parseFloat(o.time_per_piece || 0)
      const sp       = parseFloat(o.selling_price || 0)
      const pzRim    = o.quantity_remaining ?? (o.quantity - (o.quantity_produced || 0))
      // Usa hourly_cost della linea assegnata se disponibile, altrimenti media
      const hc       = parseFloat(o.hourly_cost || avgHourlyCost || 0)
      const forecastCosto  = pzRim * (tpp / 60) * hc
      const forecastRicavo = pzRim * sp
      const forecastMargine = forecastRicavo - forecastCosto
      const forecastMarginePct = forecastRicavo > 0 ? (forecastMargine / forecastRicavo) * 100 : null
      return { ...o, pzRim, forecastCosto, forecastRicavo, forecastMargine, forecastMarginePct, tpp, sp, hc }
    })

  const totCosto      = data.reduce((s, o) => s + o.forecastCosto, 0)
  const totRicavo     = data.reduce((s, o) => s + o.forecastRicavo, 0)
  const totMargine    = totRicavo - totCosto
  const totMarginePct = totRicavo > 0 ? (totMargine / totRicavo) * 100 : 0
  const missingCount  = data.filter(o => !o.sp || !o.tpp).length

  // Per brand
  const brandMap = {}
  data.forEach(o => {
    const b = o.brand_name ?? 'N/D'
    if (!brandMap[b]) brandMap[b] = { brand: b, costo: 0, ricavo: 0, margine: 0 }
    brandMap[b].costo   += o.forecastCosto
    brandMap[b].ricavo  += o.forecastRicavo
    brandMap[b].margine += o.forecastMargine
  })
  const brandData = Object.values(brandMap).map(b => ({
    ...b, costo: Math.round(b.costo), ricavo: Math.round(b.ricavo), margine: Math.round(b.margine)
  }))

  // Per mese (scadenza ordini)
  const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const monthMap = {}
  MONTHS.forEach((m, i) => { monthMap[i] = { month: m, ricavo: 0, costo: 0, margine: 0 } })
  data.forEach(o => {
    if (!o.due_date) return
    const m = new Date(o.due_date).getMonth()
    monthMap[m].ricavo  += o.forecastRicavo
    monthMap[m].costo   += o.forecastCosto
    monthMap[m].margine += o.forecastMargine
  })
  const monthData = Object.values(monthMap).map(m => ({
    ...m, ricavo: Math.round(m.ricavo), costo: Math.round(m.costo), margine: Math.round(m.margine)
  }))

  // Calcola righe SKU fuori dal JSX (evita IIFE che causa crash con esbuild)
  const skuMap = {}
  data.forEach(o => {
    const key = o.sku || o.product || 'N/D'
    if (!skuMap[key]) skuMap[key] = {
      sku: o.sku, product: o.product, brand: o.brand_name,
      orders: 0, pzRim: 0, ricavo: 0, costo: 0, margine: 0
    }
    skuMap[key].orders++
    skuMap[key].pzRim   += o.pzRim
    skuMap[key].ricavo  += o.forecastRicavo
    skuMap[key].costo   += o.forecastCosto
    skuMap[key].margine += o.forecastMargine
  })
  const skuRows = Object.values(skuMap).sort((a, b) => b.ricavo - a.ricavo)

  return (
    <div>
      <div style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--ice-light)', borderRadius: 10, border: '1px solid var(--ice)' }}>
        <span style={{ fontSize: 13, color: 'var(--blue)' }}>
          📊 Forecast basato su tutti gli ordini aperti con scadenza entro il {currentYear}.
          Costo calcolato su quantità rimanente × tempo/pz × costo orario linea.
          {avgHourlyCost > 0 && ` Costo orario medio linee: €${fmt(avgHourlyCost)}/ora.`}
        </span>
      </div>
      <MissingDataWarning count={missingCount} />

      <div className="kpi-grid mb-6">
        <KpiCard label={`Ordini aperti (${currentYear})`} value={data.length}
          sub={`${data.reduce((s,o)=>s+o.pzRim,0).toLocaleString()} pz rimanenti`} color="celeste" />
        <KpiCard label="Ricavo atteso" value={`€ ${fmt(totRicavo)}`} color="blue"
          sub="pz rimanenti × prezzo vendita" />
        <KpiCard label="Costo atteso" value={`€ ${fmt(totCosto)}`} color="warning"
          sub="pz rimanenti × tempo/pz × costo orario" />
        <KpiCard label="Margine atteso" value={`€ ${fmt(totMargine)}`}
          color={totMargine >= 0 ? 'success' : 'warning'}
          sub={`${fmt(totMarginePct)}% sul ricavo`} />
      </div>

      <div className="charts-grid mb-4">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Ricavo e costo atteso per mese</div>
            <div className="card-sub">Per data scadenza ordini — {currentYear}</div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthData} barSize={14} barGap={2}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6B85A0' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 12 }} formatter={v => [`€ ${fmt(v)}`]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ricavo"  fill="#1A5FA8" name="Ricavo" radius={[3,3,0,0]} />
                <Bar dataKey="costo"   fill="#D4820A" name="Costo"  radius={[3,3,0,0]} />
                <Bar dataKey="margine" fill="#1A9E6E" name="Margine" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Forecast per brand</div></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={brandData} barSize={14} barGap={2}>
                <XAxis dataKey="brand" tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#6B85A0' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', fontSize: 13 }} formatter={v => [`€ ${fmt(v)}`]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ricavo"  fill="#1A5FA8" name="Ricavo" radius={[4,4,0,0]} />
                <Bar dataKey="costo"   fill="#D4820A" name="Costo"  radius={[4,4,0,0]} />
                <Bar dataKey="margine" fill="#1A9E6E" name="Margine" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: '20px 24px 16px' }}>
          <div className="card-title">Dettaglio forecast per codice articolo</div>
          <div className="card-sub">Raggruppato per SKU — ordini aperti con scadenza entro il {currentYear}</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cod. Articolo</th><th>Prodotto</th><th>Brand</th>
                <th>Nr. Ordini</th><th>Pz rimanenti</th>
                <th>Ricavo atteso</th><th>Costo atteso</th><th>Margine</th>
              </tr>
            </thead>
            <tbody>
              {skuRows.map((s, i) => {
                const mPct = s.ricavo > 0 ? (s.margine / s.ricavo) * 100 : null
                return (
                  <tr key={i}>
                    <td><span style={{ fontFamily:'var(--mono)', fontWeight:700, fontSize:13, color:'var(--navy)' }}>{s.sku || '—'}</span></td>
                    <td className="font-medium">{s.product}</td>
                    <td>{s.brand ?? '—'}</td>
                    <td style={{ textAlign:'center' }}>{s.orders}</td>
                    <td style={{ fontWeight:600 }}>{s.pzRim.toLocaleString()}</td>
                    <td style={{ color:'var(--blue)', fontWeight:500 }}>
                      {s.ricavo > 0 ? `€ ${fmt(s.ricavo)}` : '—'}
                    </td>
                    <td style={{ color:'var(--warning)' }}>
                      {s.costo > 0 ? `€ ${fmt(s.costo)}` : '—'}
                    </td>
                    <td style={{ fontWeight:600, color: s.margine >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {s.ricavo > 0 ? `€ ${fmt(s.margine)}` : '—'}
                      {mPct !== null && s.ricavo > 0 && (
                        <span style={{ fontSize:11, fontWeight:400, color:'var(--gray-500)', marginLeft:4 }}>
                          ({fmt(mPct)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
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
