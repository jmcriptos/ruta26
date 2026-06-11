# Revisión de seguridad · 11 JUN 2026

## Resultado

No se encontraron credenciales privadas en el árbol o historial revisado. La
`SUPABASE_ANON_KEY` y la llave VAPID pública pueden vivir en el cliente; la
seguridad depende de RLS y de mantener privadas la service role y VAPID privada.

Las pruebas remotas anónimas confirmaron:

- `push_subscriptions` no expone filas por RLS.
- Los picks de la final no son visibles antes del kickoff.
- No hay RPC públicos expuestos.
- `page_views` sí expone filas crudas, incluido `session_id`.

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

## Pendiente prioritario

1. Desplegar analytics por fases: `tools/deploy-analytics-rollup.sql`,
   `tools/verify-analytics-rollup.sql` y finalmente `tools/harden-analytics.sql`.
   Para máxima cautela, crear antes la copia opcional con
   `tools/backup-analytics-before-hardening.sql`. El rollback de permisos está
   en `tools/rollback-analytics-hardening.sql`.
2. Ejecutar `tools/harden-push.sql` en Supabase para limitar nuevas
   suscripciones push.
3. Proteger `stats.html` si sus métricas se consideran privadas. `noindex` y una
   URL no enlazada no son controles de acceso.
4. Mover la escritura de analytics a un endpoint con rate limiting. La política
   de inserción anónima actual permite spam y consumo de cuota.
5. Activar protección de contraseñas filtradas y elevar la política de
   contraseña si importa evitar que terceros alteren picks de cuentas débiles.
6. Fijar GitHub Actions por SHA de commit para reducir riesgo de supply chain.

## Verificación

- `node --test tests/*.test.js`: 44/44.
- `node --check` en scripts modificados: correcto.
- `npm audit` de `web-push@3.6.7` y `@supabase/supabase-js@2.108.1`: 0
  vulnerabilidades conocidas.
- App principal y dashboard renderizados localmente sin errores CSP.
- `tools/harden-analytics.sql` validado en PostgreSQL 15: RPC accesible para
  `anon` y lectura cruda de `page_views` bloqueada.
- `tools/harden-push.sql` validado en PostgreSQL 15.
