# Batacazo de 15 — semifinal Inglaterra vs Argentina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El batacazo de la semifinal de hoy (Inglaterra vs Argentina, `matchId 400021540`, 15 jul 2026 19:00 UTC) paga +15 fijos para cualquiera de los dos equipos que gane, en vez de la escala de rareza.

**Architecture:** `js/scoring.js` es una función pura sin dependencias (corre igual en el browser y en `node:test`). La promo de batacazo pasa de una constante única (`SPECIAL_BATACAZO`, Cabo Verde +50) a un array `SPECIAL_BATACAZOS` donde `teamId: null` significa "simétrico: basta acertar quién gana". El array es la única fuente de verdad: de ahí leen el scoring, el banner de la app y el push. Sin SQL ni migración.

**Tech Stack:** JS vanilla ES5-ish (sin build), `node:test` para tests, GitHub Pages para deploy, GitHub Actions + web-push para las notificaciones.

**Spec:** `docs/superpowers/specs/2026-07-15-batacazo-15-semifinal-design.md`

**Restricción de tiempo:** todo desplegado antes del kickoff (19:00 UTC). Los picks se bloquean ahí por RLS.

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---|---|---|
| `js/scoring.js` | Reglas de puntos, puras | `SPECIAL_BATACAZOS` array + `specialBatacazoFor`; reescribir `specialBatacazoApplies` y `effectiveBatacazoBonus`; exports |
| `tests/scoring.test.js` | Contrato del scoring | Bloque nuevo "batacazo 15" + helper `sfMatch` |
| `js/game.js` | UI de la quiniela | `specialPromoHtml` lee el array; copy simétrico |
| `tools/push-messages.js` | Builders de push, puros | `buildBat15Candidates` + `buildBat15Push` + prioridad |
| `tests/push-messages.test.js` | Contrato de los builders | Bloque nuevo "batacazo de 15" |
| `tools/send-push-reminders.js` | Runner del cron | Rewire de la rama `special` → bat15 |
| `index.html` | Carga de scripts | Bump `?v=` de scoring.js y game.js |

**Regla que no se puede romper:** la entrada de Cabo Verde (`400021521`) se conserva intacta en el array. El scoring se recalcula sobre todo el histórico en cada carga; borrarla le quitaría el +50 a quien ya lo cobró el 3 de julio.

---

### Task 1: Scoring — array de promos de batacazo + `specialBatacazoFor`

**Files:**
- Modify: `js/scoring.js:32` (constante), `js/scoring.js:57-70` (helpers), `js/scoring.js:271` (exports)
- Test: `tests/scoring.test.js` (añadir al final)

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/scoring.test.js`:

```js
// Promo simétrica (15 jul 2026): semifinal Inglaterra (local 43942) vs Argentina
// (visitante 43922), id 400021540. El batacazo paga +15 fijos para cualquiera de los
// dos: basta marcar el partido y acertar quién gana/avanza. Reemplaza la escala.
function sfMatch(hs, as, extra) {
  return Object.assign({ id: "400021540", stage: "sf", status: "played", hs: hs, as: as, home: "43942", away: "43922" }, extra || {});
}

test("batacazo 15: gana Inglaterra y la marcaste = +15 encima (aunque sea el favorito obvio)", () => {
  const m = sfMatch(2, 1, { winner: "43942" });
  const pred = { hg: 2, ag: 1 };                              // exacto
  const s = sc.scoreMatch(pred, m);
  assert.deepStrictEqual(s, { points: 4, kind: "exact" });    // 3 exacto + 1 avance
  assert.strictEqual(sc.captainTotal(s, m, 0.9, pred), 19);   // 4 + 15 (ignora la escala)
});

test("batacazo 15: simétrico — gana Argentina y la marcaste también paga +15", () => {
  const m = sfMatch(0, 1, { winner: "43922" });               // Argentina gana 0-1
  const pred = { hg: 0, ag: 2 };                              // gana visitante, no exacto
  const s = sc.scoreMatch(pred, m);
  assert.deepStrictEqual(s, { points: 2, kind: "outcome" });  // 1 resultado + 1 avance
  assert.strictEqual(sc.captainTotal(s, m, 0.9, pred), 17);   // 2 + 15
});

