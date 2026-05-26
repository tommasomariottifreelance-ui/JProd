import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const STATUSES = ['all', 'planned', 'in_production', 'completed', 'on_hold']
const STATUS_LABELS = { all: 'Tutti', planned: 'Pianificati', in_production: 'In produzione', completed: 'Completati', on_hold: 'In attesa' }

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className={`progress-fill ${pct >= 100 ? 'done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-pct">{pct}%</span>
    </div>
  )
}

function AdvanceModal({ order, onClose, onSaved }) {
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = async () => {
    const q = parseInt(qty)
    if (!q || q <= 0) { setError('Inserisci una quantità valida'); return }
    setSaving(true)
    // Insert log
    await supabase.from('production_log').insert({
      order_id: order.id,
      produced_qt: q,
      date: new Date().toISOString().split('T')[0],
      operator: note || 'operatore'
    })
    // Update order
    const newDone = (order.quantity_done || 0) + q
    const newStatus = newDone >= order.quantity ? 'completed' : 'in_production'
    await supabase.from('orders').update({
      quantity_done: newDone,
      quantity_remaining: Math.max(0, order.quantity - newDone),
      status: newStatus
    }).eq('id', order.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Avanza produzione</div>
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>{order.order_code}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 16px' }}>
            <div className="text-sm font-medium" style={{ marginBottom: 8 }}>{order.product}</div>
            <ProgressBar done={order.quantity_done || 0} total={order.quantity || 0} />
            <div className="text-xs text-muted" style={{ marginTop: 6 }}>
              {order.quantity_done || 0} di {order.quantity || 0} pz completati
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantità prodotta oggi</label>
            <input className="form-input" type="number" min="1" max={order.quantity_remaining || order.quantity}
              value={qty} onChange={e => setQty(e.target.value)} placeholder="es. 20" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Operatore / note</label>
            <input className="form-input" type="text" value={note}
              onChange={e => setNote(e.target.value)} placeholder="Nome operatore o note" />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={handle} disabled={saving}>
            {saving ? 'Salvataggio...' : 'Salva avanzamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [brand, setBrand] = useState('all')
  const [search, setSearch] = useState('')
  const [brands, setBrands] = useState([])
  const [advancing, setAdvancing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, brands(name), production_lines(name)')
      .order('due_date', { ascending: true })
    setOrders(data || [])
    const bs = [...new Set((data || []).map(o => o.brands?.name).filter(Boolean))]
    setBrands(bs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const confirmDelete = async () => {
    await supabase.from('production_log').delete().eq('order_id', deleting.id)
    await supabase.from('orders').delete().eq('id', deleting.id)
    setDeleting(null)
    load()
  }

  const filtered = orders.filter(o => {
    if (status !== 'all' && o.status !== status) return false
    if (brand !== 'all' && o.brands?.name !== brand) return false
    if (search && !o.order_code?.toLowerCase().includes(search.toLowerCase()) &&
        !o.product?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Ordini di produzione</div>
          <div className="topbar-sub">{filtered.length} ordini</div>
        </div>
        <div className="topbar-actions">
          <input className="form-input" style={{ width: 220, padding: '6px 12px' }}
            placeholder="Cerca ordine o prodotto..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="filters-bar">
            <span className="text-xs text-muted font-medium" style={{ marginRight: 4 }}>Stato</span>
            {STATUSES.map(s => (
              <button key={s} className={`filter-chip ${status === s ? 'active' : ''}`}
                onClick={() => setStatus(s)}>{STATUS_LABELS[s]}</button>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--gray-100)', margin: '0 4px' }} />
            <span className="text-xs text-muted font-medium">Brand</span>
            <button className={`filter-chip ${brand === 'all' ? 'active' : ''}`} onClick={() => setBrand('all')}>Tutti</button>
            {brands.map(b => (
              <button key={b} className={`filter-chip ${brand === b ? 'active' : ''}`}
                onClick={() => setBrand(b)}>{b}</button>
            ))}
          </div>

          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">≡</div>
                <div className="empty-title">Nessun ordine trovato</div>
                <div className="empty-sub">Prova a cambiare i filtri o importa un file Excel</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ordine</th>
                    <th>Prodotto</th>
                    <th>Brand</th>
                    <th>Collezione</th>
                    <th>Linea</th>
                    <th>Scadenza</th>
                    <th>Stato</th>
                    <th>Avanzamento</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.id}>
                      <td><span className="mono">{o.order_code}</span></td>
                      <td style={{ maxWidth: 200 }}>
                        <div className="font-medium" style={{ fontSize: 13 }}>{o.product || '—'}</div>
                        {o.collection && <div className="text-xs text-muted">{o.collection}</div>}
                      </td>
                      <td>{o.brands?.name ?? '—'}</td>
                      <td>{o.collection || '—'}</td>
                      <td>{o.production_lines?.name ?? '—'}</td>
                      <td>
                        {o.due_date ? (
                          <span style={{
                            fontSize: 12, fontWeight: 500,
                            color: new Date(o.due_date) < new Date() && o.status !== 'completed'
                              ? 'var(--danger)' : 'var(--gray-700)'
                          }}>
                            {new Date(o.due_date).toLocaleDateString('it-IT')}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`badge badge-${o.status || 'planned'}`}>
                          {STATUS_LABELS[o.status] || o.status}
                        </span>
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <ProgressBar done={o.quantity_done || 0} total={o.quantity || 0} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {o.status !== 'completed' && (
                            <button className="btn btn-primary btn-sm" onClick={() => setAdvancing(o)}>
                              Avanza
                            </button>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(o)}>
                            Elimina
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {advancing && (
        <AdvanceModal order={advancing} onClose={() => setAdvancing(null)}
          onSaved={() => { setAdvancing(null); load() }} />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Conferma eliminazione</div>
            </div>
            <div className="modal-body">
              <p className="text-sm">Sei sicuro di voler eliminare l'ordine <strong>{deleting.order_code}</strong>?</p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>Verranno eliminati anche tutti i log di produzione associati.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>Annulla</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
