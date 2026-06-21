# Compartir imagen del podio en WhatsApp — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el botón **Compartir** de "Mi jornada" envíe una imagen diseñada del podio (Top 3 + tu posición + branding + link), con fallback a descarga + copia en desktop.

**Architecture:** Nuevo módulo browser `js/share-card.js` que dibuja la tarjeta en un `<canvas>` (1080×1350) y devuelve un PNG (`WC.shareCard.podiumBlob`). El handler `#pmsShare` de `js/game.js` pasa a async: arma `top3`/`me` desde `buildLeaderboard`, genera el PNG y comparte con `navigator.share({files})`; si no hay soporte, descarga el PNG + copia el texto. Sin cambios en scoring ni engagement.

**Tech Stack:** JS (browser, IIFE sobre `window.WC`), Canvas 2D nativo (sin librerías), CSS ya existente. GitHub Pages con versionado automático de assets (la Action reescribe `?v=` — NO bumpear a mano).

**Spec:** `docs/superpowers/specs/2026-06-21-compartir-imagen-podio-design.md`

**Rama:** `feat/share-podio` (no main); merge al final con finishing-a-development-branch.

---

## Estructura de archivos

- **Create** `js/share-card.js` — módulo de dibujo del podio en Canvas. Responsabilidad única: `data → Blob PNG`. No lee el DOM (recibe `top3`/`me`/`teams`/`url` ya resueltos).
- **Modify** `index.html` — cargar `js/share-card.js` antes de `js/game.js`.
- **Modify** `js/game.js` — reescribir el handler `#pmsShare` (async, imagen + fallback) y añadir helpers `downloadBlob` / `shareMiJornada`. Corregir el matcheo del click con `closest()` (el botón ahora contiene un `<svg>`).

No se tocan tests existentes; la suite (`node --test tests/`) debe seguir en `fail 0`. La lógica nueva es Canvas (browser) → se valida visualmente (Task 4).

---

## Task 1: Módulo `js/share-card.js` (tarjeta del podio en Canvas)

**Files:**
- Create: `js/share-card.js`

- [ ] **Step 1: Crear `js/share-card.js` con el contenido completo**

