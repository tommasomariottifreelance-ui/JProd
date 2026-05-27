-- ============================================================
-- JPROD - REFACTORING DB
-- Eseguire tutto in una volta nell'SQL Editor di Supabase
-- ============================================================

-- ------------------------------------------------------------
-- 1. AGGIUNTA client_id A TUTTE LE TABELLE
-- ------------------------------------------------------------
ALTER TABLE brands         ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id);
ALTER TABLE products       ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id);
ALTER TABLE production_lines ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id);
ALTER TABLE orders         ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id);
ALTER TABLE production_log ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id);

-- ------------------------------------------------------------
-- 2. REFACTORING users_profiles
--    Collega il profilo all'utente Auth di Supabase tramite UUID
-- ------------------------------------------------------------
ALTER TABLE users_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indice per velocizzare la lookup auth.uid() -> client_id
CREATE UNIQUE INDEX IF NOT EXISTS users_profiles_user_id_idx ON users_profiles(user_id);

-- ------------------------------------------------------------
-- 3. RIMOZIONE quantity_remaining (dato calcolato = ridondanza)
-- ------------------------------------------------------------
ALTER TABLE orders DROP COLUMN IF EXISTS quantity_remaining;

-- ------------------------------------------------------------
-- 4. VIEW orders_with_totals
--    Calcola dinamicamente prodotto e rimanente da production_log
-- ------------------------------------------------------------
DROP VIEW IF EXISTS orders_with_totals;
CREATE VIEW orders_with_totals AS
SELECT
  o.*,
  b.name                                    AS brand_name,
  pl.name                                   AS line_name,
  COALESCE(SUM(lg.produced_qt), 0)          AS quantity_produced,
  GREATEST(o.quantity - COALESCE(SUM(lg.produced_qt), 0), 0) AS quantity_remaining,
  ROUND(
    COALESCE(SUM(lg.produced_qt), 0)::numeric
    / NULLIF(o.quantity, 0) * 100, 1
  )                                         AS progress_pct
FROM orders o
LEFT JOIN brands          b  ON b.id  = o.brand_id
LEFT JOIN production_lines pl ON pl.id = o.assigned_line_id
LEFT JOIN production_log  lg ON lg.order_id = o.id
GROUP BY o.id, b.name, pl.name;

-- ------------------------------------------------------------
-- 5. FUNZIONE HELPER: recupera client_id dall'utente loggato
--    Usata internamente dalle RLS policy (evita subquery ripetute)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_client_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT client_id
  FROM public.users_profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 6. ATTIVAZIONE RLS SU TUTTE LE TABELLE
-- ------------------------------------------------------------
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_profiles   ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 7. RIMOZIONE POLICY ESISTENTI (pulizia)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_all" ON brands;
DROP POLICY IF EXISTS "auth_all" ON products;
DROP POLICY IF EXISTS "auth_all" ON production_lines;
DROP POLICY IF EXISTS "auth_all" ON orders;
DROP POLICY IF EXISTS "auth_all" ON production_log;
DROP POLICY IF EXISTS "auth_all" ON clients;

-- ------------------------------------------------------------
-- 8. POLICY RLS MULTI-TENANT
--    Ogni utente vede e modifica SOLO i dati del proprio client_id
-- ------------------------------------------------------------

-- CLIENTS: un utente vede solo il proprio client
CREATE POLICY "tenant_select" ON clients
  FOR SELECT TO authenticated
  USING (id = get_my_client_id());

-- BRANDS
CREATE POLICY "tenant_select" ON brands
  FOR SELECT TO authenticated
  USING (client_id = get_my_client_id());

CREATE POLICY "tenant_insert" ON brands
  FOR INSERT TO authenticated
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_update" ON brands
  FOR UPDATE TO authenticated
  USING (client_id = get_my_client_id())
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_delete" ON brands
  FOR DELETE TO authenticated
  USING (client_id = get_my_client_id());

