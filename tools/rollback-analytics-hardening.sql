-- ROLLBACK de permisos: restaura el acceso anterior de stats.
--
-- No restaura ni elimina filas porque harden-analytics.sql tampoco las toca.

begin;

grant select on table public.page_views to anon, authenticated;

drop policy if exists "las métricas agregadas son públicas" on public.page_views;
create policy "las métricas agregadas son públicas"
  on public.page_views for select using (true);

commit;
