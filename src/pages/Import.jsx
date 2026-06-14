import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

function parseDate(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().split('T')[0]
  }
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.split('T')[0]
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return null
}

export default function Import() {
  const [tab, setTab] = useState('ordini')
  const [rows, setRows] = useState([])
  const [validation, setValidation] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  // Materiali
  const [matRows, setMatRows] = useState([])
  const [matImporting, setMatImporting] = useState(false)
  const [matResult, setMatResult] = useState(null)
  const [matDrag, setMatDrag] = useState(false)
  const matFileRef = useRef()
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  const processFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: null })
      const mapped = data.map((r, i) => ({
        _row: i + 2,
        order_code: r['Nr. ordine produzione'],
        commessa_code: r['Codice Commessa Produzione'] ?? null,
        order_description: r['Descrizione Commessa Produttiva'] ?? null,
        product: r['Descrizione articolo'],
        brand_name: r['Marchio'],
        collection: r['Collezione'],
        reference_nr: r['Nr. Rif.'],
        sku: r['Nr. articolo'],
        color_code: r['Cod. colore'],
        color_description: r['Descrizione colore'],
        size_code: r['Cod. taglia'] ?? null,
        size_description: r['Descrizione'] ?? null,
        finishing: r['Rifinitura'],
        location_code: r['Cod. Ubicazione'] ?? null,
        bollettina_nr: r['Nr. Bollettina'] ?? null,
        po_number: r['Lancel PO No.'] ?? null,
        priority: r['Priority'] ? parseInt(r['Priority']) : null,
        week: r['Week'] ? parseInt(r['Week']) : null,
        due_date: parseDate(r['Data Scadenza Ordine Produzione']),
        quantity: parseInt(r['Quantità di input']) || 0,
        quantity_done: parseInt(r['Qtà Finita']) || 0,
        quantity_remaining: parseInt(r['Qtà Totale']) || 0,
        listino: r['Listino prezzi'] ? parseFloat(r['Listino prezzi']) : (r['Listino Articolo'] ? parseFloat(r['Listino Articolo']) : null),
      }))

      // Validation
      const issues = []
      mapped.forEach(r => {
        if (!r.order_code) issues.push({ row: r._row, field: 'Nr. ordine produzione', msg: 'Mancante' })
        if (!r.quantity || r.quantity <= 0) issues.push({ row: r._row, field: 'Quantità', msg: 'Deve essere > 0' })
        if (!r.due_date) issues.push({ row: r._row, field: 'Data scadenza', msg: 'Non parsificabile' })
        if (!r.brand_name) issues.push({ row: r._row, field: 'Marchio', msg: 'Mancante' })
      })
      setValidation(issues)
      setRows(mapped)
      setResult(null)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (f) processFile(f)
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  const doImport = async () => {
    setImporting(true)
    try {
      // ── 1. Letture iniziali indipendenti IN PARALLELO (1 round-trip invece di 3) ──
      const [{ data: profileData }, { data: allBrands }, { data: allProductsInit }] = await Promise.all([
        supabase.from('users_profiles').select('client_id').maybeSingle(),
        supabase.from('brands').select('id, name'),
        supabase.from('products').select('id, sku, name, selling_price'),
      ])
      const client_id = profileData?.client_id ?? null

      const brandMap = {}
      ;(allBrands || []).forEach(b => { brandMap[b.name.toLowerCase().trim()] = b.id })

      const missingBrands = [...new Set(
        rows.map(r => r.brand_name).filter(Boolean)
          .map(n => n.trim())
          .filter(n => !brandMap[n.toLowerCase()])
      )]
      if (missingBrands.length > 0) {
        const { data: newBrands } = await supabase
          .from('brands')
          .insert(missingBrands.map(name => ({ name, client_id })))
          .select('id, name')
        ;(newBrands || []).forEach(b => { brandMap[b.name.toLowerCase().trim()] = b.id })
      }

      // ── 2. Products: indici da lettura già fatta sopra ──
      const allProducts = allProductsInit
      const prodBySku  = {}
      const prodByName = {}
      ;(allProducts || []).forEach(p => {
        if (p.sku) prodBySku[p.sku.toLowerCase().trim()] = p
        if (p.name) prodByName[p.name.toLowerCase().trim()] = p
      })

      const findProduct = (row) => {
        if (row.sku) {
          const p = prodBySku[row.sku.toString().toLowerCase().trim()]
          if (p) return p
        }
        if (row.product) {
          const p = prodByName[row.product.toLowerCase().trim()]
          if (p) return p
        }
        return null
      }

      // Prodotti nuovi da creare (dedup per SKU)
      const newProductsMap = {}
      rows.forEach(row => {
        if (!row.sku && !row.product) return
        if (findProduct(row)) return
        const key = row.sku ? row.sku.toString().trim() : row.product.trim()
        if (!newProductsMap[key]) {
          newProductsMap[key] = {
            sku: row.sku ? row.sku.toString().trim() : null,
            name: row.product ? row.product.trim() : row.sku.toString().trim(),
            selling_price: row.listino ?? null,
            brand_id: row.brand_name ? brandMap[row.brand_name.toLowerCase().trim()] ?? null : null,
            client_id,
          }
        }
      })
      const newProducts = Object.values(newProductsMap)
      if (newProducts.length > 0) {
        const { data: created } = await supabase
          .from('products').insert(newProducts).select('id, sku, name, selling_price')
        ;(created || []).forEach(p => {
          if (p.sku) prodBySku[p.sku.toLowerCase().trim()] = p
          if (p.name) prodByName[p.name.toLowerCase().trim()] = p
        })
      }

      // Aggiorna listino dei prodotti esistenti se cambiato (in parallelo, pochi SKU unici)
      const priceUpdates = {}
      rows.forEach(row => {
        const p = findProduct(row)
        if (p && row.listino && row.listino > 0 && parseFloat(p.selling_price || 0) !== row.listino) {
          priceUpdates[p.id] = row.listino
        }
      })
      await Promise.all(
        Object.entries(priceUpdates).map(([id, price]) =>
          supabase.from('products').update({ selling_price: price }).eq('id', id)
        )
      )

      // ── 4. Ordini: upsert batch in UNA chiamata (2 query) ──
      const orderCodes = rows.map(r => r.order_code).filter(Boolean)
      const { data: existingOrders } = await supabase
        .from('orders').select('order_code')
        .in('order_code', orderCodes)
      const existingSet = new Set((existingOrders || []).map(o => o.order_code))

      const payloads = rows.filter(r => r.order_code).map(row => {
        let status = 'planned'
        if (row.quantity_done > 0 && row.quantity_done < row.quantity) status = 'in_production'
        if (row.quantity_done >= row.quantity && row.quantity > 0) status = 'completed'
        const prod = findProduct(row)
        return {
          order_code: row.order_code,
          commessa_code: row.commessa_code,
          order_description: row.order_description,
          product: row.product,
          sku: row.sku ? row.sku.toString().trim() : null,
          brand_id: row.brand_name ? brandMap[row.brand_name.toLowerCase().trim()] ?? null : null,
          product_id: prod?.id ?? null,
          client_id,
          collection: row.collection,
          reference_nr: row.reference_nr,
          color_code: row.color_code,
          color_description: row.color_description,
          size_code: row.size_code,
          size_description: row.size_description,
          finishing: row.finishing,
          location_code: row.location_code,
          bollettina_nr: row.bollettina_nr ? row.bollettina_nr.toString() : null,
          po_number: row.po_number ? row.po_number.toString() : null,
          priority: row.priority,
          week: row.week,
          due_date: row.due_date,
          quantity: row.quantity,
          quantity_done: row.quantity_done,
          status,
        }
      })

      const { data: upserted, error: upsertError } = await supabase
        .from('orders')
        .upsert(payloads, { onConflict: 'order_code,client_id' })
        .select('id, order_code, quantity_done, due_date')

      if (upsertError) throw upsertError

      const inserted = payloads.filter(p => !existingSet.has(p.order_code)).length
      const updated  = payloads.length - inserted

      // ── 5. Log iniziali per ordini con quantity_done > 0 (2 query) ──
      const ordersNeedingLog = (upserted || []).filter(o => (o.quantity_done || 0) > 0)
      if (ordersNeedingLog.length > 0) {
        const orderIds = ordersNeedingLog.map(o => o.id)
        const { data: existingLogs } = await supabase
          .from('production_log').select('order_id')
          .in('order_id', orderIds)
        const loggedSet = new Set((existingLogs || []).map(l => l.order_id))
        const newLogs = ordersNeedingLog
          .filter(o => !loggedSet.has(o.id))
          .map(o => ({
            order_id: o.id,
            produced_qt: o.quantity_done,
            date: o.due_date ?? new Date().toISOString().split('T')[0],
            operator: 'import Excel',
            client_id,
          }))
        if (newLogs.length > 0) {
          await supabase.from('production_log').insert(newLogs)
        }
      }

      setResult({ inserted, updated, skipped: rows.length - payloads.length })
    } catch (err) {
      console.error('Import error:', err)
      setResult({ inserted: 0, updated: 0, skipped: 0, error: err.message || 'Errore sconosciuto durante l\'import' })
    }
    setImporting(false)
  }

  // ── MATERIALI ──────────────────────────────────────────────
  const processMatFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval: null })
      const mapped = data.map((r, i) => ({
        _row: i + 2,
        order_code:    r['Nr. ordine produzione'],
        category_code: r['Codice categoria articolo'],
        material_code: r['Nr. articolo'] ? r['Nr. articolo'].toString() : null,
        material_desc: r['Descrizione'],
        color_desc:    r['Descrizione colore'],
        qty_base:      parseFloat(r['Quantità (base)']) || 0,
        qty_inevaso:   parseFloat(r['Qtà inevasa (base)']) || 0,
        supplier_nr:   r['Nr. Fornitore'] ? r['Nr. Fornitore'].toString() : null,
      })).filter(r => r.order_code)
      setMatRows(mapped)
      setMatResult(null)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleMatFile = (e) => {
    const f = e.target.files[0]
    if (f) processMatFile(f)
  }
  const handleMatDrop = (e) => {
    e.preventDefault(); setMatDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) processMatFile(f)
  }

  const doMatImport = async () => {
    setMatImporting(true)
    try {
      const { data: profileData } = await supabase
        .from('users_profiles').select('client_id').maybeSingle()
      const client_id = profileData?.client_id ?? null

      // Fotografia: cancella i materiali esistenti del cliente e reinserisce
      await supabase.from('order_materials').delete().eq('client_id', client_id)

      const payloads = matRows.map(m => ({
        client_id,
        order_code:    m.order_code,
        category_code: m.category_code,
        material_code: m.material_code,
        material_desc: m.material_desc,
        color_desc:    m.color_desc,
        qty_base:      m.qty_base,
        qty_inevaso:   m.qty_inevaso,
        supplier_nr:   m.supplier_nr,
      }))

      // Insert in blocchi da 500 per evitare payload troppo grandi
      let inserted = 0
      for (let i = 0; i < payloads.length; i += 500) {
        const chunk = payloads.slice(i, i + 500)
        const { error } = await supabase.from('order_materials').insert(chunk)
        if (error) throw error
        inserted += chunk.length
      }

      const distinctOrders = new Set(matRows.map(m => m.order_code)).size
      setMatResult({ inserted, orders: distinctOrders })
    } catch (err) {
      console.error('Import materiali error:', err)
      setMatResult({ inserted: 0, orders: 0, error: err.message })
    }
    setMatImporting(false)
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Import Excel</div>
          <div className="topbar-sub">Carica i file di produzione e materiali</div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--gray-100)', background: 'white', padding: '0 32px', display: 'flex' }}>
        {[['ordini','Ordini di produzione'],['materiali','Stato materiali']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 14, fontWeight: tab === key ? 600 : 400,
            color: tab === key ? 'var(--blue)' : 'var(--gray-500)',
            borderBottom: `2px solid ${tab === key ? 'var(--blue)' : 'transparent'}`,
            marginBottom: -1
          }}>{label}</button>
        ))}
      </div>

      <div className="page-content">
       {tab === 'ordini' && (
        <>
        <div className="card card-body" style={{ marginBottom: 20 }}>
          <div
            className={`upload-zone ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current.click()}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleFile} />
            <div className="upload-zone-icon">⊕</div>
            <div className="upload-zone-title">Trascina il file Excel qui</div>
            <div className="upload-zone-sub">oppure clicca per selezionarlo · .xlsx / .xls</div>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            {/* Validation summary */}
            <div className="card card-body mb-4" style={{
              background: validation.length === 0 ? '#E8F8F2' : '#FEF3E2',
              border: `1px solid ${validation.length === 0 ? '#A8DFC8' : '#F5C880'}`
            }}>
              {validation.length === 0 ? (
                <div style={{ color: 'var(--success)', fontWeight: 500 }}>
                  ✓ File valido — {rows.length} righe pronte per l'import
                </div>
              ) : (
                <div>
                  <div style={{ color: 'var(--warning)', fontWeight: 600, marginBottom: 8 }}>
                    ⚠ {validation.length} avvisi trovati
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {validation.slice(0, 5).map((v, i) => (
                      <div key={i} className="text-sm" style={{ color: 'var(--gray-700)' }}>
                        Riga {v.row} · {v.field}: {v.msg}
                      </div>
                    ))}
                    {validation.length > 5 && <div className="text-sm text-muted">...e altri {validation.length - 5}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Preview table */}
            <div className="card mb-4">
              <div className="card-header">
                <div className="card-title">Anteprima ({rows.length} righe)</div>
                <button className="btn btn-primary" onClick={doImport} disabled={importing}>
                  {importing ? 'Importazione...' : `Importa ${rows.length} ordini`}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nr. Ordine</th>
                      <th>Prodotto</th>
                      <th>Brand</th>
                      <th>Collezione</th>
                      <th>Scadenza</th>
                      <th>Qtà</th>
                      <th>Finita</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => {
                      const status = r.quantity_remaining === 0 ? 'completed'
                        : r.quantity_done > 0 ? 'in_production' : 'planned'
                      return (
                        <tr key={i}>
                          <td className="text-xs text-muted">{r._row}</td>
                          <td><span className="mono">{r.order_code}</span></td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product}</td>
                          <td>{r.brand_name}</td>
                          <td>{r.collection}</td>
                          <td className="text-sm">{r.due_date}</td>
                          <td style={{ fontWeight: 600 }}>{r.quantity}</td>
                          <td>{r.quantity_done}</td>
                          <td><span className={`badge badge-${status}`}>{status}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="text-sm text-muted" style={{ padding: '12px 16px', textAlign: 'center' }}>
                    ...e altre {rows.length - 50} righe
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {result && result.error && (
          <div className="card card-body" style={{ background: '#FEF0EE', border: '1px solid #F0B0A8' }}>
            <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 8 }}>✗ Errore durante l'import</div>
            <div className="text-sm" style={{ color: 'var(--gray-700)' }}>{result.error}</div>
            <div className="text-xs text-muted" style={{ marginTop: 8 }}>
              Se l'errore riguarda "no unique constraint", esegui su Supabase l'indice univoco indicato nella documentazione del progetto.
            </div>
          </div>
        )}

        {result && !result.error && (
          <div className="card card-body" style={{ background: '#E8F8F2', border: '1px solid #A8DFC8' }}>
            <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>✓ Import completato</div>
            <div className="text-sm" style={{ display: 'flex', gap: 24 }}>
              <span>Inseriti: <strong>{result.inserted}</strong></span>
              <span>Aggiornati: <strong>{result.updated}</strong></span>
              {result.skipped > 0 && <span style={{ color: 'var(--warning)' }}>Saltati: <strong>{result.skipped}</strong></span>}
            </div>
          </div>
        )}
        </>
       )}

       {tab === 'materiali' && (
        <>
          <div className="card card-body" style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--ice-light)', borderRadius: 8, fontSize: 13, color: 'var(--blue)' }}>
              Il file materiali è una <strong>fotografia</strong>: ogni import sostituisce completamente lo stato precedente.
              I semafori negli Ordini si aggiornano di conseguenza.
            </div>
            <div
              className={`upload-zone ${matDrag ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setMatDrag(true) }}
              onDragLeave={() => setMatDrag(false)}
              onDrop={handleMatDrop}
              onClick={() => matFileRef.current.click()}>
              <input ref={matFileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleMatFile} />
              <div className="upload-zone-icon">⊕</div>
              <div className="upload-zone-title">Trascina il file materiali qui</div>
              <div className="upload-zone-sub">oppure clicca per selezionarlo · .xlsx / .xls</div>
            </div>
          </div>

          {matRows.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <div>
                  <div className="card-title">Anteprima materiali ({matRows.length} righe)</div>
                  <div className="card-sub">{new Set(matRows.map(m => m.order_code)).size} ordini coinvolti</div>
                </div>
                <button className="btn btn-primary" onClick={doMatImport} disabled={matImporting}>
                  {matImporting ? 'Importazione...' : `Importa stato materiali`}
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ordine</th><th>Categoria</th><th>Materiale</th>
                      <th>Colore</th><th>Qtà</th><th>Inevaso</th><th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matRows.slice(0, 50).map((m, i) => {
                      const pct = m.qty_base > 0 ? Math.round((m.qty_base - m.qty_inevaso) / m.qty_base * 100) : 100
                      const col = pct >= 90 ? 'var(--success)' : pct >= 70 ? 'var(--warning)' : 'var(--danger)'
                      return (
                        <tr key={i}>
                          <td><span className="mono" style={{ fontSize: 12 }}>{m.order_code}</span></td>
                          <td><span className="mono" style={{ fontSize: 11 }}>{m.category_code || '—'}</span></td>
                          <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{m.material_desc || '—'}</td>
                          <td style={{ fontSize: 12 }}>{m.color_desc || '—'}</td>
                          <td style={{ fontSize: 12 }}>{m.qty_base}</td>
                          <td style={{ fontSize: 12 }}>{m.qty_inevaso}</td>
                          <td style={{ fontWeight: 600, color: col, fontSize: 12 }}>{pct}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {matRows.length > 50 && (
                  <div className="text-sm text-muted" style={{ padding: '12px 16px', textAlign: 'center' }}>
                    ...e altre {matRows.length - 50} righe
                  </div>
                )}
              </div>
            </div>
          )}

          {matResult && matResult.error && (
            <div className="card card-body" style={{ background: '#FEF0EE', border: '1px solid #F0B0A8' }}>
              <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 8 }}>✗ Errore import materiali</div>
              <div className="text-sm">{matResult.error}</div>
            </div>
          )}
          {matResult && !matResult.error && (
            <div className="card card-body" style={{ background: '#E8F8F2', border: '1px solid #A8DFC8' }}>
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>✓ Stato materiali aggiornato</div>
              <div className="text-sm" style={{ display: 'flex', gap: 24 }}>
                <span>Righe importate: <strong>{matResult.inserted}</strong></span>
                <span>Ordini coinvolti: <strong>{matResult.orders}</strong></span>
              </div>
            </div>
          )}
        </>
       )}
      </div>
    </div>
  )
}
