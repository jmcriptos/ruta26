# "Mi jornada ⚽" — resumen + oportunidad fusionados, narrados

**Fecha:** 2026-06-21
**Estado:** Aprobado (diseño)

## Problema / objetivo

Hoy el loop tiene dos tarjetas separadas en la Quiniela: **Resumen post-partido**
(narración de lo que pasó) y **Tu oportunidad** (qué hacer ahora). JM quiere
**fusionarlas en un solo bloque narrado** ("Mi jornada ⚽") que cuente, en texto
corrido: qué pasó → qué viene → un **empujón psicológico a volver a la app y revisar
los pronósticos**, usando los principios de engagement ya definidos en el proyecto.

## Marco psicológico (del propio proyecto)

Fuente: `_bmad-output/brainstorming/…`, `EXPERIENCE.md`, `engagement-contract.md`.
Loop triple (antes/durante/después) y tono **"Joda Amistosa Controlada"** (simple,
social, ligeramente provocador, **nunca punitivo ni humillante**). Principios a usar
en el copy:
- **Comparación social** ("vas 2º, pisándole los talones a rhandyg18").
- **Meta cercana** ("tienes a {rival} a tiro: un acierto y lo pasas").
- **Aversión a la pérdida** ("{rival} te respira en la nuca; defiende tu lugar").
- **FOMO / urgencia** ("antes del kickoff", "el que no juega no puntúa").
- **Revancha** ("mañana hay revancha").
- **Retorno + revisar picks** (cierre que invita a volver y ajustar pronósticos).

## Arquitectura

Nueva función `miJornadaHtml()` en `js/game.js` que **reemplaza** a
`postMatchSummaryHtml()` y `opportunityHtml()` en el render. Compone su texto a partir
de los view models existentes de `js/engagement.js` (`postMatchSummary` y
`opportunity`) + `snapshot.official`. **Sin cambios de scoring ni de engagement.js.**

- En `render()` (sesión iniciada): reemplazar
  `postMatchSummaryHtml() + championHtml() + remindersHtml("top") + opportunityHtml() + …`
  por `miJornadaHtml() + championHtml() + remindersHtml("top") + …`.
- Eliminar las funciones `postMatchSummaryHtml()` y `opportunityHtml()` (quedan
  reemplazadas); conservar el handler de click `[data-opp-target]` (lo reusa el CTA)
  y el handler `#pmsShare` (lo reusa Compartir).
- Título: `<h3>Mi jornada ⚽</h3>` dentro de `<div class="game-card">` (mismo estilo
  que "Mi campeón 🏆").

## Composición de la narración (`miJornadaHtml`)

1. `snap = engagementSnapshot()`. Si `!session || !snap` → `""`.
2. **recap**: misma lógica que el resumen actual (último partido jugado, `before`
   neutralizando la jornada del día, `vm = WC.engagement.postMatchSummary(...)`).
   Puede ser `null`.
3. **opp**: `WC.engagement.opportunity(snap)`. Puede ser `fallback`.
4. **me**: `snap.official.find(r => r.userId === snap.meId)` (pos y puntos).
5. Componer 3 cláusulas (las que apliquen) y unirlas en un párrafo:

**Cláusula A — recap** (si `recap` no es null):
- Encabezado: `recap.scope === "matchday" ? "Cerró la jornada" : "Terminó {homeName} {hs}-{as} {awayName}"`.
- Movimiento, según `recap.movement`:
  - `passed_friend` → " y pasaste a {recap.rival}"
  - `passed_by_friend` → " y {recap.rival} te pasó"
  - `up` → " y subiste {recap.posDelta} puesto(s)"
  - `down` → " y bajaste {abs(posDelta)} puesto(s)"
  - `none` → " y sumaste {recap.ptsGain} pt(s)"
- Posición: `; vas {me.pos}º con {me.points} pts.`
- Si `recap` es null pero hay `me`: cláusula A = `"Vas {me.pos}º con {me.points} pts."`

**Cláusula B — oportunidad** (según `opp.state`):
- `pending_pick` → "Aún te falta tu pick de {match} — el que no juega no puntúa."
- `captain` → "Marca tu Capitán para {match} y dale más filo a tu jugada."
- `reachable_rival` → "Tienes a {opp.rival.username} a tiro: un acierto y lo pasas."
- `rival_threat` → "Ojo: {opp.rival.username} te respira en la nuca."
- `win_matchday` → "Hoy puedes ganar la jornada."
- `fallback`/sin opp → se omite la cláusula B.

