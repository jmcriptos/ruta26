-- Migración a reglas 1X2 + penales. Pegar una vez en el SQL Editor de Supabase.
-- 1) nueva columna para el flag "por penales" en eliminatorias
alter table public.predictions add column if not exists pens boolean not null default false;
-- 2) limpiar predicciones viejas (tenían semántica de marcador; el torneo no ha empezado)
delete from public.predictions;
