# Resolver las casillas de 3º en el cuadro con la tabla oficial FIFA — diseño

**Fecha:** 2026-06-27
**Sección afectada:** `#ruta` ("La ruta al título") — el bracket
**Relacionado:** [[scoring-eliminatorias-rediseno]], spec `2026-06-26-mejores-terceros-design.md`

## Problema

El cuadro tiene **8 casillas de tercero** en dieciseisavos. Hoy
`WC.standings.resolveSlot` no las resuelve a un equipo: para un placeholder
`3[A-L]+` devuelve `{ teamId: null, label: "Mejor 3º …" }`, que `js/bracket.js`
acorta a "3º". El usuario quiere ver **qué tercero concreto** ocuparía cada
casilla según los resultados actuales.

Asignar terceros a casillas es el problema canónico de la FIFA: dado *cuáles* 8
de los 12 terceros clasifican, una **tabla oficial** (495 combinaciones, una por
cada subconjunto de 8 grupos de 12) dice exactamente qué tercero enfrenta a cada
ganador de grupo.

## Objetivo

Resolver, **de forma provisional y en vivo**, cada casilla de 3º al equipo que la
tabla oficial asigna según el top-8 actual de terceros — sin tocar la ruta que ya
usa los equipos reales cuando la API de FIFA los rellena al cerrar la fase.

## Datos de partida (verificados)

Los 8 partidos de dieciseisavos con casilla de tercero, su ganador emparejado y el
placeholder actual (extraídos de `js/data.js`):

| match | gana (placeholder) | placeholder 3º |
|-------|--------------------|----------------|
| 74 | 1E | 3ABCDF |
| 77 | 1I | 3CDFGH |
| 79 | 1A | 3CEFHI |
| 80 | 1L | 3EHIJK |
| 81 | 1D | 3BEFIJ |
| 82 | 1G | 3AEHIJ |
| 85 | 1B | 3EFGIJ |
| 87 | 1K | 3DEIJL |

Esto coincide exactamente con la tabla de Wikipedia (columnas `1A vs`, `1B vs`,
`1D vs`, `1E vs`, `1G vs`, `1I vs`, `1K vs`, `1L vs`). El placeholder `3XXXXX`
es solo el conjunto de grupos candidatos; **no se necesita interpretarlo** para
resolver: basta el grupo del ganador hermano del partido.

## Algoritmo (provisional, en vivo)

1. `rankThirds(tables)` ya entrega los 12 terceros ordenados con `qualifies`.
   Tomar los 8 con `qualifies === true`; sus grupos, ordenados alfabéticamente y
   concatenados, forman la **clave** (ej. `"BDEFIJKL"`).
2. `allocation[clave]` → objeto `{ A:'E', B:'J', D:'B', E:'D', G:'I', I:'F',
   K:'L', L:'K' }` (grupo del ganador → grupo del tercero asignado).
3. Para una casilla de 3º cuyo ganador hermano es del grupo `W`:
   `grupoTercero = allocation[clave][W]`; el equipo es el 3º de ese grupo:
   `tables[grupoTercero][2].teamId`.

Ejemplo verificado (Wikipedia, combinación 67 `B D E F I J K L`):
`allocation["BDEFIJKL"] = {A:'E', B:'J', D:'B', E:'D', G:'I', I:'F', K:'L', L:'K'}`
→ el conjunto de valores `{E,J,B,D,I,F,L,K}` es exactamente la clave (invariante).

## Componentes

### `js/thirds-allocation.js` (generado)

Módulo de datos puro, patrón UMD idéntico a `js/standings.js`:
`root.WC.thirdsAllocation` + `module.exports`. Exporta el mapa
`clave(8 grupos ordenados) → { ganador: grupoTercero }`. ~495 entradas.
Encabezado con comentario "generado por tools/generate-thirds-allocation.js — no
editar a mano".

### `tools/generate-thirds-allocation.js` (generador)

- Descarga la tabla desde Wikipedia vía la **API de MediaWiki** (`action=parse`
  del template/artículo de la fase eliminatoria), que devuelve contenido
  parseable (no scraping frágil de HTML renderizado).
- Parsea las 495 filas: clave (8 grupos) + 8 asignaciones por columna de ganador.
- **Valida invariantes** antes de escribir, y falla ruidosamente si no se cumplen:
  - exactamente 495 filas;
  - cada fila tiene las 8 claves de ganador `{A,B,D,E,G,I,K,L}`;
  - los 8 grupos-tercero asignados son distintos;
  - el conjunto de grupos-tercero asignados == el conjunto de la clave.
- Escribe `js/thirds-allocation.js`.
- Igual que `tools/generate-data.js`, es re-ejecutable: regenera si la fuente
  cambia. La salida se commitea al repo (la app es estática, sin build).