test("batacazo 15: fallar el ganador no paga bono", () => {
  const m = sfMatch(2, 0, { winner: "43942" });               // gana Inglaterra
  const pred = { hg: 0, ag: 2 };                              // apostó Argentina
  const s = sc.scoreMatch(pred, m);
  assert.strictEqual(s.points, 0);
  assert.strictEqual(sc.captainTotal(s, m, 0.1, pred), 0);
});

test("batacazo 15: empate predicho con adv correcto (penales) paga +15", () => {
  const m = sfMatch(1, 1, { winner: "43922", hp: 3, ap: 4 }); // Argentina pasa por penales
  const pred = { hg: 1, ag: 1, adv: "away" };
  const s = sc.scoreMatch(pred, m);
  assert.deepStrictEqual(s, { points: 4, kind: "exact" });    // exacto 1-1 + avance
  assert.strictEqual(sc.captainTotal(s, m, 0.5, pred), 19);
});

test("batacazo 15: sin marcar batacazo rige el scoring normal", () => {
  const m = sfMatch(2, 1, { winner: "43942" });
  assert.deepStrictEqual(sc.scoreMatch({ hg: 2, ag: 1 }, m), { points: 4, kind: "exact" });
});

test("batacazo 15: amarrado al partido (la otra semi usa la escala de rareza)", () => {
  const m = sfMatch(2, 1, { winner: "43942", id: "400021541" });
  const pred = { hg: 2, ag: 1 };
  const s = sc.scoreMatch(pred, m);
  assert.strictEqual(sc.captainTotal(s, m, 0.9, pred), 4);    // favorito obvio → 0 de bono
  assert.strictEqual(sc.captainTotal(s, m, 0.1, pred), 7);    // raro → +3
});

