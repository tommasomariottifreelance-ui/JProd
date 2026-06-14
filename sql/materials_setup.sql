-- ============================================================
-- JPROD — Tabella materiali per ordine (fotografia da import)
-- ============================================================

CREATE TABLE IF NOT EXISTS order_materials (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  client_id     bigint REFERENCES public.clients(id),
  order_code    text NOT NULL,              -- Nr. ordine produzione (OPR)
  category_code text,                       -- Codice categoria articolo (MP-01, MP-30...)
  material_code text,                       -- Nr. articolo
  material_desc text,                       -- Descrizione
  color_desc    text,                       -- Descrizione colore
  qty_base      numeric DEFAULT 0,          -- Quantità (base) — quanto serve
  qty_inevaso   numeric DEFAULT 0,          -- Qtà inevasa (base) — quanto manca
  supplier_nr   text                        -- Nr. Fornitore
);

ALTER TABLE order_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select" ON order_materials;
DROP POLICY IF EXISTS "tenant_insert" ON order_materials;
DROP POLICY IF EXISTS "tenant_delete" ON order_materials;

CREATE POLICY "tenant_select" ON order_materials
  FOR SELECT TO authenticated USING (client_id = get_my_client_id());
CREATE POLICY "tenant_insert" ON order_materials
  FOR INSERT TO authenticated WITH CHECK (client_id = get_my_client_id());
CREATE POLICY "tenant_delete" ON order_materials
  FOR DELETE TO authenticated USING (client_id = get_my_client_id());

-- Indice per join veloce con orders
CREATE INDEX IF NOT EXISTS order_materials_code_idx
  ON order_materials(order_code, client_id);

GRANT SELECT, INSERT, DELETE ON order_materials TO authenticated;
