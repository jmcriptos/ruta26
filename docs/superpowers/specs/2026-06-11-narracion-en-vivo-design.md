# Narración en vivo en la tarjeta del partido

**Fecha:** 2026-06-11
**Estado:** Diseño aprobado por JM vía mockup en conversación

## Objetivo

Cuando un partido está **en vivo**, su tarjeta ofrece un botón "Ver narración"
que expande un panel con dos tabs:

- **Narración** (default): jugada a jugada en español, lo más reciente arriba.
  Goles resaltados en lima. Se muestran las últimas 5 jugadas con botón
  "Ver jugadas anteriores" para desplegar el resto.
- **Estadísticas**: el mismo render de eventos + stats que ya existe para
  partidos finalizados, con datos en vivo.

El panel se refresca solo (~60 s) mientras está abierto, con pie
"Actualizado hace X s · Datos: ESPN". Al terminar el partido, la tarjeta
vuelve sola al flujo "Ver más" de finalizados (el re-render del polling FIFA
ya lo hace).

## Fuente de datos (verificado 11-JUN-2026)

Mismo endpoint `summary` ya integrado, ahora con idioma:
`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={id}&lang=es&region=mx`

- `commentary[]`: `{sequence, time.displayValue, text}` — 102 entradas para el
  MEX-RSA, en español. `sequence` asciende cronológicamente (0 = alineaciones);
  entradas sin minuto tienen `time.displayValue` vacío. Texto de gol:
  `"¡Gooooool! México 1, Sudáfrica 0. …"`.
- `keyEvents[].type.text` viene traducido ("Gol", "Tarjeta amarilla") — la
  clasificación de eventos debe pasar a `type.id`, que es independiente del
  idioma: goles vía `scoringPlay === true` (ids 70, 137…), amarilla id "94",
  roja id "93". `shootout`/`penaltyKick`/`ownGoal` se respetan si vienen.
- `boxscore.statistics[].name` NO cambia con el idioma (`possessionPct`…) —
  `parseStats` funciona sin cambios.
- **Todas** las llamadas al summary (vivo y finalizados) pasan a `lang=es` —
  un solo formato. Los modelos ya cacheados en inglés siguen siendo válidos
  (el formato del modelo no cambia).
- Mismo host → **sin cambios de CSP**.

## Decisiones de diseño

- **Colapsado por defecto.** Sin fetch hasta que el usuario abre el panel
  (el summary pesa ~400 KB; abierto se refresca cada 60 s, cerrado nada).
- **Sin caché para vivos.** localStorage solo se usa para finalizados, como hoy.
- **Detección de gol en narración:** regex sobre el texto (`/^¡Go+l/` — matchea
  "¡Gooooool!"). Es solo presentación; si falla, la entrada sale sin resaltar.
- **Minuto del partido** en el pie del panel: el minuto de la entrada más
  reciente que tenga minuto.
- **Vivo vs finalizado lo decide app.js** (ya conoce `m.status`): el botón de
  vivos lleva `data-live="1"`; `toggle()` enruta al flujo vivo o al existente.
- **Transición vivo→finalizado:** el polling FIFA re-renderiza la grilla; la
  tarjeta pasa sola de "Ver narración" a "Ver más". El intervalo de refresco
  se detiene cuando el panel ya no está en el DOM o se colapsa.

## Arquitectura

Todo en `js/match-detail.js` (mismo módulo, sigue siendo el dueño del detalle):

- `parseCommentary(json)` → lista sanitizada `{seq, minute, text, isGoal}`
  ordenada descendente por `seq`. `safeText` ampliado o variante con tope de
  ~300 caracteres para textos de jugadas. Minutos via `safeMinute` (vacío
  permitido → "").
- `eventKind(ev)` pasa a usar `type.id` (93/94) + `scoringPlay`, con fallback
  al texto en inglés actual (compatibilidad con tests/fixtures).
- `renderLive(model, opts)` → tabs + narración (5 o todas) + stats (reusa el
  render existente extraído a `renderStats(model)`) + pie con actualizado/minuto.
- `openLive(matchId, btn)` / lógica de intervalo: fetch inmediato + cada 60 s;
  re-render preservando tab activo y si está desplegado "jugadas anteriores";
  contador "hace X s" con un interval de 1 s; todo se limpia al colapsar o si
  el panel sale del DOM (`isConnected`).
- `app.js`: tarjetas `live` con entrada en `ESPN_MAP` reciben
  `<button data-detail data-live="1">Ver narración</button><div class="match-detail" hidden>`.
  La delegación existente no cambia (mismo `data-detail`).
- CSS: tabs, entrada de narración, entrada-gol (lima), pie. Tema claro existente.

## Errores

- Fetch falla → mismo estado de error con "Reintentar" del flujo actual; el
  intervalo sigue intentando mientras el panel esté abierto.
- `commentary` ausente o vacío → tab muestra "Aún no hay narración disponible";
  el tab de estadísticas puede tener datos igualmente.

## Testing

- `parseCommentary`: orden descendente, sanitización, flag de gol, minuto
  vacío, JSON sin commentary no lanza.
- `eventKind` por `type.id` con textos en español.
- `renderLive`/`renderNarration`: 5 entradas + "anteriores", escape de HTML,
  gol resaltado, estado vacío.
- Suite completa verde; verificación manual en navegador (si hay partido en
  vivo, real; si no, simulando status live con un stub local).
