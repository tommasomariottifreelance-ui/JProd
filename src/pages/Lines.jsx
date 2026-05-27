import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

export default function Lines() {
  const { profile } = useAuth()
  const [lines, setLines]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const [newForm, setNewForm]     = useState({ name: '', minutes_per_day: '', efficiency: '1', active: true })
  const [addSaving, setAddSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('production_lines').select('*').order('name')
    setLines(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addLine = async () => {
    if (!newForm.name.trim()) return
    setAddSaving(true)
    await supabase.from('production_lines').insert({
      name: newForm.name,
      available_hours_per_day: newForm.minutes_per_day ? parseFloat(newForm.minutes_per_day) / 60 : null,
      efficiency: parseFloat(newForm.efficiency) || 1,
      active: newForm.active,
      client_id: profile?.client_id ?? null,
    })
    setShowNew(false)
    setNewForm({ name: '', minutes_per_day: '', efficiency: '1', active: true })
    setAddSaving(false)
    load()
  }

  const saveEdit = async (l) => {
    setSaving(true)
    await supabase.from('production_lines').update({
      name: editForm.name,
      available_hours_per_day: editForm.minutes_per_day ? parseFloat(editForm.minutes_per_day) / 60 : null,
      efficiency: parseFloat(editForm.efficiency) || 1,
      active: editForm.active,
    }).eq('id', l.id)
    setEditingId(null)
    setSaving(false)
    load()
  }

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
          <button className="btn btn-primary" onClick={() => setShowNew(v => !v)}>+ Nuova linea</button>
        </div>
      </div>

      <div className="page-content">
        {showNew && (
          <div className="card card-body mb-4">
            <div className="card-title mb-4">Nuova linea</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="es. Grande Pelletteria" />
              </div>
              <div className="form-group">
                <label className="form-label">Min. disponibili/giorno</label>
                <input className="form-input" type="number" value={newForm.minutes_per_day} onChange={e => setNewForm(f => ({ ...f, minutes_per_day: e.target.value }))} placeholder="es. 480" />
              </div>
              <div className="form-group">
                <label className="form-label">Efficienza</label>
                <input className="form-input" type="number" step="0.01" min="0" max="1" value={newForm.efficiency} onChange={e => setNewForm(f => ({ ...f, efficiency: e.target.value }))} placeholder="0.85" />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                <input type="checkbox" checked={newForm.active} onChange={e => setNewForm(f => ({ ...f, active: e.target.checked }))} />
                <label className="form-label">Attiva</label>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" onClick={addLine} disabled={addSaving || !newForm.name}>Salva</button>
                <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Annulla</button>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 12, padding: '12px 20px', background: 'var(--ice-light)', border: '1px solid var(--ice)' }}>
          <span className="text-sm" style={{ color: 'var(--blue)' }}>✎ Clicca su una riga per modificarla direttamente</span>
        </div>

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
                    <th>Min. disponibili/giorno</th>
                    <th>Efficienza</th>
                    <th>Stato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} style={{ cursor: 'pointer' }}
                      onClick={() => editingId !== l.id && (setEditingId(l.id), setEditForm({ name: l.name, minutes_per_day: l.available_hours_per_day ? Math.round(l.available_hours_per_day * 60) : '', efficiency: l.efficiency || 1, active: l.active }))}>
                      {editingId === l.id ? (
                        <>
                          <td>
                            <input className="form-input" value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              style={{ padding: '4px 8px', fontSize: 13 }} />
                          </td>
                          <td>
                            <input className="form-input" type="number" value={editForm.minutes_per_day}
                              onChange={e => setEditForm(f => ({ ...f, minutes_per_day: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder="es. 480"
                              style={{ padding: '4px 8px', fontSize: 13, width: 90 }} />
                          </td>
                          <td>
                            <input className="form-input" type="number" step="0.01" min="0" max="1" value={editForm.efficiency}
                              onChange={e => setEditForm(f => ({ ...f, efficiency: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              style={{ padding: '4px 8px', fontSize: 13, width: 80 }} />
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                              <input type="checkbox" checked={editForm.active}
                                onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))} />
                              <span className="text-sm">Attiva</span>
                            </label>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(l)} disabled={saving}>
                                {saving ? '...' : '✓ Salva'}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Annulla</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="font-medium">{l.name}</td>
                          <td>{l.available_hours_per_day ? `${Math.round(l.available_hours_per_day * 60)} min` : '—'}</td>
                          <td>{l.efficiency ? `${Math.round(l.efficiency * 100)}%` : '—'}</td>
                          <td>
                            <span className={`badge ${l.active ? 'badge-in_production' : 'badge-on_hold'}`}>
                              {l.active ? 'Attiva' : 'Inattiva'}
                            </span>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleting(l)}>Elimina</button>
                          </td>
                        </>
                      )}
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
