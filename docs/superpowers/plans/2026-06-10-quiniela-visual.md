# Quiniela visual con banderas — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Rediseño visual de la sección Quiniela: tarjetas de predicción tipo enfrentamiento con banderas, y ranking con medallas + bandera del campeón. Solo presentación; cero cambios de reglas/datos/scoring.

**Architecture:** Cambios acotados a `js/game.js` (render: `pickRowHtml`, `rankingHtml`, helpers `teamFlag`/`champFlagFor`) y `styles.css` (append). Las banderas salen de `WC.state.teams[id].flag` (emoji ya presente). El scoring, RLS, esquema y auth no se tocan.

**Tech Stack:** Vanilla JS (WC namespace), Supabase, node:test.

**Spec:** `docs/superpowers/specs/2026-06-10-quiniela-visual-design.md`
**Working dir (citar — espacios):** `/Users/josedasilva/Dropbox/Mi Mac (MacBook-Air-de-Jose.local)/Documents/Mundial 2026 app`

**Reglas transversales:**
- Solo tokens CSS existentes. Branch `main`, commit; push en el último paso.
- Playwright cachea JS: verificación browser con puerto NUEVO de `python3 -m http.server`.
- `node --test tests/` debe seguir en 33 pass (no se toca scoring).
- Supabase ya conectado. Hay usuarios de prueba (`test_*`, `demo_*`, `sectest`) para verificar.

---

### Task 1: `js/game.js` — helpers de bandera

**Files:** Modify: `js/game.js`

- [ ] **Step 1: Agregar helpers**

Junto a los helpers existentes (después de `teamName`, ≈línea 38), agregar:

```js
  function teamFlag(id) { const t = WC.state.teams[id]; return t && t.flag ? t.flag : "🏳️"; }
  // bandera del campeón de un usuario, respetando lo que el RLS dejó ver (champion_picks ajenos
  // solo llegan tras el cierre; antes, solo el propio). Si no hay pick visible → escudo.
  function champFlagFor(userId) {
    const pk = data.picks.find(function (r) { return r.user_id === userId; });
    return pk ? teamFlag(pk.team_id) : "🛡️";
  }
```

- [ ] **Step 2: Verificación**

Run: `node --check js/game.js` → limpio. `node --test tests/` → 33 pass.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: helpers teamFlag y champFlagFor para la quiniela visual"
```

---

### Task 2: `js/game.js` — `pickRowHtml` con enfrentamiento y banderas

**Files:** Modify: `js/game.js`

- [ ] **Step 1: Reemplazar `pickRowHtml` (≈168-214) por:**

```js
  function matchupHtml(m) {
    const homeId = m.home || (WC.standings.resolveSlot(m.phA, WC.slotCtx()).teamId);
    const awayId = m.away || (WC.standings.resolveSlot(m.phB, WC.slotCtx()).teamId);
    const hf = homeId ? teamFlag(homeId) : "🏳️";
    const af = awayId ? teamFlag(awayId) : "🏳️";
    return '<div class="pick-matchup">' +
      '<div class="pm-team"><span class="pm-flag">' + hf + '</span><span class="pm-name">' + esc(WC.slotName(m, "home")) + "</span></div>" +
      '<span class="pm-vs">VS</span>' +
      '<div class="pm-team"><span class="pm-flag">' + af + '</span><span class="pm-name">' + esc(WC.slotName(m, "away")) + "</span></div></div>";
  }

  function pickRowHtml(m) {
    const v = mine[m.id];
    const locked = kicked(m);
    const when = WC.fmt.dayLocal(m.date) + " · " + WC.fmt.timeLocal(m.date);
    const phase = WC.stageLabel(m);
    const head = '<div class="pick-head"><span>' + when + "</span><span>" + phase + "</span></div>" + matchupHtml(m);
    if (locked) {
      const s = WC.scoring.scoreMatch(v ? { hg: v.hg, ag: v.ag, pens: v.pens } : null, m);
      const real = m.status !== "scheduled" && m.hs != null
        ? m.hs + "–" + m.as + (m.hp != null ? " (pen " + m.hp + "–" + m.ap + ")" : "")
        : "—";
      const chip = s.kind === "none" ? '<span class="pick-points miss">sin pick</span>'
        : s.kind === "pending" ? '<span class="pick-points pending">en juego</span>'
        : '<span class="pick-points ' + s.kind + '">' + (s.points > 0 ? "+" + s.points + " pts" : "0 pts") + "</span>";
      return '<div class="pick-card locked" data-match="' + m.id + '">' + head +
        '<div class="pick-foot"><small>Tu pick: ' + pickLabel(m, v) + " · Real: " + real + "</small>" + chip + "</div></div>";
    }
    const type = predType(m);
    let controls;
    if (type === "score") {
      const hg = v ? v.hg : "·";
      const ag = v ? v.ag : "·";
      controls = '<div class="pick-controls">' +
        '<span class="pcf">' + teamFlag(m.home) + "</span>" +
        '<button type="button" data-step="hg,-1" aria-label="Menos goles local">−</button><b data-val="hg">' + hg + "</b>" +
        '<button type="button" data-step="hg,1" aria-label="Más goles local">+</button>' +
        "<i>:</i>" +
        '<button type="button" data-step="ag,-1" aria-label="Menos goles visitante">−</button><b data-val="ag">' + ag + "</b>" +
        '<button type="button" data-step="ag,1" aria-label="Más goles visitante">+</button>' +
        '<span class="pcf">' + teamFlag(m.away) + "</span></div>";
    } else if (type === "1x2") {
      const sel = v ? (v.hg > v.ag ? "h" : (v.hg < v.ag ? "a" : "x")) : "";
      controls = '<div class="pick-1x2">' +
        '<button type="button" data-1x2="h" class="' + (sel === "h" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.home) + "</span>Gana</button>" +
        '<button type="button" data-1x2="x" class="' + (sel === "x" ? "on" : "") + '">Empate</button>' +
        '<button type="button" data-1x2="a" class="' + (sel === "a" ? "on" : "") + '"><span class="b1f">' + teamFlag(m.away) + "</span>Gana</button></div>";
    } else {
      const sel = v ? (v.hg > v.ag ? "h" : "a") : "";
      const homeId = m.home || (WC.standings.resolveSlot(m.phA, WC.slotCtx()).teamId);
      const awayId = m.away || (WC.standings.resolveSlot(m.phB, WC.slotCtx()).teamId);
      controls = '<div class="pick-1x2 ko">' +
        '<button type="button" data-adv="h" class="' + (sel === "h" ? "on" : "") + '"><span class="b1f">' + (homeId ? teamFlag(homeId) : "🏳️") + "</span>Avanza</button>" +
        '<button type="button" data-adv="a" class="' + (sel === "a" ? "on" : "") + '"><span class="b1f">' + (awayId ? teamFlag(awayId) : "🏳️") + "</span>Avanza</button>" +
        '<button type="button" data-pens class="pens ' + (v && v.pens ? "on" : "") + '">⚽ Por penales</button></div>';
    }
    const st = stateLabel(v);
    return '<div class="pick-card" data-match="' + m.id + '" data-type="' + type + '">' + head +
      controls +
      '<span class="pick-state ' + st.cls + '">' + st.text + "</span></div>";
  }
