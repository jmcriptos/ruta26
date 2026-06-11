# Revisión de seguridad · 11 JUN 2026

## Resultado

No se encontraron credenciales privadas en el árbol o historial revisado. La
`SUPABASE_ANON_KEY` y la llave VAPID pública pueden vivir en el cliente; la
seguridad depende de RLS y de mantener privadas la service role y VAPID privada.

Las pruebas remotas anónimas confirmaron:

- `push_subscriptions` no expone filas por RLS.
- Los picks de la final no son visibles antes del kickoff.
- `analytics_rollup()` es público y las filas crudas de `page_views` ya no son
  legibles por `anon`.
- La inserción anónima directa en `page_views` seguía abierta y sin límite. Una
  prueba inválida recibió el error de restricción de la tabla, confirmando que
  un atacante podía enviar filas válidas masivamente.

## Corregido en el repositorio

- Datos FIFA validados antes de entrar al render HTML.
- Navegación de notificaciones restringida al alcance de la PWA.
- CSP y política de referrer añadidas a `index.html` y `stats.html`.
- Supabase JS fijado a `2.108.1` con SRI.
- `web-push` fijado a `3.6.7`, sin scripts de instalación.
- Endpoints push limitados a proveedores conocidos antes del envío.
- Límites de tamaño/protocolo preparados para `push_subscriptions`.
- Dashboard migrado a `analytics_rollup()`, sin exponer `session_id`.
- Esquemas nuevos ya no conceden lectura pública de `page_views`.
- Cliente de analytics migrado a `record_page_view()`: valida campos y acepta
  como máximo 32.000 vistas diarias, repartidas en 16 buckets.
- Inserción anónima directa de analytics cerrada por
  `tools/deploy-abuse-guards.sql`.
- `analytics_rollup()` limitado a dos segundos por ejecución.
- Máximo de cinco suscripciones push por usuario en base de datos y en el
  proceso de envío.
- GitHub Actions con permisos mínimos, exclusión mutua y tiempo máximo.

## Pendiente prioritario

1. Ejecutar `tools/deploy-abuse-guards.sql` en Supabase y comprobar el resultado
   con `tools/verify-abuse-guards.sql`. No borra tablas ni filas.
2. Activar CAPTCHA y revisar los límites de Auth en Supabase. Sin CAPTCHA,
   alguien distribuido todavía puede intentar crear muchas cuentas, aunque
   Supabase aplica límites nativos.
3. Proteger `stats.html` si sus métricas se consideran privadas. `noindex` y una
   URL no enlazada no son controles de acceso.
4. Para resistencia frente a ataques distribuidos fuertes, poner las llamadas
   públicas de Supabase detrás de un proxy/WAF con rate limiting. Los límites en
   PostgreSQL reducen el daño, pero cada petición todavía llega a la plataforma.
5. Activar protección de contraseñas filtradas y elevar la política de
   contraseña si importa evitar que terceros alteren picks de cuentas débiles.
6. Fijar GitHub Actions por SHA de commit para reducir riesgo de supply chain.
7. Habilitar Point-in-Time Recovery o confirmar los respaldos administrados de
   Supabase. El workflow de respaldo del repo es una ayuda, no reemplaza un
   respaldo completo de PostgreSQL.

## Verificación

- `node --test tests/*.test.js`: 46/46.
- `node --check` en scripts modificados: correcto.
- `npm audit` de `web-push@3.6.7` y `@supabase/supabase-js@2.108.1`: 0
  vulnerabilidades conocidas.
- App principal y dashboard renderizados localmente sin errores CSP.
- `tools/harden-analytics.sql` validado en PostgreSQL 15: RPC accesible para
  `anon` y lectura cruda de `page_views` bloqueada.
- `tools/harden-push.sql` validado en PostgreSQL 15.
- `tools/deploy-abuse-guards.sql` validado funcionalmente en PostgreSQL y
  ejecutado dos veces para comprobar idempotencia.
