# Bracket simétrico estilo clásico — "La ruta al título"

**Fecha:** 11 de junio de 2026
**Estado:** diseño aprobado en conversación, pendiente plan
**Reemplaza la presentación de:** la sección bracket actual (`js/bracket.js`, 5 columnas izquierda→derecha + pestañas móviles)

## Objetivo

Rediseñar "La ruta al título" como el bracket clásico tipo llave (estilo Qatar 2022): mitades que convergen a la **final central con trofeo**, cajas compactas con bandera + código de 3 letras. Conservar toda la interactividad actual (elegir equipo ilumina su camino, escenarios 1º/2º/3º, cruces sin definir legibles).

## Restricción que define el diseño

2026 tiene 48 equipos → **32 en eliminatorias**: 16 dieciseisavos (8 por mitad), el doble que Qatar. El bracket simétrico completo solo cabe en escritorio; en móvil se muestra **una mitad a la vez**.

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Cajas | Bandera + código de 3 letras (`team.code`: MEX, ARG, ESP…) |
| Escritorio | Bracket simétrico completo: izquierda → Final+🏆 ← derecha |
| Móvil | Una mitad a la vez; al elegir equipo se muestra SU mitad con su camino |
| Grupos | Fuera del bracket (las tablas ya están en la sección Equipos) |
| Líneas conectoras | El layout columnar simétrico + final central da el look; conectores CSS exactos quedan como pulido posterior (frágiles en bracket responsive) |
| Lógica de rutas/escenarios/cruces | Se reutiliza intacta |

## Estructura del cuadro (árbol real FIFA)

- Final (partido 104) = ganador SF1 vs ganador SF2.
- **Mitad izquierda** alimenta SF1 (partido 101 = W97 vs W98): cuartos 97, 98; octavos 89, 90, 93, 94; dieciseisavos 73, 74, 75, 77, 81, 82, 83, 84.
- **Mitad derecha** alimenta SF2 (partido 102 = W99 vs W100): cuartos 99, 100; octavos 91, 92, 95, 96; dieciseisavos 76, 78, 79, 80, 85, 86, 87, 88.

El lado de cada partido KO se **calcula** siguiendo la cadena de ganadores (`W##`) hasta llegar a la semifinal 101 (izquierda) o 102 (derecha) — no se hardcodea. El partido por el 3er puesto queda fuera del árbol simétrico (se muestra como nota bajo la final, como hoy).

## UI

### Escritorio (≥ 681px)

- Columnas: `16avos | 8vos | 4tos | Semi || FINAL(🏆) || Semi | 4tos | 8vos | 16avos`.
- La mitad derecha es espejo (las cajas crecen de afuera hacia el centro; líneas conectoras hacia el centro).
- Cada caja: bandera + código (3 letras) por equipo; si no hay equipo, la etiqueta corta del placeholder ("1A", "3·EHIK" → "Mejor 3º", "W74" → "Gana 74"). Ganador en lima.
- Final central: caja destacada + 🏆 + fecha/sede.
- Selección: el camino del equipo se ilumina en lima (cajas + líneas); el resto se atenúa. Toggle 1º/2º/3º igual que hoy.

### Móvil (≤ 680px)

- Reemplaza las pestañas por ronda.
- **Sin equipo seleccionado:** muestra el lado izquierdo (16avos→Final) con un toggle "◀ Izquierda · Derecha ▶" para alternar mitad.
- **Con equipo seleccionado:** muestra la mitad a la que pertenece su camino, con su ruta iluminada hacia la final. El toggle de escenario 1º/2º/3º sigue disponible.
- 5 columnas compactas (16avos→Final) caben en 375px con cajas de bandera + código y scroll vertical.

## Componentes a tocar

- `js/standings.js`: nueva función pura `bracketSide(matchNum, matchesByNum)` → `"left"|"right"|null` (sigue la cadena W## hasta 101/102). Testeable con `node --test`.
- `js/bracket.js`: reescritura del `render()` — layout simétrico en escritorio, media-llave en móvil; cajas con código; líneas conectoras; toggle de lado en móvil. Se reutilizan `routeClasses`, `selectTeam`, `syncScenario`, `teamRoute`, `resolveSlot`.
- `styles.css`: estilos del bracket simétrico, cajas compactas, líneas conectoras, espejo de la mitad derecha, vista móvil de media-llave. Solo tokens existentes.
- `index.html`: el `#roundTabs` se reemplaza/repurposa por el toggle de lado móvil (o se elimina y se agrega un `#bracketSide`).

## Lo que NO cambia

- Cálculo de tablas, terceros, rutas, escenarios, resolución de cruces (`standings.js` salvo la función nueva).
- El panel de equipo y su CTA "Ver su ruta en el bracket" (sigue seleccionando el equipo).
- Datos, scoring, quiniela, auth.

## Verificación

- `node --test tests/`: nueva prueba de `bracketSide` (izquierda/derecha correctas para una muestra de partidos; null para grupos).
- Browser: escritorio simétrico con final central; elegir equipo ilumina su camino a ambos lados según corresponda; placeholders legibles. Móvil: media-llave, toggle de lado sin equipo, salto a la mitad correcta al elegir equipo; sin overflow horizontal a 375px. Estilo: solo tokens existentes; sin colores/fuentes nuevos.

## Fuera de alcance (YAGNI)

- Líneas SVG curvas (bastan conectores CSS rectos). Animaciones de transición. Grupos dentro del bracket. Zoom/pinch.
