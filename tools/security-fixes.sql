-- Quiniela Ruta 26 · arreglos de seguridad aplicados en el SQL Editor de Supabase
-- (registro de lo ejecutado; cada bloque es idempotente)

-- 11 JUN 2026 · Linter 0028/0029: public.rls_auto_enable() quedaba ejecutable
-- vía /rest/v1/rpc/ por anon y authenticated. Es una función SECURITY DEFINER
-- de event trigger (activa RLS en tablas nuevas del esquema public) — se
-- conserva, pero sin EXECUTE para el mundo: los event triggers corren como su
-- dueño y no necesitan ese grant.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Linter auth_leaked_password_protection: se deja OFF a propósito.
-- Las cuentas de la quiniela no tienen email real ni datos personales y los
-- jugadores usan contraseñas simples; activar el chequeo de HaveIBeenPwned
-- solo agregaría fricción en el registro de un juego casual.
