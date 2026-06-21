# Podio en el ranking definitivo + tipografía de desktop

**Fecha:** 2026-06-21
**Estado:** Aprobado (diseño)

Dos mejoras de UI en una sola entrega, ambas aprobadas por JM:
1. **Podio + lista** en el ranking definitivo (más visual).
2. **Tipografía más grande en PC** (las fuentes se ven chicas en pantallas grandes).

---

## Feature 1: Podio + lista (ranking definitivo)

### Qué cambia
La función `rankingHtml()` (en `js/game.js`) hoy pinta una `<table class="rank-table">` con todas las filas. Pasa a: **podio del Top 3 arriba + tabla con el 4º en adelante**. Es **pura presentación** de las mismas filas de `WC.scoring.buildLeaderboard(...)`; **sin cambios de scoring**.

### Layout
- **Podio (Top 3 por puntos):** 3 escalones. Centro = #1 (más alto), izquierda = #2, derecha = #3 (orden clásico). Cada escalón muestra:
  - la **bandera del campeón** del jugador (`champFlagFor(userId)`, igual que la columna actual),
  - el **nombre** (`esc(username)`),
  - los **puntos**,
  - su **medalla real** por `tier` (`1→🥇, 2→🥈, 3→🥉`).
- **Lista (4º en adelante):** la **tabla actual sin cambios estructurales** — columnas `#/medalla, bandera, Jugador, Exactos, Resultados, % Acierto, Bonus, Pts`, con el sort por %/Pts y el ocultado de columnas en móvil (`.col-x`). Solo se le pasan las filas desde el índice 3.

### Reglas
- **El podio siempre refleja los puntos** (la carrera por el título). El sort por % (`rankSort === "acc"`) **solo reordena la lista de abajo**, no el podio. El podio se arma siempre desde el orden por puntos (`rows`, no `view`).
- **Empates:** el podio toma las 3 primeras filas del orden canónico (puntos, y **% como desempate** — ver Feature 3); cada escalón muestra su **medalla real por `tier`** (dos empatados en puntos en el 1º muestran ambos 🥇, aunque el de mayor % vaya en el escalón central). El escalón (centro/izq/der) es solo orden visual.
- **"Yo":** si el usuario logueado está en el Top 3, su escalón se resalta (borde/anillo lima, clase `.pod-me`); si está en la lista, su fila se resalta como hoy (`tr.me`).
- Se mantienen la bandera de campeón y el botón **"Compartir mi posición"** debajo.

### Casos borde
- **0 jugadores:** "Aún no hay jugadores. ¡Sé el primero!" (como hoy), sin podio.
- **1–3 jugadores:** solo podio (con 1, 2 o 3 escalones), sin tabla.
- **4+ jugadores:** podio (3) + tabla (resto).

### Componentes y archivos
- `js/game.js`:
  - Nueva función `podiumHtml(top3, uid)` → devuelve el HTML del podio (recibe hasta 3 filas ya ordenadas por puntos y el `uid` para el resaltado).
  - `rankingHtml()` parte `rows` en `top3 = rows.slice(0,3)` y `rest = view.slice(3)` (la lista respeta el sort elegido; el podio no). Arma `podiumHtml(top3, uid)` + la tabla con `rest`. Si `rows.length <= 3`, no se pinta tabla.
- `styles.css`: clases del podio (`.podium`, `.pod-step`, `.pod-step.first/second/third`, `.pod-flag`, `.pod-name`, `.pod-pts`, `.pod-medal`, `.pod-block`, `.pod-me`). Escalones con alturas decrecientes; flat (sin gradientes). Tarjeta oscura estilo broadcast (fondo `--ink`/`--ink-soft`, acentos `--lime`) coherente con las tarjetas de engagement. Debe entrar en ~360px (móvil) — los nombres con `text-overflow: ellipsis`.

### Pruebas
- Verificación **visual** (screenshots) en móvil y desktop: podio con 3, con empate en el 1º, con 1–2 jugadores, y el resaltado "yo".
- Los tests de `scoring` ya cubren los datos (pos/tier/orden). El único corte nuevo (`slice(0,3)` / `slice(3)`) es trivial; no requiere test unitario nuevo.

---

## Feature 2: Tipografía de desktop

