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