### `js/standings.js` — nueva función `resolveThird`

`resolveThird(winnerGroup, thirds, tables, allocation)` → `teamId` (string) o
`null`. Pura. Lógica:
- Filtrar `thirds` por `qualifies === true`; si no hay exactamente 8, devolver
  `null` (aún no se puede resolver).
- Construir la clave (grupos de los 8, ordenados).
- `row = allocation[clave]`; si no existe, `null`.
- `g = row[winnerGroup]`; si no existe, `null`.
- Devolver `tables[g] && tables[g][2] ? tables[g][2].teamId : null`.

Se integra en `resolveSlot`, rama `3[A-L]+`: cuando el contexto trae el grupo del
ganador hermano y la asignación está disponible, devolver
`{ teamId, label: "", provisional: true }`; si no, mantener el comportamiento
actual (`{ teamId: null, label: "Mejor 3º …" }`).

**Cómo conoce `resolveSlot` el grupo del ganador:** `resolveSlot` recibe solo el
placeholder y `ctx`. Para no cambiar su firma pública, `js/bracket.js` (que sí
tiene el partido `m`) calcula el grupo del ganador hermano —el placeholder
`1[A-L]` del otro lado— y lo pasa por `ctx` (campo nuevo `winnerGroup`) o por el
tercer argumento `opts`. La rama de terceros usa ese dato + `ctx.thirds` +
`ctx.tables` + `WC.thirdsAllocation`.

### `js/bracket.js` — `teamBox`

`teamBox` ya resuelve slots provisionales y marca con la clase `b-prov` (cursiva
+ `title="Clasificado provisional"`). Para una casilla de 3º:
- Determinar el grupo del ganador hermano (el placeholder `1[A-L]` del otro lado
  del mismo `m`).
- Pasar ese `winnerGroup` y `ctx.thirds` a `resolveSlot`.
- Si resuelve a un equipo, se pinta como provisional (reusa `b-prov`); si no,
  queda "3º" como hoy.

### `index.html`

Cargar `js/thirds-allocation.js` antes de `js/standings.js` (standings lo
consume); bump de versión de `standings.js`, `bracket.js` y `app.js` si cambian.

## Datos (estado y disponibilidad)

`WC.state.thirds` ya se calcula en `app.js` (`recompute`) y se pasa por `ctx`
desde `WC.slotCtx()`. El spec añade `thirds` a `slotCtx()` si no está, para que
`resolveSlot` lo tenga. (Verificar `js/app.js` `slotCtx`: hoy devuelve
`{ tables, matchesByNum, teams }`; añadir `thirds: state.thirds`.)

## Provisionalidad y cierre

- Mientras la fase de grupos esté en curso, la clave se calcula con el top-8
  **actual**; el equipo se marca provisional. La nota del cuadro ya advierte que
  la ruta de un 3º es orientativa.
- Cuando un partido de dieciseisavos ya trae `home`/`away` reales desde la API de
  FIFA, `teamBox` los usa primero (`const id = … m.home/m.away`) — esa ruta no se
  toca, así que al cerrar grupos los equipos reales reemplazan la estimación.

## Testing

- **`tests/thirds-allocation.test.js`** (sobre el módulo generado):
  - 495 entradas exactas;
  - invariante en TODAS las filas (8 ganadores `{A,B,D,E,G,I,K,L}`; valores
    distintos; conjunto de valores == conjunto de la clave);
  - dos filas verbatim de Wikipedia: `BDEFIJKL` → `{A:'E',B:'J',D:'B',E:'D',
    G:'I',I:'F',K:'L',L:'K'}` y `ABCDEFGI` → `{A:'C',B:'G',D:'B',E:'D',G:'A',
    I:'F',K:'E',L:'I'}` (combinación 494: `3C|3G|3B|3D|3A|3F|3E|3I`).
- **`tests/standings.test.js`** (añadir): `resolveThird` con un escenario de 8
  grupos cerrados (terceros conocidos) → asigna el `teamId` correcto a cada
  ganador; devuelve `null` si hay <8 terceros con `qualifies`.
- La suite completa (`node --test tests/`, hoy 159) debe seguir verde.

## Fuera de alcance (YAGNI)

- No se cambia la tarjeta "Mejores terceros" de la sección de grupos.
- No se resuelven escenarios "qué pasa si gana X" para terceros (la ruta de 3º
  sigue siendo el modo orientativo existente).
- No se persiste nada nuevo en Supabase.

## Fuente

Tabla oficial: Wikipedia, "2026 FIFA World Cup knockout stage" / "Template:2026
FIFA World Cup third-place table" (495 combinaciones). Es la representación
canónica de la asignación reglamentaria de FIFA.
