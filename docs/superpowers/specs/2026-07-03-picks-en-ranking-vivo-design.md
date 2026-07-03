# Picks de cada jugador en el ranking en vivo

**Fecha:** 2026-07-03
**Estado:** Aprobado por JM

## Objetivo

En el "Ranking en vivo" de la quiniela, mostrar el pick (marcador pronosticado)
de cada jugador para cada partido que está en vivo, con un semáforo que indique
cómo le va con el marcador actual.

## Contexto

- El ranking en vivo se renderiza en `liveRankingHtml()` (`js/game.js`), una
  tabla con columnas: posición, movimiento (▲▼), bandera del campeón, jugador
  (+pts en vivo) y puntos totales.
- Los picks viven en `data.predictions` (`user_id, match_id, hg, ag, adv`) y ya
  se cargan completos para todos los jugadores. Los capitanes en `data.captains`.
- Los picks se bloquean al kickoff, así que mostrarlos durante un partido en
  vivo no filtra información (el bloque "Cómo se reparte la quiniela" ya
  muestra agregados tras el lock).
- `WC.scoring.scoreMatch(pred, match)` devuelve `kind`:
  `exact | outcome | miss | pending | none`. `WC.scoring.freezeLive(m)`
  congela un partido en vivo como si el marcador actual fuera final.

## Diseño

### Datos

Sin cargas nuevas ni cambios en Supabase. Se construye un índice en memoria
`user_id|match_id → prediction` a partir de `data.predictions`, solo para los
partidos en vivo del render actual.

### UI (tabla del ranking en vivo)

- **Una columna extra por cada partido en vivo**, entre el nombre y los puntos.
  - Encabezado: las banderas de los dos equipos del partido.
  - Celda: el marcador pronosticado (`2-1`).
  - Eliminatorias con pick de empate: se añade la banderita del equipo elegido
    para avanzar (`1-1 🇦🇷`), usando `adv` (`home | away`).
  - Jugador sin pick para ese partido: `–` en gris tenue.
  - Si el jugador es capitán de ese partido (`data.captains`), un distintivo
    pequeño Ⓑ junto al pick (en la UI el capitán se llama "Batacazo").

### Semáforo

Cada celda se colorea evaluando `scoreMatch(pred, freezeLive(m))` — la misma
lógica que ya usa `buildLiveLeaderboard`, cero lógica de puntaje nueva:

| kind | color |
|---|---|
| `exact` | verde (sumando marcador exacto) |
| `outcome` | amarillo (acertando ganador/empate) |
| `miss` | gris apagado (fallando por ahora) |
| `none` | `–` gris tenue |

### Casos borde

- 2 partidos simultáneos (máximo en eliminatorias) caben en móvil: celdas de
  3-4 caracteres. Si hubiera más, la tabla recibe `overflow-x: auto` dentro de
  su card para desplazarse horizontalmente sin romper el layout.
- El estado "Sin datos frescos" (`liveStale`) no cambia: en ese caso no se
  muestra la tabla y por tanto tampoco los picks.
- La animación FLIP de las filas (`captureLiveRows`/`animateLiveRows`) usa
  `data-user` por fila y no depende del número de columnas: no requiere cambios.
- El bloque agregado "Cómo se reparte la quiniela" se conserva tal cual.

### Testing

- La columna es presentación pura sobre `scoreMatch`/`freezeLive`, ya cubiertos
  por `tests/scoring.test.js`.
- Verificación visual/funcional en el preview con un partido simulado en vivo:
  columna presente, semáforo correcto, `–` para quien no tiene pick, Ⓒ para
  capitanes, empate KO con banderita de avance.

## Fuera de alcance

- Mostrar picks de partidos ya terminados o futuros en el ranking.
- Cambios de scoring, notificaciones o datos en Supabase.