**Cláusula C — empujón a volver** (cierre):
- Si hay opp accionable (cualquiera salvo fallback): "Vuelve y revisa tus pronósticos antes del kickoff."
- Si NO hay opp accionable pero sí hubo recap: "Mañana hay revancha."
- (Si no hay ni recap ni opp accionable ni `me` → la función devuelve `""`.)

Resultado: `narration = [A, B, C].filter(Boolean).join(" ")`. Todos los nombres
(equipos, rivales, usernames) **escapados con `esc()`** antes de interpolar.

## Acciones

- **Pronosticar** (CTA): `<button class="primary-btn opp-cta" data-opp-target="{opp.primaryAction.targetMatchId || ''}" data-opp-reason="{opp.reason || 'mijornada'}">Pronosticar ahora</button>`.
  Reusa el handler `[data-opp-target]` existente (scroll/foco al pick; con target
  vacío cae al primer `.pick-card`). Etiqueta: "Pronosticar ahora" si hay pick
  pendiente/oportunidad; "Revisar mis pronósticos" si no hay opp accionable.
- **Compartir**: `<button class="secondary-btn" id="pmsShare" data-share="{teaser}">Compartir</button>`.
  Reusa el handler `#pmsShare` (navigator.share o clipboard).
  **`teaser` = resumen parcial + link directo:** la cláusula A (recap o posición) +
  " " + `location.origin + location.pathname + "#quiniela"`. Ej.:
  "Terminó Túnez 0-4 Japón y sumaste 1 pt; vas 2º con 22 pts. https://…/#quiniela".
  Si no hay recap: "Voy {me.pos}º en la quiniela del Mundial ⚽ {url}".

Botones lado a lado (clase `.es-buttons`, ya existente).

## Render

```
<div class="game-card mijornada-card">
  <h3>Mi jornada ⚽</h3>
  <p class="mj-narration">{narration}</p>
  <div class="es-buttons">{Pronosticar}{Compartir}</div>
</div>
```
CSS: reusar `.es-buttons`/`.primary-btn`/`.secondary-btn`. Añadir `.mj-narration`
(texto legible, ~15px, line-height 1.55), análogo a `.pms-narration` (que se elimina
con `postMatchSummaryHtml`).

## Tracking (analítica, sin cambios de allowlist)

- Al renderizarse con recap → `trackEvent("post_match_summary_viewed", { movement: recap.movement, scope: recap.scope })`.
- Al renderizarse con opp accionable → `trackEvent("opportunity_viewed", { state: opp.state, reason: opp.reason })`.
- CTA → el handler `[data-opp-target]` ya dispara `opportunity_cta_clicked`.
- Compartir → el handler `#pmsShare` ya dispara `share_summary_clicked`/`whatsapp_copy_clicked`.

## Casos borde

- Sin sesión / sin snapshot → `""`.
- Recap + opp → narración completa (A+B+C).
- Solo opp (sin movimiento) → "Vas Nº…" + B + "Vuelve y revisa…".
- Solo recap (sin opp accionable) → A + "Mañana hay revancha."
- Ni recap ni opp ni `me` → `""` (no se muestra el bloque).

## Alcance / lo que NO cambia

- Ranking en vivo y ranking definitivo (podio) quedan igual.
- `engagement.js` (view models) y `scoring.js` no cambian.
- Se eliminan del render `postMatchSummaryHtml`/`opportunityHtml` y su CSS huérfano
  (`.pms-*`, `.es-impact`, `.es-share`, etc.) si queda sin uso.

## Pruebas

- Verificación **visual** (móvil + desktop, logueado): el bloque "Mi jornada ⚽"
  muestra la narración correcta en los casos recap+opp, solo-opp y solo-recap;
  Pronosticar hace scroll a los pronósticos; Compartir arma teaser + link; sin
  errores de consola.
- Los view models (`postMatchSummary`, `opportunity`) ya tienen tests en
  `tests/engagement.test.js`; la composición de la narración es render (game.js) y se
  valida visualmente.
