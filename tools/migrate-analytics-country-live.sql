-- Analytics: país (agregado, sin IP) y usuarios en vivo.
-- Pegar en el SQL Editor de Supabase. Idempotente.

-- 1) Columna país en page_views (código ISO-2 o null). Las visitas previas quedan null.
alter table public.page_views add column if not exists country text
  check (country is null or country ~ '^[A-Z]{2}$');

-- 2) record_page_view ahora acepta p_country (default '' para clientes viejos).
--    Se elimina la firma anterior de 5 args y se crea la de 6.
drop function if exists public.record_page_view(text, text, text, boolean, text);
create or replace function public.record_page_view(
  p_session_id text, p_section text, p_device text, p_standalone boolean,
  p_ref text default '', p_country text default ''
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
set statement_timeout = '1500ms'
as $function$
declare v_bucket smallint; v_accepted integer; v_country text;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9-]{8,40}$'
    or p_section is null or p_section not in ('#inicio', '#partidos', '#equipos', '#ruta', '#quiniela', '#proyecciones')
    or p_device is null or p_device not in ('mobile', 'desktop')
    or p_ref is null or char_length(p_ref) > 80 or p_ref !~ '^[A-Za-z0-9.-]*$' then
    return false;
  end if;
  v_country := case when p_country ~ '^[A-Z]{2}$' then p_country else null end;
  v_bucket := (hashtextextended(p_session_id, 0) & 15)::smallint;
  insert into public.page_view_daily_quota (day, bucket, accepted)
  values ((now() at time zone 'America/Curacao')::date, v_bucket, 1)
  on conflict (day, bucket) do update
    set accepted = public.page_view_daily_quota.accepted + 1
    where public.page_view_daily_quota.accepted < 2000
  returning accepted into v_accepted;
  if v_accepted is null then return false; end if;
  insert into public.page_views (session_id, section, device, standalone, ref, country)
  values (p_session_id, p_section, p_device, coalesce(p_standalone, false), p_ref, v_country);
  return true;
end;
$function$;
revoke all on function public.record_page_view(text, text, text, boolean, text, text) from public;
grant execute on function public.record_page_view(text, text, text, boolean, text, text) to anon, authenticated;

-- 3) analytics_rollup suma la dimensión 'country' (solo países válidos; sin "Desconocido").
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
      coalesce(v.device, 'unknown') as device, v.standalone, v.country, v.session_id
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
  union all select b.day, 'country'::text, b.country::text, count(*)::bigint, count(distinct b.session_id)::bigint
    from bounded b where b.country ~ '^[A-Z]{2}$' group by b.day, b.country
  union all select null::date, 'period'::text, (p.days::text || '_' || p.kind)::text,
    count(b.session_id)::bigint, count(distinct b.session_id)::bigint
    from periods p left join bounded b on b.day between p.start_day and p.end_day group by p.days, p.kind;
$function$;
revoke all on function public.analytics_rollup(timestamptz) from public;
grant execute on function public.analytics_rollup(timestamptz) to anon, authenticated;
alter function public.analytics_rollup(timestamptz) set statement_timeout = '2000ms';

-- 4) analytics_live: sesiones distintas con actividad en los últimos 5 minutos.
create or replace function public.analytics_live()
returns integer language sql stable security definer set search_path = public, pg_temp
as $function$
  select count(distinct session_id)::integer from public.page_views
  where ts > now() - interval '5 minutes';
$function$;
revoke all on function public.analytics_live() from public;
grant execute on function public.analytics_live() to anon, authenticated;
alter function public.analytics_live() set statement_timeout = '1500ms';
