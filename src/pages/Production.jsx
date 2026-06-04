import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

// ─── Helpers ────────────────────────────────────────────────
const STATUSES = ['all', 'planned', 'in_production', 'completed', 'on_hold']
const STATUS_LABELS = { all: 'Tutti', planned: 'Pianificati', in_production: 'In produzione', completed: 'Completati', on_hold: 'In attesa' }

function getWeekNumber(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getFullYear() }
}

function getWeeksRange(startOffset = 0, count = 4) {
  const weeks = []
  const now = new Date()
  for (let i = startOffset; i < startOffset + count; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i * 7)
    const { week, year } = getWeekNumber(d)
    const monday = new Date(d)
    monday.setDate(d.getDate() - (d.getDay() || 7) + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    weeks.push({
      week, year,
      label: `W${week}`,
      range: `${monday.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} - ${sunday.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`,
      isCurrentWeek: i === 0
    })
  }
  return weeks
}

// ─── Progress Bar ────────────────────────────────────────────
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

// ─── Advance Modal ───────────────────────────────────────────
function AdvanceModal({ order, lines, onClose, onSaved }) {
  const [qty, setQty]       = useState('')
  const [note, setNote]     = useState('')
  const [lineId, setLineId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const handle = async () => {
    const q = parseInt(qty)
    if (!q || q <= 0) { setError('Inserisci una quantità valida'); return }
    if (!lineId) { setError('Seleziona la linea di produzione'); return }
    const remaining = order.quantity_remaining ?? (order.quantity - (order.quantity_produced || 0))
    if (q > remaining) { setError(`Massimo ${remaining} pz rimanenti`); return }
    setSaving(true)
    const { error: logError } = await supabase.from('production_log').insert({
      order_id: order.id, produced_qt: q,
      date: new Date().toISOString().split('T')[0],
      operator: note || 'operatore',
      client_id: order.client_id,
      line_id: lineId ? parseInt(lineId) : null,
    })
    if (logError) { setError('Errore nel salvataggio'); setSaving(false); return }
    const newProduced = (order.quantity_produced || 0) + q
    await supabase.from('orders').update({
      status: newProduced >= order.quantity ? 'completed' : 'in_production'
    }).eq('id', order.id)
    setSaving(false); onSaved()
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
            <ProgressBar done={order.quantity_produced || 0} total={order.quantity || 0} />
            <div className="text-xs text-muted" style={{ marginTop: 6 }}>
              {order.quantity_produced || 0} di {order.quantity || 0} pz · rimanenti: <strong>{order.quantity_remaining ?? order.quantity}</strong>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantità prodotta oggi <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" type="number" min="1"
              value={qty} onChange={e => setQty(e.target.value)} placeholder="es. 20" autoFocus
              style={{ borderColor: !qty ? 'var(--gray-100)' : 'inherit' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Linea di produzione <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="form-select" value={lineId} onChange={e => setLineId(e.target.value)}
              style={{ borderColor: !lineId ? 'var(--danger)' : 'inherit' }}>
              <option value="">— Seleziona linea —</option>
              {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
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

// ─── Assignment Panel ────────────────────────────────────────
function AssignPanel({ cell, orders, lines, onClose, onSaved, clientId }) {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedOrder, setSelectedOrder] = useState('')
  const [qty, setQty]   = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('order_line_assignments')
        .select('*, orders(order_code, product, quantity, due_date, time_per_piece:product_id(time_per_piece))')
        .eq('line_id', cell.line.id)
        .eq('week_number', cell.week.week)
        .eq('year', cell.week.year)
      setAssignments(data || [])
      setLoading(false)
    }
    load()
  }, [cell])

  // Capacità settimanale in minuti (5 giorni lavorativi)
  const capacityMinutesWeek = cell.line.available_hours_per_day
    ? Math.round(cell.line.available_hours_per_day * 60 * (cell.line.efficiency || 1) * 5)
    : null

  // Minuti necessari per le assegnazioni correnti (pz × time_per_piece)
  const usedMinutes = assignments.reduce((s, a) => {
    const tpp = parseFloat(a.orders?.time_per_piece?.time_per_piece || 0)
    return s + (a.quantity_assigned || 0) * tpp
  }, 0)

  const loadPct = capacityMinutesWeek && usedMinutes > 0
    ? Math.round((usedMinutes / capacityMinutesWeek) * 100)
    : 0

  const save = async () => {
    if (!selectedOrder || !qty) return
    if (maxQty !== null && parseInt(qty) > maxQty) return
    setSaving(true)
    await supabase.from('order_line_assignments').insert({
      order_id: parseInt(selectedOrder),
      line_id: cell.line.id,
      week_number: cell.week.week,
      year: cell.week.year,
      quantity_assigned: parseInt(qty),
      notes: notes || null,
      client_id: clientId,
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  const removeAssignment = async (id) => {
    await supabase.from('order_line_assignments').delete().eq('id', id)
    // Ricarica dal DB per aggiornare anche la griglia
    const { data } = await supabase
      .from('order_line_assignments')
      .select('*, orders(order_code, product, due_date, time_per_piece:product_id(time_per_piece))')
      .eq('line_id', cell.line.id)
      .eq('week_number', cell.week.week)
      .eq('year', cell.week.year)
    setAssignments(data || [])
    onSaved()
  }

  // Ordini disponibili: non completati, ordinati per scadenza
  const availableOrders = orders
    .filter(o => o.status !== 'completed')
    .sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })

  // Ordine selezionato (per calcolare limite quantità)
  const selectedOrderObj = availableOrders.find(o => o.id === parseInt(selectedOrder))
  const maxQty = selectedOrderObj ? (selectedOrderObj.quantity_remaining ?? selectedOrderObj.quantity) : null

  // Minuti aggiuntivi che verrebbero aggiunti con la nuova assegnazione
  const previewMinutes = selectedOrderObj && qty && selectedOrderObj.time_per_piece
    ? Math.round(parseInt(qty) * parseFloat(selectedOrderObj.time_per_piece))
    : null
  const previewLoadPct = capacityMinutesWeek && previewMinutes
    ? Math.round(((usedMinutes + previewMinutes) / capacityMinutesWeek) * 100)
    : null

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
      background: 'white', boxShadow: 'var(--shadow-lg)', zIndex: 200,
      display: 'flex', flexDirection: 'column',
      animation: 'slideIn 0.2s cubic-bezier(0.4,0,0.2,1)'
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{cell.line.name}</div>
            <div className="text-sm text-muted">{cell.week.label} · {cell.week.range}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        {capacityMinutesWeek && (
          <div style={{ marginTop: 12, background: 'var(--ice-light)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="text-xs text-muted">Capacità settimanale</div>
                <div style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 14, marginTop: 2 }}>
                  {capacityMinutesWeek} min
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-xs text-muted">Carico attuale</div>
                <div style={{
                  fontWeight: 700, fontSize: 14, marginTop: 2,
                  color: loadPct === 0 ? 'var(--gray-500)' : loadPct <= 70 ? 'var(--success)' : loadPct <= 90 ? 'var(--warning)' : 'var(--danger)'
                }}>
                  {loadPct}% ({Math.round(usedMinutes)} min)
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, height: 4, background: 'var(--gray-200)', borderRadius: 99 }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${Math.min(loadPct, 100)}%`,
                background: loadPct <= 70 ? 'var(--success)' : loadPct <= 90 ? 'var(--warning)' : 'var(--danger)',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div className="text-xs text-muted font-medium" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Assegnazioni ({assignments.length})
        </div>
        {loading ? (
          <div className="text-sm text-muted">Caricamento...</div>
        ) : assignments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-500)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>○</div>
            <div className="text-sm">Nessun ordine assegnato</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {assignments.map(a => (
              <div key={a.id} style={{
                background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px',
                border: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{a.orders?.order_code}</div>
                  <div className="text-xs text-muted">{a.orders?.product}</div>
                  <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600, marginTop: 4 }}>
                    {a.quantity_assigned} pz
                    {a.orders?.time_per_piece?.time_per_piece && (
                      <span style={{ color: 'var(--gray-500)', fontWeight: 400 }}>
                        {' '}· {Math.round(a.quantity_assigned * parseFloat(a.orders.time_per_piece.time_per_piece))} min
                      </span>
                    )}
                  </div>
                  {a.notes && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{a.notes}</div>}
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => removeAssignment(a.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 20 }}>
          <div className="text-xs text-muted font-medium" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Nuova assegnazione
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Ordine</label>
              <select className="form-select" value={selectedOrder} onChange={e => setSelectedOrder(e.target.value)}>
                <option value="">Seleziona ordine...</option>
                {availableOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.due_date ? new Date(o.due_date).toLocaleDateString('it-IT') : '—'} · {o.order_code} — {o.product} ({o.quantity_remaining ?? o.quantity} pz rim.)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                Quantità da assegnare
                {maxQty !== null && <span className="text-muted" style={{ fontWeight: 400 }}> (max {maxQty} pz)</span>}
              </label>
              <input className="form-input" type="number" min="1" max={maxQty ?? undefined}
                value={qty} onChange={e => setQty(e.target.value)} placeholder="es. 50" />
              {previewMinutes && (
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--gray-500)' }}>
                  = {previewMinutes} min aggiuntivi
                  {previewLoadPct !== null && (
                    <span style={{
                      marginLeft: 6, fontWeight: 600,
                      color: previewLoadPct <= 70 ? 'var(--success)' : previewLoadPct <= 90 ? 'var(--warning)' : 'var(--danger)'
                    }}>
                      → carico totale: {previewLoadPct}%
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Note (opzionale)</label>
              <input className="form-input" type="text" value={notes}
                onChange={e => setNotes(e.target.value)} placeholder="es. turno mattina" />
            </div>
            <button className="btn btn-primary w-full" onClick={save}
              disabled={saving || !selectedOrder || !qty}>
              {saving ? 'Salvataggio...' : '+ Assegna'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TAB: ORDINI ─────────────────────────────────────────────
function TabOrders() {
  const [orders, setOrders]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [status, setStatus]     = useState('all')
  const [brand, setBrand]       = useState('all')
  const [search, setSearch]     = useState('')
  const [brands, setBrands]     = useState([])
  const [lines, setLines]         = useState([])
  const [advancing, setAdvancing] = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [selected, setSelected]   = useState(new Set())
  const [deletingSelected, setDeletingSelected] = useState(false)

  const load = useCallback(async () => {
    const [{ data }, { data: linesData }] = await Promise.all([
      supabase.from('orders_with_totals').select('*').order('due_date', { ascending: true }),
      supabase.from('production_lines').select('id, name').eq('active', true).order('name')
    ])
    setOrders(data || [])
    setLines(linesData || [])
    setBrands([...new Set((data || []).map(o => o.brand_name).filter(Boolean))])
    setSelected(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const generateAutoPlan = async () => {
    setGenerating(true)
    try {
      const result = await generatePlan(orders, lines, assignments, weeks, profile?.client_id, saturationCap)
      setDraftPlan(result)
    } catch(e) {
      console.error(e)
    }
    setGenerating(false)
  }

  const approvePlan = async () => {
    if (!draftPlan) return
    for (const item of draftPlan.plan) {
      await supabase.from('order_line_assignments').insert({
        order_id: item.order_id,
        line_id: item.line_id,
        week_number: item.week_number,
        year: item.year,
        quantity_assigned: item.quantity_assigned,
        client_id: profile?.client_id,
      })
    }
    setDraftPlan(null)
    load()
  }

  const filtered = orders.filter(o => {
    if (status !== 'all' && o.status !== status) return false
    if (brand !== 'all' && o.brand_name !== brand) return false
    if (search && !o.order_code?.toLowerCase().includes(search.toLowerCase()) &&
        !o.product?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const allSelected = filtered.length > 0 && filtered.every(o => selected.has(o.id))
  const toggleAll = () => {
    if (allSelected) setSelected(s => { const n = new Set(s); filtered.forEach(o => n.delete(o.id)); return n })
    else setSelected(s => { const n = new Set(s); filtered.forEach(o => n.add(o.id)); return n })
  }
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const confirmDelete = async () => {
    await supabase.from('production_log').delete().eq('order_id', deleting.id)
    await supabase.from('order_line_assignments').delete().eq('order_id', deleting.id)
    await supabase.from('orders').delete().eq('id', deleting.id)
    setDeleting(null); load()
  }

  const confirmDeleteSelected = async () => {
    const ids = [...selected]
    await supabase.from('production_log').delete().in('order_id', ids)
    await supabase.from('order_line_assignments').delete().in('order_id', ids)
    await supabase.from('orders').delete().in('id', ids)
    setDeletingSelected(false); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '16px 0', flexWrap: 'wrap' }}>
        {selected.size > 0 && (
          <button className="btn btn-danger btn-sm" onClick={() => setDeletingSelected(true)}>
            Elimina selezionati ({selected.size})
          </button>
        )}
        <input className="form-input" style={{ width: 240, padding: '6px 12px', marginLeft: 'auto' }}
          placeholder="Cerca ordine o prodotto..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        <div className="filters-bar">
          <span className="text-xs text-muted font-medium">Stato</span>
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
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Ordine</th>
                  <th>Commessa</th>
                  <th>Desc. Commessa</th>
                  <th>Cod. Articolo</th>
                  <th>Prodotto</th>
                  <th>Brand</th>
                  <th>Scadenza</th>
                  <th>Stato</th>
                  <th>Pz fatti / Totale</th>
                  <th>Pianificati / Totale</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id} style={{ background: selected.has(o.id) ? 'var(--ice-light)' : undefined }}>
                    <td><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} style={{ cursor: 'pointer' }} /></td>
                    <td><span className="mono">{o.order_code}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}><span className="mono" style={{ fontSize: 11 }}>{o.commessa_code || '—'}</span></td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span className="text-sm text-muted">{o.order_description || '—'}</span>
                    </td>
                    <td><span className="mono">{o.sku || '—'}</span></td>
                    <td style={{ maxWidth: 160 }}>
                      <div className="font-medium" style={{ fontSize: 13 }}>{o.product || '—'}</div>
                    </td>
                    <td>{o.brand_name ?? '—'}</td>
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
                    <td><span className={`badge badge-${o.status || 'planned'}`}>{STATUS_LABELS[o.status] || o.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13 }}>
                        {(o.quantity_produced || 0).toLocaleString('it-IT')}
                      </span>
                      <span className="text-muted" style={{ fontSize: 12 }}> / {(o.quantity || 0).toLocaleString('it-IT')} pz</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--success)', fontSize: 13 }}>
                        {(o.quantity_assigned || 0).toLocaleString('it-IT')}
                      </span>
                      <span className="text-muted" style={{ fontSize: 12 }}> / {(o.quantity || 0).toLocaleString('it-IT')} pz</span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {o.status !== 'completed' && (
                          <button className="btn btn-primary btn-sm" onClick={() => setAdvancing(o)}>Avanza</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleting(o)}>Elimina</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {advancing && <AdvanceModal order={advancing} lines={lines} onClose={() => setAdvancing(null)} onSaved={() => { setAdvancing(null); load() }} />}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><div className="modal-title">Conferma eliminazione</div></div>
            <div className="modal-body">
              <p className="text-sm">Eliminare l'ordine <strong>{deleting.order_code}</strong>?</p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>Verranno eliminati anche log e assegnazioni associate.</p>
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
              <p className="text-sm">Eliminare <strong>{selected.size} ordini</strong> e tutti i dati associati?</p>
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

// ─── ALGORITMO PIANIFICAZIONE ────────────────────────────────
async function generatePlan(orders, lines, existingAssignments, weeks, clientId, saturationPct = 85) {
  // 1. Carica compatibilità linea-prodotto
  // Usa supabase importato staticamente in cima al file
  const { data: compat } = await supabase
    .from('line_product_compatibility').select('line_id, product_id')
  const compatMap = {}
  ;(compat || []).forEach(c => {
    if (!compatMap[c.product_id]) compatMap[c.product_id] = new Set()
    compatMap[c.product_id].add(c.line_id)
  })

  // 2. FIX: usa 52 settimane per coprire tutti gli ordini, non solo quelle visibili
  const allWeeks = getWeeksRange(0, 52)

  // 3. FIX saturazione: applica cap sulla capacità TOTALE, non sulla residua
  // capDisponibile = capTotale * SATURATION_CAP - minutiGiàUsati
  const SATURATION_CAP = saturationPct / 100
  const lineCapTotal = {}
  const lineCapUsed  = {}

  lines.forEach(l => {
    const capTot = Math.round((l.available_hours_per_day || 0) * 60 * (l.efficiency || 1) * 5)
    lineCapTotal[l.id] = capTot
    allWeeks.forEach(w => {
      const key = `${l.id}_${w.year}_${w.week}`
      const used = existingAssignments
        .filter(a => a.line_id === l.id && a.week_number === w.week && a.year === w.year)
        .reduce((s, a) => {
          const order = orders.find(o => o.id === a.order_id)
          const tpp = parseFloat(order?.time_per_piece || 0)
          return s + (a.quantity_assigned || 0) * tpp
        }, 0)
      lineCapUsed[key] = used
    })
  })

  const getAvailable = (lineId, week, year) => {
    const key = `${lineId}_${year}_${week}`
    const capMax = (lineCapTotal[lineId] || 0) * SATURATION_CAP
    const used   = lineCapUsed[key] || 0
    return Math.max(0, capMax - used)
  }

  const consumeCapacity = (lineId, week, year, minutes) => {
    const key = `${lineId}_${year}_${week}`
    lineCapUsed[key] = (lineCapUsed[key] || 0) + minutes
  }

  // 4. Calcola pz già pianificati per ordine (da TUTTE le assegnazioni esistenti)
  const alreadyPlanned = {}
  existingAssignments.forEach(a => {
    alreadyPlanned[a.order_id] = (alreadyPlanned[a.order_id] || 0) + (a.quantity_assigned || 0)
  })

  // 5. Ordina ordini per scadenza — escludi quelli già completamente pianificati
  const toplan = orders
    .filter(o => o.status === 'planned' || (o.status === 'in_production' && (o.quantity_remaining || 0) > 0))
    .filter(o => {
      const rem = o.quantity_remaining || 0
      const planned = alreadyPlanned[o.id] || 0
      // Salta se pz già pianificati >= pz rimanenti
      return rem > 0 && planned < rem
    })
    .map(o => ({
      ...o,
      // Aggiusta quantity_remaining sottraendo quanto già pianificato
      quantity_remaining: Math.max(0, (o.quantity_remaining || 0) - (alreadyPlanned[o.id] || 0))
    }))
    .sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })

  // 5. Algoritmo greedy
  const plan = []
  const warnings = []

  toplan.forEach(order => {
    const tpp = parseFloat(order.time_per_piece || 0)
    if (tpp === 0) {
      warnings.push(`${order.order_code}: time_per_piece non configurato, saltato`)
      return
    }

    let remaining = order.quantity_remaining || order.quantity
    const compatLines = lines.filter(l => compatMap[order.product_id]?.has(l.id))

    if (compatLines.length === 0) {
      warnings.push(`${order.order_code}: nessuna linea compatibile con "${order.product}"`)
      return
    }

    for (const week of allWeeks) {
      if (remaining <= 0) break

      const sortedLines = [...compatLines].sort((a, b) =>
        getAvailable(b.id, week.week, week.year) - getAvailable(a.id, week.week, week.year)
      )

      for (const line of sortedLines) {
        if (remaining <= 0) break
        const available = getAvailable(line.id, week.week, week.year)
        if (available <= 0) continue

        const maxPz = Math.floor(available / tpp)
        if (maxPz <= 0) continue

        const pzThisWeek  = Math.min(maxPz, remaining)
        const minutesUsed = pzThisWeek * tpp

        plan.push({
          order_id:          order.id,
          line_id:           line.id,
          week_number:       week.week,
          year:              week.year,
          quantity_assigned: pzThisWeek,
          _order_code:       order.order_code,
          _product:          order.product,
          _line_name:        line.name,
          _due_date:         order.due_date,
        })

        consumeCapacity(line.id, week.week, week.year, minutesUsed)
        remaining -= pzThisWeek
        break // satura una linea alla volta per settimana

      }
    }

    if (remaining > 0) {
      warnings.push(`${order.order_code}: ${remaining} pz non pianificabili (capacità insufficiente nelle settimane disponibili)`)
    }
  })

  return { plan, warnings }
}

// ─── TAB: PIANIFICAZIONE ─────────────────────────────────────
function TabPlanning() {
  const { profile } = useAuth()
  const [lines, setLines]             = useState([])
  const [orders, setOrders]           = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]         = useState(true)
  const [view, setView]               = useState('week')
  const [activeCell, setActiveCell]   = useState(null)
  const [generating, setGenerating]   = useState(false)
  const [draftPlan, setDraftPlan]     = useState(null)
  const [saturationCap, setSaturationCap] = useState(85)

  const weeks = view === 'week' ? getWeeksRange(0, 1) : getWeeksRange(0, 4)

  const load = useCallback(async () => {
    const minWeek = weeks[0]
    const maxWeek = weeks[weeks.length - 1]
    const [{ data: l }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('production_lines').select('*').eq('active', true).order('name'),
      supabase.from('orders_with_totals').select('*').neq('status', 'completed'),
      supabase.from('order_line_assignments')
        .select('*, orders(order_code, product, due_date, time_per_piece:product_id(time_per_piece))')
        .gte('week_number', minWeek.week)
        .lte('week_number', maxWeek.week)
    ])
    setLines(l || [])
    setOrders(o || [])
    setAssignments(a || [])
    setLoading(false)
  }, [view])

  useEffect(() => { load() }, [load])

  const generateAutoPlan = async () => {
    setGenerating(true)
    try {
      // Carica linee con dati completi
      const { data: fullLines } = await supabase
        .from('production_lines').select('*').eq('active', true)
      // FIX: carica TUTTE le assegnazioni esistenti senza filtro settimana
      // altrimenti l'algoritmo non vede le assegnazioni fuori dalla vista corrente
      const { data: allAssignments } = await supabase
        .from('order_line_assignments').select('*')
      // Carica tutti gli ordini non completati (non solo quelli visibili)
      const { data: allOrders } = await supabase
        .from('orders_with_totals').select('*').neq('status', 'completed')
      const result = await generatePlan(
        allOrders || orders,
        fullLines || lines,
        allAssignments || [],
        weeks,
        profile?.client_id,
        saturationCap
      )
      setDraftPlan(result)
    } catch(e) {
      console.error('generatePlan error:', e)
    }
    setGenerating(false)
  }

  const approvePlan = async () => {
    if (!draftPlan) return
    for (const item of draftPlan.plan) {
      await supabase.from('order_line_assignments').insert({
        order_id:          item.order_id,
        line_id:           item.line_id,
        week_number:       item.week_number,
        year:              item.year,
        quantity_assigned: item.quantity_assigned,
        client_id:         profile?.client_id,
      })
    }
    setDraftPlan(null)
    load()
  }

  const deleteWeekAssignments = async (week, year) => {
    if (!window.confirm(`Eliminare tutte le assegnazioni della settimana W${week}?`)) return
    // Elimina tutte le assegnazioni di quella settimana per tutte le linee
    await supabase
      .from('order_line_assignments')
      .delete()
      .eq('week_number', week)
      .eq('year', year)
    load()
  }

  const getCellAssignments = (lineId, week, year) =>
    assignments.filter(a => a.line_id === lineId && a.week_number === week && a.year === year)

  const getCellMinutes = (lineId, week, year) => {
    return getCellAssignments(lineId, week, year).reduce((s, a) => {
      const order = orders.find(o => o.id === a.order_id)
      const tpp = parseFloat(order?.time_per_piece || 0)
      return s + (a.quantity_assigned || 0) * tpp
    }, 0)
  }

  const getCapacityWeek = (line) =>
    line.available_hours_per_day
      ? Math.round(line.available_hours_per_day * 60 * (line.efficiency || 1) * 5)
      : null

  const getLoadPct = (lineId, week, year, line) => {
    const minutes = getCellMinutes(lineId, week, year)
    const cap = getCapacityWeek(line)
    if (!cap || minutes === 0) return 0
    return Math.round((minutes / cap) * 100)
  }

  const getLoadColor = (pct, hasCapacity) => {
    if (!hasCapacity) return 'var(--gray-100)'
    if (pct === 0) return 'var(--gray-50)'
    if (pct <= 70) return '#E8F8F2'
    if (pct <= 90) return '#FEF3E2'
    return '#FEF0EE'
  }

  const getLoadTextColor = (pct, hasCapacity) => {
    if (!hasCapacity || pct === 0) return 'var(--gray-500)'
    if (pct <= 70) return 'var(--success)'
    if (pct <= 90) return 'var(--warning)'
    return 'var(--danger)'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '16px 0', alignItems: 'center' }}>
        <span className="text-sm text-muted">Vista:</span>
        <button className={`filter-chip ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>
          Settimana corrente
        </button>
        <button className={`filter-chip ${view === '4weeks' ? 'active' : ''}`} onClick={() => setView('4weeks')}>
          4 settimane
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="text-xs text-muted">Saturazione max:</span>
          <select className="form-select" value={saturationCap}
            onChange={e => setSaturationCap(parseInt(e.target.value))}
            style={{ width: 90, padding: '5px 8px', fontSize: 13 }}>
            <option value={75}>75%</option>
            <option value={80}>80%</option>
            <option value={85}>85%</option>
            <option value={90}>90%</option>
            <option value={95}>95%</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={generateAutoPlan} disabled={generating}>
            {generating ? '⟳ Generando...' : '⚡ Genera piano automatico'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
      ) : lines.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">⚙</div>
          <div className="empty-title">Nessuna linea attiva</div>
          <div className="empty-sub">Configura le linee di produzione nelle Anagrafiche</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.7px',
                    borderBottom: '2px solid var(--gray-100)', background: 'white', minWidth: 160 }}>
                    Linea
                  </th>
                  {weeks.map(w => (
                    <th key={`${w.year}-${w.week}`} style={{
                      padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600,
                      color: w.isCurrentWeek ? 'var(--blue)' : 'var(--gray-500)',
                      textTransform: 'uppercase', letterSpacing: '0.7px',
                      borderBottom: `2px solid ${w.isCurrentWeek ? 'var(--blue)' : 'var(--gray-100)'}`,
                      background: w.isCurrentWeek ? 'var(--ice-light)' : 'white', minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span>{w.label}</span>
                        <button
                          onClick={e => { e.stopPropagation(); deleteWeekAssignments(w.week, w.year) }}
                          title={`Elimina tutte le assegnazioni W${w.week}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--danger)', fontSize: 11, padding: '1px 4px',
                            borderRadius: 4, opacity: 0.7, lineHeight: 1 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}>
                          ✕
                        </button>
                      </div>
                      <div style={{ fontWeight: 400, fontSize: 10, marginTop: 2, textTransform: 'none' }}>{w.range}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.id}>
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--gray-50)',
                      fontWeight: 500, fontSize: 13, color: 'var(--gray-900)' }}>
                      <div>{line.name}</div>
                      {line.available_hours_per_day && (
                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                          {Math.round(line.available_hours_per_day * 60 * (line.efficiency || 1))} min/gg
                        </div>
                      )}
                    </td>
                    {weeks.map(w => {
                      const cellAssignments = getCellAssignments(line.id, w.week, w.year)
                      const totalPz  = cellAssignments.reduce((s, a) => s + (a.quantity_assigned || 0), 0)
                      const loadPct  = getLoadPct(line.id, w.week, w.year, line)
                      const capWeek  = getCapacityWeek(line)
                      const usedMin  = getCellMinutes(line.id, w.week, w.year)
                      const bg = getLoadColor(loadPct, !!capWeek)
                      const tc = getLoadTextColor(loadPct, !!capWeek)
                      return (
                        <td key={`${w.year}-${w.week}`}
                          onClick={() => setActiveCell({ line, week: w })}
                          style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-50)',
                            background: bg, cursor: 'pointer', verticalAlign: 'top',
                            transition: 'filter 0.15s', minHeight: 80,
                            borderLeft: w.isCurrentWeek ? '2px solid var(--ice)' : '1px solid var(--gray-50)' }}
                          onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.96)'}
                          onMouseLeave={e => e.currentTarget.style.filter = ''}>
                          {cellAssignments.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {cellAssignments.slice(0, 3).map(a => (
                                <div key={a.id} style={{ background: 'white', borderRadius: 6,
                                  padding: '4px 8px', fontSize: 11,
                                  borderLeft: '3px solid var(--blue)', boxShadow: 'var(--shadow-sm)' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{a.orders?.order_code}</div>
                                  <div style={{ color: 'var(--gray-500)', marginTop: 1 }}>{a.quantity_assigned} pz</div>
                                </div>
                              ))}
                              {cellAssignments.length > 3 && (
                                <div style={{ fontSize: 10, color: 'var(--gray-500)', textAlign: 'center' }}>
                                  +{cellAssignments.length - 3} altri
                                </div>
                              )}
                              <div style={{ fontSize: 11, fontWeight: 600, color: tc, marginTop: 2 }}>
                                {capWeek ? `${loadPct}% · ${Math.round(usedMin)}/${capWeek} min` : `${totalPz} pz`}
                              </div>
                            </div>
                          ) : (
                            <div style={{ color: 'var(--gray-300)', fontSize: 11, textAlign: 'center', paddingTop: 8 }}>
                              + Assegna
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-50)', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="text-xs text-muted">Carico:</span>
            {[['#E8F8F2','var(--success)','≤70%'],['#FEF3E2','var(--warning)','71-90%'],['#FEF0EE','var(--danger)','>90%']].map(([bg,tc,label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, background: bg, borderRadius: 3, border: '1px solid var(--gray-100)' }} />
                <span style={{ fontSize: 11, color: tc, fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {draftPlan && (
        <div className="modal-overlay" onClick={() => setDraftPlan(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Piano proposto</div>
                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                  {draftPlan.plan.length} assegnazioni · saturazione max {saturationCap}%
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setDraftPlan(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {draftPlan.warnings.length > 0 && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#FEF3E2',
                  borderRadius: 8, border: '1px solid #F5C880' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--warning)', marginBottom: 6 }}>
                    ⚠ {draftPlan.warnings.length} avvisi
                  </div>
                  {draftPlan.warnings.map((w, i) => (
                    <div key={i} className="text-sm text-muted">{w}</div>
                  ))}
                </div>
              )}
              {draftPlan.plan.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <div className="empty-icon">⚡</div>
                  <div className="empty-title">Nessun ordine da pianificare</div>
                  <div className="empty-sub">Verifica le compatibilità linea-prodotto nelle Anagrafiche</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--gray-100)' }}>
                      {['Ordine','Prodotto','Linea','Settimana','Pz','Scadenza'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Pz' ? 'right' : 'left',
                          fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draftPlan.plan.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--gray-50)' }}>
                        <td style={{ padding: '8px 12px' }}><span className="mono">{item._order_code}</span></td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{item._product}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ background: 'var(--ice)', color: 'var(--blue)',
                            padding: '2px 8px', borderRadius: 99, fontSize: 12, fontWeight: 500 }}>
                            {item._line_name}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>W{item.week_number} {item.year}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--blue)' }}>
                          {item.quantity_assigned}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12,
                          color: item._due_date && new Date(item._due_date) < new Date() ? 'var(--danger)' : 'var(--gray-500)' }}>
                          {item._due_date ? new Date(item._due_date).toLocaleDateString('it-IT') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDraftPlan(null)}>Annulla</button>
              {draftPlan.plan.length > 0 && (
                <button className="btn btn-primary" onClick={approvePlan}>✓ Approva e salva piano</button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeCell && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(11,31,58,0.2)' }}
          onClick={() => setActiveCell(null)} />
      )}
      {activeCell && (
        <AssignPanel
          cell={activeCell} orders={orders} lines={lines}
          clientId={profile?.client_id}
          onClose={() => setActiveCell(null)}
          onSaved={() => { setActiveCell(null); load() }} />
      )}
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────
export default function Production() {
  const [tab, setTab] = useState('orders')

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Produzione</div>
          <div className="topbar-sub">Gestione ordini e pianificazione linee</div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--gray-100)', background: 'white',
        padding: '0 32px', display: 'flex', gap: 0 }}>
        {[['orders','Ordini'],['planning','Pianificazione']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 14, fontWeight: tab === key ? 600 : 400,
            color: tab === key ? 'var(--blue)' : 'var(--gray-500)',
            borderBottom: `2px solid ${tab === key ? 'var(--blue)' : 'transparent'}`,
            transition: 'all var(--transition)', marginBottom: -1
          }}>{label}</button>
        ))}
      </div>

      <div className="page-content">
        {tab === 'orders'   && <TabOrders />}
        {tab === 'planning' && <TabPlanning />}
      </div>
    </div>
  )
}
