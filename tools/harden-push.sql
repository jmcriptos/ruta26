-- Limita el tamaño y protocolo de suscripciones existentes.
-- NOT VALID evita que datos históricos defectuosos bloqueen la migración;
-- la restricción sí aplica inmediatamente a filas nuevas o modificadas.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscription_shape_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscription_shape_check check (
        char_length(endpoint) between 1 and 2048
        and endpoint ~ '^https://'
        and char_length(p256dh) between 1 and 256
        and char_length(auth) between 1 and 256
      ) not valid;
  end if;
end
$$;

-- Tras revisar que no haya filas históricas inválidas:
-- alter table public.push_subscriptions validate constraint push_subscription_shape_check;

-- Máximo cinco endpoints por cuenta, incluso con inserciones concurrentes.
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
