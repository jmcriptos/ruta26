# "Mi jornada ⚽" — resumen + oportunidad fusionados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fusionar el resumen post-partido y "Tu oportunidad" en un único bloque narrado "Mi jornada ⚽" con empujones psicológicos a volver y revisar pronósticos.

**Architecture:** Nueva función `miJornadaHtml()` en `js/game.js` que reemplaza a `postMatchSummaryHtml()` y `opportunityHtml()` en el render. Compone una narración a partir de los view models existentes `WC.engagement.postMatchSummary` y `WC.engagement.opportunity` + `snapshot.official`. Sin cambios en `engagement.js` ni `scoring.js`.

**Tech Stack:** JS CommonJS (browser), CSS, GitHub Pages (deploy + versionado automático ya activos — NO bumpear `?v=`).

**Spec:** `docs/superpowers/specs/2026-06-21-mi-jornada-resumen-fusionado-design.md`

**Rama:** `feat/mi-jornada` (no main); merge al final.

---

## Estructura de archivos

- **Modify** `js/game.js` — añadir `miJornadaHtml()`; cablearla en `render()`; eliminar `postMatchSummaryHtml()` y `opportunityHtml()`.
- **Modify** `styles.css` — añadir `.mj-narration`.

Nota: NO se elimina CSS huérfano de las tarjetas viejas (`.pms-*`, `.es-impact`, `.opp-card`, etc.) en esta entrega — varias clases `es-*` (es-strip/es-team/es-name/es-vs/es-score/es-label/es-status) las sigue usando el ranking en vivo. Limpieza opcional aparte.

---

## Task 1: Bloque "Mi jornada ⚽"

**Files:**
- Modify: `js/game.js`
- Modify: `styles.css`

- [ ] **Step 1: Añadir `miJornadaHtml()` en `js/game.js`**

Insertarla junto a las funciones de engagement (p. ej. justo antes de `function opportunityHtml()`):

```js
  // "Mi jornada": fusiona el resumen (postMatchSummary) + la oportunidad en una sola
  // narración, con empujón psicológico a volver y revisar pronósticos. Texto crudo en
  // las cláusulas; se escapa UNA vez al renderizar (no escapar dentro de a/b/c).
  function miJornadaHtml() {
    if (!session || !WC.engagement) return "";
    const snap = engagementSnapshot();
    if (!snap) return "";
    const me = (snap.official || []).find(function (r) { return r.userId === snap.meId; });
    const teams = WC.state.teams || {};

    // recap del último partido / jornada del día (puede quedar null)
    const ms = matches();
    const played = ms.filter(function (m) { return m.status === "played" && m.hs != null; });
    let recap = null, last = null;
    if (played.length) {
      last = played[0];
      played.forEach(function (m) { if (new Date(m.date) > new Date(last.date)) last = m; });
      const lastDay = matchDay(last);
      const inDay = played.filter(function (m) { return matchDay(m) === lastDay; });
      const scope = inDay.length > 1 ? "matchday" : "match";
      const msBefore = ms.map(function (m) {
        return m.status === "played" && m.hs != null && matchDay(m) === lastDay
          ? Object.assign({}, m, { status: "scheduled", hs: null, as: null, hp: null, ap: null, winner: null })
          : m;
      });
      const before = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, msBefore, data.captains);
      recap = WC.engagement.postMatchSummary(Object.assign({}, snap, { summaryScope: scope }), before, snap.official);
    }

    const opp = WC.engagement.opportunity(snap);
    const hasOpp = !!(opp && opp.state !== "fallback" && opp.copy && opp.copy.headline);

    // cláusula A — recap o posición
    let a = "";
    if (recap) {
      const homeN = (teams[last.home] || {}).name, awayN = (teams[last.away] || {}).name;
      a = recap.scope === "matchday" ? "Cerró la jornada"
        : (homeN && awayN ? "Terminó " + homeN + " " + last.hs + "-" + last.as + " " + awayN : "Terminó el partido");
      if (recap.movement === "passed_friend") a += " y pasaste a " + recap.rival;
      else if (recap.movement === "passed_by_friend") a += " y " + recap.rival + " te pasó";
      else if (recap.movement === "up") a += " y subiste " + recap.posDelta + " puesto" + (recap.posDelta > 1 ? "s" : "");
      else if (recap.movement === "down") a += " y bajaste " + Math.abs(recap.posDelta) + " puesto" + (Math.abs(recap.posDelta) > 1 ? "s" : "");
      else if (recap.ptsGain > 0) a += " y sumaste " + recap.ptsGain + " pt" + (recap.ptsGain > 1 ? "s" : "");
      a += me ? ("; vas " + me.pos + "º con " + me.points + " pts.") : ".";
    } else if (me) {
      a = "Vas " + me.pos + "º con " + me.points + " pts.";
    }

    // cláusula B — oportunidad
    let b = "";
    if (hasOpp) {
      const mn = opp.match && opp.match.homeName && opp.match.awayName ? (opp.match.homeName + " vs " + opp.match.awayName) : "tu próximo partido";
      const rival = (opp.rival && opp.rival.username) || "tu rival";
      if (opp.state === "pending_pick") b = "Aún te falta tu pick de " + mn + " — el que no juega no puntúa.";
      else if (opp.state === "captain") b = "Marca tu Capitán para " + mn + " y dale más filo a tu jugada.";
      else if (opp.state === "reachable_rival") b = "Tienes a " + rival + " a tiro: un acierto y lo pasas.";
      else if (opp.state === "rival_threat") b = "Ojo: " + rival + " te respira en la nuca.";
      else if (opp.state === "win_matchday") b = "Hoy puedes ganar la jornada.";
    }

    // cláusula C — empujón a volver
    const c = hasOpp ? "Vuelve y revisa tus pronósticos antes del kickoff." : (recap ? "Mañana hay revancha." : "");

    const narration = [a, b, c].filter(Boolean).join(" ");
    if (!narration) return "";

    if (recap) trackEvent("post_match_summary_viewed", { movement: recap.movement, scope: recap.scope });
    if (hasOpp) trackEvent("opportunity_viewed", { state: opp.state, reason: opp.reason });

    const url = location.origin + location.pathname + "#quiniela";
    const ctaTarget = hasOpp && opp.primaryAction ? opp.primaryAction.targetMatchId : "";
    const ctaLabel = hasOpp ? "Pronosticar ahora" : "Revisar mis pronósticos";
    const cta = '<button class="primary-btn opp-cta" data-opp-target="' + esc(ctaTarget) + '" data-opp-reason="' + esc((opp && opp.reason) || "mijornada") + '">' + ctaLabel + "</button>";
    const teaser = (a ? a + " " : "") + url;
    const share = '<button class="secondary-btn" id="pmsShare" data-share="' + esc(teaser) + '">Compartir</button>';

    return '<div class="game-card mijornada-card"><h3>Mi jornada ⚽</h3>' +
      '<p class="mj-narration">' + esc(narration) + "</p>" +
      '<div class="es-buttons">' + cta + share + "</div>" +
      "</div>";
  }
```

