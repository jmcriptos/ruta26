-- Guarda la zona horaria IANA de cada dispositivo push para que el texto del
-- recordatorio muestre su hora local. No borra ni modifica datos existentes.

begin;

alter table public.push_subscriptions
  add column if not exists timezone text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and conname = 'push_subscription_timezone_check'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscription_timezone_check check (
        timezone is null
        or (
          char_length(timezone) between 1 and 64
          and timezone ~ '^[A-Za-z0-9_+./-]+$'
        )
      ) not valid;
  end if;
end
$$;

commit;

-- Las suscripciones existentes actualizarán timezone cuando el usuario vuelva
-- a abrir la app. Hasta entonces, el push dirá "empieza pronto" sin hora.