-- PRODUCTS
CREATE POLICY "tenant_select" ON products
  FOR SELECT TO authenticated
  USING (client_id = get_my_client_id());

CREATE POLICY "tenant_insert" ON products
  FOR INSERT TO authenticated
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_update" ON products
  FOR UPDATE TO authenticated
  USING (client_id = get_my_client_id())
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_delete" ON products
  FOR DELETE TO authenticated
  USING (client_id = get_my_client_id());

-- PRODUCTION_LINES
CREATE POLICY "tenant_select" ON production_lines
  FOR SELECT TO authenticated
  USING (client_id = get_my_client_id());

CREATE POLICY "tenant_insert" ON production_lines
  FOR INSERT TO authenticated
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_update" ON production_lines
  FOR UPDATE TO authenticated
  USING (client_id = get_my_client_id())
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_delete" ON production_lines
  FOR DELETE TO authenticated
  USING (client_id = get_my_client_id());

-- ORDERS
CREATE POLICY "tenant_select" ON orders
  FOR SELECT TO authenticated
  USING (client_id = get_my_client_id());

CREATE POLICY "tenant_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_update" ON orders
  FOR UPDATE TO authenticated
  USING (client_id = get_my_client_id())
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_delete" ON orders
  FOR DELETE TO authenticated
  USING (client_id = get_my_client_id());

-- PRODUCTION_LOG
CREATE POLICY "tenant_select" ON production_log
  FOR SELECT TO authenticated
  USING (client_id = get_my_client_id());

CREATE POLICY "tenant_insert" ON production_log
  FOR INSERT TO authenticated
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_update" ON production_log
  FOR UPDATE TO authenticated
  USING (client_id = get_my_client_id())
  WITH CHECK (client_id = get_my_client_id());

CREATE POLICY "tenant_delete" ON production_log
  FOR DELETE TO authenticated
  USING (client_id = get_my_client_id());

-- USERS_PROFILES: ogni utente vede solo il proprio profilo
CREATE POLICY "own_profile" ON users_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 9. TRIGGER: popola automaticamente users_profiles
--    quando un nuovo utente si registra via Supabase Auth
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users_profiles (user_id, role)
  VALUES (NEW.id, 'operator')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- 10. PERMESSI VIEW orders_with_totals
--     Necessario per esporre la VIEW tramite API Supabase
-- ------------------------------------------------------------
GRANT SELECT ON orders_with_totals TO authenticated;
GRANT SELECT ON orders_with_totals TO anon;

-- ------------------------------------------------------------
-- 11. Aggiorna VIEW con minuti disponibili effettivi per linea
--     capacity_minutes = available_hours_per_day * 60 * efficiency
-- ------------------------------------------------------------
DROP VIEW IF EXISTS orders_with_totals;
CREATE VIEW orders_with_totals AS
SELECT
  o.*,
  b.name                                              AS brand_name,
  pl.name                                             AS line_name,
  ROUND(COALESCE(pl.available_hours_per_day, 0) * 60 * COALESCE(pl.efficiency, 1))
                                                      AS line_capacity_minutes,
  COALESCE(SUM(lg.produced_qt), 0)                   AS quantity_produced,
  GREATEST(o.quantity - COALESCE(SUM(lg.produced_qt), 0), 0) AS quantity_remaining,
  ROUND(
    COALESCE(SUM(lg.produced_qt), 0)::numeric
    / NULLIF(o.quantity, 0) * 100, 1
  )                                                   AS progress_pct
FROM orders o
LEFT JOIN brands           b  ON b.id  = o.brand_id
LEFT JOIN production_lines pl ON pl.id = o.assigned_line_id
LEFT JOIN production_log   lg ON lg.order_id = o.id
GROUP BY o.id, b.name, pl.name, pl.available_hours_per_day, pl.efficiency;

GRANT SELECT ON orders_with_totals TO authenticated;
GRANT SELECT ON orders_with_totals TO anon;
