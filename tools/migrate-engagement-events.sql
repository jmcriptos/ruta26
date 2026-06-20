-- Eventos del loop de engagement (agregados, sin PII). Mismo modelo de seguridad
-- que page_views: INSERT solo vía RPC validado + rate limit; sin SELECT para anon.
-- Pegar en Supabase SQL Editor → Run.

create table if not exists public.engagement_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  session_id text not null check (char_length(session_id) <= 40),
  event text not null check (event ~ '^[a-z_]{1,40}$'),
  fields jsonb not null default '{}'::jsonb
);
alter table public.engagement_events enable row level security;
create index if not exists engagement_events_ts_idx on public.engagement_events (ts);

-- Cuota diaria PROPIA por bucket (no comparte la de page_views: los eventos del
-- loop son mucho más frecuentes y agotarían el contador de visitas). Cap alto.
create table if not exists public.engagement_event_daily_quota (
  day date not null,
  bucket smallint not null check (bucket between 0 and 15),
  accepted integer not null check (accepted between 0 and 20000),
  primary key (day, bucket)
);
alter table public.engagement_event_daily_quota enable row level security;
revoke all on table public.engagement_event_daily_quota from public, anon, authenticated;

-- RPC: valida nombre del evento contra la allowlist y el tamaño de p_fields
-- (anti-abuso server-side, no solo cliente), con cuota diaria propia. Los campos
-- llegan saneados desde el cliente (enums cortos allowlisted); se guardan en jsonb.
create or replace function public.record_engagement_event(
  p_session_id text, p_event text, p_fields jsonb default '{}'::jsonb
)
returns boolean language plpgsql security definer set search_path = public, pg_temp
set statement_timeout = '1500ms'
as $function$
declare v_bucket smallint; v_accepted integer;
begin
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9-]{8,40}$'
    or p_event is null or p_event not in (
      'opportunity_viewed', 'opportunity_cta_clicked', 'prediction_submitted',
      'locked_predictions_viewed', 'live_ranking_viewed', 'post_match_summary_viewed',
      'share_summary_clicked', 'whatsapp_copy_clicked',
      'push_prompt_seen', 'push_enabled', 'push_dismissed', 'push_reminder_clicked'
    )
    or (p_fields is not null and (
      pg_column_size(p_fields) > 400
      or (select count(*) from jsonb_object_keys(p_fields)) > 6
    )) then
    return false;
  end if;
  v_bucket := (hashtextextended(p_session_id, 0) & 15)::smallint;
  insert into public.engagement_event_daily_quota (day, bucket, accepted)
  values ((now() at time zone 'America/Curacao')::date, v_bucket, 1)
  on conflict (day, bucket) do update
    set accepted = public.engagement_event_daily_quota.accepted + 1
    where public.engagement_event_daily_quota.accepted < 20000
  returning accepted into v_accepted;
  if v_accepted is null then return false; end if;
  insert into public.engagement_events (session_id, event, fields)
  values (p_session_id, p_event, coalesce(p_fields, '{}'::jsonb));
  return true;
end;
$function$;

revoke insert on table public.engagement_events from public, anon, authenticated;
revoke select on table public.engagement_events from anon, authenticated;
revoke all on function public.record_engagement_event(text, text, jsonb) from public;
grant execute on function public.record_engagement_event(text, text, jsonb) to anon, authenticated;
