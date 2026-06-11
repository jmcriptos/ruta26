-- FASE 2: verificación de solo lectura.
--
-- Ejecuta esto después de deploy-analytics-rollup.sql. No modifica nada.
-- Guarda o toma captura del resultado "inventario_page_views" para comparar.

select
  count(*) as filas,
  count(distinct session_id) as sesiones,
  min(ts) as primera_vista,
  max(ts) as ultima_vista
from public.page_views;

select
  dimension,
  value,
  views,
  sessions
from public.analytics_rollup(now() - interval '62 days')
where dimension = 'period'
order by value;

select
  has_function_privilege('anon', 'public.analytics_rollup(timestamptz)', 'execute') as anon_puede_ejecutar_rpc,
  has_table_privilege('anon', 'public.page_views', 'select') as anon_aun_puede_leer_crudo;
