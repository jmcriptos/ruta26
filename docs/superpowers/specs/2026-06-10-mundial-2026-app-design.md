# Ruta 26 — App intuitiva del Mundial 2026

**Fecha:** 10 de junio de 2026 (el torneo inicia el 11 de junio)
**Estado:** diseño aprobado en conversación, pendiente plan de implementación

## Objetivo

Convertir la landing actual en una app de consulta intuitiva donde el usuario pueda:

1. Encontrar todos los partidos de cualquier equipo, con fechas, horas y sedes.
2. Ver resultados reales y marcadores en vivo a medida que avanza el torneo.
3. Visualizar el bracket completo y la ruta posible de cada equipo hacia la final.

## Restricción visual (requisito del usuario)

**Mantener intacto el estilo visual original.** Nada de rediseño: se conservan
los tokens existentes de `styles.css`:

- Fuentes: DM Sans (cuerpo) y League Spartan (display/marca), vía Google Fonts.
- Paleta: `--ink #0a1512`, `--lime #d7ff43`, `--paper #f3f2eb`, `--orange #ff7c42`,
  `--blue #68a7ff`, `--muted`, `--line`, etc.
- Lenguaje visual: fondos paper con secciones oscuras ink, acentos lime,
  bordes redondeados orgánicos, textura de ruido, sombras suaves.

Los componentes nuevos (panel de equipo, bracket, mini-tablas) se construyen
con estas mismas variables y patrones (tarjetas tipo `match-card`/`group-card`,
pills, kickers en mayúsculas, etc.).

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Datos | Calendario real completo: 104 partidos desde la API no oficial de FIFA |
| Vista de equipo | Panel que se abre al hacer clic en cualquier equipo |
| Ruta visual | Bracket interactivo completo (16avos → final) |
| Resultados | Automáticos desde la API de FIFA (verificada: CORS abierto, datos en español) |
| Arquitectura | App estática sin frameworks ni build; JS organizado en módulos clásicos |

## Fuente de datos (verificada el 10 JUN 2026)

API no oficial de FIFA, sin key, con `Access-Control-Allow-Origin: *`:

- Calendario completo: `https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=500&language=es`
- 104 partidos con: equipos (nombre en español), fecha/hora UTC, estadio, ciudad,
  fase, grupo, marcador, estado del partido, y placeholders del bracket
  (`PlaceHolderA/B`, ej. "2A" vs "2B"; rondas posteriores referencian ganadores
  de partidos previos, ej. "W74").
- `IdSeason` 2026: `285023`. `IdMatch` es estable → clave para fusionar datos.

Riesgo: API no oficial, puede cambiar sin aviso. Mitigación: triple respaldo
(abajo) — la app siempre funciona aunque la API muera.

## Arquitectura

Sitio estático (abre con doble clic o cualquier hosting estático). Scripts
clásicos cargados en orden (no ES modules, para que funcione desde `file://`):

```
index.html
styles.css
js/
  data.js        ← snapshot embebido: 48 equipos, 104 partidos, mapa del bracket
  api.js         ← fetch a FIFA + caché localStorage + merge por IdMatch
  standings.js   ← tablas de grupos + ranking de mejores terceros (puro cálculo)
  team-panel.js  ← panel de equipo (render + apertura/cierre)
  bracket.js     ← sección "La ruta": bracket interactivo + iluminación de caminos
  app.js         ← lo existente (hero, búsqueda, partidos, grupos) adaptado
```

`data.js` se genera durante la implementación con un script Node de un solo uso
(`tools/generate-data.js`) que descarga el calendario FIFA y lo serializa. El
script queda en el repo para regenerar el snapshot cuando se quiera.

### Capa de datos en vivo — triple respaldo

1. Al cargar: `fetch` al calendario completo (timeout 10 s).
2. Éxito → merge por `IdMatch` sobre el snapshot, guarda en
   `localStorage` con timestamp, re-render de todo.
3. Fallo → usa el último caché de localStorage; si no existe, el snapshot
   embebido. Indicador discreto "Actualizado hace X min" / "Sin conexión —
   datos del DD MMM".
