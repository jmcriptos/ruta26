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

-- RPC: valida el nombre del evento contra la allowlist y reusa la cuota diaria
-- por bucket de page_views como anti-abuso. Los campos llegan ya saneados desde
-- el cliente (solo enums cortos allowlisted); se guardan tal cual en jsonb.
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
    ) then
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
  insert into public.engagement_events (session_id, event, fields)
  values (p_session_id, p_event, coalesce(p_fields, '{}'::jsonb));
  return true;
end;
$function$;

revoke insert on table public.engagement_events from public, anon, authenticated;
revoke select on table public.engagement_events from anon, authenticated;
revoke all on function public.record_engagement_event(text, text, jsonb) from public;
grant execute on function public.record_engagement_event(text, text, jsonb) to anon, authenticated;
