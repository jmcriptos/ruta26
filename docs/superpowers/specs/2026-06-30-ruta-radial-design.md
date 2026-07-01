# La Ruta — bracket radial (diseño)

Fecha: 2026-06-30
Sección afectada: `#ruta` ("La ruta al título") en [index.html](../../../index.html), render en [js/bracket.js](../../../js/bracket.js).

## Objetivo

Rediseñar la sección "La Ruta" para que se vea como un **bracket radial**: las 32
selecciones de 16avos alrededor de un círculo, con las rondas cerrando hacia
adentro (8vos → 4tos → semis → final) y la copa al centro. Debe verse **idéntico
en PC y en móvil** (mismo círculo completo, sin scroll lateral ni cambio de
formato), fiel a la imagen de referencia que aportó el usuario.

## Decisiones tomadas (brainstorming)

- **Móvil = mismo círculo completo** (opción A). No hay vista vertical alterna ni
  zoom: el círculo entero entra en pantalla, en PC y en teléfono.
- **Interacción minimalista** (opción 2): solo banderas sobre el círculo; los
  detalles van a un panel al tocar. Se conserva "elegir equipo → iluminar su ruta".
- **Banderas redondas** (opción B): SVG circulares estilo *circle-flags*,
  guardados en el repo (`assets/flags/`) para carga rápida y offline. No emoji.
- **3er puesto: se elimina por completo** del bracket (no aparece ni como nota).
- Se conserva **toda la capa de datos** actual; cambia solo la presentación.

## Alcance: qué se conserva, qué cambia, qué se quita

### Se conserva (capa de datos, sin tocar)
- Resolución de slots provisionales y de terceros: `WC.standings.resolveSlot`,
  `WC.standings.resolveThird`, `WC.thirdsAllocation`.
- Ruta de un equipo: `WC.standings.teamRoute(teamId, scenario, state)`.
- Árbol del cuadro y lados: `WC.standings.bracketSide`, placeholders `W##`,
  semis num **101** (izquierda) y **102** (derecha).
- Eliminación en fase de grupos: `WC.standings.groupStageEliminated`.
- Selector "Elegir equipo" (`#bracketTeam`) y toggle de escenarios
  (`#scenarioToggle`) para terceros, con su lógica actual (`scenario`,
  `scenarioManual`, `syncScenario`).
- API pública `WC.bracket = { render, select }` (la siguen llamando
  [app.js](../../../js/app.js) y [team-panel.js](../../../js/team-panel.js)).

### Cambia (capa visual, reescritura del render)
- Se reemplazan los constructores de columnas horizontales
  (`columnHtml`, `sideStackHtml`, `finalColumnHtml`, `matchBox`, `teamBox`) por
  un render **radial** (anillos concéntricos + líneas SVG).
- Las banderas pasan de emoji a `<img>` de SVG redondo local.

### Se quita
- El partido de **3er puesto** del render (la lógica de datos puede quedar, pero
  no se dibuja).
- El toggle móvil izquierda/derecha (`#bracketSide`, `mobileSide`, `routeSide`,
  `grid.dataset.mobileSide`): innecesario, el círculo se ve completo.
- **Marcadores y códigos de 3 letras sobre el círculo**: ya no se pintan encima
  de las banderas (van al panel de equipo).

## Layout radial

Lienzo cuadrado responsivo (un contenedor con `aspect-ratio: 1`), centrado en PC
(máx. ~620px de lado) y al 100% del ancho en móvil. Como la imagen de referencia
es vertical, el círculo calza natural en pantalla de teléfono.

**Anillos** (de afuera hacia adentro), con su radio como fracción del lado:

| Anillo | Ronda    | Nodos | Radio aprox. |
|--------|----------|-------|--------------|
| 0      | 16avos   | 32    | 0.455        |
| 1      | 8vos     | 16    | 0.365        |
| 2      | 4tos     | 8     | 0.275        |
| 3      | Semis    | 4     | 0.185        |
| 4      | Final    | 2     | 0.105        |
| centro | Campeón  | 1 (🏆)| 0            |

