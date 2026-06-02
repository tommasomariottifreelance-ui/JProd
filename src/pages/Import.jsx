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
  const [rows, setRows] = useState([])
  const [validation, setValidation] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
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
        finishing: r['Rifinitura'],
        week: r['Week'] ? parseInt(r['Week']) : null,
        due_date: parseDate(r['Data Scadenza Ordine Produzione']),
        quantity: parseInt(r['Quantità di input']) || 0,
        quantity_done: parseInt(r['Qtà Finita']) || 0,
        quantity_remaining: parseInt(r['Qtà Totale']) || 0,
        listino: r['Listino Articolo'] ? parseFloat(r['Listino Articolo']) : null,
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
    let inserted = 0, updated = 0, skipped = 0

    // Recupera client_id dal profilo utente loggato
    const { data: profileData } = await supabase
      .from('users_profiles')
      .select('client_id')
      .maybeSingle()
    const client_id = profileData?.client_id ?? null

    for (const row of rows) {
      // Determina status in base alle quantità
      let status = 'planned'
      if (row.quantity_done > 0 && row.quantity_done < row.quantity) status = 'in_production'
      if (row.quantity_done >= row.quantity && row.quantity > 0) status = 'completed'

      // Cerca o crea brand — maybeSingle() evita errore 406
      let brand_id = null
      if (row.brand_name) {
        const { data: b } = await supabase
          .from('brands').select('id')
          .ilike('name', row.brand_name)
          .maybeSingle()
        if (b) {
          brand_id = b.id
        } else {
          const { data: nb } = await supabase
            .from('brands')
            .insert({ name: row.brand_name, client_id })
            .select('id')
            .maybeSingle()
          if (nb) brand_id = nb.id
        }
      }

      // Cerca product_id per nome (per alimentare il JOIN con time_per_piece)
      let product_id = null
      if (row.product) {
        const { data: prod } = await supabase
          .from('products').select('id')
          .ilike('name', row.product.trim())
          .maybeSingle()
        if (prod) product_id = prod.id
      }

      // Payload ordine — senza quantity_remaining (calcolata dalla VIEW)
      const payload = {
        order_code: row.order_code,
        commessa_code: row.commessa_code,
        order_description: row.order_description,
        product: row.product,
        brand_id,
        product_id,
        client_id,
        collection: row.collection,
        reference_nr: row.reference_nr,
        color_code: row.color_code,
        color_description: row.color_description,
        finishing: row.finishing,
        week: row.week,
        due_date: row.due_date,
        quantity: row.quantity,
        quantity_done: row.quantity_done,
        status,
      }

      // Aggiorna selling_price del prodotto se presente nel listino Excel
      if (product_id && row.listino && row.listino > 0) {
        await supabase.from('products')
          .update({ selling_price: row.listino })
          .eq('id', product_id)
      }

      // Upsert: aggiorna se esiste, inserisce se nuovo
      const { data: existing } = await supabase
        .from('orders').select('id')
        .eq('order_code', row.order_code)
        .maybeSingle()

      let order_id = null
      if (existing) {
        await supabase.from('orders').update(payload).eq('id', existing.id)
        order_id = existing.id
        updated++
      } else {
        const { data: newOrder, error } = await supabase
          .from('orders').insert(payload).select('id').maybeSingle()
        if (!error && newOrder) { order_id = newOrder.id; inserted++ } else { skipped++ }
      }

      // Opzione A: se quantity_done > 0 crea log iniziale per alimentare la VIEW
      // Controlla prima che non esista già un log (evita duplicati su reimport)
      if (order_id && row.quantity_done > 0) {
        const { data: existingLog } = await supabase
          .from('production_log').select('id')
          .eq('order_id', order_id)
          .maybeSingle()
        if (!existingLog) {
          await supabase.from('production_log').insert({
            order_id,
            produced_qt: row.quantity_done,
            date: row.due_date ?? new Date().toISOString().split('T')[0],
            operator: 'import Excel',
            client_id,
          })
        }
      }
    }

    setResult({ inserted, updated, skipped })
    setImporting(false)
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Import Excel</div>
          <div className="topbar-sub">Carica il file ordini di produzione</div>
        </div>
      </div>

      <div className="page-content">
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

        {result && (
          <div className="card card-body" style={{ background: '#E8F8F2', border: '1px solid #A8DFC8' }}>
            <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>✓ Import completato</div>
            <div className="text-sm" style={{ display: 'flex', gap: 24 }}>
              <span>Inseriti: <strong>{result.inserted}</strong></span>
              <span>Aggiornati: <strong>{result.updated}</strong></span>
              {result.skipped > 0 && <span style={{ color: 'var(--warning)' }}>Saltati: <strong>{result.skipped}</strong></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