```js
/* share-card.js — genera la imagen del podio para compartir (Canvas, browser).
   Expone WC.shareCard.podiumBlob({ top3, me, teams, url }) -> Promise<Blob> (PNG).
   No lee el DOM: recibe top3 (cada fila { username, points, flag }), me ({ pos, points } | null) y url. */
(function () {
  "use strict";
  var WC = (window.WC = window.WC || {});

  var W = 1080, H = 1350;
  var INK = "#0a1512", LIME = "#d7ff43", WHITE = "#ffffff", MUTE = "#9fb0a8";
  var BLOCK = { 0: LIME, 1: "#c9ccc4", 2: "#d8a56b" }; // color por posición real (0=1º,1=2º,2=3º)
  var MEDAL = ["🥇", "🥈", "🥉"];

  function spartan(px, weight) { return (weight || 800) + " " + px + "px 'League Spartan', sans-serif"; }
  function sans(px, weight) { return (weight || 400) + " " + px + "px 'DM Sans', sans-serif"; }

  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  function pill(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(ctx, data) {
    // fondo
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);

    // --- header: bolita "26" + wordmark ---
    ctx.fillStyle = LIME;
    ctx.beginPath(); ctx.arc(150, 150, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = spartan(48, 800); ctx.fillText("26", 150, 156);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = WHITE; ctx.font = spartan(50, 800); ctx.fillText("RUTA AL TÍTULO", 240, 142);
    ctx.fillStyle = MUTE; ctx.font = sans(30, 500); ctx.fillText("Quiniela Mundial 2026", 240, 188);

    // --- podio (centro=1º, izq=2º, der=3º) ---
    var top3 = data.top3 || [];
    var centersX = [233, 540, 847]; // columnas en pantalla
    var order = [1, 0, 2];          // qué índice de top3 va en cada columna (1º al centro)
    var heights = { 0: 330, 1: 250, 2: 200 }; // alto del bloque por posición real
    var baseline = 880;             // base inferior de los bloques
    var colW = 300;

    order.forEach(function (idx, col) {
      var r = top3[idx];
      if (!r) return;
      var cx = centersX[col];
      var h = heights[idx];
      var top = baseline - h;

      // bloque del escalón
      ctx.fillStyle = BLOCK[idx] || "#c9ccc4";
      pill(ctx, cx - colW / 2, top, colW, h, 12); ctx.fill();

      // número del puesto dentro del bloque
      ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.font = spartan(idx === 0 ? 96 : 80, 800);
      ctx.fillText(String(idx + 1), cx, top + (idx === 0 ? 112 : 96));

      // medalla
      ctx.font = "72px 'DM Sans', sans-serif";
      ctx.fillText(MEDAL[idx], cx, top - 190);
      // bandera del campeón (ya resuelta en r.flag)
      ctx.font = "80px 'DM Sans', sans-serif";
      ctx.fillText(r.flag || "🛡️", cx, top - 112);
      // nombre
      ctx.fillStyle = WHITE; ctx.font = spartan(34, 800);
      ctx.fillText(truncate(ctx, r.username || "—", colW), cx, top - 60);
      // puntos
      ctx.fillStyle = LIME; ctx.font = spartan(30, 700);
      ctx.fillText((r.points != null ? r.points : 0) + " pts", cx, top - 22);
    });

    // --- línea personal (pastilla lima tenue) ---
    if (data.me && data.me.pos != null) {
      var label = "Vas " + data.me.pos + "º con " + (data.me.points != null ? data.me.points : 0) + " pts";
      ctx.font = spartan(38, 800);
      var pw = ctx.measureText(label).width + 80;
      var px = (W - pw) / 2, py = 960, ph = 84;
      ctx.fillStyle = "rgba(215,255,67,0.14)"; pill(ctx, px, py, pw, ph, 16); ctx.fill();
      ctx.strokeStyle = "rgba(215,255,67,0.45)"; ctx.lineWidth = 2; pill(ctx, px, py, pw, ph, 16); ctx.stroke();
      ctx.fillStyle = LIME; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, W / 2, py + ph / 2 + 2);
      ctx.textBaseline = "alphabetic";
    }

    // --- footer: host limpio + CTA ---
    var host = (data.url || "")
      .replace(/^https?:\/\//, "").replace(/#.*$/, "").replace(/index\.html$/, "").replace(/\/$/, "");
    ctx.textAlign = "center";
    ctx.fillStyle = MUTE; ctx.font = sans(30, 500);
    ctx.fillText(host, W / 2, 1230);
    ctx.fillStyle = WHITE; ctx.font = spartan(34, 800);
    ctx.fillText("¡Únete a la quiniela! ⚽", W / 2, 1284);
  }

  function podiumBlob(data) {
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      var canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext("2d");
      draw(ctx, data || {});
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("toBlob devolvió null")); }, "image/png");
      });
    });
  }

  WC.shareCard = { podiumBlob: podiumBlob };
})();
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node -c js/share-card.js`
Expected: sin salida (OK). (Es código de browser; `node -c` solo valida la sintaxis, no ejecuta `document`.)

- [ ] **Step 3: Commit**

```bash
git add js/share-card.js
git commit -m "feat(share): módulo Canvas que genera la imagen del podio (share-card.js)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cargar `share-card.js` en `index.html`

**Files:**
- Modify: `index.html` (zona de `<script>` de la app, ~líneas 356-360)

- [ ] **Step 1: Añadir el `<script>` antes de `game.js`**

Localizar (el `?v=` puede diferir; la Action lo reescribe):

```html
  <script src="js/engagement.js?v=20260621c"></script>
  <script src="js/game.js?v=20260621d"></script>
```

Reemplazar por:

```html
  <script src="js/engagement.js?v=20260621c"></script>
  <script src="js/share-card.js?v=20260621a"></script>
  <script src="js/game.js?v=20260621d"></script>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "build: cargar share-card.js antes de game.js

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Handler de Compartir con imagen + fallback (`js/game.js`)

**Files:**
- Modify: `js/game.js` — añadir `downloadBlob()` y `shareMiJornada()`; reescribir la rama `#pmsShare` del listener de click.

- [ ] **Step 1: Añadir los helpers `downloadBlob` y `shareMiJornada`**

Insertar junto a las funciones helper de game.js (p. ej. justo antes de la función que contiene el listener de click, cerca de `champFlagFor`). `data`, `session`, `matches`, `champFlagFor`, `engagementSnapshot`, `trackEvent`, `WC` ya existen en el módulo.

