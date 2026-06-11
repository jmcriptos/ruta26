-- Migración: la bandera del campeón se ve en el ranking para todos desde que se elige.
-- Antes, los picks ajenos solo se revelaban tras el cierre (28 JUN 19:00 UTC).
-- Pegar en Supabase: SQL Editor → New query → Run.
-- Nota: insert/update siguen cerrando el 28 JUN; esto solo abre la lectura.

drop policy "ver mi campeón siempre, los ajenos tras el cierre" on public.champion_picks;

create policy "campeones visibles para todos en el ranking"
  on public.champion_picks for select using (true);