- **Nodo `i` del anillo `k`** se ubica en ángulo `(i+0.5)/N_k * 360°`, con una
  rotación global de **+90°** para que los dos finalistas (anillo 4) queden a las
  **9 y 3 en punto** (izquierda/derecha de la copa), igual que en la imagen. El
  implementador ajusta la rotación/sentido para clavar la simetría de la foto.
- **Padre** del nodo `i` (anillo `k`) = nodo `floor(i/2)` del anillo `k+1`. Las
  líneas se trazan de cada nodo a su padre; por la alineación de ángulos,
  convergen radialmente hacia la copa.
- **Líneas**: SVG absoluto detrás de las banderas, `stroke` gris tenue
  (~`rgba(255,255,255,.16)`); la ruta iluminada se pinta en lima.

## Orden de las 32 casillas alrededor del círculo

Para que banderas vecinas sean rivales reales y las líneas aniden bien, el orden
del anillo 0 se deriva del **árbol KO existente**, no de un seeding nuevo:

1. Raíz = partido de `stage === "final"`. Sus `phA`/`phB` son `W101`/`W102`.
2. DFS in-order: para cada partido, bajar primero por el hijo de `phA`, luego por
   el de `phB`, resolviendo `W##` → partido cuyo `num` coincide.
3. Al llegar a un partido de 16avos (hoja, cuyos `phA`/`phB` son placeholders de
   grupo tipo `1A`/`2B`/`3CDEF`, no `W##`), emitir **[slot home, slot away]**.
4. El resultado es un array de 32 slots en orden de cuadro. El par `(2i, 2i+1)`
   es un partido de 16avos; su ganador es el nodo `i` del anillo 1; y así.

El **subárbol bajo la semi 101** ocupa la mitad izquierda del círculo y el de la
**102** la derecha (coherente con `bracketSide`).

## Resolución y estado visual de cada nodo

- **Anillo 0 (16avos):** cada slot resuelve su equipo con la lógica actual
  (`resolveSlot` + caso de tercero con `resolveThird`). Si el grupo no cerró, el
  clasificado provisional se muestra **atenuado** (sin asterisco, porque ya no hay
  texto). Si el slot aún no tiene equipo, se dibuja un **punto gris** (placeholder).
- **Anillos 1–4:** un nodo muestra la bandera del **ganador** del partido que lo
  alimenta solo cuando ese partido está `played` y tiene `winner`. Mientras no esté
  decidido, es un **punto gris** (como los anillos internos vacíos de la imagen).
- **Centro:** trofeo siempre visible con resplandor; si la final ya se jugó, el
  campeón puede resaltarse (glow lima alrededor de la copa). Detalle menor, opcional.
- **Equipos eliminados** (`groupStageEliminated` o perdedor en KO): bandera
  **desaturada y opaca**. Equipos vivos: a todo color.

## Interacción

- **Tocar una bandera** (cualquier anillo) → `selectTeam(teamId)`:
  - Ilumina la **ruta completa** del equipo hasta la copa (nodos y líneas en lima),
    reutilizando `teamRoute` y el mapeo de `seg.matches` a posiciones de anillo
    (mismo criterio que `routeClasses` hoy: `lit` para tramos ciertos, `maybe`
    punteado para los provisionales).
  - Abre el panel de equipo existente ([team-panel.js](../../../js/team-panel.js))
    con próximo rival / marcador / ruta. (Hoy el panel se invoca desde otros lados;
    aquí lo dispara el tap en el nodo.)
- **Selector `#bracketTeam`**: se mantiene; al elegir, mismo efecto que el tap.
- **Toggle de escenarios `#scenarioToggle`**: se mantiene; visible solo cuando hay
  un equipo seleccionado cuya ruta depende del escenario de tercero (igual que hoy,
  vía `updateToggle`).
