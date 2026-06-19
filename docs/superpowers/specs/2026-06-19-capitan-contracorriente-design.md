# Capitán contracorriente (híbrido aditivo) — Diseño

**Fecha:** 2026-06-19
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Autor:** JM + Claude (brainstorming)
**Reemplaza el comportamiento de:** [Capitán de eliminatorias](2026-06-18-capitan-eliminatorias-design.md) (el ×3 fijo)

## Contexto

El capitán simple ya está en producción: marca un partido de eliminatoria por día
y multiplica ×3 los puntos base. Tiene una debilidad: en **dieciseisavos (r32)**
hay favoritos cantados, así que la jugada óptima es capitanear el partido más
desnivelado → todos van a lo seguro, el capitán no diferencia a nadie y no genera
drama ni remontada (lo contrario del objetivo de engagement).

Este upgrade corrige eso **solo en r32** con un bono que premia ir contracorriente,
y mantiene un bono fijo de octavos en adelante (donde los partidos ya son parejos y
no hay "obvio" que castigar).

Además, se cambia de **multiplicar a sumar**: multiplicar compone con la base (el
marcador exacto de la final llegaba a ×3 = 9) y obligaba a separar "base vs
penales". Sumar un bono fijo controla el tope y **elimina esa complicación**: el
bono se suma encima de lo que ya ganaste, sin importar penales.

## Objetivo

Premiar la valentía en r32 (desincentivar capitanear lo obvio), mantener un premio
de capitán con sentido hasta el clímax, y conservar la filosofía: simple, **solo
suma, nunca resta**.

## La regla

El capitán **suma un bono** a los puntos ganados en ese partido, **solo si el pick
es correcto** (puntos ganados > 0); si falla, 0; nunca resta. El bono es plano (se
suma encima de base + bonus de penales si lo hubo); no hay separación base/penales.

### Dieciseisavos (r32) — bono contracorriente por escalón

`p` = jugadores que predijeron al equipo que **realmente avanzó** ÷ jugadores que
predijeron ese partido.

| `p` (% que acertó el partido) | Bono |
|---|---:|
| `p ≥ 0.60` (lo tenía la mayoría) | **+1** |
| `0.35 ≤ p < 0.60` | **+2** |
| `0.20 ≤ p < 0.35` | **+3** |
| `p < 0.20` (batacazo) | **+4** |

### Octavos → final (incluye 3er lugar)

Bono fijo **+2** (stages `r16`, `qf`, `sf`, `final`, `third`).

### Grupos

No se capitanean (sin cambios).

### Parámetros afinables

- Umbrales r32: `[0.20, 0.35, 0.60]`.
- Bonos r32: `[4, 3, 2, 1]` (del más raro al más común).
- Bono fijo octavos+: `2`.

## Ejemplos

| Situación | Aditivo |
|---|---:|
| 16vos, favorito acertado (p=0.80) | 1 + 1 = **2** |
| 16vos, batacazo acertado (p=0.18) | 1 + 4 = **5** |
| 16vos, acierto + penales (p=0.30) | (1+1 penales) + 3 = **5** |
| Octavos, aciertas | 1 + 2 = **3** |
| Final, marcador exacto | 3 + 2 = **5** |
| Final, solo resultado | 1 + 2 = **3** |
| Falla el capitán | **0** |

## Componentes

### 1. Scoring (`js/scoring.js`)

- Sustituir el `captainTotal(s, match)` actual (que hace ×3 sobre la base) por la
  versión aditiva.
- Nueva función pura `captainBonus(match, pCorrect)`:
  - `group` → `0`.
  - `r32` → escalón según `pCorrect` (fracción 0..1): `<0.20 → 4`, `<0.35 → 3`,
    `<0.60 → 2`, resto → `1`.
  - resto de eliminatoria (`r16/qf/sf/final/third`) → `CAPTAIN_FIXED_BONUS` (2).
- `captainTotal(s, match, pCorrect)`: si `s.points <= 0` o `group` → `s.points`;
  si no → `s.points + captainBonus(match, pCorrect)`.
- `buildLeaderboard` precomputa, por partido, el tally de aciertos del **avance**:
  `total` = predicciones de ese partido; `correct` = cuántas predijeron a
  `match.winner`. `pCorrect = correct / total`. Para una predicción capitaneada usa
  ese `pCorrect`. (Para no-r32 el bono es fijo, `pCorrect` se ignora.)
- Constantes nuevas: `CAPTAIN_FIXED_BONUS = 2`, `CAPTAIN_R32_TIERS` (estructura de
  umbrales/bonos). Quitar `CAPTAIN_MULT`.
- `buildLiveLeaderboard` hereda (usa `buildLeaderboard`); en vivo, `match.winner`
  proviene de `freezeLive` para los partidos en curso.
- Predicted winner de una predicción: `pred.hg > pred.ag ? match.home : match.away`
  (igual que `scoreMatch`).

### 2. UI (`js/game.js`)

- La etiqueta del capitán en tarjetas **jugadas** muestra el bono **real**
  ("⭐ Capitán +4") en vez del "×3" fijo. Para calcularlo, un helper que use
  `data.predictions` para obtener `pCorrect` del partido y llame a `captainBonus`.
- Actualizar "Cómo se juega" (`rulesHtml`) con la regla aditiva (contracorriente en
  16vos, +2 de octavos en adelante).

### 3. Sin cambios

- Base de datos: ninguno (la tabla `captain_picks` no cambia).
- CSS: ninguno (la clase `.cap-tag` ya existe; solo cambia el texto).

## Casos borde

- **Capitán correcto pero solo él lo predijo** (`p = 1.0` en r32) → +1 (≥0.60). OK.
- **Partido no decidido** (`match.winner` nulo / pendiente) → `s.points` 0 → sin
  bono hasta que se resuelva.
- **Denominador 0** (nadie predijo el partido): imposible si el capitán lo predijo
  (`total ≥ 1`); aun así, guard: tratar `pCorrect` indefinido como tier más común (+1).
- **Fronteras de escalón**: `p = 0.60` → +1; `p = 0.35` → +2; `p = 0.20` → +3.
  (Comparaciones `< 0.20`, `< 0.35`, `< 0.60`.)

## Pruebas (`tests/scoring.test.js`)

- Actualizar los tests del capitán existentes (asumían ×3) al modelo aditivo.
- `captainBonus`: cada escalón de r32 (p=0.10→4, 0.25→3, 0.50→2, 0.80→1) y las
  fronteras exactas (0.20, 0.35, 0.60); fijo +2 para `r16/qf/sf/final/third`;
  `group`/fallo → 0.
- `captainTotal`: aditivo sobre base, con penales sumados (no multiplicados),
  final exacto capitaneado = 5, fallo = 0.
- `buildLeaderboard`: cálculo correcto de `pCorrect` (correct/total) y aplicación
  del bono; un capitán en r32 con batacazo suma +4; ranking en vivo respeta el bono.
- Acumulación entre fases intacta; grupos sin cambio.

## Seguridad de despliegue

El capitán simple (×3) está vivo pero **aún no existe ningún capitán** y r32 es
~28 jun. Cambiar la regla ahora no reescribe nada: no hay partidos de eliminatoria
jugados ni capitanes registrados, así que el ranking no cambia retroactivamente.
Seguro de desplegar antes de que arranque r32.

## Fuera de alcance (futuro)

- **Pista previa al partido**: "este pick lo tiene el 20% → +4 si aciertas"
  (el `p` cambia mientras la gente pronostica; mostrarlo en vivo es un extra).
- Revelar el ⭐ ajeno tras el kickoff; columna de bono de capitán en el ranking.
