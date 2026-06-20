-- Rollup agregado de engagement_events (sin PII): conteos y sesiones distintas
-- por (día, evento) + una fila de total del rango (day = null) para el embudo.
-- Mismo patrón de seguridad que analytics_rollup. Pegar en Supabase SQL Editor → Run.
create or replace function public.engagement_rollup(since_at timestamptz default (now() - interval '62 days'))
returns table (day date, event text, events bigint, sessions bigint)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with params as (
    select greatest(coalesce(since_at, now() - interval '62 days'), now() - interval '93 days') as since_at
  ),
  bounded as (
    select (e.ts at time zone 'America/Curacao')::date as day, e.event, e.session_id
    from public.engagement_events e cross join params p
    where e.ts >= p.since_at and e.ts < now() + interval '5 minutes'
  )
  select b.day, b.event, count(*)::bigint, count(distinct b.session_id)::bigint
    from bounded b group by b.day, b.event
  union all
  select null::date, b.event, count(*)::bigint, count(distinct b.session_id)::bigint
    from bounded b group by b.event;
$function$;
revoke all on function public.engagement_rollup(timestamptz) from public;
grant execute on function public.engagement_rollup(timestamptz) to anon, authenticated;
alter function public.engagement_rollup(timestamptz) set statement_timeout = '2000ms';
