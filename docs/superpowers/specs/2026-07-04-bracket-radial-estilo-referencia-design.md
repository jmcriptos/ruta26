# Bracket de La Ruta: rutas rectangulares y estética de referencia

**Fecha:** 2026-07-04
**Estado:** Aprobado por JM (validado visualmente con mockups en el preview)

## Objetivo

Acercar el bracket radial de "La Ruta" (`#ruta`, `js/bracket.js` + `js/radial-layout.js`)
al estilo del bracket de referencia compartido por JM: rutas estructuradas
(rectangulares), halo dorado central, copa protagonista y ruta del clasificado
en blanco.

## Decisiones validadas (mockups A/B con el visual companion)

1. **Rutas rectangulares** (elegido B: sin puntos en las esquinas): cada
   conexión hijo→padre se dibuja como tramo RADIAL hacia adentro (mismo ángulo
   del hijo, hasta el radio del anillo padre) + tramo de ARCO sobre el anillo
   padre (del ángulo del hijo al ángulo del padre). Sin `<circle>` en los codos.
2. **Halo dorado central**: fondo del lienzo con dorado más cálido y amplio.
3. **Copa más grande y brillante**: emoji 🏆 (sin asset nuevo) a ~84px en
   desktop con doble drop-shadow dorado; en móvil escala con el viewport.
4. **Ruta del equipo seleccionado en blanco**: tramos jugados en blanco sólido,
   tramos futuros en blanco punteado (hoy: lima sólido / lima punteado).
   El aro lima del nodo (`.br-lit`) se conserva.
5. **Sin cambios**: color/peso de líneas base (blanco tenue), estilo de
   eliminados (`.br-dead`), nodos pendientes (`.br-dot`), atenuación con
   selección, panel de equipo, radios de anillos (`RINGS`), datos y lógica.

## Diseño técnico

### `js/radial-layout.js` (módulo puro, dual browser/node)

Añadir geometría de segmento rectangular:

- `nodeAngleDeg(ringIdx, i)` → ángulo en grados del nodo `i` del anillo
  (`(i + 0.5) / n * 360 + ROTATION_DEG`), hoy implícito en `nodePos`.
- `rectSegment(ringIdx, i, size?)` → para la conexión hijo `(ringIdx, i)` →
  padre `(ringIdx+1, parentIndex(i))`, devuelve
  `{ a: {x,y}, c: {x,y}, b: {x,y}, r: <radio del arco en unidades del lienzo>, sweep: 0|1 }`
  donde `a` = nodo hijo, `c` = esquina (radio del padre, ángulo del hijo),
  `b` = nodo padre, `sweep` = dirección del arco (1 si el delta de ángulo
  normalizado a (-180, 180] es positivo). `size` default 100 (coordenadas en %
  del lienzo, igual que `nodePos`).

`nodePos` y `parentIndex` no cambian. La final → centro no usa `rectSegment`
(línea radial directa al centro, como hoy).

### `js/bracket.js`

`linesSvg()` emite `<path d="M a L c A r r 0 0 sweep b">` por conexión usando
`rectSegment`, en vez de `<line>`. Aplica igual para las líneas base y para los
tramos lit/maybe de la ruta (`routeViz` no cambia: sigue devolviendo pares
anillo/índice; solo cambia cómo se dibujan). Los 2 tramos finalista→centro
quedan como `<line>` o `<path>` recto.

### `styles.css`

- `.bracket-radial` background:
  `radial-gradient(circle at 50% 50%, rgba(216,164,64,.45) 0%, rgba(140,100,30,.18) 34%, transparent 62%)`.
- `.br-cup`: `font-size: min(13vw, 84px)`; filtro
  `drop-shadow(0 0 26px rgba(255,190,60,.9)) drop-shadow(0 0 60px rgba(255,170,40,.5))`.
  `.br-trophy.br-has-champ` conserva su realce extra (ajustado al nuevo halo).
- `.br-line-lit`: `stroke: #fff` (grosor actual .45).
- `.br-line-maybe`: `stroke: rgba(255,255,255,.75)` punteado (dasharray actual).
- `.br-line` y `.br-line-*` deben cubrir `<path>` (`fill: none` explícito).

## Casos borde

- **Wrap de ángulos**: conexiones que cruzan el límite 360°→0° (arriba del
  lienzo) deben normalizar el delta a (-180, 180] para elegir `sweep` y no dar
  la vuelta larga al anillo. Test unitario dedicado.
- **Deltas de ángulo pequeños**: el arco entre ángulos cercanos degenera casi
  en recta — correcto, no requiere manejo especial.
- **`stroke-dasharray` en arcos**: el punteado de `.br-line-maybe` funciona
  igual en `<path>`.

## Testing

- `tests/radial-layout.test.js`: nuevos tests de `nodeAngleDeg` y `rectSegment`
  (esquina en el radio del padre y ángulo del hijo, `b` = `nodePos` del padre,
  sweep en ambas direcciones, wrap en el cruce de las 12).
- Visual en preview (desktop 1280 y móvil 375): bracket completo, equipo
  seleccionado con tramo jugado blanco sólido + futuro punteado, halo y copa.
- Suite completa `node --test tests/` sin regresiones.

## Fuera de alcance

- Copa fotorealista (asset): posible follow-up, hoy se mejora el emoji.
- Escudos de federaciones junto a las banderas (la referencia los tiene; no hay
  assets y no fue elegido).
- Cambios de layout/geometría de anillos o del panel de equipo.
