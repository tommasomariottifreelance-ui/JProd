import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

export default function Products() {
  const { profile } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)

  const load = async () => {
    // Carica prodotti esistenti + estrai prodotti unici dagli ordini non ancora in anagrafica
    const [{ data: existing }, { data: orders }] = await Promise.all([
      supabase.from('products').select('*, brands(name)').order('name'),
      supabase.from('orders').select('product, brand_id, brands(name)')
    ])

    const existingNames = new Set((existing || []).map(p => p.name?.toLowerCase()))

    // Prodotti presenti negli ordini ma non in anagrafica
    const fromOrders = []
    const seen = new Set()
    ;(orders || []).forEach(o => {
      const key = o.product?.toLowerCase()
      if (key && !existingNames.has(key) && !seen.has(key)) {
        seen.add(key)
        fromOrders.push({
          id: null, // non ancora salvato
          name: o.product,
          sku: null,
          time_per_piece: null,
          brands: o.brands,
          brand_id: o.brand_id,
          _fromOrders: true
        })
      }
    })

    setProducts([...(existing || []), ...fromOrders])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startEdit = (p) => {
    setEditingId(p.id ?? `new_${p.name}`)
    setEditForm({ name: p.name, sku: p.sku || '', time_per_piece: p.time_per_piece || '', selling_price: p.selling_price || '', brand_id: p.brand_id || null })
  }

  const saveEdit = async (p) => {
    setSaving(true)
    const payload = {
      name: editForm.name,
      sku: editForm.sku || null,
      time_per_piece: parseFloat(editForm.time_per_piece) || null,
      selling_price: parseFloat(editForm.selling_price) || null,
      brand_id: editForm.brand_id || null,
      client_id: profile?.client_id ?? null,
    }
    if (p.id) {
      await supabase.from('products').update(payload).eq('id', p.id)
    } else {
      await supabase.from('products').insert(payload)
    }
    setEditingId(null)
    setSaving(false)
    load()
  }

  const confirmDelete = async () => {
    if (deleting.id) await supabase.from('products').delete().eq('id', deleting.id)
    setDeleting(null)
    load()
  }

  const isEditing = (p) => editingId === (p.id ?? `new_${p.name}`)

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Prodotti</div>
          <div className="topbar-sub">{products.length} prodotti in anagrafica</div>
        </div>
      </div>

      <div className="page-content">
        <div className="card" style={{ marginBottom: 12, padding: '12px 20px', background: 'var(--ice-light)', border: '1px solid var(--ice)' }}>
          <span className="text-sm" style={{ color: 'var(--blue)' }}>
            ✎ Clicca su una riga per modificarla direttamente. I prodotti evidenziati in grigio chiaro sono estratti dagli ordini e non ancora salvati in anagrafica.
          </span>
        </div>

        <div className="card">
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">◈</div>
                <div className="empty-title">Nessun prodotto trovato</div>
                <div className="empty-sub">Importa un file Excel per popolare l'anagrafica automaticamente</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome prodotto</th>
                    <th>Codice Articolo</th>
                    <th>Brand</th>
                    <th>Tempo/pz (min)</th>
                    <th>Prezzo vendita (€/pz)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id ?? `new_${p.name}`}
                      style={{ background: p._fromOrders ? 'var(--gray-50)' : 'white', cursor: 'pointer' }}
                      onClick={() => !isEditing(p) && startEdit(p)}>
                      {isEditing(p) ? (
                        <>
                          <td>
                            <input className="form-input" value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              style={{ padding: '4px 8px', fontSize: 13 }} />
                          </td>
                          <td>
                            <input className="form-input" value={editForm.sku}
                              onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder="es. ART-001"
                              style={{ padding: '4px 8px', fontSize: 13 }} />
                          </td>
                          <td><span className="text-sm text-muted">{p.brands?.name ?? '—'}</span></td>
                          <td>
                            <input className="form-input" type="number" value={editForm.time_per_piece}
                              onChange={e => setEditForm(f => ({ ...f, time_per_piece: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder="es. 45"
                              style={{ padding: '4px 8px', fontSize: 13, width: 90 }} />
                          </td>
                          <td>
                            <input className="form-input" type="number" step="0.01" value={editForm.selling_price}
                              onChange={e => setEditForm(f => ({ ...f, selling_price: e.target.value }))}
                              onClick={e => e.stopPropagation()}
                              placeholder="es. 120.00"
                              style={{ padding: '4px 8px', fontSize: 13, width: 100 }} />
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p)} disabled={saving}>
                                {saving ? '...' : '✓ Salva'}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                                Annulla
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="font-medium">
                            {p.name}
                            {p._fromOrders && <span className="text-xs text-muted" style={{ marginLeft: 8 }}>da ordini</span>}
                          </td>
                          <td><span className="mono">{p.sku || '—'}</span></td>
                          <td>{p.brands?.name ?? '—'}</td>
                          <td>{p.time_per_piece ? `${p.time_per_piece} min` : '—'}</td>
                          <td>{p.selling_price ? `€ ${p.selling_price}` : '—'}</td>
                          <td onClick={e => e.stopPropagation()}>
                            {p.id && (
                              <button className="btn btn-danger btn-sm" onClick={() => setDeleting(p)}>
                                Elimina
                              </button>
                            )}
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
            <div className="modal-header">
              <div className="modal-title">Conferma eliminazione</div>
            </div>
            <div className="modal-body">
              <p className="text-sm">Sei sicuro di voler eliminare <strong>{deleting.name}</strong>?</p>
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
