-- Verificación de solo lectura tras ejecutar deploy-abuse-guards.sql.

select
  has_function_privilege('anon', 'public.record_page_view(text,text,text,boolean,text)', 'execute')
    as anon_puede_registrar_via_rpc,
  has_table_privilege('anon', 'public.page_views', 'insert')
    as anon_aun_puede_insertar_directo,
  has_table_privilege('anon', 'public.page_view_daily_quota', 'select')
    as anon_puede_leer_cupos;

select
  count(*) as buckets_hoy,
  coalesce(sum(accepted), 0) as vistas_aceptadas_hoy,
  32000 as maximo_diario
from public.page_view_daily_quota
where day = (now() at time zone 'America/Curacao')::date;

select
  tgname as trigger_push_activo
from pg_trigger
where tgrelid = 'public.push_subscriptions'::regclass
  and tgname = 'enforce_push_subscription_limit'
  and not tgisinternal;
