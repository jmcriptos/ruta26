-- Marcador exacto en eliminatorias (Mundial 2026).
-- A partir de ahora el pick de KO es un MARCADOR completo (hg/ag = goles 90/120').
-- Cuando el marcador predicho es empate (va a penales) hace falta guardar a quién
-- cree el jugador que avanza: esa es la columna 'adv' ('home' | 'away', nullable).
-- En picks que NO son empate, adv puede quedar null (el avance se deriva del signo).
--
-- Migración ADITIVA y de bajo riesgo: columna nullable, las filas existentes
-- (grupos) quedan con adv = null. La RLS de predictions ya cubre la columna nueva.
-- Pegar en el SQL Editor del proyecto correcto (wwzgpifvfmogjttwstxy) ANTES de
-- desplegar el JS.

alter table public.predictions
  add column if not exists adv text
  check (adv is null or adv in ('home', 'away'));
