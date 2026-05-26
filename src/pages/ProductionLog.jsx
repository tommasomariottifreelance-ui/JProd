import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ProductionLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    async function load() {
      let q = supabase
        .from('production_log')
        .select('*, orders(order_code, product, brands(name))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
      if (dateFrom) q = q.gte('date', dateFrom)
      if (dateTo)   q = q.lte('date', dateTo)
      const { data } = await q
      setLogs(data || [])
      setLoading(false)
    }
    load()
  }, [dateFrom, dateTo])

  const total = logs.reduce((s, l) => s + (l.produced_qt || 0), 0)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Log di produzione</div>
          <div className="topbar-sub">{logs.length} registrazioni · {total.toLocaleString('it-IT')} pz totali</div>
        </div>
        <div className="topbar-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="text-xs text-muted">Dal</span>
            <input className="form-input" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} style={{ width: 150, padding: '6px 10px' }} />
            <span className="text-xs text-muted">al</span>
            <input className="form-input" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)} style={{ width: 150, padding: '6px 10px' }} />
            {(dateFrom || dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo('') }}>✕ Reset</button>
            )}
          </div>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : logs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">◎</div>
                <div className="empty-title">Nessun log trovato</div>
                <div className="empty-sub">Avanza un ordine dalla pagina Ordini per registrare la produzione</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Ordine</th>
                    <th>Prodotto</th>
                    <th>Brand</th>
                    <th>Quantità prodotta</th>
                    <th>Operatore</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>
                        {l.date ? new Date(l.date).toLocaleDateString('it-IT') : '—'}
                      </td>
                      <td><span className="mono">{l.orders?.order_code ?? '—'}</span></td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.orders?.product ?? '—'}
                      </td>
                      <td>{l.orders?.brands?.name ?? '—'}</td>
                      <td>
                        <span style={{
                          fontWeight: 600, fontSize: 14, color: 'var(--blue)',
                          background: 'var(--ice)', padding: '2px 10px', borderRadius: 99
                        }}>
                          {l.produced_qt} pz
                        </span>
                      </td>
                      <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{l.operator || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
