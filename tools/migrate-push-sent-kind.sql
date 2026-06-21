-- Migración: push_sent.kind
-- Permite que un usuario reciba el push de % (kind='summary') y, en otro slot del día,
-- uno de oportunidad (kind='opportunity') para el mismo partido sin pisarse el dedupe.
-- Antes el PK era (match_id, user_id) → un solo push por partido/usuario.
-- Idempotente: se puede correr varias veces.
-- APLICAR EN SUPABASE ANTES de desplegar el nuevo send-push-reminders.js
-- (el INSERT del cron ahora incluye la columna kind).

alter table public.push_sent
  add column if not exists kind text not null default 'opportunity';

-- Reemplaza el PK (match_id, user_id) por un unique que incluye kind.
alter table public.push_sent drop constraint if exists push_sent_pkey;

create unique index if not exists push_sent_match_user_kind
  on public.push_sent (match_id, user_id, kind);
