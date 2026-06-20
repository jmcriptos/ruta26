# Métricas de engagement en el dashboard de stats — Diseño

**Fecha:** 2026-06-20
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Autor:** JM + Claude (brainstorming)
**Depende de:** [[engagement-mvp-capitan]] (los eventos `engagement_events` que ya emite `js/metrics.js`)

## Contexto

El MVP de engagement ya emite eventos in-app y de push vía `WC.metrics.track` a la
tabla `engagement_events` (RPC `record_engagement_event`, en `tools/migrate-engagement-events.sql`).
Falta **visualizarlos**. El dashboard de stats (`stats.html` + `js/stats-dashboard.js`)
ya consume RPCs agregadas (`analytics_rollup`, `analytics_live`) y pinta en `#content`;
esta feature añade una sección de engagement siguiendo ese mismo patrón.

## Objetivo

Responder, sin PII, cuatro preguntas: ¿el loop convierte (embudo)?, ¿qué momento
engancha?, ¿el push funciona?, y ¿cómo evoluciona en el tiempo?

## Componentes

### 1. RPC `engagement_rollup(since_at timestamptz)` — `tools/engagement-rollup.sql`

Agregada, sin PII, mismo patrón de seguridad que `analytics_rollup`:
`security definer set search_path = public, pg_temp`, `statement_timeout`, `revoke from public`,
`grant execute to anon, authenticated`. Acota `since_at` (clamp a ~93 días como `analytics_rollup`).

Devuelve filas por **(día, evento)**:

```
returns table (day date, event text, events bigint, sessions bigint)
```

- `events` = `count(*)` de ese evento ese día.
- `sessions` = `count(distinct session_id)` (sesiones que dispararon el evento ese día).
- Solo conteos agregados; **nunca** devuelve `session_id`, ni filas individuales, ni `fields`.

El dashboard deriva totales, embudo, tendencia y tasas en JS desde estas filas.

### 2. Sección "Engagement" en `js/stats-dashboard.js`

Nueva consulta `rpc("engagement_rollup", { since_at: since })` junto a las existentes,
y una sección con 4 bloques (reusando los helpers de cards/charts ya presentes):

- **Embudo de conversión** (por sesiones distintas, en el rango): Vieron Oportunidad
  (`opportunity_viewed`) → Tocaron CTA (`opportunity_cta_clicked`) → Pronosticaron
  (`prediction_submitted`), con % de conversión entre pasos. *Direccional, no por
  usuario individual* (los eventos no enlazan journeys; es conteo de sesiones por paso).
- **Uso de cada momento** (total de eventos en el rango): Oportunidad, Ranking en Vivo
  (`live_ranking_viewed`), Pronósticos compactos (`locked_predictions_viewed`),
  Resumen (`post_match_summary_viewed`), Compartir (`share_summary_clicked` +
  `whatsapp_copy_clicked`).
- **Push**: Avisos vistos (`push_prompt_seen`), activados (`push_enabled`), descartados
  (`push_dismissed`), abiertos desde push (`push_reminder_clicked`). Más dos tasas:
  opt-in = activados / vistos; retorno = abiertos / (envíos conocidos — si no hay, se omite).
- **Tendencia**: eventos por día (chart de barras/área, el patrón que ya usa el dashboard
  para visitas).

**Estado vacío:** si `engagement_rollup` devuelve cero filas (SQL no desplegado o sin
datos aún), la sección muestra un mensaje amable ("Aún sin datos de engagement") en
vez de bloques vacíos, y **no rompe** el resto del dashboard (degradación: si la RPC
da 404 por no estar desplegada, se captura y se omite la sección, igual que el manejo
actual de `analytics_rollup`).

### 3. `stats.html`

Sin cambios estructurales (todo se pinta en `#content`). Solo bump de versión de
`js/stats-dashboard.js?v=...`.

## Seguridad / privacidad

- La RPC devuelve **solo agregados** (conteos y conteos de sesiones distintas); nunca
  `session_id`, `fields`, ni filas crudas. `engagement_events` sigue con SELECT revocado
  para anon/authenticated.
- Sin PII, consistente con `analytics_rollup` y el contrato de `data-contracts.md`.

## Dependencias para que muestre datos

1. Desplegar `tools/migrate-engagement-events.sql` (write — ya escrito, pendiente deploy).
2. Desplegar `tools/engagement-rollup.sql` (read — este diseño).
3. Que los jugadores interactúen (los eventos se acumulan).

## Fuera de alcance

- Embudo por-usuario / por-journey (los eventos no enlazan sesiones a lo largo del tiempo).
- Tests automáticos del render (el `stats-dashboard.js` actual no tiene tests; se sigue ese patrón).
- Atribución push-→-conversión exacta (solo tasas agregadas).
