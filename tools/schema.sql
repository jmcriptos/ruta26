-- Quiniela Ruta 26 · esquema + reglas del juego (RLS)
-- Pegar una vez en Supabase: SQL Editor → New query → Run.

-- 1) Perfiles (sin datos personales: solo username)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "perfiles visibles para el ranking"
  on public.profiles for select using (true);
create policy "cada quien crea su perfil"
  on public.profiles for insert with check (auth.uid() = id);

-- 2) Partidos de referencia (fuente de verdad de los cierres)
create table public.matches (
  id text primary key,
  kickoff_at timestamptz not null,
  stage text not null
);
alter table public.matches enable row level security;

create policy "partidos visibles"
  on public.matches for select using (true);
-- sin políticas de escritura: solo se cargan via SQL Editor (service role)

-- 3) Predicciones de marcador
create table public.predictions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  hg smallint not null check (hg between 0 and 99),
  ag smallint not null check (ag between 0 and 99),
  pens boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
alter table public.predictions enable row level security;

create policy "ver mis picks siempre, los ajenos tras el kickoff"
  on public.predictions for select using (
    user_id = auth.uid()
    or (select kickoff_at from public.matches m where m.id = match_id) <= now()
  );
create policy "crear pick solo mío y antes del kickoff"
  on public.predictions for insert with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
create policy "editar pick solo mío y antes del kickoff"
  on public.predictions for update
  using (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  )
  with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );

-- 4) Pick de campeón (cierra al inicio de los 16avos)
create table public.champion_picks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  team_id text not null check (team_id ~ '^[0-9]{1,12}$'),
  updated_at timestamptz not null default now()
);
alter table public.champion_picks enable row level security;

create policy "campeones visibles para todos en el ranking"
  on public.champion_picks for select using (true);
create policy "elegir campeón antes del cierre"
  on public.champion_picks for insert with check (
    user_id = auth.uid() and now() < timestamptz '2026-06-28T19:00:00Z'
  );
create policy "cambiar campeón antes del cierre"
  on public.champion_picks for update
  using (
    user_id = auth.uid() and now() < timestamptz '2026-06-28T19:00:00Z'
  )
  with check (
    user_id = auth.uid() and now() < timestamptz '2026-06-28T19:00:00Z'
  );

-- 5) Suscripciones push (recordatorio 1h antes si falta el pick)
create table public.push_subscriptions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;

create policy "cada quien ve sus suscripciones"
  on public.push_subscriptions for select using (user_id = auth.uid());
create policy "cada quien crea su suscripción"
  on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "cada quien actualiza su suscripción"
  on public.push_subscriptions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cada quien borra su suscripción"
  on public.push_subscriptions for delete using (user_id = auth.uid());

-- 6) Registro de recordatorios enviados (dedupe; solo service role, sin políticas)
create table public.push_sent (
  match_id text not null references public.matches(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.push_sent enable row level security;