```

Nota: `WC.slotCtx` y `WC.standings.resolveSlot` ya existen (usados por el bracket). Para grupos `m.home`/`m.away` siempre están; en eliminatorias pueden ser null y se resuelven por placeholder.

- [ ] **Step 2: `paintRow` — la query sigue sirviendo**

`paintRow` busca `[data-match]` y dentro `[data-1x2]`, `[data-adv]`, `[data-pens]`, `[data-val]`, `.pick-state`. Como el contenedor cambió de `.pick-row` a `.pick-card` pero el selector usa `[data-match]`, NO requiere cambios. Verificar (lectura) que `paintRow` no referencia `.pick-row` por clase. (No lo hace.)

- [ ] **Step 3: Verificación**

Run: `node --check js/game.js` → limpio. `node --test tests/` → 33 pass.

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat: tarjetas de predicción tipo enfrentamiento con banderas"
```

---

### Task 3: `js/game.js` — ranking con medallas y bandera del campeón

**Files:** Modify: `js/game.js`

- [ ] **Step 1: Reemplazar la construcción de filas en `rankingHtml` (≈290-294)**

Reemplazar el bloque `'<table class="rank-table">...` (cabecera + map de filas) por:

```js
        : '<table class="rank-table"><tr><th>#</th><th></th><th>Jugador</th><th class="col-x">Exactos</th><th class="col-x">Resultados</th><th class="col-x">Bonus</th><th>Pts</th></tr>' +
          rows.map(function (r) {
            const medal = r.pos === 1 ? "🥇" : r.pos === 2 ? "🥈" : r.pos === 3 ? "🥉" : '<span class="num">' + r.pos + "</span>";
            return "<tr" + (r.userId === uid ? ' class="me"' : "") + '><td class="pos">' + medal + '</td><td class="flag">' + champFlagFor(r.userId) + "</td><td>" + esc(r.username) + '</td><td class="col-x">' +
              r.exact + '</td><td class="col-x">' + r.outcome + '</td><td class="col-x">' + (r.bonus || 0) + '</td><td class="pts">' + r.points + "</td></tr>";
          }).join("") + "</table>") +
```

(Se agregó una columna de bandera tras la posición y se marcaron las 3 columnas de desglose con `col-x` para ocultarlas en móvil con CSS — reemplaza el ocultado por `nth-child` anterior, que ahora desfasaría por la columna nueva.)

- [ ] **Step 2: Verificación**

