-- Migración: analytics de visitas propio (sin cookies, sin identidad).
-- Pegar en Supabase: SQL Editor → New query → Run.
-- Cada fila es "una sección vista": timestamp, sesión anónima aleatoria,
-- sección, tipo de dispositivo y si es la PWA instalada. Sin PII.

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

create policy "cualquiera registra una vista"
  on public.page_views for insert with check (true);
create policy "las métricas agregadas son públicas"
  on public.page_views for select using (true);
-- sin update/delete: las vistas son inmutables (solo service role limpia)

create index page_views_ts_idx on public.page_views (ts);
