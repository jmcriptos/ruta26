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
  endpoint text not null check (char_length(endpoint) between 1 and 2048 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 1 and 256),
  auth text not null check (char_length(auth) between 1 and 256),
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

-- 7) Analytics de visitas propio (sin cookies ni PII; sección vista por sesión anónima)
create table public.page_views (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  session_id text not null check (char_length(session_id) <= 40),
  section text check (char_length(section) <= 40),
  device text check (device in ('mobile', 'desktop')),
  standalone boolean not null default false,
  ref text check (char_length(ref) <= 80)
);
alter table public.page_views enable row level security;

create policy "cualquiera registra una vista"
  on public.page_views for insert with check (true);

create index page_views_ts_idx on public.page_views (ts);

-- Métricas públicas agregadas; nunca devuelve session_id ni filas individuales.
create or replace function public.analytics_rollup(since_at timestamptz default (now() - interval '62 days'))
returns table (day date, dimension text, value text, views bigint, sessions bigint)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with params as (
    select greatest(coalesce(since_at, now() - interval '62 days'), now() - interval '93 days') as since_at,
      (now() at time zone 'America/Curacao')::date as today
  ),
  bounded as (
    select (v.ts at time zone 'America/Curacao')::date as day,
      coalesce(nullif(v.section, ''), '#inicio') as section,
      coalesce(v.device, 'unknown') as device, v.standalone, v.session_id
    from public.page_views v cross join params p
    where v.ts >= p.since_at and v.ts < now() + interval '5 minutes'
  ),
  periods(days, kind, start_day, end_day) as (
    select x.days, x.kind, x.start_day, x.end_day from params p cross join lateral (values
      (7, 'current', p.today - 6, p.today), (7, 'previous', p.today - 13, p.today - 7),
      (14, 'current', p.today - 13, p.today), (14, 'previous', p.today - 27, p.today - 14),
      (30, 'current', p.today - 29, p.today), (30, 'previous', p.today - 59, p.today - 30)
    ) x(days, kind, start_day, end_day)
  )
  select b.day, 'day'::text, 'all'::text, count(*)::bigint, count(distinct b.session_id)::bigint from bounded b group by b.day
  union all select b.day, 'section'::text, b.section::text, count(*)::bigint, count(distinct b.session_id)::bigint from bounded b group by b.day, b.section
  union all select b.day, 'device'::text, b.device::text, count(*)::bigint, count(distinct b.session_id)::bigint from bounded b group by b.day, b.device
  union all select b.day, 'standalone'::text, b.standalone::text, count(*)::bigint, count(distinct b.session_id)::bigint from bounded b group by b.day, b.standalone
  union all select null::date, 'period'::text, (p.days::text || '_' || p.kind)::text,
    count(b.session_id)::bigint, count(distinct b.session_id)::bigint
    from periods p left join bounded b on b.day between p.start_day and p.end_day group by p.days, p.kind;
$function$;

revoke select on table public.page_views from anon, authenticated;
revoke all on function public.analytics_rollup(timestamptz) from public;
grant execute on function public.analytics_rollup(timestamptz) to anon, authenticated;
