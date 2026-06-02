-- ============================================================
-- JPROD — RICREA VIEW orders_with_totals
-- Eseguire su Supabase SQL Editor ogni volta che si aggiunge
-- una colonna alla tabella orders o alle tabelle collegate.
-- ============================================================

DROP VIEW IF EXISTS orders_with_totals;
CREATE VIEW orders_with_totals
WITH (security_invoker = true)
AS
SELECT
  o.*,
  b.name                                              AS brand_name,
  pl.name                                             AS line_name,
  ROUND(COALESCE(pl.available_hours_per_day,0) * 60 * COALESCE(pl.efficiency,1))
                                                      AS line_capacity_minutes,
  p.time_per_piece                                    AS time_per_piece,
  p.selling_price                                     AS selling_price,

  -- Quantità prodotta e avanzamento (da production_log)
  COALESCE(log_agg.total_produced, 0)                AS quantity_produced,
  GREATEST(o.quantity - COALESCE(log_agg.total_produced, 0), 0)
                                                      AS quantity_remaining,
  ROUND(
    COALESCE(log_agg.total_produced, 0)::numeric
    / NULLIF(o.quantity, 0) * 100, 1
  )                                                   AS progress_pct,

  -- Quantità pianificata (da order_line_assignments)
  COALESCE(plan_agg.total_assigned, 0)               AS quantity_assigned,

  -- Consuntivo economico (basato su production_log reale)
  -- Costo = SUM(pz_prodotti * time_per_piece/60 * hourly_cost_linea)
  COALESCE(log_agg.total_cost, 0)                    AS costo_produzione,
  -- Ricavo = pz_prodotti * prezzo_vendita
  COALESCE(log_agg.total_produced, 0) * COALESCE(p.selling_price, 0)
                                                      AS ricavo_produzione,

  -- Forecast economico (basato su order_line_assignments pianificate)
  -- Costo previsto = SUM(pz_pianificati * time_per_piece/60 * hourly_cost_linea)
  COALESCE(plan_agg.total_forecast_cost, 0)          AS forecast_costo,
  -- Ricavo previsto = pz_pianificati * prezzo_vendita
  COALESCE(plan_agg.total_assigned, 0) * COALESCE(p.selling_price, 0)
                                                      AS forecast_ricavo

FROM orders o
LEFT JOIN brands            b   ON b.id  = o.brand_id
LEFT JOIN production_lines  pl  ON pl.id = o.assigned_line_id
LEFT JOIN products          p   ON p.id  = o.product_id

-- Subquery consuntivo: aggrega log per ordine con costi reali
LEFT JOIN (
  SELECT
    lg.order_id,
    SUM(lg.produced_qt)                                        AS total_produced,
    SUM(
      lg.produced_qt
      * COALESCE(p2.time_per_piece, 0) / 60.0
      * COALESCE(ln.hourly_cost, 0)
    )                                                          AS total_cost
  FROM production_log lg
  JOIN orders o2 ON o2.id = lg.order_id
  LEFT JOIN products p2 ON p2.id = o2.product_id
  LEFT JOIN production_lines ln ON ln.id = lg.line_id
  GROUP BY lg.order_id
) log_agg ON log_agg.order_id = o.id

-- Subquery forecast: aggrega pianificazione per ordine con costi previsti
LEFT JOIN (
  SELECT
    ola.order_id,
    SUM(ola.quantity_assigned)                                 AS total_assigned,
    SUM(
      ola.quantity_assigned
      * COALESCE(p3.time_per_piece, 0) / 60.0
      * COALESCE(ln2.hourly_cost, 0)
    )                                                          AS total_forecast_cost
  FROM order_line_assignments ola
  JOIN orders o3 ON o3.id = ola.order_id
  LEFT JOIN products p3 ON p3.id = o3.product_id
  LEFT JOIN production_lines ln2 ON ln2.id = ola.line_id
  GROUP BY ola.order_id
) plan_agg ON plan_agg.order_id = o.id

GROUP BY
  o.id, b.name, pl.name, pl.available_hours_per_day, pl.efficiency,
  p.time_per_piece, p.selling_price,
  log_agg.total_produced, log_agg.total_cost,
  plan_agg.total_assigned, plan_agg.total_forecast_cost;

-- Permessi API
GRANT SELECT ON orders_with_totals TO authenticated;
GRANT SELECT ON orders_with_totals TO anon;

-- ============================================================
-- VERIFICA — esegui dopo la creazione per controllare i campi
-- ============================================================
SELECT
  order_code,
  product,
  sku,
  commessa_code,
  order_description,
  quantity,
  quantity_produced,
  quantity_remaining,
  progress_pct,
  ROUND(costo_produzione::numeric, 2) AS costo,
  ROUND(ricavo_produzione::numeric, 2) AS ricavo,
  ROUND((ricavo_produzione - costo_produzione)::numeric, 2) AS margine
FROM orders_with_totals
LIMIT 5;
