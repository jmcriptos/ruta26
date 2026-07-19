---
title: 'Batacazo simétrico de 25 para la final'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_commit: 'beafe8ddcdaa35d0c593d4667b51da7e376c2dc6'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-batacazo-final-espana-25.md'
  - '{project-root}/docs/architecture/adr-capitan-scoring.md'
  - '{project-root}/docs/superpowers/specs/2026-07-15-batacazo-15-semifinal-design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La promo de la final España–Argentina (`matchId 400021543`) paga actualmente 25 puntos fijos solo si España gana. La nueva decisión amplía el mismo premio a quienes marquen la final como Batacazo, pronostiquen a Argentina como ganadora y Argentina salga campeona.

**Approach:** Convertir la entrada de esta final en una promo simétrica, reutilizando la semántica canónica `teamId: null`: cualquiera de los dos equipos puede activar el +25, pero únicamente para el jugador cuyo ganador pronosticado coincida con el campeón real. Adaptar el copy para comunicar ambos lados sin duplicar scoring.

## Boundaries & Constraints

**Always:** El +25 es aditivo al puntaje base y exige Batacazo registrado, final `400021543`, partido resuelto y ganador pronosticado igual al ganador real. España y Argentina reciben exactamente el mismo tratamiento, tanto en juego como por penales. La regla debe ser idéntica en ranking oficial, ranking en vivo y tarjeta del partido. Los puntos de campeón elegido conservan su acumulado graduado `4 → 8 → 11 → 13 → 15`.

**Ask First:** Cambiar el valor de 25, pagar sin marcar Batacazo, convertir el bono en total fijo, añadir notificaciones push o alterar los puntos base/campeón.

**Never:** Pagar el +25 al lado perdedor, pagar un empate pronosticado sin ganador de penales, premiar un partido pendiente en el ranking oficial, modificar promociones históricas, duplicar la elegibilidad fuera de `js/scoring.js` o cambiar datos del torneo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| España campeona | Batacazo + pick ganador España | Puntaje base aplicable +25 | Pick Argentina o sin Batacazo: sin especial |
| Argentina campeona | Batacazo + pick ganador Argentina | Puntaje base aplicable +25 | Pick España o sin Batacazo: sin especial |
| Campeón por penales | Pick directo al campeón, pero marcador real empatado | +25 aunque la base sea 0 por diferir el método | No bloquear el especial por `s.points <= 0` |
| Empate pronosticado | Empate + lado correcto elegido en penales | Base aplicable +25 | Sin `adv` o lado incorrecto: sin especial |
| Final en vivo | Ganador provisional identificable | Solo ranking en vivo proyecta el +25 | Ranking oficial permanece sin premio |
| Otro partido | Igual marcador o mismos equipos | Sin efecto de esta promo | Mantener scoring histórico |

</frozen-after-approval>

## Code Map

- `js/scoring.js` -- configuración canónica de promos y elegibilidad por ganador real/pronosticado.
- `tests/scoring.test.js` -- contrato del especial, rankings, penales y regresiones históricas.
- `js/game.js` -- copy simétrico, selector de penales y desglose visual del bono.
- `index.html`, `carrera.html` -- versiones de assets para invalidar caché.

## Tasks & Acceptance

**Execution:**
- [x] `js/scoring.js` -- cambiar únicamente la entrada de la final a `{ matchId: "400021543", teamId: null, bonus: 25 }` y actualizar comentarios; conservar las guardas de partido jugado, ganador correcto y estados `none/pending`.
- [x] `tests/scoring.test.js` -- añadir casos de Argentina campeona en juego y por penales, empate con `adv: "away"`, ranking con/sin Batacazo, ganador incorrecto y configuración simétrica; preservar casos equivalentes de España, máximo 28, campeón 15 y promos +50/+15.
- [x] `js/game.js` -- comunicar que el +25 paga al acertar quién sale campeón, España o Argentina; mantener el selector de penales exclusivo de esta final y la visualización del bono con base 0.
- [x] `index.html`, `carrera.html` -- incrementar las versiones de `js/scoring.js` y `js/game.js` modificados.

**Acceptance Criteria:**
- Given que cualquiera de los dos equipos gana la final, when el jugador marcó Batacazo y pronosticó a ese equipo como campeón, then suma el puntaje base correspondiente más 25.
- Given que el método pronosticado difiere del real, when coinciden el ganador pronosticado y el campeón, then el especial suma 25 aunque el puntaje base sea 0.
- Given que falta el Batacazo, el ganador pronosticado es incorrecto o el partido no está resuelto, when se calcula el ranking oficial, then no se añade el especial.
- Given el recálculo completo del torneo, when se aplican las nuevas reglas, then Cabo Verde +50, semifinal +15, puntajes base y campeón graduado permanecen intactos.

## Spec Change Log

## Design Notes

La simetría ya existe en `SPECIAL_BATACAZOS`: `teamId: null` exige `predWinner(pred, match) === match.winner` sin restringir el equipo. Por eso el cambio de scoring debe ser declarativo y no requiere una nueva rama. `captainTotal` conserva la excepción de base 0 necesaria para una final, porque acertar al campeón puede no coincidir con el signo del marcador tras penales.

## Verification

**Commands:**
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/scoring.test.js` -- casos focales y regresiones pasan.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test tests/*.test.js` -- suite completa en verde.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check js/scoring.js` -- sintaxis válida.
- `/Users/josedasilva/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check js/game.js` -- sintaxis válida.

**Manual checks (if no CLI):**
- La tarjeta de la final promete +25 por acertar España o Argentina y el empate permite escoger quién gana por penales.

## Suggested Review Order

**Regla simétrica**

- La configuración declarativa habilita el mismo premio para cualquiera de los dos campeones.
  [`scoring.js:33`](../../js/scoring.js#L33)

- La elegibilidad exige partido resuelto y coincidencia entre ganador real y pronosticado.
  [`scoring.js:68`](../../js/scoring.js#L68)

- La excepción permite cobrar aunque juego y penales produzcan una base distinta.
  [`scoring.js:94`](../../js/scoring.js#L94)

**Experiencia de la final**

- El helper limita el selector especial exclusivamente a esta final.
  [`game.js:405`](../../js/game.js#L405)

- El banner comunica el premio simétrico con ambos equipos resueltos dinámicamente.
  [`game.js:486`](../../js/game.js#L486)

- La tarjeta bloqueada muestra +25 incluso cuando el puntaje base es cero.
  [`game.js:531`](../../js/game.js#L531)

**Cobertura y entrega**

- Los casos de Argentina reflejan exacto, resultado, método distinto y penales.
  [`scoring.test.js:727`](../../tests/scoring.test.js#L727)

- Los rankings prueban que solo cobra quien marcó el Batacazo.
  [`scoring.test.js:798`](../../tests/scoring.test.js#L798)

- Campeón acumulado y promociones históricas permanecen intactos.
  [`scoring.test.js:874`](../../tests/scoring.test.js#L874)

- Las nuevas versiones evitan servir lógica anterior desde caché.
  [`index.html:355`](../../index.html#L355)

- Carrera consume la misma versión canónica de scoring.
  [`carrera.html:103`](../../carrera.html#L103)
