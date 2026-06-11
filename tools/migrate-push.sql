-- Migración: notificaciones push (recordatorio 1h antes si falta el pick).
-- Pegar en Supabase: SQL Editor → New query → Run.

-- Suscripciones push de cada jugador. Un navegador (endpoint) puede tener
-- más de un usuario (dispositivo compartido), por eso la PK es compuesta.
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

-- Impide que una cuenta llene la tabla con endpoints ilimitados.
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

-- Registro de recordatorios ya enviados (dedupe del GitHub Action).
-- Sin políticas: solo la service key del Action lee/escribe.
create table public.push_sent (
  match_id text not null references public.matches(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.push_sent enable row level security;
