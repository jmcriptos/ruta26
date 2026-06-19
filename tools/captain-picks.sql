-- Capitán de eliminatorias: 1 por día (unique user+match_day), multiplica x3 los
-- puntos base del partido. RLS calcada de predictions. Pegar en Supabase SQL Editor.
create table public.captain_picks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  match_day date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id),
  unique (user_id, match_day)
);
alter table public.captain_picks enable row level security;

create policy "ver mi capitán siempre, ajenos tras el kickoff"
  on public.captain_picks for select using (
    user_id = auth.uid()
    or (select kickoff_at from public.matches m where m.id = match_id) <= now()
  );
create policy "crear capitán solo mío y antes del kickoff"
  on public.captain_picks for insert with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
create policy "editar capitán solo mío y antes del kickoff"
  on public.captain_picks for update
  using (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  )
  with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
create policy "borrar mi capitán antes del kickoff"
  on public.captain_picks for delete using (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
