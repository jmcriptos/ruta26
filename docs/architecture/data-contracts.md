# Contratos de datos

## Rows crudos vs view models

- **Supabase / fuentes externas** usan `snake_case` (`user_id`, `match_id`, `hg`,
  `ag`, `team_id`, `kickoff_at`). Estos rows **no se mutan**: no se les agregan
  campos de frontend.
- **View models de engagement** usan `camelCase` y son **objetos derivados** nuevos,
  creados al render por `js/engagement.js`. No se persisten en Supabase (MVP).
- `js/scoring.js` ya emite outputs canónicos en `camelCase` (`userId`, `username`,
  `points`, `exact`, `outcome`, `pos`, `tier`, `livePoints`, `delta`). `engagement.js`
  consume esos outputs tal cual.

## Visibilidad de pronósticos (privacidad)

- Los **pronósticos ajenos solo son visibles después del lock/kickoff** del partido
  (regla RLS existente y de producto). `engagement.js` debe recibir únicamente
  pronósticos ya visibles; `prediction_groups` devuelve **fallback vacío** si los
  ajenos aún no son visibles.
- Ningún view model expone pronósticos ajenos antes del kickoff, ni el `pCorrect`
  del Capitán antes del kickoff.

## Allowlist de analytics (in-app + push)

Eventos agregados, **sin PII** (nunca username, teléfono, texto libre, predicción
completa ni objeto crudo). Campos permitidos: identificadores no personales y enums.

| Evento | Cuándo | Campos permitidos |
|---|---|---|
| `opportunity_viewed` | se pinta el Bloque de Oportunidad | `state`, `reason` |
| `opportunity_cta_clicked` | clic en la acción primaria | `reason` |
| `prediction_submitted` | se guarda un pronóstico | `stage` |
| `locked_predictions_viewed` | se ven pronósticos compactos | — |
| `live_ranking_viewed` | se ve el ranking en vivo | `has_personal_impact` (bool) |
| `post_match_summary_viewed` | se ve el resumen post-partido | `movement` (enum) |
| `share_summary_clicked` | clic en compartir | `channel` (enum: native/copy) |
| `whatsapp_copy_clicked` | fallback de copiado | — |
| `push_prompt_seen` | se muestra el prompt de permiso | — |
| `push_enabled` | activa avisos | — |
| `push_dismissed` | descarta el prompt | — |
| `push_reminder_clicked` | abre la app desde un push | `reason` |

- `reason` (enum): `pending_pick`, `captain`, `reachable_rival`, `rival_threat`, `win_matchday`.
- `state` (enum de opportunity): ver `engagement-contract.md`.
- Si analytics requiere cambio de schema/RPC, se crea migración explícita
  `tools/migrate-engagement-events.sql` (no implícito en `tools/schema.sql`).

## Copy seguro (allowlist)

- Todo el copy in-app y de push sale de una **lista cerrada** documentada en
  `engagement-contract.md`. No hay texto libre de jugadores en el MVP.
- Tono: Joda Amistosa, sin humillación, insultos ni agresión; cortos; entendibles
  para 20-60 años sin conocimiento futbolero avanzado.