test("batacazo 15: la promo de Cabo Verde sigue en el array (histórico intacto)", () => {
  const ids = sc.SPECIAL_BATACAZOS.map(function (s) { return s.matchId; });
  assert.ok(ids.indexOf("400021521") >= 0);                   // Cabo Verde +50
  assert.ok(ids.indexOf("400021540") >= 0);                   // semi +15
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `node --test tests/scoring.test.js`
Expected: FAIL. Los tests de `sfMatch` fallan con `19 !== 4` (todavía rige la escala, y 0.9 → 0 de bono); el último falla con `TypeError: Cannot read properties of undefined (reading 'map')` porque `SPECIAL_BATACAZOS` no existe.

- [ ] **Step 3: Reemplazar la constante en `js/scoring.js`**

Sustituir la línea 32 y su comentario (líneas 26-32) por:

```js
  // Promos de batacazo amarradas a un partido: sustituyen la escala de rareza por un
  // premio fijo, si el jugador marcó ese cruce como batacazo y acertó quién avanza.
  //   teamId con valor → solo paga si gana ESE equipo (premia ir por el underdog).
  //   teamId null      → simétrico: paga por cualquiera de los dos, basta acertar.
  // NO tocar ni borrar entradas viejas: el scoring se recalcula sobre todo el histórico
  // en cada carga, así que quitarlas le arrebataría puntos ya cobrados a los jugadores.
  const SPECIAL_BATACAZOS = [
    // 3 jul 2026 — Argentina vs Cabo Verde (R32): +50 por ir con Cabo Verde si avanza.
    { matchId: "400021521", teamId: "43850", bonus: 50 },
    // 15 jul 2026 — semi Inglaterra vs Argentina: +15 para cualquiera de los dos.
    { matchId: "400021540", teamId: null, bonus: 15 }
  ];
```

- [ ] **Step 4: Reescribir los helpers en `js/scoring.js`**

Sustituir las líneas 57-70 (`specialBatacazoApplies` y `effectiveBatacazoBonus`) por:

```js
  // La entrada de SPECIAL_BATACAZOS que cubre esta apuesta ya resuelta, o null. Siempre
  // exige acertar quién avanza; si la entrada amarra un teamId, además exige que gane ese
  // equipo. pred = {hg,ag,adv}.
  function specialBatacazoFor(match, pred) {
    if (!match || !pred || !match.winner) return null;
    for (let i = 0; i < SPECIAL_BATACAZOS.length; i++) {
      const sp = SPECIAL_BATACAZOS[i];
      if (sp.matchId !== match.id) continue;
      if (sp.teamId && match.winner !== sp.teamId) return null;
      if (predWinner(pred, match) !== match.winner) return null;
      return sp;
    }
    return null;
  }

  // ¿La apuesta ya resuelta cae en una promo especial? (marcó el cruce como batacazo y
  // acertó). Lo usa game.js para el banner.
  function specialBatacazoApplies(match, pred) {
    return !!specialBatacazoFor(match, pred);
  }

  // Bono efectivo del batacazo: el premio especial si aplica, si no la escala de
  // rareza. Única fuente de verdad para scoring y para el display del bono.
  function effectiveBatacazoBonus(match, pCorrect, pred) {
    const sp = specialBatacazoFor(match, pred);
    return sp ? sp.bonus : captainBonus(match, pCorrect);
  }
```

- [ ] **Step 5: Actualizar los exports en `js/scoring.js:271`**

En el objeto `const scoring = { ... }`, sustituir `SPECIAL_BATACAZO: SPECIAL_BATACAZO,` por:

```js
SPECIAL_BATACAZOS: SPECIAL_BATACAZOS, specialBatacazoFor: specialBatacazoFor,
```

Verificar que no quede ninguna referencia al nombre viejo dentro de `js/scoring.js`:

Run: `grep -n "SPECIAL_BATACAZO\b" js/scoring.js`
Expected: sin resultados (solo debe aparecer `SPECIAL_BATACAZOS`).

- [ ] **Step 6: Correr los tests de scoring**

Run: `node --test tests/scoring.test.js`
Expected: PASS, todos. Los tests viejos de "promo Cabo Verde" (+50) siguen verdes — esa es la regresión que protege el histórico.

- [ ] **Step 7: Commit**

```bash
git add js/scoring.js tests/scoring.test.js
git commit -m "feat(quiniela): batacazo de 15 simétrico para la semi (SPECIAL_BATACAZOS)"
```

---

### Task 2: Banner de la promo en la quiniela

**Files:**
- Modify: `js/game.js:476-491` (`specialPromoHtml`, la rama del batacazo especial)

No lleva test automatizado: `game.js` toca el DOM y Supabase, y no está bajo `node:test`. Se verifica en el navegador en la Task 5.

- [ ] **Step 1: Reescribir la rama del batacazo especial**

Sustituir el comentario y la rama de las líneas 476-491 (desde `// Aviso de la promo de una jornada` hasta el `}` que cierra el `if (sp && m.id === sp.matchId) {`) por:

```js
  // Aviso de una promo de batacazo amarrada a un partido (ver scoring.SPECIAL_BATACAZOS).
  // Con teamId hay que ir por ese equipo (Cabo Verde +50); sin teamId es simétrica y basta
  // acertar quién gana (semi Inglaterra–Argentina +15). El copy se adapta a si el partido
  // está por jugarse, ya cerrado (locked/en vivo) o terminado con el premio logrado.
  function specialPromoHtml(m) {
    const sp = (WC.scoring.SPECIAL_BATACAZOS || []).find(function (x) { return x.matchId === m.id; });
    if (sp) {
      const v = mine[m.id];
      if (m.status === "played" && m.hs != null) {
        const won = isCaptain(m.id) && v && WC.scoring.specialBatacazoApplies(m, { hg: v.hg, ag: v.ag, adv: v.adv });
        return won ? '<div class="promo-bat won">💥 ¡Batacazo especial logrado! <b>+' + sp.bonus + " puntos</b></div>" : "";
      }
      const bonus = "<b>+" + sp.bonus + " puntos</b>";
      const txt = sp.teamId
        ? (kicked(m)
            ? "Batacazo especial: " + bonus + " si " + teamName(sp.teamId) + " avanza."
            : "Marca a <b>" + teamName(sp.teamId) + "</b> como tu batacazo y gana " + bonus + " si avanza.")
        : (kicked(m)
            ? "Batacazo especial: " + bonus + " si aciertas quién avanza."
            : "Marca este partido como tu <b>Batacazo</b> y gana " + bonus + " si aciertas quién gana — " +
              esc(WC.slotName(m, "home")) + " o " + esc(WC.slotName(m, "away")) + ", da igual cuál.");
      return '<div class="promo-bat"><span class="promo-bat-tag">💥 Especial</span> <span class="promo-bat-txt">' + txt + "</span></div>";
    }
```

Notas de los helpers usados, todos ya existentes en `game.js`: `teamName(id)` (línea 43) devuelve `"🇨🇻 Cabo Verde"` ya escapado; `esc` (línea 13); `kicked(m)` (línea 41); `isCaptain(matchId)` (línea 417); `WC.slotName(m, side)` viene de `app.js` y devuelve el nombre crudo, por eso va envuelto en `esc`.

La rama de `SPECIAL_MATCH_PROMOS` (Suiza) que sigue justo abajo no se toca.

- [ ] **Step 2: Verificar que no queda ninguna referencia al nombre viejo**

Run: `grep -rn "SPECIAL_BATACAZO\b" js/`
Expected: sin resultados.

- [ ] **Step 3: Verificar que el archivo parsea**

Run: `node --check js/game.js`
Expected: sin salida (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat(quiniela): banner del batacazo de 15 en la tarjeta de la semi"
```

---

### Task 3: Builders del push (doble pulso)

**Files:**
- Modify: `tools/push-messages.js:90` (prioridad), `tools/push-messages.js:153` (insertar tras `buildSpecialPush`), `tools/push-messages.js:277-281` (exports)
- Test: `tests/push-messages.test.js` (añadir al final)

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `tests/push-messages.test.js`:

```js
/* ---------- promo especial: batacazo de 15 simétrico (semi 15 jul) ---------- */
const SF_MATCH = { id: "400021540", num: 102, date: "2026-07-15T19:00:00.000Z", home: "43942", away: "43922", status: "scheduled" };
const SF_TEAMS = { "43942": { id: "43942", name: "Inglaterra", flag: "🏴" }, "43922": { id: "43922", name: "Argentina", flag: "🇦🇷" } };
const SF_PROMO = { matchId: "400021540", teamId: null, bonus: 15 };

test("buildBat15Candidates: broadcast a todos si el cruce está en la ventana", () => {
  const now = new Date("2026-07-15T17:00:00Z").getTime();   // faltan 120 min
  const cands = pm.buildBat15Candidates(["u1", "u2"], [M1, SF_MATCH], SF_PROMO, now);
  assert.strictEqual(cands.length, 2);
  assert.strictEqual(cands[0].reason, "special_bat15");
  assert.strictEqual(cands[0].kind, "special_bat15");
  assert.strictEqual(cands[0].matchId, "400021540");
  assert.strictEqual(cands[0].bonus, 15);
});

test("buildBat15Candidates: doble pulso — kind _pre cuando faltan más de 185 min", () => {
  const now = new Date("2026-07-15T10:30:00Z").getTime();   // faltan 510 min
  const cands = pm.buildBat15Candidates(["u1"], [SF_MATCH], SF_PROMO, now);
  assert.strictEqual(cands[0].kind, "special_bat15_pre");
});

test("buildBat15Candidates: nada si el cruce no está en la ventana o no hay promo", () => {
  const now = new Date("2026-07-15T17:00:00Z").getTime();
  assert.strictEqual(pm.buildBat15Candidates(["u1"], [M1, M2], SF_PROMO, now).length, 0);
  assert.strictEqual(pm.buildBat15Candidates(["u1"], [SF_MATCH], null, now).length, 0);
});

test("buildBat15Push: copy simétrico con los dos equipos, +15 y metadata allowlisted", () => {
  const push = pm.buildBat15Push(SF_MATCH, SF_TEAMS, "3:00 p. m.", 15);
  assert.ok(push.title.indexOf("Batacazo de 15") >= 0);
  assert.ok(push.body.indexOf("Inglaterra") >= 0);
  assert.ok(push.body.indexOf("Argentina") >= 0);
  assert.ok(push.body.indexOf("+15") >= 0);
  assert.strictEqual(push.data.reason, "special_bat15");
  assert.strictEqual(push.data.matchId, "400021540");
  assert.strictEqual(push.data.campaign, "special_bat15");
});

test("applyGuardrails: el batacazo de 15 gana el bloque sobre el % (summary)", () => {
  const cands = [
    { userId: "u1", matchId: "400021540", reason: "summary", kind: "summary", kickoffAt: SF_MATCH.date },
    { userId: "u1", matchId: "400021540", reason: "special_bat15", kind: "special_bat15", kickoffAt: SF_MATCH.date }
  ];
  const winners = pm.applyGuardrails(cands, {});
  assert.strictEqual(winners.length, 1);
  assert.strictEqual(winners[0].reason, "special_bat15");
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `node --test tests/push-messages.test.js`
Expected: FAIL con `TypeError: pm.buildBat15Candidates is not a function`.

- [ ] **Step 3: Añadir la prioridad en `tools/push-messages.js:90`**

Sustituir la línea 90 por:

```js
const REASON_PRIORITY = { special_bat15: 7, special_suiza: 7, special_batacazo: 7, summary: 6, pending_pick: 5, captain: 4, reachable_rival: 3, rival_threat: 2, win_matchday: 1 };
```

- [ ] **Step 4: Añadir los builders tras `buildSpecialPush` (después de la línea 153)**

```js
// Candidatos del push "Batacazo de 15" (promo simétrica: el batacazo de ese cruce paga un
// premio fijo para cualquiera de los dos, ver la entrada con teamId null en
// scoring.SPECIAL_BATACAZOS). Broadcast a todos los suscriptores si el cruce está en la
// ventana (soon): es un anuncio, no se gatilla por el estado del pick. Doble pulso con
// DEDUPE distinto para poder enviar dos veces (ahora + repetición): "special_bat15_pre"
// cuando faltan >185 min (envío manual adelantado) y "special_bat15" dentro de la ventana
// estándar de 180 min (≈3 h antes), que es la que dispara el cron.
function buildBat15Candidates(userIds, soon, promo, nowMs) {
  if (!promo) return [];
  const m = (soon || []).find(function (x) { return x.id === promo.matchId; });
  if (!m) return [];
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const minsToKick = (new Date(m.date).getTime() - now) / 60000;
  const kind = minsToKick > 185 ? "special_bat15_pre" : "special_bat15";
  return (userIds || []).map(function (uid) {
    return { userId: uid, matchId: m.id, reason: "special_bat15", kind: kind, kickoffAt: m.date, match: m, bonus: promo.bonus };
  });
}

// Push {title, body, data} del "Batacazo de 15". Simétrico: nombra a los dos equipos
// porque el premio no depende de cuál gane.
function buildBat15Push(match, teams, hora, bonus) {
  const pts = bonus || 15;
  const h = teamName(teams, match.home), a = teamName(teams, match.away);
  const hn = h ? (h.flag ? h.flag + " " : "") + h.name : "el local";
  const an = a ? (a.flag ? a.flag + " " : "") + a.name : "el visitante";
  return {
    title: "💥 Batacazo de " + pts + (hora ? " · " + hora : ""),
    body: "Hoy el Batacazo paga +" + pts + " puntos: marca la semi y acierta quién gana, " + hn + " o " + an + ". ¡Da igual cuál, solo hoy!",
    data: { reason: "special_bat15", matchId: match.id, blockHour: blockHourKey(match.date), campaign: "special_bat15" }
  };
}
```

`teamName(teams, id)` y `blockHourKey(date)` ya existen en el módulo (los usa `buildSpecialPush`).

- [ ] **Step 5: Añadir los exports (líneas 277-281)**

Tras la línea `buildSuizaSpecialCandidates: buildSuizaSpecialCandidates, buildSuizaSpecialPush: buildSuizaSpecialPush,` añadir:

```js
  buildBat15Candidates: buildBat15Candidates, buildBat15Push: buildBat15Push,
```

- [ ] **Step 6: Correr los tests de push**

Run: `node --test tests/push-messages.test.js`
Expected: PASS, todos. Los tests viejos de `buildSpecialCandidates`/`buildSpecialPush` (Cabo Verde) siguen verdes: le pasan el `matchId` explícito, así que no dependen de la constante que quitamos.

- [ ] **Step 7: Commit**

```bash
git add tools/push-messages.js tests/push-messages.test.js
git commit -m "feat(push): builders del batacazo de 15 con doble pulso"
```

---

### Task 4: Rewire del runner del push

**Files:**
- Modify: `tools/send-push-reminders.js:237-241` (candidatos), `tools/send-push-reminders.js:248-254` (dispatch del mensaje)

Sin test: el runner hace I/O contra Supabase y web-push. La lógica pura vive en `push-messages.js` y ya quedó cubierta en la Task 3. Se verifica con `dry_run=1` en la Task 6.

- [ ] **Step 1: Sustituir la construcción de candidatos (líneas 237-241)**

Reemplazar:

```js
  const specialCands = scoring.SPECIAL_BATACAZO
    ? pm.buildSpecialCandidates(userIds, soon, scoring.SPECIAL_BATACAZO.matchId) : [];
  const suizaPromo = (scoring.SPECIAL_MATCH_PROMOS || [])[0] || null;
  const suizaCands = pm.buildSuizaSpecialCandidates(userIds, soon, suizaPromo, now);
  const winners = pm.applyGuardrails(suizaCands.concat(specialCands).concat(summaryCands).concat(oppCands), { alreadySent: alreadySent, sentTodayCount: sentTodayCount });
```

por:

```js
  // Promo de batacazo simétrica (la entrada sin teamId): hoy, la semi con +15.
  const bat15Promo = (scoring.SPECIAL_BATACAZOS || []).find(function (p) { return !p.teamId; }) || null;
  const bat15Cands = pm.buildBat15Candidates(userIds, soon, bat15Promo, now);
  const suizaPromo = (scoring.SPECIAL_MATCH_PROMOS || [])[0] || null;
  const suizaCands = pm.buildSuizaSpecialCandidates(userIds, soon, suizaPromo, now);
  const winners = pm.applyGuardrails(bat15Cands.concat(suizaCands).concat(summaryCands).concat(oppCands), { alreadySent: alreadySent, sentTodayCount: sentTodayCount });
```

- [ ] **Step 2: Sustituir el dispatch del mensaje (líneas 248-254)**

Reemplazar:

```js
      const msg = candidate.kind === "summary"
        ? pm.buildPush(candidate.blockMatches, snap.teams, tallies, candidate.missingPick)
        : candidate.kind === "special"
          ? pm.buildSpecialPush(candidate.match, snap.teams, pm.horaTxt(candidate.kickoffAt), scoring.SPECIAL_BATACAZO.teamId)
          : (candidate.kind === "special_suiza" || candidate.kind === "special_suiza_pre")
            ? pm.buildSuizaSpecialPush(candidate.match, snap.teams, pm.horaTxt(candidate.kickoffAt), candidate.teamId)
            : pm.buildOpportunityPush(candidate.opp, pm.horaTxt(candidate.kickoffAt));
```

por:

```js
      const msg = candidate.kind === "summary"
        ? pm.buildPush(candidate.blockMatches, snap.teams, tallies, candidate.missingPick)
        : (candidate.kind === "special_bat15" || candidate.kind === "special_bat15_pre")
          ? pm.buildBat15Push(candidate.match, snap.teams, pm.horaTxt(candidate.kickoffAt), candidate.bonus)
          : (candidate.kind === "special_suiza" || candidate.kind === "special_suiza_pre")
            ? pm.buildSuizaSpecialPush(candidate.match, snap.teams, pm.horaTxt(candidate.kickoffAt), candidate.teamId)
            : pm.buildOpportunityPush(candidate.opp, pm.horaTxt(candidate.kickoffAt));
```

`buildSpecialCandidates`/`buildSpecialPush` quedan sin uso desde el runner (el cruce de Cabo Verde ya se jugó y nunca vuelve a caer en `soon`), pero se conservan en el módulo con sus tests.

- [ ] **Step 3: Verificar que no queda ninguna referencia al nombre viejo**

Run: `grep -rn "SPECIAL_BATACAZO\b" js/ tools/`
Expected: sin resultados.

- [ ] **Step 4: Verificar que el archivo parsea**

Run: `node --check tools/send-push-reminders.js`
Expected: sin salida (exit 0).

- [ ] **Step 5: Correr toda la suite**

Run: `node --test tests/`
Expected: PASS, todos.

- [ ] **Step 6: Commit**

```bash
git add tools/send-push-reminders.js
git commit -m "feat(push): el runner lee la promo simétrica de SPECIAL_BATACAZOS"
```

---

### Task 5: Bump de caché y verificación en el navegador

**Files:**
- Modify: `index.html:355` (scoring.js), `index.html:358` (game.js)

- [ ] **Step 1: Bumpear el `?v=` de los dos scripts**

En `index.html`, línea 355: `js/scoring.js?v=20260711a` → `js/scoring.js?v=20260715a`
En `index.html`, línea 358: `js/game.js?v=20260711a` → `js/game.js?v=20260715a`

El `?v=` es obligatorio: el service worker no cachea estos scripts, pero el navegador sí, y sin el bump los jugadores seguirían con el scoring viejo.

- [ ] **Step 2: Levantar un servidor local en un puerto nuevo**

Run: `python3 -m http.server 8099`

Puerto nuevo a propósito: el navegador de pruebas cachea JS de forma agresiva y un puerto reusado sirve el archivo viejo.

- [ ] **Step 3: Verificar el banner en la tarjeta de la semi**

Abrir `http://localhost:8099/index.html`, ir a la quiniela y buscar la tarjeta de Inglaterra vs Argentina.
Expected: el banner "💥 Especial — Marca este partido como tu **Batacazo** y gana **+15 puntos** si aciertas quién gana — Inglaterra o Argentina, da igual cuál."

Si la sesión requiere login y no hay credenciales a mano, verificar en su lugar que el módulo expone la promo:

Run: `node -e 'const s=require("./js/scoring.js"); console.log(JSON.stringify(s.SPECIAL_BATACAZOS)); const m={id:"400021540",stage:"sf",status:"played",hs:2,as:1,winner:"43942",home:"43942",away:"43922"}; const p={hg:2,ag:1}; console.log("captainTotal:", s.captainTotal(s.scoreMatch(p,m),m,0.9,p));'`
Expected: el array con las dos entradas y `captainTotal: 19`.

- [ ] **Step 4: Commit y desplegar**

```bash
git add index.html
git commit -m "chore(cache): bump de scoring.js y game.js a v20260715a"
git push origin main
```

El `git push` a main publica en GitHub Pages (jmcriptos.github.io/ruta26). **Confirmar con Jose antes de pushear**: es un despliegue en vivo que cambia el scoring de un partido que se juega hoy.

- [ ] **Step 5: Verificar el sitio en vivo**

Esperar ~1 min al build de Pages y abrir `https://jmcriptos.github.io/ruta26/`.
Expected: el banner del batacazo de 15 aparece en la tarjeta de la semi, y `view-source` muestra `scoring.js?v=20260715a`.

---

### Task 6: Enviar el push a la liga

**Files:** ninguno (operación).

Depende de que la Task 5 esté desplegada: el workflow corre contra `main`.

- [ ] **Step 1: Probar en seco**

Run: `gh workflow run push-reminders.yml -f dry_run=1 -f window_min=600`

`window_min=600` (10 h) porque el kickoff es a las 19:00 UTC y faltan ~8 h; con la ventana estándar de 180 min el cruce no entraría en `soon` todavía.

- [ ] **Step 2: Revisar el log del dry-run**

Run: `gh run list --workflow=push-reminders.yml --limit 1` y luego `gh run view <run-id> --log`
Expected: líneas `[dry-run] <uid>… [special_bat15_pre:special_bat15] ← 💥 Batacazo de 15 · <hora> | Hoy el Batacazo paga +15 puntos…`, una por suscriptor. Verificar que el `kind` es `special_bat15_pre` (no `special_bat15`), que nombra a Inglaterra y Argentina, y que no salen candidatos de Suiza ni de Cabo Verde.

- [ ] **Step 3: Enviar de verdad**

**Confirmar con Jose antes de correr esto**: manda una notificación real a todos los suscriptores y no se puede deshacer.

Run: `gh workflow run push-reminders.yml -f dry_run=0 -f window_min=600`

- [ ] **Step 4: Verificar el envío**

Run: `gh run view <run-id> --log`
Expected: `Usuarios avisados: N` sin la marca `[dry-run]`, y sin errores de endpoint.

El segundo pulso (`special_bat15`, a T-3h ≈ 16:00 UTC) lo dispara el cron solo. Si a las 16:30 UTC no ha salido, repetir el Step 3 con `-f window_min=200`: el `kind` distinto esquiva el dedupe, así que el pulso `_pre` ya enviado no lo bloquea.

---

## Verificación final

- [ ] `node --test tests/` en verde (la suite completa, no solo los archivos tocados).
- [ ] `grep -rn "SPECIAL_BATACAZO\b" js/ tools/` sin resultados.
- [ ] El banner del +15 se ve en el sitio en vivo antes de las 19:00 UTC.
- [ ] El push salió (`Usuarios avisados: N` > 0).
- [ ] Los tests de "promo Cabo Verde" siguen verdes: el +50 del histórico no se tocó.
