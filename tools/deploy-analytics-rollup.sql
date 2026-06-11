-- FASE 1: crea el RPC agregado usado por stats.html.
--
-- Esta consulta NO borra filas, NO elimina tablas y NO cambia el acceso actual
-- a page_views. Si analytics_rollup ya existe, PostgreSQL detendrá la consulta
-- sin modificar datos; usa harden-analytics.sql solo después de verificar.

create function public.analytics_rollup(
  since_at timestamptz default (now() - interval '62 days')
)
returns table (
  day date,
  dimension text,
  value text,
  views bigint,
  sessions bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with params as (
    select
      greatest(coalesce(since_at, now() - interval '62 days'), now() - interval '93 days') as since_at,
      (now() at time zone 'America/Curacao')::date as today
  ),
  bounded as (
    select
      (v.ts at time zone 'America/Curacao')::date as day,
      coalesce(nullif(v.section, ''), '#inicio') as section,
      coalesce(v.device, 'unknown') as device,
      v.standalone,
      v.session_id
    from public.page_views v
    cross join params p
    where v.ts >= p.since_at
      and v.ts < now() + interval '5 minutes'
  ),
  periods(days, kind, start_day, end_day) as (
    select x.days, x.kind, x.start_day, x.end_day
    from params p
    cross join lateral (
      values
        (7,  'current',  p.today - 6,  p.today),
        (7,  'previous', p.today - 13, p.today - 7),
        (14, 'current',  p.today - 13, p.today),
        (14, 'previous', p.today - 27, p.today - 14),
        (30, 'current',  p.today - 29, p.today),
        (30, 'previous', p.today - 59, p.today - 30)
    ) x(days, kind, start_day, end_day)
  )
  select b.day, 'day'::text, 'all'::text, count(*)::bigint, count(distinct b.session_id)::bigint
  from bounded b group by b.day
  union all
  select b.day, 'section'::text, b.section::text, count(*)::bigint, count(distinct b.session_id)::bigint
  from bounded b group by b.day, b.section
  union all
  select b.day, 'device'::text, b.device::text, count(*)::bigint, count(distinct b.session_id)::bigint
  from bounded b group by b.day, b.device
  union all
  select b.day, 'standalone'::text, b.standalone::text, count(*)::bigint, count(distinct b.session_id)::bigint
  from bounded b group by b.day, b.standalone
  union all
  select
    null::date,
    'period'::text,
    (p.days::text || '_' || p.kind)::text,
    count(b.session_id)::bigint,
    count(distinct b.session_id)::bigint
  from periods p
  left join bounded b on b.day between p.start_day and p.end_day
  group by p.days, p.kind;
$function$;

alter function public.analytics_rollup(timestamptz) set statement_timeout = '2000ms';
