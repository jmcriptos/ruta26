-- Migración: notificaciones push (recordatorio 1h antes si falta el pick).
-- Pegar en Supabase: SQL Editor → New query → Run.

-- Suscripciones push de cada jugador. Un navegador (endpoint) puede tener
-- más de un usuario (dispositivo compartido), por eso la PK es compuesta.
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

-- Registro de recordatorios ya enviados (dedupe del GitHub Action).
-- Sin políticas: solo la service key del Action lee/escribe.
create table public.push_sent (
  match_id text not null references public.matches(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.push_sent enable row level security;
