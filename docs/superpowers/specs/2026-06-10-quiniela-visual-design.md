# Quiniela — rediseño visual con banderas

**Fecha:** 10 de junio de 2026
**Estado:** diseño aprobado en conversación, pendiente plan
**Sobre:** la sección Quiniela ya en producción (reglas 1X2 — ver `2026-06-10-quiniela-1x2-design.md`)

## Objetivo

Hacer la quiniela más visual incluyendo banderas, sin cambiar reglas ni datos. Solo presentación (`js/game.js` render + `styles.css`). Estilo "enfrentamiento visual" (Opción A aprobada).

## Tarjetas de predicción (Opción A)

Cada partido por jugar se rinde como una tarjeta tipo `match-card`:

- **Cabecera:** fecha/hora a la izquierda, grupo o fase a la derecha (texto mut., 11px).
- **Enfrentamiento:** dos columnas centradas — bandera grande (44px) sobre el nombre del equipo (700, 15px) — con un "VS" en League Spartan gris al medio. En partidos sin equipos definidos (eliminatorias con placeholder) se usa el label de `WC.slotName` y un emoji neutro 🏳️ como bandera.
- **Controles según tipo** (sin cambiar la mecánica ni el guardado):
  - **Grupos (1x2):** tres botones — `[🇲🇽 Gana]` · `Empate` · `[🇿🇦 Gana]`. El de cada equipo muestra su bandera (18px) sobre la palabra "Gana"; el activo en lima. (La palabra es "Gana" porque el nombre ya está arriba en el enfrentamiento.)
  - **Eliminatorias (ko):** dos botones — `[🇦🇷 Avanza]` · `[🇨🇴 Avanza]` con bandera — más el toggle `⚽ Por penales` (full-width, estilo actual).
  - **Final (score):** los steppers `+/−` actuales, pero con la bandera de cada equipo junto a su contador.
- **Estado de guardado:** "Guardado ✓" alineado a la derecha bajo los controles (igual que hoy).

Filas bloqueadas (partido ya empezó): la cabecera de enfrentamiento se mantiene (banderas + nombres), debajo el pick legible (`pickLabel`) + resultado real + chip de puntos.

## Banderas — fuente

`WC.state.teams[id].flag` (emoji) ya existe para los 48 equipos. Para placeholders sin equipo definido, bandera neutra 🏳️. No se cargan imágenes externas.

## Ranking (medallas + bandera del campeón)

- Posición 1-3: medalla 🥇🥈🥉 en la columna de posición; resto, el número en League Spartan.
- Columna de bandera: el **campeón** que eligió cada jugador. Visibilidad atada a la regla existente — el pick de campeón ajeno solo se conoce tras el cierre (`2026-06-28T19:00:00Z`); antes, para otros jugadores se muestra 🛡️; tu propia bandera siempre se ve. (El cliente ya recibe solo los `champion_picks` que el RLS permite; si no hay pick visible para un usuario, 🛡️.)
- Fila propia resaltada en lima (como hoy).
- Escritorio: se conservan las columnas exactos/resultados/bonus. Móvil: como hoy, solo #, jugador (con bandera) y pts.

## Alcance / no-cambios

- Sin cambios de reglas, scoring, esquema, RLS ni datos.
- Sin imágenes externas (solo emojis de bandera ya presentes).
- Auth, cierres, compartir, reglas plegables: intactos.
- Tests `node --test tests/` siguen verdes (no se toca scoring).

## Componentes a tocar

- `js/game.js`: `pickRowHtml` (cabecera de enfrentamiento + controles con bandera por tipo), `pickLabel` (sin cambios de texto, ya escapado), `rankingHtml` (medallas + bandera del campeón), un helper `champFlagFor(userId)` que lee `data.picks` (respeta lo que entregó el RLS). Posible helper `teamFlag(id)`.
- `styles.css` (al final): `.pick-matchup`, banderas, botones 1x2 con bandera, medallas en `.rank-table`.

## Verificación

- Browser puerto fresco: grupos (enfrentamiento + 3 botones con bandera), eliminatorias (avanza con bandera + penales), final (steppers con bandera), bloqueadas, ranking con medallas y bandera de campeón (propia visible, ajenas 🛡️ antes del cierre). Móvil 375px sin overflow. Estilo: solo tokens existentes. `node --test tests/` verde.
