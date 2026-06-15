// ============================================================
// Logica semaforo materiali — fasi di produzione
// ============================================================

// Mappa categoria materiale → fase di produzione
export const PHASE_CATEGORIES = {
  taglio:     ['MP-01', 'MP-15'],
  montaggio:  ['MP-30', 'MP-45', 'MP-50', 'MP-55'],
  rifinitura: ['MP-70', 'MP-80'],
}

export const PHASE_LABELS = {
  taglio:     'Taglio',
  montaggio:  'Montaggio',
  rifinitura: 'Rifinitura',
}

export const PHASE_ORDER = ['taglio', 'montaggio', 'rifinitura']

// Colori semaforo
export const STATUS_COLORS = {
  verde:  '#1A9E6E',
  giallo: '#D4820A',
  rosso:  '#E5484D',
  vuoto:  '#C8D2DC',  // nessun materiale per quella fase
  attesa: '#94A3B8',  // MP da ricevere (mai vista distinta)
}

// Determina la fase di una categoria materiale
function categoryToPhase(categoryCode) {
  if (!categoryCode) return null
  const code = categoryCode.toUpperCase().trim()
  for (const [phase, cats] of Object.entries(PHASE_CATEGORIES)) {
    if (cats.includes(code)) return phase
  }
  return null
}

// Stato di una singola riga materiale (per percentuale arrivata)
// ≥90% verde, 70-90% giallo, <70% rosso
function rowStatus(qtyBase, qtyInevaso) {
  const base = parseFloat(qtyBase || 0)
  if (base <= 0) return 'verde' // nessuna quantità richiesta = ok
  const arrivata = base - parseFloat(qtyInevaso || 0)
  const pct = (arrivata / base) * 100
  if (pct >= 90) return 'verde'
  if (pct >= 70) return 'giallo'
  return 'rosso'
}

// Peggiore tra due stati (anello debole)
function worstStatus(a, b) {
  const rank = { verde: 0, giallo: 1, rosso: 2 }
  return rank[a] >= rank[b] ? a : b
}

// Calcola lo stato delle 3 fasi per un set di materiali di un ordine
// materials = array di { category_code, qty_base, qty_inevaso }
// Ritorna { taglio: 'verde'|'giallo'|'rosso'|'vuoto', montaggio: ..., rifinitura: ... }
export function computePhaseStatus(materials) {
  // Questa funzione viene chiamata solo per OPR PRESENTI nel file materiali
  // (la distinta è arrivata). Quindi una fase senza righe significa che i suoi
  // materiali sono già stati tutti consegnati e il brand li ha rimossi dal file:
  // in tal caso la fase è VERDE (completata), non 'vuoto'.
  const result = { taglio: 'verde', montaggio: 'verde', rifinitura: 'verde' }
  const hasRows = { taglio: false, montaggio: false, rifinitura: false }

  for (const m of materials) {
    const phase = categoryToPhase(m.category_code)
    if (!phase) continue
    const status = rowStatus(m.qty_base, m.qty_inevaso)
    if (!hasRows[phase]) {
      result[phase] = status
      hasRows[phase] = true
    } else {
      result[phase] = worstStatus(result[phase], status)
    }
  }
  return result
}

// Raggruppa materiali per order_code e calcola le fasi per ciascun ordine
// Ritorna { [order_code]: { taglio, montaggio, rifinitura } }
export function computeOrderPhases(allMaterials) {
  const byOrder = {}
  for (const m of allMaterials) {
    if (!m.order_code) continue
    if (!byOrder[m.order_code]) byOrder[m.order_code] = []
    byOrder[m.order_code].push(m)
  }
  const result = {}
  for (const [code, mats] of Object.entries(byOrder)) {
    result[code] = computePhaseStatus(mats)
  }
  return result
}


// Risolve lo stato di visualizzazione di un ordine considerando i 3 casi:
//   caso materiali presenti → semaforo normale per fase
//   caso 1 (assente ma già visto in passato) → tutte verdi (materiali consegnati)
//   caso 2 (assente e mai visto) → stato 'attesa' (MP da ricevere)
// Ritorna { mode: 'phases'|'all_green'|'awaiting', phases?: {...} }
export function resolveOrderMaterialState(orderCode, phasesMap, seenSet) {
  const phases = phasesMap[orderCode]
  if (phases) {
    return { mode: 'phases', phases }
  }
  if (seenSet && seenSet.has(orderCode)) {
    // Caso 1: materiali completati
    return { mode: 'all_green', phases: { taglio: 'verde', montaggio: 'verde', rifinitura: 'verde' } }
  }
  // Caso 2: distinta mai ricevuta
  return { mode: 'awaiting' }
}
