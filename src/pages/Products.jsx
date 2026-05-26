import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

function ProductModal({ product, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(product || { sku: '', name: '', time_per_piece: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handle = async () => {
    setSaving(true)
    const payload = {
      sku: form.sku,
      name: form.name,
      time_per_piece: parseFloat(form.time_per_piece) || null,
      client_id: profile?.client_id ?? null,
    }
    if (form.id) await supabase.from('products').update(payload).eq('id', form.id)
    else await supabase.from('products').insert(payload)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{form.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">SKU / Codice articolo</label>
            <input className="form-input" value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="es. ART-001" />
          </div>
          <div className="form-group">
            <label className="form-label">Nome prodotto</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="es. Shopping Bag Grande" />
          </div>
          <div className="form-group">
            <label className="form-label">Tempo per pezzo (minuti)</label>
            <input className="form-input" type="number" step="0.1" min="0"
              value={form.time_per_piece} onChange={e => set('time_per_piece', e.target.value)}
              placeholder="es. 45" />
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

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null)
  const [showNew, setShowNew]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, brands(name)')
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const confirmDelete = async () => {
    await supabase.from('products').delete().eq('id', deleting.id)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Prodotti</div>
          <div className="topbar-sub">{products.length} prodotti in anagrafica</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nuovo prodotto</button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">◈</div>
                <div className="empty-title">Nessun prodotto in anagrafica</div>
                <div className="empty-sub">Aggiungi i prodotti o importa un file Excel</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nome</th>
                    <th>Brand</th>
                    <th>Tempo/pz (min)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td><span className="mono">{p.sku || '—'}</span></td>
                      <td className="font-medium">{p.name}</td>
                      <td>{p.brands?.name ?? '—'}</td>
                      <td>{p.time_per_piece ? `${p.time_per_piece} min` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(p)}>Modifica</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleting(p)}>Elimina</button>
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
        <ProductModal
          product={editing}
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
              <p className="text-sm">Sei sicuro di voler eliminare <strong>{deleting.name}</strong>? L'operazione non è reversibile.</p>
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
