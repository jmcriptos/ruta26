-- Cierra las dos vías de consumo de cuota más fáciles de abusar.
--
-- Esta migración NO borra tablas ni filas. DROP POLICY elimina únicamente la
-- regla que permitía INSERT directo; desde ese momento el cliente registra
-- vistas mediante record_page_view(), con validación y un máximo de 32.000
-- vistas aceptadas por día (2.000 en cada uno de 16 buckets).
--
-- Puede ejecutarse de nuevo: todos los cambios son idempotentes.

begin;

create table if not exists public.page_view_daily_quota (
  day date not null,
  bucket smallint not null check (bucket between 0 and 15),
  accepted integer not null check (accepted between 0 and 2000),
  primary key (day, bucket)
);

alter table public.page_view_daily_quota enable row level security;
revoke all on table public.page_view_daily_quota from public, anon, authenticated;

create or replace function public.record_page_view(
  p_session_id text,
  p_section text,
  p_device text,
  p_standalone boolean,
  p_ref text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
set statement_timeout = '1500ms'
as $function$
declare
  v_bucket smallint;
  v_accepted integer;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9-]{8,40}$' then
    return false;
  end if;
  if p_section is null or p_section not in (
    '#inicio', '#partidos', '#equipos', '#ruta', '#quiniela', '#proyecciones'
  ) then
    return false;
  end if;
  if p_device is null or p_device not in ('mobile', 'desktop') then
    return false;
  end if;
  if p_ref is null or char_length(p_ref) > 80 or p_ref !~ '^[A-Za-z0-9.-]*$' then
    return false;
  end if;

  v_bucket := (hashtextextended(p_session_id, 0) & 15)::smallint;

  insert into public.page_view_daily_quota (day, bucket, accepted)
  values ((now() at time zone 'America/Curacao')::date, v_bucket, 1)
  on conflict (day, bucket) do update
    set accepted = public.page_view_daily_quota.accepted + 1
    where public.page_view_daily_quota.accepted < 2000
  returning accepted into v_accepted;

  if v_accepted is null then
    return false;
  end if;

  insert into public.page_views (session_id, section, device, standalone, ref)
  values (p_session_id, p_section, p_device, coalesce(p_standalone, false), p_ref);
  return true;
end;
$function$;

drop policy if exists "cualquiera registra una vista" on public.page_views;
revoke insert on table public.page_views from public, anon, authenticated;
revoke all on function public.record_page_view(text, text, text, boolean, text) from public;
grant execute on function public.record_page_view(text, text, text, boolean, text) to anon, authenticated;

-- Evita que una consulta pública agregada retenga recursos demasiado tiempo.
alter function public.analytics_rollup(timestamptz) set statement_timeout = '2000ms';

-- Máximo cinco endpoints push por cuenta, incluso con inserciones concurrentes.
create or replace function public.enforce_push_subscription_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

drop trigger if exists enforce_push_subscription_limit on public.push_subscriptions;
create trigger enforce_push_subscription_limit
before insert on public.push_subscriptions
for each row execute function public.enforce_push_subscription_limit();

revoke all on function public.enforce_push_subscription_limit() from public, anon, authenticated;

commit;
