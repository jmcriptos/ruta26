---
title: 'Batacazo de 25 para España en la final'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_commit: 'cb7dab5e9afd20cb5dac41fa51ecd0721c6df9c7'
context:
  - '{project-root}/docs/architecture/adr-capitan-scoring.md'
  - '{project-root}/docs/superpowers/specs/2026-07-15-batacazo-15-semifinal-design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Para la final Argentina–España del 19 de julio (`matchId 400021543`), el Batacazo debe otorgar un bono fijo de 25 puntos únicamente a quien marque el partido como Batacazo, pronostique a España (`teamId 43969`) como ganadora y España termine campeona. La condición debe cumplirse tanto si España gana en juego como si gana por penales.

**Approach:** Añadir una promo histórica, específica por partido y equipo, a la fuente canónica de scoring. Evaluar el ganador elegido independientemente de si coincide el método de victoria, permitir seleccionar quién gana por penales cuando se pronostica empate en la final y comunicar la regla en la tarjeta.

## Boundaries & Constraints

**Always:** El +25 es aditivo al puntaje base; exige Batacazo registrado, final `400021543`, ganador real España y ganador pronosticado España. Deben conservarse intactas las promos históricas y la misma regla debe alimentar ranking oficial, ranking en vivo y UI. Si la condición especial no se cumple, rige el scoring normal existente.

**Ask First:** Cambiar el bono de aditivo a total fijo; impedir también el Batacazo normal cuando gana Argentina; añadir notificaciones push o modificar datos del torneo.

**Never:** Pagar +25 a un pick por Argentina, pagar solo por haber marcado el partido, borrar promos anteriores, duplicar el cálculo fuera de `js/scoring.js`, cambiar los puntos base de la final o los puntos de campeón.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| España gana en juego | Batacazo + pick ganador España | Puntaje base +25 | Sin Batacazo o pick Argentina: sin +25 |
| España gana por penales | Pick España ganando sin empate | +25 aunque el puntaje base sea 0 por diferir el signo del marcador real | No bloquear el especial por `s.points <= 0` |
| Empate pronosticado | Empate + España elegida en el selector de penales | España cuenta como ganadora pronosticada; base aplicable +25 | Sin lado elegido: sin +25 |
| Gana Argentina | Cualquier pick o Batacazo | Nunca se paga el fijo +25 | Aplicar únicamente las reglas normales |
| Otro partido | Mismos equipos o mismo marcador | Sin efecto de esta promo | Mantener scoring histórico |

</frozen-after-approval>

## Code Map

- `js/scoring.js` -- fuente única de promos, ganador pronosticado, total del Batacazo y potencial máximo.
- `tests/scoring.test.js` -- contrato unitario y end-to-end de scoring/ranking.
- `js/game.js` -- selector de desempate, copy de la promo y desglose del bono en la tarjeta.
- `index.html`, `carrera.html` -- versiones de los assets modificados para evitar caché obsoleta.

## Tasks & Acceptance

**Execution:**
- [x] `js/scoring.js` -- registrar `{ matchId: "400021543", teamId: "43969", bonus: 25 }`; permitir que una promo válida cobre aun con base 0, sin relajar el guard del Batacazo ordinario; reflejar 25 en el potencial máximo del partido.
- [x] `tests/scoring.test.js` -- cubrir todos los escenarios de la matriz, ranking con/sin Batacazo, aislamiento por equipo/partido y preservación de Cabo Verde +50 y semifinal +15.
- [x] `js/game.js` -- habilitar en la final el selector España/Argentina cuando el marcador pronosticado sea empate; usar “gana/sale campeona” en vez de “avanza”; mostrar +25 tras una victoria por penales aunque la base sea 0.
- [x] `index.html`, `carrera.html` -- actualizar `?v=` de `js/scoring.js` y `js/game.js` donde corresponda.

**Acceptance Criteria:**
- Given que España gana la final, when un jugador la marcó como Batacazo y su pick da a España como ganadora, then el ranking suma 25 más los puntos base que correspondan.
- Given que la final termina empatada y España gana por penales, when el pick daba a España ganadora por cualquier vía, then el bono fijo se paga aunque el signo del marcador pronosticado no coincida.
- Given que gana Argentina, falta el Batacazo o el pick no da ganadora a España, when se calcula el ranking, then no se añade el fijo de 25.
- Given cualquier promo histórica u otro partido, when se recalcula todo el torneo, then su scoring permanece sin cambios.

## Spec Change Log

## Design Notes

`specialBatacazoFor(match, pred)` determina la elegibilidad por ganador real y pronosticado. `captainTotal` debe consultar primero esa elegibilidad: si existe, devuelve `s.points + 25`; si no existe, conserva el requisito ordinario `s.points > 0`. Totales de referencia: exacto 28, resultado 26 y solo ganador correcto con método distinto 25.

## Verification

**Commands:**
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/scoring.test.js` -- todos los casos nuevos y regresiones pasan.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.js` -- suite completa en verde.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check js/scoring.js` -- sintaxis válida.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check js/game.js` -- sintaxis válida.

**Manual checks (if no CLI):**
- En la tarjeta de la final, un empate muestra el selector “¿quién gana por penales?” y el banner indica +25 solo con España.

## Suggested Review Order

### Regla canónica

1. Promo fija y alcance histórico — [scoring.js:33](../../js/scoring.js#L33)
2. Elegibilidad por estado y ganador — [scoring.js:68](../../js/scoring.js#L68)
3. Total aditivo y excepción con base cero — [scoring.js:94](../../js/scoring.js#L94)
4. Potencial máximo de 28 puntos — [scoring.js:115](../../js/scoring.js#L115)

### Experiencia de la final

1. Activación exclusiva del selector — [game.js:405](../../js/game.js#L405)
2. Copy y estado de la promo — [game.js:486](../../js/game.js#L486)
3. Desglose del bono en tarjeta bloqueada — [game.js:530](../../js/game.js#L530)
4. Selector del ganador por penales — [game.js:569](../../js/game.js#L569)

### Pruebas y entrega

1. Matriz completa del especial — [scoring.test.js:662](../../tests/scoring.test.js#L662)
2. Separación entre ranking oficial y en vivo — [scoring.test.js:766](../../tests/scoring.test.js#L766)
3. Campeón acumulado permanece en 15 — [scoring.test.js:786](../../tests/scoring.test.js#L786)
4. Versionado de assets — [index.html:355](../../index.html#L355), [carrera.html:103](../../carrera.html#L103)
