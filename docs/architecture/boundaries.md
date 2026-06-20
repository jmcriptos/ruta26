# Límites de módulos (boundaries)

Contrato de responsabilidades para el MVP de engagement. Antes de trabajo paralelo,
cualquier agente consulta este archivo para saber qué módulo hace qué.

## Quién hace qué

| Módulo | Responsabilidad | NO debe |
|---|---|---|
| `js/scoring.js` | Única fuente de verdad de puntos, ranking oficial, ranking en vivo, freeze/live y contrato del Capitán. Funciones puras. | Leer DOM/Supabase/fetch. |
| `js/engagement.js` | Deriva **view models** puros: `opportunity`, `live_tension`, `prediction_groups`, `post_match_summary`, `whatsapp_share`. Recibe snapshots + outputs canónicos de scoring. | Leer DOM, Supabase, fetch, localStorage, sessionStorage, push, `Date.now()`; recalcular puntos/ranking; inventar copy fuera de la allowlist. |
| `js/game.js` | Orquesta datos, render, handlers, native share/copy y llamadas a métricas. Renderiza los view models. | Inventar reglas de opportunity/ranking social/resumen/share; recalcular Capitán o puntos. |
| `js/metrics.js` | Registra eventos allowlisted (agregados, sin PII). | Calcular scoring; bloquear UI/guardado/navegación. |
| `js/api.js` | Frontera de datos/fetch/normalización de fuentes externas y shapes Supabase. | — |
| `tools/push-messages.js` | Arma copy de push y guardrails. Consume señales permitidas del contrato de engagement. | Calcular scoring; recrear opportunity logic; asumir rows Supabase crudos. |
| `tools/send-push-reminders.js` | Envío + dedupe + frecuencia + bloque horario. | Calcular scoring. |

## Dirección de dependencias

```
scoring.js  ─┐
             ├─►  engagement.js  ─►  game.js (render)  ─►  metrics.js (eventos)
api.js  ─────┘                       │
                                     └─►  tools/push-messages.js (consume señales)
```

- `engagement.js` depende de outputs de `scoring.js`, nunca al revés.
- `game.js` y `tools/push-messages.js` consumen `engagement.js`; no lo duplican.
- Ningún módulo de engagement escribe en Supabase los view models (se derivan al render — ver `data-contracts.md`).

## Reglas transversales

- Todo HTML generado desde JS escapa texto dinámico antes de interpolar (`esc()`).
- `styles.css` es el único stylesheet; clases nuevas siguen tokens de `DESIGN.md`.
- Sin framework, build system ni dependencias npm.
- Tests en `tests/` con `node:test`. Fixtures en `tests/fixtures/scoring/` y `tests/fixtures/engagement/`.
- La base Quiniela (ranking oficial, pronósticos) debe seguir funcionando aunque un bloque de engagement falle (degradación segura).