4. Auto-refresco cada 2 minutos solo si hay partidos en estado "en vivo" o
   programados para hoy; si no, sin polling.

### Cálculo de posiciones (`standings.js`)

- Pts, PJ, DG, GF por grupo a partir de los partidos jugados; orden: puntos,
  diferencia de goles, goles a favor (criterios FIFA simplificados; los
  desempates finos los resuelve la realidad — la API entrega el bracket real).
- Ranking de los 12 terceros (clasifican los 8 mejores).
- Es cálculo puro sobre el array de partidos: testeable y sin DOM.

## Funcionalidad

### Panel de equipo

Clic en cualquier equipo en toda la app (tarjetas de grupo, tarjetas de
partido, resultados de búsqueda, ranking de favoritos) abre un panel lateral
(overlay estilo búsqueda existente, fondo ink, acentos lime) con:

- Bandera, nombre, grupo, posición actual en su grupo (o "eliminado"/fase alcanzada).
- Sus partidos: jugados con resultado, en vivo con marcador y pill naranja,
  próximos con día, hora local del visitante y sede.
- Resumen de su ruta: cadena de fases con fecha y sede según su posición
  actual (antes de terminar grupos, según la posición que lleve).
- Botón "Ver su ruta en el bracket" → cierra el panel, navega a la sección
  bracket con ese equipo preseleccionado.

### Bracket interactivo — sección nueva "La ruta"

- Cuadro completo: 16 partidos de 16avos → 8 octavos → 4 cuartos → 2 semis →
  final (19 JUL, NY/NJ). Columnas con scroll horizontal en móvil.
- Cada cruce: equipos (o placeholder "1A / 2B / mejor 3º"), fecha, sede.
- Selector de equipo (y entrada directa desde el panel). Al elegir:
  - Su camino se ilumina (lime sobre ink); el resto se atenúa.
  - Si su grupo no terminó: toggle "si queda 1º / 2º / 3º". El escenario 3º
    muestra los cruces posibles atenuados/punteados, porque el destino de los
    terceros depende de qué terceros clasifiquen.
  - Con el grupo terminado o en eliminatorias: se muestra la ruta real.
- Los resultados reales van llenando el bracket automáticamente (la API
  reemplaza placeholders con equipos).

### Mejoras a lo existente

- Tarjetas de grupo → mini-tablas de posiciones (Pts, PJ, DG) cuando haya
  partidos jugados; antes muestran la lista actual.
- Pestaña "Resultados" → partidos jugados reales con marcador (reemplaza el
  estado vacío "0–0").
- Horarios en zona horaria del visitante con `Intl.DateTimeFormat` (hoy están
  fijos en UTC−4); etiqueta de zona visible.
- Hero: terminado el partido inaugural, la cuenta regresiva pasa a mostrar el
  próximo partido (o el partido en vivo del momento).
- La búsqueda global y la de equipos abren el panel de equipo en vez de solo
  enlazar a la sección.

## Manejo de errores

- API: timeout 10 s, cadena snapshot → localStorage → live; sin pantallas rotas.
- Partidos sin definir (placeholders): siempre renderizan texto legible
  ("Ganador del partido 74", "Mejor 3º de E/H/I/K").
- localStorage lleno/inaccesible (Safari privado): try/catch, la app funciona
  sin caché.

## Verificación

- Carga normal con red: datos en vivo visibles, indicador de actualización.
- Carga con API bloqueada (DevTools offline): la app funciona con snapshot.
- Panel de equipo desde los 4 puntos de entrada; horarios en hora local.
- Bracket: rutas de un 1º, un 2º y un 3º; placeholders legibles; móvil (375px).
- Estilo visual: cero regresiones — los componentes nuevos usan las variables
  CSS existentes; sin fuentes ni colores nuevos.

## Fuera de alcance (YAGNI)

- Notificaciones, favoritos persistentes, PWA/offline-first, estadísticas de
  jugadores, predicciones propias, backend.
