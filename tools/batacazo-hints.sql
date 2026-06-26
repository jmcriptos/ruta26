-- Velo "pista gruesa" del Batacazo (Mundial 2026).
-- Devuelve, por cada partido KO que AÚN NO arranca, una banda gruesa de cuánta
-- gente va con cada lado (home/away), SIN revelar % exacto ni picks individuales.
-- Es un agregado security-definer: lee todas las predicciones saltándose la RLS
-- (que oculta los picks ajenos hasta el kickoff) pero solo expone 3 bandas.
-- Guarda de privacidad: con menos de 5 picks devuelve 'na' (sin pista), para no
-- delatar nada con muestras chicas (la liga es de ~15 personas).
--
-- Bandas (fracción de la liga que va con ese lado):
--   'few'   < 25%  → ir con este lado es contracorriente → batacazo grande potencial
--   'split' 25–65% → pick dividido
--   'most'  ≥ 65%  → la mayoría → batacazo chico/cero
--   'na'    muestra < 5 → sin pista todavía
--
-- Requiere la columna predictions.adv (correr add-adv-column.sql primero).
-- Pegar en el SQL Editor de Supabase ANTES de desplegar el JS (game.js?v=...).

create or replace function public.batacazo_hints()
returns table (match_id text, home_band text, away_band text)
language sql
stable
security definer
set search_path = public
as $$
  with tally as (
    -- el lado que avanza: local si gana en 90', visitante si pierde, y en empate
    -- lo define adv (penales). Picks de empate sin adv no cuentan para la pista.
    select p.match_id,
           count(*) filter (where p.hg > p.ag or (p.hg = p.ag and p.adv = 'home')) as home_n,
           count(*) filter (where p.hg < p.ag or (p.hg = p.ag and p.adv = 'away')) as away_n
    from public.predictions p
    join public.matches m on m.id = p.match_id
    where m.stage in ('r32', 'r16', 'qf', 'sf')
      and m.kickoff_at > now()
    group by p.match_id
  )
  select t.match_id,
         case when (t.home_n + t.away_n) < 5 then 'na'
              when t.home_n::numeric / (t.home_n + t.away_n) < 0.25 then 'few'
              when t.home_n::numeric / (t.home_n + t.away_n) >= 0.65 then 'most'
              else 'split' end as home_band,
         case when (t.home_n + t.away_n) < 5 then 'na'
              when t.away_n::numeric / (t.home_n + t.away_n) < 0.25 then 'few'
              when t.away_n::numeric / (t.home_n + t.away_n) >= 0.65 then 'most'
              else 'split' end as away_band
  from tally t;
$$;

-- Solo jugadores autenticados; nunca el rol anónimo.
revoke all on function public.batacazo_hints() from public, anon;
grant execute on function public.batacazo_hints() to authenticated;
