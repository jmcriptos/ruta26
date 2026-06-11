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

create or replace function public.enforce_push_subscription_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = new.user_id and endpoint = new.endpoint
  ) and (
    select count(*) from public.push_subscriptions where user_id = new.user_id
  ) >= 5 then
    raise exception 'máximo de 5 suscripciones push por usuario'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;
create trigger enforce_push_subscription_limit
before insert on public.push_subscriptions
for each row execute function public.enforce_push_subscription_limit();
revoke all on function public.enforce_push_subscription_limit() from public, anon, authenticated;

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

create index page_views_ts_idx on public.page_views (ts);

create table public.page_view_daily_quota (
  day date not null,
  bucket smallint not null check (bucket between 0 and 15),
  accepted integer not null check (accepted between 0 and 2000),
  primary key (day, bucket)
);
alter table public.page_view_daily_quota enable row level security;
revoke all on table public.page_view_daily_quota from public, anon, authenticated;

create or replace function public.record_page_view(
  p_session_id text, p_section text, p_device text, p_standalone boolean, p_ref text default ''
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
set statement_timeout = '1500ms'
as $function$
declare v_bucket smallint; v_accepted integer;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9-]{8,40}$'
    or p_section is null or p_section not in ('#inicio', '#partidos', '#equipos', '#ruta', '#quiniela', '#proyecciones')
    or p_device is null or p_device not in ('mobile', 'desktop')
    or p_ref is null or char_length(p_ref) > 80 or p_ref !~ '^[A-Za-z0-9.-]*$' then
    return false;
  end if;
  v_bucket := (hashtextextended(p_session_id, 0) & 15)::smallint;
  insert into public.page_view_daily_quota (day, bucket, accepted)
  values ((now() at time zone 'America/Curacao')::date, v_bucket, 1)
  on conflict (day, bucket) do update
    set accepted = public.page_view_daily_quota.accepted + 1
    where public.page_view_daily_quota.accepted < 2000
  returning accepted into v_accepted;
  if v_accepted is null then return false; end if;
  insert into public.page_views (session_id, section, device, standalone, ref)
  values (p_session_id, p_section, p_device, coalesce(p_standalone, false), p_ref);
  return true;
end;
$function$;
revoke insert on table public.page_views from public, anon, authenticated;
revoke all on function public.record_page_view(text, text, text, boolean, text) from public;
grant execute on function public.record_page_view(text, text, text, boolean, text) to anon, authenticated;

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
alter function public.analytics_rollup(timestamptz) set statement_timeout = '2000ms';
