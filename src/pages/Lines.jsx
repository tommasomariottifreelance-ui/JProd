import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

function LineModal({ line, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(line || { name: '', daily_capacity: '', efficiency: 1, active: true })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handle = async () => {
    setSaving(true)
    const payload = {
      name: form.name,
      daily_capacity: parseInt(form.daily_capacity) || null,
      efficiency: parseFloat(form.efficiency) || 1,
      active: form.active,
      client_id: profile?.client_id ?? null,
    }
    if (form.id) await supabase.from('production_lines').update(payload).eq('id', form.id)
    else await supabase.from('production_lines').insert(payload)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{form.id ? 'Modifica linea' : 'Nuova linea'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nome linea</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="es. Grande Pelletteria" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Capacità giornaliera (pz)</label>
              <input className="form-input" type="number" value={form.daily_capacity} onChange={e => set('daily_capacity', e.target.value)} placeholder="es. 100" />
            </div>
            <div className="form-group">
              <label className="form-label">Efficienza (0-1)</label>
              <input className="form-input" type="number" step="0.01" min="0" max="1" value={form.efficiency} onChange={e => set('efficiency', e.target.value)} placeholder="es. 0.85" />
            </div>
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="active" checked={form.active} onChange={e => set('active', e.target.checked)} />
            <label className="form-label" htmlFor="active" style={{ cursor: 'pointer' }}>Linea attiva</label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={handle} disabled={saving || !form.name}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Lines() {
  const [lines, setLines]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('production_lines').select('*').order('name')
    setLines(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const confirmDelete = async () => {
    await supabase.from('production_lines').delete().eq('id', deleting.id)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Linee di produzione</div>
          <div className="topbar-sub">{lines.length} linee configurate</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nuova linea</button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : lines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⚙</div>
                <div className="empty-title">Nessuna linea configurata</div>
                <div className="empty-sub">Aggiungi le linee di produzione per assegnare gli ordini</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Capacità / giorno</th>
                    <th>Efficienza</th>
                    <th>Stato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.name}</td>
                      <td>{l.daily_capacity ? `${l.daily_capacity} pz` : '—'}</td>
                      <td>{l.efficiency ? `${Math.round(l.efficiency * 100)}%` : '—'}</td>
                      <td>
                        <span className={`badge ${l.active ? 'badge-in_production' : 'badge-on_hold'}`}>
                          {l.active ? 'Attiva' : 'Inattiva'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(l)}>Modifica</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(l)}>Elimina</button>
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

      {(editing || showNew) && (
        <LineModal
          line={editing}
          onClose={() => { setEditing(null); setShowNew(false) }}
          onSaved={() => { setEditing(null); setShowNew(false); load() }} />
      )}

      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Conferma eliminazione</div>
            </div>
            <div className="modal-body">
              <p className="text-sm">Sei sicuro di voler eliminare la linea <strong>{deleting.name}</strong>?</p>
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