Run: `node --check js/game.js` → limpio. `node --test tests/` → 33 pass.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: ranking con medallas en el podio y bandera del campeón"
```

---

### Task 4: `styles.css` — estilos del enfrentamiento, botones con bandera y medallas

**Files:** Modify: `styles.css` (append). Además, ELIMINAR la regla móvil de ocultado por `nth-child` del ranking (quedó obsoleta por la columna nueva) y reemplazarla por `.col-x`.

- [ ] **Step 1: Reemplazar el bloque de ranking móvil existente**

Buscar en `styles.css` el bloque:

```css
/* ranking compacto en móvil: solo #, jugador y puntos (el desglose se oculta) */
@media (max-width: 680px) {
  .rank-table { font-size: 14px; }
  .rank-table th, .rank-table td { padding: 11px 6px; }
  .rank-table td.num { font-size: 15px; }
  .rank-table th:nth-child(3), .rank-table td:nth-child(3),
  .rank-table th:nth-child(4), .rank-table td:nth-child(4),
  .rank-table th:nth-child(5), .rank-table td:nth-child(5) { display: none; }
}
```

y reemplazarlo por:

```css
/* ranking compacto en móvil: oculta el desglose marcado con .col-x */
@media (max-width: 680px) {
  .rank-table { font-size: 14px; }
  .rank-table th, .rank-table td { padding: 11px 6px; }
  .rank-table td.num { font-size: 15px; }
  .rank-table .col-x { display: none; }
}
```

- [ ] **Step 2: Agregar al final de `styles.css`**

```css
/* ===== Quiniela visual: tarjetas de enfrentamiento ===== */
.pick-card { background: var(--paper-bright); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 6px 20px rgba(12,29,23,.04); }
.pick-card:last-child { margin-bottom: 0; }
.pick-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
.pick-matchup { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px; }
.pick-matchup .pm-team { flex: 1; text-align: center; min-width: 0; }
.pick-matchup .pm-flag { display: block; font-size: 40px; line-height: 1; }
.pick-matchup .pm-name { display: block; margin-top: 5px; font-weight: 700; font-size: 14px; }
.pick-matchup .pm-vs { font: 800 14px "League Spartan", sans-serif; color: var(--line); flex: 0 0 auto; }

.pick-card .pick-controls { display: flex; align-items: center; justify-content: center; gap: 6px; }
.pick-card .pick-controls .pcf { font-size: 22px; }
.pick-card .pick-1x2 button .b1f { display: block; font-size: 20px; line-height: 1; margin-bottom: 1px; }
.pick-card .pick-state { display: block; text-align: right; margin-top: 10px; }
.pick-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.pick-foot small { color: var(--muted); font-size: 12px; }

/* medallas y bandera del campeón en el ranking */
.rank-table td.pos { font-size: 18px; text-align: center; width: 30px; }
.rank-table td.pos .num { font: 800 16px "League Spartan", sans-serif; color: var(--muted); }
.rank-table td.flag { font-size: 22px; width: 30px; text-align: center; }

@media (max-width: 680px) {
  .pick-matchup .pm-flag { font-size: 34px; }
  .pick-card .pick-1x2 button { min-width: 0; }
}
```

- [ ] **Step 3: Verificación browser (puerto nuevo)**

`python3 -m http.server 8831` → `http://localhost:8831/#quiniela`. Login con un usuario de prueba. Verificar:
- Grupos: tarjeta con banderas grandes enfrentadas + "VS"; 3 botones, los de equipo con su bandera arriba de "Gana"; activo en lima; "Guardado ✓".
- Eliminatorias: enfrentamiento (con placeholders/banderas neutras si no hay equipo) + 2 botones "🏳️ Avanza" + toggle penales.
- Final: enfrentamiento + steppers con banderas a los lados.
- Ranking: 🥇🥈🥉 en el podio, bandera del campeón (la propia visible; ajenas 🛡️ si aún no se revela), fila propia en lima.
- Móvil 375px: sin overflow; el desglose del ranking se oculta y la bandera permanece.
- Consola sin errores. `node --test tests/` → 33 pass.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: estilos de enfrentamiento, botones con bandera y medallas del ranking"
```

---

### Task 5: deploy y verificación en producción

**Files:** ninguno (push + verificación).

- [ ] **Step 1: Tests + push**

```bash
node --test tests/   # 33 pass
git push
```

- [ ] **Step 2: Verificación en producción**

Esperar el deploy de Pages (~1 min, comprobar que `js/game.js` en vivo contiene `pick-matchup`). En `https://jmcriptos.github.io/ruta26/#quiniela`: login, predicción de grupo con banderas, recarga (persiste), ranking con medallas/banderas, móvil sin overflow.

---

## Riesgos conocidos

- **Eliminatorias sin equipo definido:** `m.home`/`m.away` null → se resuelve por `resolveSlot`; si tampoco hay (grupo no terminado) → bandera neutra 🏳️ y el label de `WC.slotName`. No rompe.
- **Banderas como emoji:** dependen del soporte de emoji del dispositivo (universal en móviles/navegadores modernos). Sin imágenes externas, sin requests.
- **Caché del navegador:** tras el deploy, recarga forzada para ver el cambio (los usuarios ya saben).
