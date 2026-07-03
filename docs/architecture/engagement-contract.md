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
  liveStale,                 // boolean — true si datos live no cumplen PD4
  summaryScope,              // "match"|"matchday" opcional para copy post-partido
  matches,                   // partidos (snake_case) con kickoff_at, stage, status, winner...
  matchPotentials,           // { matchId: max points } desde scoring.maxMatchPoints(...)
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
  match: { id, home, away, homeName, awayName, kickoffAt, stage, stageLabel } | null,
  rival: { username, pos, pointsGap } | null,   // Rival/Meta Cercana
  chips: [ "A {gap} pts", "Rival: {x}", "Capitán disponible" ], // datos para la tira de chips
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
  state: "personal"|"group"|"frozen"|"fallback",
  message,                             // copy: impacto personal, o grupal si no hay personal
  me: { pos, delta, livePoints } | null,
  rival: { username, pos } | null,     // vecino que pasas/te pasa (solo en "personal")
  rows: [ { username, pos, delta, livePoints, isMe } ]  // tabla provisional
}
```

- Prioriza impacto personal; usa fallback grupal si no hay impacto personal.
- `frozen` (`live_frozen`): hay partido en juego (`snapshot.matches` con `status:"live"`)
  pero nadie suma ni se mueve (p. ej. sorpresa: todos al favorito y va perdiendo).
  Evita el silencio total; si no hay partido en juego → `fallback`.
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
  scope: "match"|"matchday",              // origen del delta resumido
  social,                              // titular social primero
  subtitle,                            // línea de apoyo (tono según movimiento)
  points,                              // "+{pts}" como evidencia; social nunca es fórmula
  ptsGain, mePoints,                   // números para el grid de impacto de la tarjeta
  rival,                               // username del rival pasado/que pasó (o null)
  posDelta, passed: [usernames], passedBy: [usernames]
}
```

- **Movimiento relevante (PD5):** sube/baja ≥1 posición, pasa a un amigo, un amigo lo
  pasa, o **gana puntos** (aunque no cambie de posición). Solo si no hay nada de eso
  (0 puntos y 0 movimiento) → `null` (sin ruido artificial).
- Ganó puntos sin cambiar de puesto → `movement:"none"`, `social` = línea humana
  (`post_points_social` o `post_points_social_day`) y `points` = evidencia
  (`post_points` o `post_points_day` si `summaryScope:"matchday"`).
- Si bajó → tono de revancha / Meta Cercana (nunca culpa).
- El caller (`game.js`) calcula `beforeRows` neutralizando **todos los partidos
  terminados de la última jornada** (día calendario en Curazao), no solo el último,
  para reflejar el impacto acumulado del día.

## 5. `whatsappShare(summaryVm, snapshot)` → string | null

- Texto con **solo hechos visibles** + copy allowlisted + enlace a `#quiniela`.
- Sin datos sensibles ni info fuera de lo visible para el grupo. `null` si no hay
  resumen compartible.

## 6. `livePickView(pred, match)` → vm | null

```js
{ score: "2-1", advSide: "home"|"away"|null }
```

- Formatea el pick de un jugador para la columna de picks del ranking en vivo.
- No recibe snapshot: entrada mínima (`{hg, ag, adv}` + partido). Puro, sin puntos
  ni semáforo — el color de la celda sale de `scoring.scoreMatch(pred, freezeLive(m))`.
- Pick ausente/incompleto → `null` (la celda pinta "–").
- `advSide` solo en empate KO con `adv` válido; en grupos o sin empate → `null`.

## Matriz de estados UI

`game.js` conserva una sola superficie de Quiniela y debe resolver el estado dominante
sin crear dashboards paralelos:

| Momento / estado | Superficie dominante | Copy/UX principal | Fallback seguro |
|---|---|---|---|
| Antes del partido con pick pendiente | Oportunidad | Frase accionable + CTA al pronóstico | Si falta rival, nombrar el partido |
| Antes del partido sin acción pendiente | Oportunidad o nada | Meta cercana / jornada | Ocultar si no hay frase social fuerte |
| Partido live fresco | Ranking en Vivo | Chip `Provisional`, frase social, tabla provisional | Fallback grupal si no hay impacto personal |
| Partido live stale | Ranking en Vivo | `Actualizando ranking en vivo` | Ranking Oficial sigue visible |
| Post-partido único | Resumen | Movimiento social + `+N pts en este partido` como evidencia | Sin rival: `Sin rival cercano` |
| Post-jornada con varios partidos | Resumen de jornada | Movimiento social + `+N pts en esta jornada` como evidencia | Tira de jornada, no marcador del último partido |
| Share/clipboard falla | Resumen | Texto compartible visible/copiable vía prompt nativo | No perder el resumen ni bloquear navegación |