### Problema
Todas las `@media` son `max-width` (solo achican para móvil/tablet). No hay escalado para desktop y las fuentes son px fijos pensados para móvil → en pantallas grandes (el contenido se centra hasta 1240px) el texto se ve chico. El móvil ya quedó bien (no tocarlo).

### Enfoque
Agregar un **breakpoint de desktop** que **sube el texto** en las zonas densas, sin tocar las reglas `≤980px`.

- En `styles.css`: un bloque nuevo `@media (min-width: 981px) { ... }` que sube ~1–2px el texto de:
  - **Grupos:** `.gt-row > span` (13→14), `.gt-head > span` (11→12), nombre de equipo.
  - **Rankings:** `.rank-table` base (14→15), `.rank-table th` (11→12), `td.num`/`td.pts` un punto.
  - **Partidos:** etiquetas/textos de las match-cards que se vean chicos en PC.
  - **Copy general / secciones** que aplique.
- En `stats.html` (CSS inline propio): un bloque equivalente `@media (min-width: 981px)` que sube las etiquetas e items del dashboard (`.dz-kpi small`, `.dz-bar-row`, leyendas, `.dz-card-head .aside`, etc.).

### Reglas
- **No tocar** las reglas `max-width` existentes (móvil/tablet quedan igual).
- Bump conservador (+1–2px) — el objetivo es legibilidad en PC, no agrandar todo desproporcionadamente. Verificar que no rompa layouts (las columnas de grupos/ranking tienen anchos fijos; revisar que el texto mayor siga entrando, o ajustar el ancho de columna en el mismo breakpoint si hiciera falta).
- Los tamaños exactos por selector se fijan en el plan.

### Pruebas
- Verificación **visual** en desktop (ancho ~1280px): grupos, ranking (con el podio nuevo), partidos y dashboard se leen cómodos; y en móvil (375px) **sin cambios** respecto a lo actual.

---

## Feature 3: Desempate del ranking por % de aciertos

### Qué cambia
En `WC.scoring.buildLeaderboard` (`js/scoring.js`) el comparador de orden actual es
`puntos desc → exactos desc → nombre`. Pasa a **`puntos desc → % aciertos desc → exactos desc → nombre`**.

### Reglas (importante)
- **`pos` y `tier` NO cambian:** se siguen calculando **solo por puntos**. Es decir,
  dos jugadores con los mismos puntos quedan **empatados en posición y medalla** (misma
  `pos`, mismo `tier` → misma 🥇/🥈/🥉). El % **solo decide el orden de aparición**
  dentro de un empate de puntos (quién se muestra/colocae primero en lista y podio).
- **% de aciertos** = `(exact + outcome) / decided`. Si `decided === 0` (sin picks
  resueltos), su valor de orden es `-1` (va al fondo del empate). Misma definición que
  el helper `accValue` de `game.js`, para que el orden por defecto y el toggle de "%"
  sean coherentes.
- Aplica a **ambos** rankings (definitivo y en vivo), porque los dos derivan de
  `buildLeaderboard` / `buildLiveLeaderboard`. Consistente y deseado.
- El **toggle de orden** (`rankSort` pts/%) en `game.js` no cambia; el % como segundo
  criterio solo afecta el **orden por defecto** (por puntos).

### Comparador resultante
```js
function accOf(r) { return r.decided > 0 ? (r.exact + r.outcome) / r.decided : -1; }
rows.sort(function (x, y) {
  return y.points - x.points
    || accOf(y) - accOf(x)
    || y.exact - x.exact
    || (x.username || "").localeCompare(y.username || "", "es");
});
```
El bucle que asigna `pos`/`tier` (por caída de puntos) queda **igual**.

### Pruebas
- Unit en `tests/scoring.test.js`: con puntos iguales y % distinto, el de mayor % va
  primero en el array, pero **ambos tienen la misma `pos` y `tier`**; con `decided=0`
  va al fondo del empate; sin empate de puntos, el % no altera el orden.

---

## Alcance / lo que NO cambia
- El **ranking en vivo** queda igual (tabla con flechas de color). El podio es solo para el **definitivo**.
- Sin cambios de scoring, datos ni backend.
- El versionado de assets es automático (Action) — no hay que bumpear `?v=`.
