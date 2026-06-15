# Clasificados provisionales en el gráfico de la ruta

**Fecha:** 2026-06-15
**Estado:** Aprobado por JM en conversación

## Contexto

El gráfico de "La ruta al título" (`js/bracket.js`) ya se actualiza solo: en cada
`applyData` (polling FIFA + carga) se recalculan las tablas (`recompute`) y se
re-renderiza (`renderAll → WC.bracket.render`). Ya muestra marcadores de
eliminatorias y resalta/avanza a los ganadores. Pero los cruces que dependen de
grupos (`1A`, `2B`…) solo se resuelven cuando el grupo cierra sus 3 partidos
(`resolveSlot` exige `groupFinished`), así que durante la fase de grupos el
bracket muestra placeholders y parece estático.

## Objetivo

Mostrar en el bracket los **clasificados provisionales** (quién va 1.º/2.º de
cada grupo según los resultados parciales), marcados visualmente como
provisionales, para que el gráfico refleje los resultados desde la primera
jornada. Al cerrar el grupo, el equipo se vuelve definitivo automáticamente.

## Diseño

### `js/standings.js` — `resolveSlot(ph, ctx, opts)`

Nuevo tercer parámetro opcional `opts`. Sin `opts` el comportamiento es idéntico
al actual (no se rompe ningún consumidor). El valor de retorno gana el campo
`provisional` (boolean; default `false`).

Para un slot de grupo `^([12])([A-L])$`:
- `groupFinished(g)` → `{ teamId: tabla[pos-1].teamId, label: "", provisional: false }` (como hoy).
- `opts.provisional === true` **y** el grupo tiene ≥1 partido jugado
  (`tabla.some(r => r.pj > 0)`) → `{ teamId: tabla[pos-1].teamId, label: pos+"º grupo "+g, provisional: true }`
  (devuelve el equipo provisional **y** la etiqueta).
- En cualquier otro caso (sin `opts`, o grupo sin partidos jugados) →
  `{ teamId: null, label: pos+"º grupo "+g, provisional: false }` (placeholder, como hoy).

Los demás slots (`3…` mejores terceros, `W…`/`RU…` ganador/perdedor) no cambian;
solo se les añade `provisional: false` al objeto de retorno por consistencia.

### `js/bracket.js` — `teamBox`

Llama a `resolveSlot(..., ctx, { provisional: true })`. Si el equipo proviene del
slot (no de `m.home`/`m.away` ya definidos) y `slot.provisional`, marca la caja
con una clase (`b-prov`) y `title="Clasificado provisional"`. Muestra bandera +
código igual que un equipo resuelto. El resaltado de ganador (`b-winner`) no
aplica a estos (su partido de eliminatoria aún no se juega).

### `styles.css`

Clase `.b-prov`: equipo atenuado (opacidad ~.7) con un indicador sutil
(p. ej. borde punteado o un "•" tenue) que lo distingue de un clasificado
confirmado, sin romper el layout del bracket.

## Alcance / no-cambios

- Solo el gráfico de la ruta usa el flag `provisional`. Las tarjetas de partido
  (`app.js`) y la ruta del equipo seleccionado (`teamRoute`/`routeClasses`) no lo
  pasan → su comportamiento no cambia.
- Los "mejores terceros" siguen como placeholder hasta que la API los asigne
  (no se calculan provisionalmente).

## Errores / bordes

- Grupo 0-0-0-0 (sin jugar) → placeholder, sin provisional (un orden sin partidos
  no es informativo).
- Empate de puntos en provisional → se usa el desempate existente (DG, GF,
  nombre); puede cambiar con el próximo partido, por eso va marcado como
  provisional.

## Testing

- `tests/standings.test.js`: `resolveSlot` con `opts.provisional` →
  - grupo con partidos jugados, no cerrado → teamId provisional + `provisional:true`;
  - mismo caso **sin** opts → `teamId:null` (comportamiento actual intacto);
  - grupo sin jugar + provisional → `teamId:null`;
  - grupo cerrado → definitivo (`provisional:false`).
- Render: verificación en el navegador (con grupos en curso, los octavos muestran
  provisionales marcados; al simular un grupo cerrado, se vuelven definitivos).

## Nota de scope

Toca `js/standings.js`, `js/bracket.js`, `styles.css`, `tests/standings.test.js`,
`index.html` (versiones). **No toca `js/game.js`** → commit limpio, sin enredo con
la feature de timezone pendiente.
