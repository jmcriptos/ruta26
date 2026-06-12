# Detalle de partidos finalizados con datos de ESPN

**Fecha:** 2026-06-11
**Estado:** Aprobado en conversación, pendiente de plan de implementación

## Objetivo

Al tocar la tarjeta de un partido **finalizado**, expandirla ahí mismo mostrando
goleadores, tarjetas y estadísticas del partido (estilo captura de referencia:
posesión con barra, tiros, al arco, faltas, amarillas, rojas, córners, offsides,
atajadas, pases buenos), con un toggle "Ver más / Ver menos".

Solo partidos finalizados. Los partidos en vivo quedan fuera de alcance
(posible iteración futura).

## Fuente de datos: ESPN

La API pública de ESPN (la misma que alimenta su web/app) trae todo lo necesario:

- **Calendario / scoreboard:**
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`
  Lista los eventos del día con `id` ESPN, kickoff UTC, equipos y estado.
- **Detalle / summary:**
  `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={id}`
  Trae `keyEvents` (goles, tarjetas, cambios, con nombre de jugador y minuto) y
  `boxscore.teams[].statistics` con las 10 estadísticas de la captura.
- **CORS abierto (`*`)** — funciona directo desde GitHub Pages, sin proxy.

Verificado el 11-JUN-2026 con México 2-0 Sudáfrica (evento ESPN `760415`):
los valores coinciden exactamente con la captura de referencia (posesión
60.5/39.5, tiros 16/3, pases buenos 467/272, etc.).

La API de FIFA se descartó como fuente del detalle: no expone posesión ni pases
(BallPossession llega `null` en partidos terminados, endpoints de stats dan 404)
y los conteos de faltas/atajadas de su timeline no cuadran con los oficiales.
FIFA sigue siendo la fuente del calendario/resultados como hasta ahora — este
feature no toca ese flujo.

## Arquitectura

Dos piezas nuevas, siguiendo los patrones existentes (módulos IIFE sobre el
namespace `WC`, sin build, sanitización estilo `api.js`):

### 1. Mapeo estático de IDs — `tools/generate-espn-map.js` → `js/espn-map.js`

Los partidos de la app usan IDs de FIFA; ESPN usa los suyos. Un script de
generación (estilo `generate-data.js`) produce el mapeo una sola vez:

- Recorre el scoreboard de ESPN por cada fecha del torneo (11-JUN a 19-JUL 2026).
- Empareja cada evento ESPN con el partido del snapshot FIFA por **kickoff UTC**.
- Desempate cuando hay partidos simultáneos: por equipos (cuando se conocen,
  comparando abreviaturas/nombres normalizados sin acentos) y como segundo
  criterio por ciudad/estadio del venue ESPN.
- Valida que se mapeen los **104 partidos** y falla ruidosamente si no
  (mismo contrato que `generate-data.js`).
- Escribe `js/espn-map.js`: `WC.ESPN_MAP = { "<idFifa>": "<idEspn>", ... }`.

Regenerar si ESPN cambia IDs: `node tools/generate-espn-map.js`.

### 2. Módulo de detalle — `js/match-detail.js` (`WC.matchDetail`)

- **Disparo:** las tarjetas con `status === "played"` muestran un toggle
  "Ver más". Al tocarlo se expande el detalle dentro de la misma tarjeta.
- **Carga:** primero revisa caché en localStorage
  (`wc26-detail-v1:<idFifa>`); si no está, hace **un solo fetch** al summary
  de ESPN con timeout (mismo patrón AbortController de `api.js`).
- **Parseo:** extrae un modelo compacto y sanitizado:
  - `events`: goles (incluye penales y autogoles, marcados como tales),
    amarillas y rojas, por equipo, con minuto y nombre del jugador.
    Los cambios (sustituciones) NO se muestran.
  - `stats`: posesión, tiros, al arco, faltas, amarillas, rojas, córners,
    offsides, atajadas, pases buenos (de `boxscore`, par local/visitante).
  - Sanitización estilo `api.js` (`safeInt`, texto limpio y acotado);
    campos faltantes → se omite la fila, nunca rompe el render.
- **Caché:** se guarda el **modelo parseado** (pequeño, no los ~400 KB del
  summary crudo) y para siempre — las stats de un partido finalizado no
  cambian. Escritura tolerante a fallos (Safari privado), como `writeCache`.
- **Estados de UI:** "Cargando…" mientras llega el fetch; si falla, mensaje
  "No se pudo cargar el detalle" con botón "Reintentar". Si el partido no
  está en `ESPN_MAP`, el toggle no se muestra.

### Integración con `app.js`

- `matchCard()` agrega el toggle y un contenedor vacío para el detalle en
  tarjetas finalizadas.
- Delegación de eventos en `matchesGrid` (patrón existente de `.match-tabs`).
- Los re-renders (filtros, polling) colapsan el detalle abierto — aceptable;
  reabrir es instantáneo gracias al caché.

## UI del detalle (referencia: captura FIFA/ESPN)

- **Eventos:** dos columnas — local alineado a la izquierda, visitante a la
  derecha. Cada línea: minuto + icono (⚽ gol, 🟨 amarilla, 🟥 roja) + nombre.
  Goles de penal con sufijo "(P)", autogoles "(AG)".
- **Posesión:** fila con porcentajes y barra bicolor (verde local / azul
  visitante), estilo de la captura.
- **Stats:** filas `valor local — etiqueta centrada — valor visitante`.
- **Toggle:** "Ver más" expande, "Ver menos" colapsa.
- Estilos en `styles.css` siguiendo el tema existente de la app (claro,
  papel/lima) — la captura de referencia define el contenido y layout, no la
  paleta.
- El CSP de `index.html` debe sumar `https://site.api.espn.com` a `connect-src`.

## Manejo de errores

- Fetch con timeout de 10 s; error o respuesta inválida → estado de error con
  retry, sin afectar el resto de la app.
- ESPN caído o sin CORS algún día → el detalle no carga; el calendario y
  resultados (FIFA) siguen funcionando igual.
- JSON inesperado → el parser devuelve solo lo que pudo extraer; filas
  ausentes se omiten.

## Testing

- `tests/match-detail.test.js` (node `--test`, como los 19 existentes):
  - Parser del summary: fixture recortado del JSON real de ESPN → modelo
    esperado (eventos por equipo, las 10 stats).
  - Campos faltantes/nulos: no lanza, omite filas.
  - Sanitización: minutos/valores fuera de rango, strings con control chars.
- Lógica de matching del generador (kickoff + desempates) extraída a función
  pura testeable.
- Verificación manual con Playwright sobre `python3 -m http.server` en puerto
  nuevo (el navegador cachea JS agresivamente).
