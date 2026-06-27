-- Picks a destiempo para cannobbio24 — jornada final Grupos H e I (26-27 JUN 2026).
-- Se corre en el SQL Editor de Supabase (service role) → omite el cierre por kickoff.
-- Codificación canónica 1X2 RELATIVA AL LOCAL de la ficha FIFA:
--   gana local hg=1 ag=0 · empate hg=0 ag=0 · gana visitante hg=0 ag=1. pens=false (grupos).
--
--   #  match_id    partido (LOCAL vs VISITA)      pick               lado       hg ag
--   1  400021489   Noruega  vs Francia            gana Francia       visitante   0  1
--   2  400021493   Senegal  vs Irak               gana Senegal       local       1  0
--   3  400021484   Uruguay  vs España             gana España        visitante   0  1
--   4  400021485   Cabo Verde vs Arabia Saudí     gana Cabo Verde    local       1  0

insert into public.predictions (user_id, match_id, hg, ag, pens, updated_at)
select p.id, v.match_id, v.hg, v.ag, false, now()
from public.profiles p
cross join (values
  ('400021489', 0, 1),  -- Noruega vs Francia    → gana Francia (visitante)
  ('400021493', 1, 0),  -- Senegal vs Irak       → gana Senegal (local)
  ('400021484', 0, 1),  -- Uruguay vs España     → gana España (visitante)
  ('400021485', 1, 0)   -- Cabo Verde vs Arabia  → gana Cabo Verde (local)
) as v(match_id, hg, ag)
where p.username = 'cannobbio24'
on conflict (user_id, match_id)
  do update set hg = excluded.hg, ag = excluded.ag, pens = excluded.pens, updated_at = now();

-- Verificación: debe devolver 4 filas (hg/ag tal cual la tabla de arriba).
select p.username, pr.match_id, pr.hg, pr.ag, pr.pens, pr.updated_at
from public.predictions pr
join public.profiles p on p.id = pr.user_id
where p.username = 'cannobbio24'
  and pr.match_id in ('400021489', '400021493', '400021484', '400021485')
order by pr.match_id;
