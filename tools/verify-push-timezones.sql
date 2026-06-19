-- Verificación de solo lectura tras ejecutar deploy-push-timezones.sql.

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'push_subscriptions'
      and column_name = 'timezone'
  ) as columna_timezone_activa,
  count(*) filter (where timezone is not null) as dispositivos_con_zona,
  count(*) filter (where timezone is null) as dispositivos_pendientes
from public.push_subscriptions;