## Copy allowlist (lista cerrada)

Tono Joda Amistosa, corto, sin humillación. `{x}` = placeholders rellenados con
hechos visibles (nombres ya escapados al render).

| key | uso | texto |
|---|---|---|
| `opp_pending_pick` | falta pick | `Aún te falta tu pick de {match}` |
| `opp_pending_cta` | CTA pick | `Pronosticar ahora` |
| `opp_captain` | capitán disponible | `Elige tu Capitán para {match}` |
| `opp_captain_cta` | CTA capitán | `Marcar Capitán` |
| `opp_reachable_rival` | rival alcanzable | `Hoy puedes pasar a {rival}` |
| `opp_rival_threat` | amenaza | `{rival} te pisa los talones — defiende tu lugar` |
| `opp_win_matchday` | jornada | `Hoy puedes ganar la jornada` |
| `opp_ready` | listo | `Listo: tu pick quedó guardado` |
| `opp_closed` | cerrado | `Este partido ya cerró` |
| `opp_chip_gap` | chip de brecha | `A {gap} pts` |
| `opp_chip_tied` | chip empate de pts | `Empatados` |
| `opp_chip_rival` | chip de rival | `Rival: {rival}` |
| `opp_chip_captain` | chip de capitán | `Capitán disponible` |
| `live_personal_up` | sube en vivo (sin vecino) | `Vas subiendo: #{pos} (+{delta})` |
| `live_personal_down` | baja en vivo (sin vecino) | `Cuidado: bajas a #{pos}` |
| `live_pass` | pasas a vecino | `Si queda así, pasas a {rival}` |
| `live_passed_by` | vecino te pasa | `Si queda así, {rival} te pasa` |
| `live_group` | grupal | `La tabla se mueve en vivo` |
| `live_frozen` | en juego sin movimiento | `Tabla congelada: nadie suma… por ahora 👀` |
| `post_up` | subió | `Subiste {n} puesto(s) 🔺` |
| `post_down` | bajó | `Bajaste {n}, hay revancha 🔁` |
| `post_passed` | pasó a alguien | `Pasaste a {rival}` |
| `post_passed_by` | lo pasaron | `{rival} te pasó` |
| `post_points_social` | solo puntos | `Sumaste puntos, la tabla sigue igual` |
| `post_points_social_day` | solo puntos de jornada | `Sumaste en la jornada, la tabla sigue igual` |
| `post_points` | puntos (apoyo) | `+{pts} pts en este partido` |
| `post_points_day` | puntos de jornada (apoyo) | `+{pts} pts en esta jornada` |
| `post_sub_up` | subtítulo subió/pasó | `El grupo ya tiene tema.` |
| `post_sub_down` | subtítulo bajó/lo pasaron | `Mañana hay revancha.` |
| `post_sub_points` | subtítulo solo puntos | `Buen cierre: sigues en carrera.` |
| `share_passed` | compartir: pasó a alguien | `Le pasé a {rival} en la quiniela del Mundial ⚽😎 ¿quién sigue?` |
| `share_passed_by` | compartir: lo pasaron | `{rival} me pasó… disfrútalo que mañana hay revancha 😏 quiniela del Mundial ⚽` |
| `share_up` | compartir: subió | `Subí {n} puesto(s) en la quiniela del Mundial 🔥 a ver quién me alcanza` |
| `share_down` | compartir: bajó | `Tropecé pero esto no acabó 🔁 los espero arriba en la quiniela del Mundial ⚽` |
| `share_default` | compartir: genérico/reto | `Voy #{pos} en la quiniela del Mundial ⚽ ¿te le mides?` |

> El copy out-of-app (push) reutiliza estas keys; `tools/push-messages.js` no inventa
> texto nuevo fuera de esta lista.
