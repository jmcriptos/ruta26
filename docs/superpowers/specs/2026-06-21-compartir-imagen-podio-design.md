# Compartir imagen del podio en WhatsApp

**Fecha:** 2026-06-21
**Estado:** Aprobado (diseño)

## Objetivo

Al tocar **Compartir** en "Mi jornada", además del texto, enviar una **imagen
diseñada del podio** (Top 3 + tu posición + branding + link), lista para WhatsApp.

## Decisiones (de JM)

- **Imagen = tarjeta diseñada en Canvas** (no captura del DOM): nítida, on-brand,
  sin librerías externas.
- **Contenido:** podio Top 3 (bandera/nombre/medalla/pts) + tu posición ("vas Nº con
  P pts") + branding "Ruta al título" + el link.
- **Fallback** (desktop / navegador sin compartir-archivos): **descargar el PNG +
  copiar texto/link** al portapapeles.

## Arquitectura

### 1. `js/share-card.js` (nuevo módulo, browser)

Expone `WC.shareCard.podiumBlob(data)` → `Promise<Blob>` (PNG).

- `data = { top3, me, teams, url }`:
  - `top3`: array de hasta 3 filas de `buildLeaderboard` (orden por puntos→%), cada
    una con `{ userId, username, points }`.
  - `me`: la fila del usuario logueado (`{ pos, points }`) o `null`.
  - `teams`: `WC.state.teams` (para la bandera del campeón vía `champ-pick`).
  - `url`: enlace a `#quiniela`.
- **Bandera por jugador:** la del **campeón elegido** del jugador (misma que el podio
  en pantalla, `champFlagFor`). El módulo recibe ya resuelto el emoji de bandera por
  fila (game.js pasa `flag` en cada `top3[i]`), para no depender del DOM.
- **Lienzo:** `<canvas>` offscreen **1080×1350** (4:5). Dibuja:
  - Fondo ink `#0a1512`.
  - Branding: bolita lima "26" + "RUTA AL TÍTULO" + "Quiniela Mundial 2026".
  - Podio: 3 columnas (centro=1º más alto lima, izq=2º plata `#c9ccc4`, der=3º bronce
    `#d8a56b`); por columna: medalla (🥇/🥈/🥉 por escalón), bandera, nombre
    (truncado), pts en lima, bloque con el número de escalón.
  - Línea personal: "Vas {me.pos}º con {me.points} pts" en una pastilla lima tenue
    (omitir si `me` es null).
  - Pie: `{url sin protocolo}` + "¡Únete a la quiniela! ⚽".
- **Fuentes/emoji:** `await document.fonts.ready` antes de dibujar (League Spartan para
  números/títulos, DM Sans para texto). Banderas y medallas con `fillText` (usan la
  fuente de emoji del SO del usuario — es client-side).
- Devuelve el PNG con `canvas.toBlob(resolve, "image/png")`.
- Puro respecto al DOM salvo crear el canvas; **no** lee la tabla del DOM.

### 2. `js/game.js` — handler de Compartir (`#pmsShare`)

El handler pasa a ser **async**:
1. Arma los datos: `rows = WC.scoring.buildLeaderboard(...)`; `top3 = rows.slice(0,3)`
   con `flag = champFlagFor(userId)` por fila; `me = rows.find(meId)`; `url`.
2. Feedback: el botón muestra "Generando…" mientras tanto.
3. `blob = await WC.shareCard.podiumBlob({ top3, me, teams, url })`.
4. `file = new File([blob], "ruta26-podio.png", { type: "image/png" })`.
5. **Compartir según soporte:**
   - Si `navigator.canShare && navigator.canShare({ files: [file] })` →
     `await navigator.share({ files: [file], text })` (text = la narración + link,
     lo que ya arma "Mi jornada"). En WhatsApp queda imagen + caption.
   - Si NO → **fallback**: descargar el PNG (anchor `download`) + copiar `text` al
     portapapeles; feedback "Imagen descargada · texto copiado".
6. **Errores** (canvas/share falla, o el usuario cancela): si es cancelación del share
   no hacer nada; si es error real → caer a compartir/copiar **solo texto** (como hoy).
7. Restaurar el texto del botón ("Compartir") al terminar.

Mantener el `data-share` (texto = narración completa + link) como hoy; el handler lo
lee para el caption/clipboard.

### 3. `index.html`

Cargar `<script src="js/share-card.js">` antes de `game.js` (la Action versiona el
`?v=` automáticamente).

## Casos borde

- `me` null → omitir la línea personal; el podio igual se dibuja.
- Menos de 3 jugadores → dibujar solo los escalones que existan.
- Sin `WC.shareCard` (no cargó) o canvas falla → fallback a texto (no romper Compartir).
- Cancelar la hoja de compartir → no error, no fallback.

## Pruebas

- **Visual:** en el preview, generar el PNG (`podiumBlob` → `URL.createObjectURL` →
  `<img>`), screenshot y revisar la tarjeta (branding, podio, línea personal, link).
- **Soporte/fallback:** en desktop (sin `canShare files`) confirmar que descarga el
  PNG y copia el texto; en consola sin errores.
- La lógica de armado de datos (top3/me) es trivial y ya cubierta por `scoring` tests;
  el dibujo es canvas → validación visual.

## Alcance / lo que NO cambia

- Solo el botón **Compartir** de "Mi jornada". Scoring, engagement, ranking (en vivo y
  definitivo) y el resto del loop quedan igual.
- Sin librerías externas (Canvas nativo).