- **Tocar el centro o el fondo** → limpia la selección (`selectTeam("")`).

## Estilo visual (para clavar la imagen)

- Fondo casi negro; **resplandor cálido radial** detrás de la copa central.
- Banderas: `<img>` SVG redondo, con sombra suave; tamaño escala con el lado del
  lienzo (anillo 0 ~7% del lado → ~26px en un teléfono de 380px; más grande en PC).
- Copa central: imagen del **trofeo real** (un asset, p. ej. `assets/trophy.png`)
  con glow; fallback a emoji 🏆 si no carga.
- Ruta iluminada: lima brillante (`var(--lime)`), con leve glow; el resto del
  cuadro queda tenue cuando hay selección (como `has-selection` hoy).
- Reusar variables CSS existentes: `--lime`, `--lime-deep`, `--ink`, `--ink-soft`,
  `--white`.

## Banderas: assets y mapeo

- Descargar los 48 SVG redondos (estilo *circle-flags*, licencia MIT) a
  `assets/flags/<code>.svg`.
- Mapa **código de equipo (3 letras) → archivo de bandera** (ISO 3166-1 alpha-2 en
  minúscula, con casos especiales). Tabla completa de los 48:

```
GER→de  KSA→sa  ALG→dz  ARG→ar  AUS→au  AUT→at  BEL→be  BIH→ba
BRA→br  CPV→cv  CAN→ca  QAT→qa  CZE→cz  COL→co  KOR→kr  CIV→ci
CRO→hr  CUW→cw  ECU→ec  EGY→eg  SCO→gb-sct  ESP→es  USA→us  FRA→fr
GHA→gh  HAI→ht  ENG→gb-eng  IRQ→iq  IRN→ir  JPN→jp  JOR→jo  MAR→ma
MEX→mx  NOR→no  NZL→nz  NED→nl  PAN→pa  PAR→py  POR→pt  COD→cd
SEN→sn  RSA→za  SWE→se  SUI→ch  TUN→tn  TUR→tr  URU→uy  UZB→uz
```

- El mapa vive junto a la lógica de banderas (p. ej. constante `FLAG_CODE` en
  `js/bracket.js` o un pequeño `js/flags.js`). Helper `flagSrc(team)` →
  `assets/flags/${FLAG_CODE[team.code]}.svg`.

## HTML / estructura

- `#ruta` mantiene el encabezado, el `<select id="bracketTeam">` y la nota al pie.
- Se elimina `<div class="bracket-side" id="bracketSide">` (toggle móvil).
- `<div class="bracket-scroll"><div class="bracket" id="bracketGrid"></div></div>`
  se reemplaza por un contenedor radial cuadrado, p. ej.
  `<div class="bracket-radial" id="bracketGrid"></div>` (se conserva el id
  `bracketGrid` para no romper referencias) con `aspect-ratio:1`.

## Versionado de assets

Bump del query de versión de `js/bracket.js` en [index.html](../../../index.html)
(`?v=...`) y registro de los nuevos assets, siguiendo el patrón de
[tools/version-assets.js](../../../tools/version-assets.js) si aplica.

## No-objetivos (YAGNI)

- No animaciones de transición entre rondas (más allá del FLIP/glow que ya exista).
- No zoom/pan en móvil (descartado al elegir opción A).
- No rediseño del panel de equipo ni del resto de secciones.
- No cambios en scoring, quiniela ni datos.

## Riesgos / puntos delicados

- **Orden circular correcto**: el DFS del árbol debe dar rivales adyacentes; probar
  con el cuadro real (semis 101/102) antes de pulir estilo.
- **Legibilidad en móvil**: banderas ~26px en 380px; es el trade-off aceptado de la
  opción A. Verificar que el tap-target sea usable (área tocable algo mayor que la
  bandera).
- **Peso de assets**: 48 SVG livianos; confirmar que entren al cache del service
  worker ([sw.js](../../../sw.js)) si corresponde, para que funcionen offline.
```
