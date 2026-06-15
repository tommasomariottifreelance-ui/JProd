-- ============================================================
-- JPROD Sprint 3 — Archiviazione ordini, log import, OPR storici
-- ============================================================

-- 1. Colonna archived su orders (soft-delete ordini annullati dal brand)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Log leggero degli import (ordini e materiali)
CREATE TABLE IF NOT EXISTS import_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  client_id   bigint REFERENCES public.clients(id),
  import_type text,                  -- 'ordini' | 'materiali'
  file_name   text,
  rows_count  integer DEFAULT 0,
  orders_count integer DEFAULT 0
);
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select" ON import_log;
DROP POLICY IF EXISTS "tenant_insert" ON import_log;
CREATE POLICY "tenant_select" ON import_log
  FOR SELECT TO authenticated USING (client_id = get_my_client_id());
CREATE POLICY "tenant_insert" ON import_log
  FOR INSERT TO authenticated WITH CHECK (client_id = get_my_client_id());
GRANT SELECT, INSERT ON import_log TO authenticated;

-- 3. Memoria additiva degli OPR visti almeno una volta nei materiali
CREATE TABLE IF NOT EXISTS materials_seen_opr (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id  bigint REFERENCES public.clients(id),
  order_code text NOT NULL,
  first_seen timestamptz DEFAULT now(),
  UNIQUE(client_id, order_code)
);
ALTER TABLE materials_seen_opr ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select" ON materials_seen_opr;
DROP POLICY IF EXISTS "tenant_insert" ON materials_seen_opr;
CREATE POLICY "tenant_select" ON materials_seen_opr
  FOR SELECT TO authenticated USING (client_id = get_my_client_id());
CREATE POLICY "tenant_insert" ON materials_seen_opr
  FOR INSERT TO authenticated WITH CHECK (client_id = get_my_client_id());
GRANT SELECT, INSERT ON materials_seen_opr TO authenticated;

-- 4. Ricrea la VIEW orders_with_totals per filtrare gli archiviati
--    (la VIEW espone solo ordini non archiviati; lo storico resta in tabella)
-- NB: esegui dopo questo il file recreate_view.sql se preferisci,
--     ma qui aggiungiamo il filtro archived = false a monte non è necessario:
--     filtriamo lato frontend per mantenere gli archiviati nei report economici.
