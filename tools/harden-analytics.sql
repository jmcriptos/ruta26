-- FASE 3: cierra la lectura pública de analytics crudo.
--
-- Este archivo NO borra filas ni tablas. DROP POLICY elimina únicamente una
-- regla de acceso; REVOKE elimina únicamente permisos de lectura.
--
-- Requisitos:
-- 1. deploy-analytics-rollup.sql ya fue ejecutado.
-- 2. verify-analytics-rollup.sql mostró conteos correctos.
-- 3. stats.html carga correctamente usando el RPC.
--
-- Todo ocurre en una transacción: si una comprobación falla, se revierte.

begin;

do $$
begin
  if to_regprocedure('public.analytics_rollup(timestamptz)') is null then
    raise exception 'Falta analytics_rollup; ejecuta primero deploy-analytics-rollup.sql';
  end if;
  if not exists (select 1 from public.page_views limit 1) then
    raise notice 'page_views está vacía; se cerrarán permisos igualmente';
  end if;
end
$$;

drop policy if exists "las métricas agregadas son públicas" on public.page_views;
revoke select on table public.page_views from anon, authenticated;
revoke all on function public.analytics_rollup(timestamptz) from public;
grant execute on function public.analytics_rollup(timestamptz) to anon, authenticated;

commit;