- [ ] **Step 2: Cablear en `render()` y quitar las dos viejas del render**

En `render()` (rama con `session`), localizar:

```js
      postMatchSummaryHtml() + championHtml() + remindersHtml("top") + opportunityHtml() + liveRankingHtml() + rankingHtml() + predictionsHtml() + remindersHtml("bottom") + rulesHtml();
```

Reemplazar por:

```js
      miJornadaHtml() + championHtml() + remindersHtml("top") + liveRankingHtml() + rankingHtml() + predictionsHtml() + remindersHtml("bottom") + rulesHtml();
```

- [ ] **Step 3: Eliminar las funciones `postMatchSummaryHtml()` y `opportunityHtml()`**

Borrar por completo ambas funciones (ya no se referencian). Conservar el handler de click `[data-opp-target]` (lo reusa el CTA) y el handler `#pmsShare` (lo reusa Compartir).

- [ ] **Step 4: Añadir CSS en `styles.css`**

Junto al bloque de engagement (p. ej. después de `.pms-card .pms-narration`):

```css
.mijornada-card .mj-narration { margin: 8px 0 16px; font-size: 15px; line-height: 1.55; color: var(--ink); }
```

- [ ] **Step 5: Verificar sintaxis y suite**

Run: `node -c js/game.js`
Expected: sin salida (OK).

Run: `node --test tests/`
Expected: `fail 0` (no se tocaron tests; los view models siguen igual).

- [ ] **Step 6: Verificar visualmente (móvil + desktop, logueado)**

Levantar preview NUEVO (primera carga = CSS/JS fresco; el `?v=` del fuente es estático y solo lo versiona la Action al desplegar). La pestaña suele estar logueada como jmcriptos_26.
- Sección Quiniela: confirmar que aparece **un solo bloque "Mi jornada ⚽"** (ya no las dos tarjetas separadas Resumen / Tu oportunidad).
- Leer la narración: debe combinar recap + oportunidad + cierre ("Vuelve y revisa…"). Coherente y sin `&amp;`/doble-escape.
- **Pronosticar**: hace scroll/foco a los pronósticos.
- **Compartir**: `data-share` = resumen parcial (cláusula A) + el link `…/#quiniela`. (Inspeccionar el atributo o tocar el botón.)
- A 375px y 1280px: legible, botones lado a lado, sin desbordes.
- `preview_console_logs` nivel error → sin errores.
- Screenshot de evidencia.

- [ ] **Step 7: Commit**

```bash
git add js/game.js styles.css
git commit -m "feat(engagement): 'Mi jornada' — resumen + oportunidad fusionados y narrados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final

- [ ] `node --test tests/` → `fail 0`.
- [ ] Preview 375px y 1280px: bloque "Mi jornada ⚽" correcto, sin errores de consola.
- [ ] Merge a `main` con superpowers:finishing-a-development-branch (el push dispara la Action que versiona y despliega).

---

## Self-review (cobertura del spec)

- Título "Mi jornada ⚽" estilo Mi campeón (h3 + emoji) → Step 1 (render del `<h3>`).
- Narración en 3 cláusulas (recap / oportunidad / empujón) con la psicología y tono → Step 1 (plantillas de copy exactas).
- Acciones Pronosticar (scroll a picks, reusa `[data-opp-target]`) + Compartir (teaser = cláusula A + link directo, reusa `#pmsShare`) → Step 1.
- Casos borde (sin sesión, solo opp, solo recap, nada) → Step 1 (`return ""`, ramas A/B/C).
- Reemplaza/elimina las dos tarjetas viejas → Steps 2-3.
- Sin cambios de scoring/engagement; ranking en vivo/definitivo intactos → no se tocan.
- Tracking preservado (`post_match_summary_viewed`, `opportunity_viewed`, cta/share por los handlers) → Step 1.
- Escapado único (a/b/c crudos, `esc()` al render y en `data-share`) → Step 1.