```js
  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    var u = URL.createObjectURL(blob);
    a.href = u; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }

  // Compartir "Mi jornada": genera la imagen del podio y la comparte (móvil) o la
  // descarga + copia el texto (desktop). Cae a solo-texto si algo falla.
  function shareMiJornada(btn) {
    var text = btn.dataset.share || "";
    var origHTML = btn.innerHTML;

    function shareTextOnly() {
      if (navigator.share) { navigator.share({ title: "Quiniela Ruta 26", text: text }).catch(function () {}); trackEvent("share_summary_clicked", { channel: "native" }); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { btn.textContent = "Texto copiado ✓"; }).catch(function () { window.prompt("Copia tu resumen:", text); }); trackEvent("whatsapp_copy_clicked", {}); }
      else { window.prompt("Copia tu resumen:", text); trackEvent("whatsapp_copy_clicked", {}); }
    }
    function restore() { setTimeout(function () { btn.innerHTML = origHTML; btn.disabled = false; }, 2200); }

    if (!WC.shareCard) { shareTextOnly(); return; }

    btn.disabled = true; btn.innerHTML = "Generando…";
    var rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
    var top3 = rows.slice(0, 3).map(function (r) {
      return { username: r.username, points: r.points, flag: champFlagFor(r.userId) };
    });
    var snap = (typeof engagementSnapshot === "function") ? engagementSnapshot() : null;
    var meId = snap ? snap.meId : null;
    var meRow = meId ? rows.find(function (r) { return r.userId === meId; }) : null;
    var me = meRow ? { pos: meRow.pos, points: meRow.points } : null;
    var url = location.origin + location.pathname + "#quiniela";

    WC.shareCard.podiumBlob({ top3: top3, me: me, teams: WC.state.teams || {}, url: url })
      .then(function (blob) {
        var file = new File([blob], "ruta26-podio.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: text }).then(function () {
            trackEvent("share_summary_clicked", { channel: "image" });
          });
        }
        downloadBlob(blob, "ruta26-podio.png");
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
        btn.innerHTML = "Imagen descargada ✓";
        trackEvent("share_summary_clicked", { channel: "download" });
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return; // el usuario canceló la hoja → no hacer nada
        shareTextOnly();                               // error real → solo texto
      })
      .finally(restore);
  }
```

- [ ] **Step 2: Reescribir la rama `#pmsShare` del listener de click**

Localizar el bloque actual:

```js
    if (event.target.id === "pmsShare") {
      const text = event.target.dataset.share || "";
      if (navigator.share) { navigator.share({ title: "Quiniela Ruta 26", text: text }).catch(function () {}); trackEvent("share_summary_clicked", { channel: "native" }); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(function () { event.target.textContent = "Texto copiado ✓"; }).catch(function () { window.prompt("Copia tu resumen:", text); }); trackEvent("whatsapp_copy_clicked", {}); }
      else { window.prompt("Copia tu resumen:", text); trackEvent("whatsapp_copy_clicked", {}); }
      return;
    }
```

Reemplazar por (usa `closest` porque el botón ahora contiene un `<svg>` y el click puede caer en el ícono):

```js
    var pmsBtn = event.target.closest ? event.target.closest("#pmsShare") : (event.target.id === "pmsShare" ? event.target : null);
    if (pmsBtn) {
      shareMiJornada(pmsBtn);
      return;
    }
```

- [ ] **Step 3: Verificar sintaxis y suite de tests**

Run: `node -c js/game.js`
Expected: sin salida (OK).

Run: `node --test tests/`
Expected: `# fail 0` (no se tocaron tests; scoring/engagement intactos).

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat(share): Compartir de Mi jornada envía la imagen del podio + fallback

navigator.share({files}) en móvil; descarga PNG + copia texto en desktop;
cae a solo-texto si falla. Usa closest() para captar el click sobre el ícono.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Verificación visual (preview)

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar preview NUEVO y loguear**

`preview_start` (servidor nuevo = assets frescos). Ir a `index.html`. La pestaña suele estar logueada como jmcriptos_26 (si no, iniciar sesión).

- [ ] **Step 2: Generar el PNG y revisarlo visualmente**

Dos vías (los datos reales viven en el closure de game.js, así que para inspeccionar la imagen se usa el módulo directo con datos de ejemplo):

