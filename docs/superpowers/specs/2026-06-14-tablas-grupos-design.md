# Tablas de posiciones por grupo

**Fecha:** 2026-06-14
**Estado:** Aprobado por JM en conversación

## Objetivo

Mostrar la tabla de posiciones de cada grupo del Mundial, calculada desde los
resultados reales, en la sección **Equipos** — reemplazando el mini-resumen
compacto actual (PTS·PJ·DG por equipo) por una tabla ordenada.

## Columnas

`Pos · Equipo · PJ · PG · PE · PP · DG · Pts`

- Sin GF/GC, para que entre sin scroll horizontal en móvil.
- Celda de equipo: bandera + nombre; el nombre se trunca con elipsis si es
  largo (p. ej. "Bosnia y Herzegovina"). Las 6 columnas numéricas con ancho
  fijo estrecho.
- Encabezado de columnas en cada tabla (PJ PG PE PP DG PTS).

## Orden y resaltado

- Orden: `pts → DG → GF → nombre` (el que ya usa `computeGroups`; el desempate
  fino de FIFA por resultado directo no se modela — suficiente para la app).
- Resaltado: las **2 primeras posiciones** con acento lima, **solo cuando el
  grupo ya tiene partidos jugados**. Antes de empezar, tabla neutra en ceros.

## Arquitectura

### `js/standings.js` — `computeGroups`

Hoy calcula por fila `{teamId, pts, pj, gf, gc, dg}`. Se agrega **`pg, pe, pp`**
(ganados/empatados/perdidos) en el mismo recorrido de partidos:

- victoria local → `h.pg++`, `a.pp++`; visitante → `a.pg++`, `h.pp++`;
  empate → `h.pe++`, `a.pe++`.

El orden de desempate y el resto de la API (`groupFinished`, `rankThirds`,
`resolveSlot`…) no cambian.

### `tests/standings.test.js`

Actualizar/añadir asserts para `pg/pe/pp` (victoria, empate, derrota se cuentan
bien; suman `pg+pe+pp === pj`).

### `js/app.js` — `renderGroups`

Cada `.group-card` arma una tabla en vez de la lista compacta:

- Fila de encabezado con las etiquetas de columnas.
- Una fila por equipo (en orden de `state.tables[g]`), clicable
  (`data-team-id`, abre el panel del equipo por delegación existente).
- Resalta las filas de posición 1 y 2 con la clase de "clasificando" cuando hay
  partidos jugados (`played`).
- La búsqueda por nombre dentro de Equipos sigue filtrando filas como hoy.
- Si el grupo no tiene partidos jugados, se muestran las columnas en 0 sin
  resaltado.

### `styles.css`

Estilos de la tabla: grid de columnas (equipo `1fr` con `min-width:0` para la
elipsis; numéricas ancho fijo), encabezado tenue, fila clicable con hover,
resaltado top-2 (acento lima en el borde/posición).

## Errores / bordes

- Grupo sin resultados → ceros, orden por defecto, sin resaltado.
- Nombres largos → elipsis, sin romper el ancho.
- Equipos sin grupo (no debería ocurrir en fase de grupos) → no aparecen.

## Testing

- `computeGroups` con `pg/pe/pp` cubierto en `tests/standings.test.js`
  (`node --test`).
- El render de la tabla se verifica en el navegador con los resultados reales
  (ya hay partidos jugados): columnas correctas, orden, resaltado top-2,
  clic abre el panel del equipo, sin scroll horizontal en móvil.

## Nota de scope

Esta feature toca `js/standings.js`, `js/app.js`, `styles.css` y
`tests/standings.test.js` — **no toca `js/game.js`**, así que no interfiere con
los cambios de timezone sin commitear de otra sesión.
