-- Pick a destiempo: jeansuarez en Chequia vs Sudáfrica (#25, Grupo A).
-- match_id 400021440 · kickoff 2026-06-18T16:00:00Z (ya cerrado por RLS).
-- Se corre en el SQL Editor de Supabase (service role) → omite el cierre por kickoff.
-- Pick: gana Chequia (local) → codificación canónica hg=1, ag=0, pens=false.

insert into public.predictions (user_id, match_id, hg, ag, pens, updated_at)
select p.id, '400021440', 1, 0, false, now()
from public.profiles p
where p.username = 'jeansuarez'
on conflict (user_id, match_id)
  do update set hg = excluded.hg, ag = excluded.ag, pens = excluded.pens, updated_at = now();

-- Verificación: debe devolver 1 fila con hg=1, ag=0.
select pr.user_id, pr.match_id, pr.hg, pr.ag, pr.pens, pr.updated_at
from public.predictions pr
join public.profiles p on p.id = pr.user_id
where p.username = 'jeansuarez' and pr.match_id = '400021440';
