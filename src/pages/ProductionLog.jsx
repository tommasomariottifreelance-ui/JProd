import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ProductionLog() {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(null)
  const [deletingSelected, setDeletingSelected] = useState(false)

  const load = async () => {
    let q = supabase
      .from('production_log')
      .select('*, orders(order_code, product, brands(name)), production_lines(name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (dateFrom) q = q.gte('date', dateFrom)
    if (dateTo)   q = q.lte('date', dateTo)
    const { data } = await q
    setLogs(data || [])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  const total = logs.reduce((s, l) => s + (l.produced_qt || 0), 0)
  const allSelected = logs.length > 0 && logs.every(l => selected.has(l.id))

  const toggleAll  = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(logs.map(l => l.id)))
  }
  const toggleOne  = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const confirmDelete = async () => {
    const { error } = await supabase.from('production_log').delete().eq('id', deleting.id)
    if (error) { console.error(error); return }
    setDeleting(null)
    load()
  }

  const confirmDeleteSelected = async () => {
    const ids = [...selected]
    await supabase.from('production_log').delete().in('id', ids)
    setDeletingSelected(false)
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Log di produzione</div>
          <div className="topbar-sub">
            {logs.length} registrazioni · {total.toLocaleString('it-IT')} pz totali
            {selected.size > 0 && ` · ${selected.size} selezionati`}
          </div>
        </div>
        <div className="topbar-actions">
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={() => setDeletingSelected(true)}>
              Elimina selezionati ({selected.size})
            </button>
          )}
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
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                    </th>
                    <th>Data</th>
                    <th>Ordine</th>
                    <th>Prodotto</th>
                    <th>Brand</th>
                    <th>Quantità prodotta</th>
                    <th>Linea</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{ background: selected.has(l.id) ? 'var(--ice-light)' : undefined }}>
                      <td>
                        <input type="checkbox" checked={selected.has(l.id)}
                          onChange={() => toggleOne(l.id)} style={{ cursor: 'pointer' }} />
                      </td>
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
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{l.production_lines?.name || '—'}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(l)}>Elimina</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Conferma eliminazione</div></div>
            <div className="modal-body">
              <p className="text-sm">Elimini il log del <strong>{deleting.date ? new Date(deleting.date).toLocaleDateString('it-IT') : ''}</strong> — <strong>{deleting.produced_qt} pz</strong>?</p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>Il contatore dell'ordine verrà aggiornato automaticamente dalla VIEW.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>Annulla</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {deletingSelected && (
        <div className="modal-overlay" onClick={() => setDeletingSelected(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Conferma eliminazione multipla</div></div>
            <div className="modal-body">
              <p className="text-sm">Sei sicuro di voler eliminare <strong>{selected.size} registrazioni</strong> dal log?</p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>I contatori degli ordini verranno aggiornati automaticamente.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeletingSelected(false)}>Annulla</button>
              <button className="btn btn-danger" onClick={confirmDeleteSelected}>Elimina tutti</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
