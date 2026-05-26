import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

export default function Brands() {
  const { profile } = useAuth()
  const [brands, setBrands]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [deleting, setDeleting]   = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [newName, setNewName]     = useState('')
  const [addSaving, setAddSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('brands').select('*, clients(name)').order('name')
    setBrands(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addBrand = async () => {
    if (!newName.trim()) return
    setAddSaving(true)
    await supabase.from('brands').insert({ name: newName.trim(), client_id: profile?.client_id ?? null })
    setNewName('')
    setAddSaving(false)
    load()
  }

  const saveEdit = async (b) => {
    setSaving(true)
    await supabase.from('brands').update({ name: editForm.name, priority: editForm.priority || null }).eq('id', b.id)
    setEditingId(null)
    setSaving(false)
    load()
  }

  const confirmDelete = async () => {
    await supabase.from('brands').delete().eq('id', deleting.id)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Brand</div>
          <div className="topbar-sub">{brands.length} brand configurati</div>
        </div>
      </div>

      <div className="page-content">
        <div className="card card-body mb-4">
          <div className="card-title mb-4">Aggiungi brand</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nome brand (es. PEL, LAN)" style={{ maxWidth: 300 }}
              onKeyDown={e => e.key === 'Enter' && addBrand()} />
            <button className="btn btn-primary" onClick={addBrand} disabled={addSaving || !newName.trim()}>
              + Aggiungi
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12, padding: '12px 20px', background: 'var(--ice-light)', border: '1px solid var(--ice)' }}>
          <span className="text-sm" style={{ color: 'var(--blue)' }}>
            ✎ Clicca su una riga per modificarla direttamente
          </span>
        </div>

        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : brands.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">◈</div>
                <div className="empty-title">Nessun brand configurato</div>
                <div className="empty-sub">Vengono creati automaticamente durante l'import Excel</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Priorità</th>
                    <th>Cliente</th>
                    <th>Creato il</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map(b => (
                    <tr key={b.id} style={{ cursor: 'pointer' }}
                      onClick={() => editingId !== b.id && (setEditingId(b.id), setEditForm({ name: b.name, priority: b.priority || '' }))}>
                      {editingId === b.id ? (
                        <>
                          <td>
                            <input className="form-input" value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              style={{ padding: '4px 8px', fontSize: 13 }} />
                          </td>
                          <td>
                            <input className="form-input" type="number" value={editForm.priority}
                              onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder="es. 1"
                              style={{ padding: '4px 8px', fontSize: 13, width: 80 }} />
                          </td>
                          <td>{b.clients?.name ?? '—'}</td>
                          <td>{b.created_at ? new Date(b.created_at).toLocaleDateString('it-IT') : '—'}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(b)} disabled={saving}>
                                {saving ? '...' : '✓ Salva'}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Annulla</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="font-medium">{b.name}</td>
                          <td>{b.priority ?? '—'}</td>
                          <td>{b.clients?.name ?? '—'}</td>
                          <td className="text-sm text-muted">
                            {b.created_at ? new Date(b.created_at).toLocaleDateString('it-IT') : '—'}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleting(b)}>Elimina</button>
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
              <p className="text-sm">Sei sicuro di voler eliminare il brand <strong>{deleting.name}</strong>?</p>
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
