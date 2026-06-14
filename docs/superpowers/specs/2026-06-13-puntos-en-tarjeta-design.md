# Puntos del jugador en cada tarjeta de partido finalizado

**Fecha:** 2026-06-13
**Estado:** Aprobado por JM en conversación

## Objetivo

En cada tarjeta de partido **finalizado**, mostrar al jugador logueado los
puntos que ganó con su pick de la quiniela. Cada quien ve los suyos.

## Qué se muestra (solo `status === "played"`, solo con sesión)

- **Acierto:** chip verde con los puntos del partido:
  - Grupos: `+1 punto`.
  - Eliminatorias: `+1 punto`, o `+2 puntos` si acertó "por penales".
  - Final: `+3 puntos` (marcador exacto) o `+1 punto` (solo resultado).
- **Fallo:** chip tenue `0 puntos`.
- **Sin pick en ese partido:** chip tenue `Sin pronóstico`.
- **Sin sesión:** no se muestra nada (tarjeta igual que hoy).
- **Partido sin marcador aún** (`pending`/`none`): no se muestra nada.

Pluralización: `+1 punto` / `+N puntos` / `0 puntos`.

Ubicación: en la barra inferior de la tarjeta (`.match-bottom`), como chip
junto al estado `FINAL`. No toca el marcador central ni el botón "Ver más".

## Arquitectura

Los puntos ya los calcula `WC.scoring.scoreMatch(pred, match)` → `{points, kind}`
(`kind`: `exact` | `outcome` | `miss` | `pending` | `none`). No se duplica esa
lógica. Falta conectar el estado del jugador (en `game.js`) con el render de
tarjetas (en `app.js`).

### `js/game.js` — expone el resultado del jugador

Nueva función pública `myMatchPoints(match)`:

- `null` si no hay sesión, no hay match, o el partido no está `played`.
- `{ hasPred: false }` si hay sesión pero el jugador no pronosticó ese partido.
- `{ hasPred: true, points, kind }` usando `scoreMatch(mine[match.id], match)`.

Se expone tanto en el stub temprano de `WC.game` (devolviendo `null`) como en
el objeto final, para que `app.js` pueda llamarlo aunque `game.js` no haya
terminado de cargar.

### `js/app.js` — pinta el chip y coordina el re-render

- `matchCard(m)`: para `m.status === "played"`, llama
  `WC.game && WC.game.myMatchPoints ? WC.game.myMatchPoints(m) : null` y arma el
  chip. La traducción `kind → clase/color` y la pluralización viven aquí
  (presentación). Resultado vacío → sin chip.
- Expone `WC.app.refreshMatches()` (= `renderMatches`, que ya preserva filtros,
  fecha activa, paginado y paneles de detalle abiertos vía
  `captureOpen`/`restoreOpen`).

### Coordinación

- `game.js` llama `WC.app.refreshMatches()` (con guarda) tras resolver la sesión
  en `init()` y en `onAuthStateChange` (login/logout/carga inicial), para que
  las tarjetas muestren u oculten los puntos.
- El polling FIFA de `app.js` ya re-renderiza las tarjetas; cuando un partido
  pasa de "en vivo" a "finalizado", el chip aparece solo en el siguiente render.

## Errores / bordes

- `game.js` aún no cargó → sin chip; aparece al primer `refreshMatches`.
- Partido `played` sin marcador (`scoreMatch` → `pending`) → sin chip.
- Re-render preserva todo (filtros, paneles abiertos) porque reusa
  `renderMatches`.

## Testing

- La lógica de puntos ya está cubierta en `tests/scoring.test.js`
  (`scoreMatch` para grupos, final exacto/resultado, eliminatorias con penales).
- Lo nuevo es presentación (chip, pluralización, clasificación win/zero/none) y
  el cableado entre módulos: se verifica en el navegador con sesión iniciada
  (jmcriptos_26 tiene picks reales; el México 2-0 debe mostrar su chip), y el
  caso sin sesión (tarjetas sin chip).
