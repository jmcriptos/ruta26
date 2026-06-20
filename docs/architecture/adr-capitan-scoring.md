---
status: approved
decision_date: 2026-06-20
decision_source: brainstorming JM + Claude (superpowers) → docs/superpowers/specs/2026-06-19-capitan-contracorriente-design.md
gate: Story 1.1 (Epic 1) — cerrar contrato de Capitán antes del engagement
---

# ADR: Contrato de scoring del Capitán

## Decisión

El Capitán es **contracorriente aditivo**, NO `×3` multiplicativo.

El capitán **suma** un bono a los puntos ganados en el partido elegido, solo si
acierta (`points > 0`); nunca resta. El bono no se multiplica con la base, por lo
que el marcador exacto de la final no se dispara.

- **Dieciseisavos (`r32`):** bono por escalón según `pCorrect` = fracción de la liga
  que acertó quién avanzó en ese partido:
  - `pCorrect < 0.20` (batacazo) → **+4**
  - `0.20 ≤ pCorrect < 0.35` → **+3**
  - `0.35 ≤ pCorrect < 0.60` → **+2**
  - `pCorrect ≥ 0.60` (obvio) → **+1**
- **Octavos → final, incluido 3er lugar** (`r16`, `qf`, `sf`, `final`, `third`):
  bono fijo **+2**.
- **Grupos:** no se capitanean (bono 0).

El bono de penales (`+1`) se conserva en `scoreMatch` y se suma aparte; el capitán
no lo altera.

### Parámetros (afinables, en `js/scoring.js`)

- `CAPTAIN_FIXED_BONUS = 2`
- `CAPTAIN_R32_TIERS = [{maxP:0.20,bonus:4},{maxP:0.35,bonus:3},{maxP:0.60,bonus:2},{maxP:Infinity,bonus:1}]`

## Fuente de verdad

`js/scoring.js` es la única fuente de verdad. Expone `captainBonus(match, pCorrect)`
y `captainTotal(s, match, pCorrect)`. `buildLeaderboard` y `buildLiveLeaderboard`
calculan `pCorrect` por partido y aplican el capitán. **No** se recalcula Capitán en
`js/game.js`, `js/engagement.js` ni `tools/push-messages.js`; `game.js` solo lee
`captainBonus` para mostrar el bono ya resuelto.

## Aprobación

La regla se considera aprobada porque `tests/scoring.test.js` pasa con
`tests/fixtures/scoring/capitan-contract.json`, que cubre: marcador exacto,
resultado correcto, fallo, empate, partido sin resultado, capitán activo/inactivo y
tie-break de ranking. Sin framework, build system ni dependencias npm nuevas.

## Despliegue

El capitán simple (`×3`) llegó a producción el 18 jun pero ningún jugador lo usó
(no hay partidos de eliminatoria jugados; r32 ≈ 28 jun). El cambio a aditivo no
reescribe puntajes pasados. La rama `capitan-contracorriente-impl` contiene la
implementación.
