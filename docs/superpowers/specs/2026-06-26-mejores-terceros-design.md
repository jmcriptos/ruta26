# Tarjeta "Mejores terceros" — diseño

**Fecha:** 2026-06-26
**Sección afectada:** `#equipos` ("48 selecciones") — grilla de grupos
**Estado del dato:** ya calculado, sin pintar

## Problema

La app calcula el ranking de los terceros de cada grupo (`state.thirds` vía
`WC.standings.rankThirds`, [app.js:67](../../../js/app.js)) pero ese dato solo se
usa internamente para decidir qué equipos quedan eliminados. El usuario no puede
ver **qué terceros están clasificando** a dieciseisavos (los 8 mejores de 12
grupos avanzan), que es una de las preguntas más frecuentes durante la fase de
grupos del Mundial 2026 (48 equipos, 12 grupos).

## Objetivo

Mostrar el ranking de mejores terceros como una tarjeta dentro de la sección de
grupos, marcando claramente quién clasifica (top 8) y quién no, sin introducir
plomería de datos nueva.

## Decisiones de diseño (acordadas con el usuario)

1. **Alcance:** mostrar los **12 terceros** con una **línea de corte** tras el 8º
   (no solo el top 8), para que se vea quién está al borde.
2. **Provisionalidad:** marcar a los terceros cuyo grupo aún no cerró (`pj < 3`)
   con **asterisco + nota al pie** ("Ambos"): el `*` junto al equipo y una nota
   general explicando que es provisional hasta cerrar la fase de grupos.
3. **Columnas:** **las mismas que las tablas de grupo** — Pos · Equipo · PJ · PG ·
   PE · PP · DG · PTS — para máxima consistencia visual.

## Ubicación

Nueva tarjeta al final de `#groupsGrid`, **después** de las 12 tarjetas de grupo.
Ocupa el ancho de una tarjeta de grupo normal, por lo que se integra en la grilla
existente sin tocar el layout responsive.

## Estructura visual

```
┌─ Mejores terceros ───────────────────────────┐
│  #  Equipo            PJ PG PE PP  DG  PTS     │
│  1  🇸🇪 Suecia         3  1  1  1   0    4   ✅ │  ← verde (.qualifying)
│  …                                              │
│  8  🇩🇿 Argelia *      2  1  0  1  -2    3   ✅ │
│ ─────── clasifican 8 · línea de corte ─────── │  ← divisor
│  9  🏴 Escocia         3  1  0  2  -3    3      │  ← gris (fuera)
│  …                                              │
│ 12  🇨🇩 RD Congo *     2  0  1  1  -1    1      │
│                                                 │
│ * Grupo aún en curso. Provisional hasta cerrar │
│   la fase de grupos.                            │
└─────────────────────────────────────────────────┘
```

- **Encabezado:** título "Mejores terceros" + reusa `.gt-head` para la fila de
  columnas.
- **Filas:** reusan `.gt-row` / `.gt-team-row`. Cada fila incluye la etiqueta del
  grupo de origen junto al equipo (p. ej. "Gr. F") para identificar de qué grupo
  sale ese tercero.
- **Verde:** filas 1–8 con la clase existente `.qualifying`.
- **Línea de corte:** divisor visual entre el 8º y el 9º con micro-texto
  "clasifican los 8 mejores".
- **Asterisco:** equipos con `pj < 3`.
- **Nota al pie:** texto de provisionalidad dentro de la tarjeta.

## Arquitectura

- **Función nueva `renderThirds(thirds, teamsById)` en [app.js](../../../js/app.js):**
  función **pura de presentación** que recibe el array ya ordenado (`state.thirds`)
  y el lookup de equipos, y devuelve un string de HTML (la tarjeta). No calcula
  nada: el orden y `qualifies` vienen de `rankThirds`.
- **Integración:** se invoca al final de `renderGroups()` y su salida se concatena
  a `groupsGrid.innerHTML` después de las tarjetas de grupo.
- **Interacción:** cada fila lleva `data-team-id`, por lo que reutiliza el handler
  de clic existente que abre el panel del equipo. No requiere listener nuevo.
- **Estado vacío:** si no hay terceros con datos útiles (ningún partido jugado), la
  función devuelve string vacío y no se renderiza la tarjeta.
- **Filtro de búsqueda:** la tarjeta de terceros se muestra solo cuando el campo de
  búsqueda de equipos está vacío (es un ranking global, no tiene sentido filtrarlo
  fila a fila como las tablas de grupo).

## No se toca

- `computeGroups`, `rankThirds`, `groupFinished` en
  [standings.js](../../../js/standings.js) — ya existen y tienen tests.
- Layout de la grilla de grupos ni el resto de secciones.

## CSS

Reutiliza `.group-card`, `.group-table`, `.gt-row`, `.gt-head`, `.gt-team-row`,
`.gt-pos`, `.gt-team`, `.gt-pts`, `.qualifying`. Agrega solo:

- `.thirds-card` (variante de `.group-card` para el título y el ancho).
- Estilo del **divisor de línea de corte**.
- Estilo de la **nota al pie** (`.thirds-note`).

## Testing

- El cálculo del ranking ya está cubierto por `tests/` (lógica de `rankThirds`).
- Añadir un test mínimo de render para `renderThirds`: dado un array de 12 terceros
  (mezcla de `qualifies` true/false y de `pj` 2 y 3), verificar que (a) marca 8 filas
  como `qualifying`, (b) inserta el divisor entre el 8º y el 9º, (c) pone asterisco
  solo en los `pj < 3`. Requiere que `renderThirds` sea pura (devuelve string), sin
  tocar el DOM.

## Fuera de alcance (YAGNI)

- Escenarios "qué necesita X para clasificar" (es otra feature).
- Ordenar/filtrar interactivamente la tabla de terceros.
- Mostrar el ranking de terceros también en la sección del bracket (`#ruta`).
