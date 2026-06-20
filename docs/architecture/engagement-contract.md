# Contrato de engagement (`js/engagement.js`)

`js/engagement.js` es un módulo **puro** (`WC.engagement`) que deriva view models a
partir de snapshots + outputs canónicos de `js/scoring.js`. No lee DOM, Supabase,
fetch, storage, push ni `Date.now()` (la hora entra por parámetro `now`). Ante datos
faltantes devuelve `null`, lista vacía o un view model con `state: "fallback"`, sin
romper Ranking Oficial ni Pronósticos.

Rows crudos en `snake_case`; view models en `camelCase` (ver `data-contracts.md`).

## Snapshot de entrada (común)

```js
{
  now,                       // number (ms) — inyectado, nunca Date.now()
  meId,                      // userId autenticado (o null)
  official,                  // buildLeaderboard(...) → filas canónicas
  live,                      // buildLiveLeaderboard(...) → filas con livePoints/delta
  matches,                   // partidos (snake_case) con kickoff_at, stage, status, winner...
  myPredictions,             // { match_id: {hg, ag, pens} } del jugador
  myCaptains,                // [{ user_id, match_id }] del jugador
  visiblePredictions,        // predicciones AJENAS ya visibles (post-kickoff); [] si no
  teams                      // mapa de equipos para nombres/flags
}
```

## 1. `opportunity(snapshot)` → vm | null

Responde "por qué entrar ahora": un partido, un rival/meta cercana, una acción.

**Prioridad determinística ("Oportunidad más fuerte"):**
1. `pending_pick` — pronóstico pendiente antes de lock/kickoff.
2. `captain` — Capitán disponible o seleccionado en el partido.
3. `reachable_rival` — rival alcanzable por posición con los partidos del día.
4. `rival_threat` — amenaza de que un rival cercano pase al jugador.
5. `win_matchday` — ganar la jornada (fallback).

**Desempates:** kickoff más cercano → mayor ganancia potencial de posiciones →
menor diferencia de puntos → `match_id` estable.

```js
{
  state: "pending_pick"|"captain"|"reachable_rival"|"rival_threat"|"win_matchday"|"ready"|"closed"|"fallback",
  reason,                              // el criterio ganador (mismo enum)
  match: { id, homeName, awayName, kickoffAt, stageLabel } | null,
  rival: { username, pos, pointsGap } | null,   // Rival/Meta Cercana
  primaryAction: { label, targetMatchId } | null, // label de la allowlist; scroll/focus, sin modal
  copy: { headline, sub }              // de la allowlist
}
```

- Si no hay rival cercano calculable pero hay jornada/pick pendiente → degrada a
  `pending_pick`/`win_matchday`; **nunca** mensajes de distancia al líder.
- Ya pronosticado y sin meta → `state:"ready"`. Lock cerrado → `state:"closed"`.
  Sin oportunidad segura o faltan datos → `null` o `state:"fallback"`.

## 2. `liveTension(snapshot)` → vm (fallback si no hay live)

```js
{
  state: "personal"|"group"|"fallback",
  message,                             // copy: impacto personal, o grupal si no hay personal
  me: { pos, delta, livePoints } | null,
  rows: [ { username, pos, delta, livePoints, isMe } ]  // tabla provisional
}
```

- Prioriza impacto personal; usa fallback grupal si no hay impacto personal.
- Feed live stale/incompleto (ver PD4) → `state:"fallback"` sin copy dramático,
  Ranking Oficial sigue visible.
- No recalcula puntos/posiciones: usa `official`/`live` de scoring.

## 3. `predictionGroups(snapshot, matchId)` → vm

```js
{
  state: "visible"|"empty",
  matchId,
  groups: [ { outcome: "home"|"draw"|"away", label, count, usernames } ]
}
```

- Agrupa pronósticos visibles de forma compacta (local/empate/visitante).
- `visiblePredictions` vacío o partido antes de lock/kickoff → `state:"empty"`, `groups:[]`.

## 4. `postMatchSummary(snapshot, beforeRows, afterRows)` → vm | null

```js
{
  state: "moved"|"fallback",
  movement: "up"|"down"|"passed_friend"|"passed_by_friend"|"none",
  social,                              // línea social primero
  points,                              // puntos como apoyo (secundario)
  posDelta, passed: [usernames], passedBy: [usernames]
}
```

- **Movimiento relevante (PD5):** sube/baja ≥1 posición, pasa a un amigo, un amigo lo
  pasa, o gana puntos que cambian una Meta Cercana. Si nada de eso → `null` o fallback
  neutral (sin ruido artificial).
- Si bajó → tono de revancha / Meta Cercana (nunca culpa).

## 5. `whatsappShare(summaryVm, snapshot)` → string | null

- Texto con **solo hechos visibles** + copy allowlisted + enlace a `#quiniela`.
- Sin datos sensibles ni info fuera de lo visible para el grupo. `null` si no hay
  resumen compartible.

## Copy allowlist (lista cerrada)

Tono Joda Amistosa, corto, sin humillación. `{x}` = placeholders rellenados con
hechos visibles (nombres ya escapados al render).

| key | uso | texto |
|---|---|---|
| `opp_pending_pick` | falta pick | `Aún te falta tu pick de {match}` |
| `opp_pending_cta` | CTA pick | `Pronosticar ahora` |
| `opp_captain` | capitán disponible | `Elige tu Capitán para {match}` |
| `opp_captain_cta` | CTA capitán | `Marcar Capitán` |
| `opp_reachable_rival` | rival alcanzable | `Estás a {gap} de {rival}` |
| `opp_rival_threat` | amenaza | `{rival} te pisa los talones` |
| `opp_win_matchday` | jornada | `Hoy puedes ganar la jornada` |
| `opp_ready` | listo | `Listo: tu pick quedó guardado` |
| `opp_closed` | cerrado | `Este partido ya cerró` |
| `live_personal_up` | sube en vivo | `Vas subiendo: #{pos} (+{delta})` |
| `live_personal_down` | baja en vivo | `Cuidado: bajas a #{pos}` |
| `live_group` | grupal | `La tabla se mueve en vivo` |
| `post_up` | subió | `Subiste {n} puesto(s) 🔺` |
| `post_down` | bajó | `Bajaste {n}, hay revancha 🔁` |
| `post_passed` | pasó a alguien | `Pasaste a {rival}` |
| `post_passed_by` | lo pasaron | `{rival} te pasó` |
| `post_points` | puntos (apoyo) | `+{pts} pts en este partido` |
| `share_text` | compartir | `Voy #{pos} en la quiniela del Mundial ⚽ {move}` |

> El copy out-of-app (push) reutiliza estas keys; `tools/push-messages.js` no inventa
> texto nuevo fuera de esta lista.