- **Vía botón (camino real):** hacer scroll a "Mi jornada" y tocar Compartir (`preview_click` en `#pmsShare`). En desktop (sin `canShare({files})`) debe **descargar `ruta26-podio.png`** y el botón mostrar "Imagen descargada ✓".
- **Vía módulo (para ver la imagen en pantalla):** en `preview_eval` pintar el PNG en un `<img>`:

```js
WC.shareCard.podiumBlob({
  top3: [
    { username: "rhandyg18", points: 22, flag: "🇵🇹" },
    { username: "jmcriptos_26", points: 22, flag: "🇵🇹" },
    { username: "jeansuarez", points: 21, flag: "🇵🇹" }
  ],
  me: { pos: 2, points: 22 },
  teams: {},
  url: "https://jmcriptos.github.io/ruta26/index.html#quiniela"
}).then(function (b) {
  var img = document.createElement("img");
  img.src = URL.createObjectURL(b);
  img.style.cssText = "position:fixed;inset:0;margin:auto;max-width:90vw;max-height:90vh;z-index:99999;box-shadow:0 0 0 9999px rgba(0,0,0,.6)";
  img.id = "sc-preview";
  document.body.appendChild(img);
  return { w: b.size, type: b.type };
})
```

Luego `preview_screenshot` y revisar: branding arriba, podio (1º centro lima, 2º izq plata, 3º der bronce) con banderas/medallas/nombres/pts, pastilla "Vas 2º con 22 pts", footer con host + "¡Únete a la quiniela! ⚽". Quitar el preview con `preview_eval`: `document.getElementById('sc-preview')?.remove()`.

- [ ] **Step 3: Confirmar el fallback de descarga y la consola**

- Tocar `#pmsShare` (desktop) → debe descargar el PNG y el botón decir "Imagen descargada ✓"; el texto queda copiado al portapapeles (verificar con `preview_eval`: `navigator.clipboard.readText().then(t=>t)` si el navegador lo permite, o confiar en la rama).
- `preview_console_logs` nivel error → sin errores.
- Confirmar que el ícono de WhatsApp vuelve tras el estado "Generando…" (el `innerHTML` se restaura).

- [ ] **Step 4: `preview_stop`**

---

## Verificación final

- [ ] `node --test tests/` → `# fail 0`.
- [ ] Preview: la imagen del podio se genera y se ve correcta; el fallback descarga el PNG; sin errores de consola; el ícono del botón se restaura.
- [ ] Merge a `main` con superpowers:finishing-a-development-branch (el push dispara la Action que versiona y despliega). En móvil real, Compartir abrirá la hoja nativa con la imagen (validación post-deploy a cargo de JM).

---

## Self-review (cobertura del spec)

- **Tarjeta diseñada en Canvas, sin librerías** → Task 1 (`js/share-card.js`, Canvas 2D nativo).
- **Contenido: podio Top 3 (bandera/nombre/medalla/pts) + tu posición + branding + link** → Task 1 `draw()` (header, podio, pastilla personal, footer).
- **Bandera = campeón del jugador, resuelta fuera del módulo** → Task 3 (`flag: champFlagFor(r.userId)` por fila); el módulo solo pinta `r.flag`.
- **Compartir async: genera blob → `navigator.share({files})` si `canShare({files})`** → Task 3 `shareMiJornada`.
- **Fallback desktop: descargar PNG + copiar texto** → Task 3 (`downloadBlob` + `clipboard.writeText`).
- **Errores → solo texto; cancelar → nada** → Task 3 (`catch` con `AbortError`).
- **Casos borde: `me` null (omitir pastilla), <3 jugadores (solo escalones existentes), sin `WC.shareCard` (solo texto)** → Task 1 (`if (!r) return`, `if (data.me...)`) y Task 3 (`if (!WC.shareCard)`).
- **`document.fonts.ready` antes de dibujar** → Task 1 `podiumBlob`.
- **Cargar el script** → Task 2.
- **No cambiar scoring/engagement/ranking; sin librerías** → ningún cambio en esos archivos; suite en `fail 0` (Task 3 Step 3).
- **Fix latente:** click sobre el `<svg>` del botón → `closest("#pmsShare")` (Task 3 Step 2).
- **Validación visual del PNG + fallback** → Task 4.
```
