# Arreglo de notificaciones push (datos en vivo + %) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir las notificaciones push: leer datos en vivo (FIFA) para el ranking, arreglar la hora del mediodía, no enviar rivales espurios, y restaurar el push de "% del más votado" como principal pre-partido conviviendo con los de oportunidad.

**Architecture:** El cron `tools/send-push-reminders.js` pasa a fusionar resultados en vivo (reusando `js/api.js`) antes de calcular el ranking. `tools/push-messages.js` gana el candidato `summary` (%) de máxima prioridad y un dedupe por `kind`. `js/engagement.js` gana un guardarraíl (rival solo con partidos decididos). Migración SQL aditiva en `push_sent` (columna `kind`).

**Tech Stack:** JS CommonJS (Node 20, `fetch`/`AbortController` nativos), web-push, Supabase REST, GitHub Actions. Tests con `node --test tests/`.

**Spec:** `docs/superpowers/specs/2026-06-21-fix-push-notificaciones-design.md`

**Rama:** `fix/push-notificaciones` (no main); merge al final.

---

## Estructura de archivos

- **Modify** `tools/push-messages.js` — fix `horaTxt` (hourCycle); `REASON_PRIORITY.summary`; `buildSummaryCandidates`; `applyGuardrails` dedupe por `kind`; exportar lo nuevo.
- **Modify** `tests/push-messages.test.js` — tests de horaTxt mediodía, buildSummaryCandidates, guardrails con summary+kind (y actualizar el test de dedupe a `kind`).
- **Modify** `js/engagement.js` — guardarraíl `me.decided > 0` en `reachable_rival`/`rival_threat`.
- **Modify** `tests/engagement.test.js` — test del guardarraíl.
- **Modify** `tools/send-push-reminders.js` — live data (api.js), passes summary+oportunidad, drop `pending_pick`, `kind` en `push_sent`/`alreadySent`, ruteo de mensaje.
- **Create** `sql/migrate-push-sent-kind.sql` — migración aditiva de `push_sent`.

Orden de despliegue (en la verificación final): SQL primero, luego el código.

---

## Task 1: Fix de la hora del mediodía (`horaTxt`)

**Files:**
- Modify: `tools/push-messages.js`
- Test: `tests/push-messages.test.js`

- [ ] **Step 1: Test que falla — mediodía y medianoche**

Añadir al final de `tests/push-messages.test.js`:

```js
test("horaTxt: mediodía y medianoche no se imprimen como 0", () => {
  assert.strictEqual(pm.horaTxt("2026-06-21T16:00:00Z"), "12:00 p. m."); // 16:00Z = mediodía Curaçao
  assert.strictEqual(pm.horaTxt("2026-06-21T04:00:00Z"), "12:00 a. m."); // 04:00Z = medianoche Curaçao
  assert.strictEqual(pm.horaTxt("2026-06-11T19:00:00Z"), "3:00 p. m.");  // sin cambios
});
```

- [ ] **Step 2: Correr el test → falla**

Run: `node --test tests/push-messages.test.js`
Expected: FALLA en el nuevo test (actual da "0:00 p. m." / "0:00 a. m.").

- [ ] **Step 3: Implementar — `hourCycle: "h12"`**

En `tools/push-messages.js`, función `horaTxt`, reemplazar:

```js
  return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Curacao" })
    .format(new Date(iso)).replace(/\s/g, " ");
```

por:

```js
  return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZone: "America/Curacao" })
    .format(new Date(iso)).replace(/\s/g, " ");
```

- [ ] **Step 4: Correr el test → pasa**

Run: `node --test tests/push-messages.test.js`
Expected: PASA (incluye el nuevo test).

- [ ] **Step 5: Commit**

```bash
git add tools/push-messages.js tests/push-messages.test.js
git commit -m "fix(push): horaTxt usa hourCycle h12 (mediodía ya no sale como 0:00)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Guardarraíl del rival (`engagement.opportunity`)

**Files:**
- Modify: `js/engagement.js`
- Test: `tests/engagement.test.js`

- [ ] **Step 1: Test que falla — sin partidos decididos no hay rival**

Añadir al final de `tests/engagement.test.js` (el módulo se requiere como `engagement` o `WC.engagement`; usar el mismo identificador que el resto del archivo — revisar las primeras líneas y reutilizarlo):

```js
test("opportunity: sin partidos decididos no dispara rival_threat/reachable_rival", () => {
  // dos jugadores empatados a 0, ninguno con partidos decididos
  const official = [
    { userId: "me", username: "yo", points: 0, decided: 0, exact: 0, pos: 1 },
    { userId: "ot", username: "otro", points: 0, decided: 0, exact: 0, pos: 1 }
  ];
  const snap = {
    now: 0, meId: "me", official: official, live: [],
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2999-01-01T00:00:00Z", home: "1", away: "2" }],
    matchPotentials: { m1: 3 }, myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    visiblePredictions: [], teams: { "1": { name: "A" }, "2": { name: "B" } }
  };
  const opp = engagement.opportunity(snap);
  assert.ok(opp.reason !== "rival_threat" && opp.reason !== "reachable_rival");
});

test("opportunity: con partidos decididos y gap chico sí dispara rival_threat", () => {
  const official = [
    { userId: "me", username: "yo", points: 5, decided: 4, exact: 1, pos: 1 },
    { userId: "ot", username: "otro", points: 3, decided: 4, exact: 0, pos: 2 }
  ];
  const snap = {
    now: 0, meId: "me", official: official, live: [],
    matches: [{ id: "m1", stage: "group", status: "scheduled", kickoff_at: "2999-01-01T00:00:00Z", home: "1", away: "2" }],
    matchPotentials: { m1: 3 }, myPredictions: { m1: { hg: 1, ag: 0 } }, myCaptains: [],
    visiblePredictions: [], teams: { "1": { name: "A" }, "2": { name: "B" } }
  };
  const opp = engagement.opportunity(snap);
  assert.strictEqual(opp.reason, "rival_threat");
  assert.strictEqual(opp.rival.username, "otro");
});
```

Nota: si el identificador del módulo en el archivo es `WC.engagement` o `eng`, usar ese. Verificar con las primeras ~10 líneas del archivo de test.

- [ ] **Step 2: Correr → el primer test falla**

Run: `node --test tests/engagement.test.js`
Expected: FALLA "sin partidos decididos…" (hoy devuelve rival_threat con gap 0).

- [ ] **Step 3: Implementar el guardarraíl**

En `js/engagement.js`, función `opportunity`, bloque "3/4) rival cercano por ranking oficial". Reemplazar:

```js
    if (meIdx >= 0) {
      const me = official[meIdx], above = official[meIdx - 1], below = official[meIdx + 1];
      const potential = nextMatch ? dayPotential(snapshot, upcoming, nextMatch) : 0;
      if (above && (above.points - me.points) > 0 && (above.points - me.points) <= potential) {
```

por (añade la guarda `hasDecided`):

```js
    if (meIdx >= 0) {
      const me = official[meIdx], above = official[meIdx - 1], below = official[meIdx + 1];
      const potential = nextMatch ? dayPotential(snapshot, upcoming, nextMatch) : 0;
      const hasDecided = (me.decided || 0) > 0; // carrera real: solo si ya se jugó algo
      if (hasDecided && above && (above.points - me.points) > 0 && (above.points - me.points) <= potential) {
```

Y en la rama de `rival_threat`, reemplazar:

```js
      if (below && (me.points - below.points) <= THREAT_GAP) {
```

por:

```js
      if (hasDecided && below && (me.points - below.points) <= THREAT_GAP) {
```

- [ ] **Step 4: Correr → pasan**

Run: `node --test tests/engagement.test.js`
Expected: PASA (ambos nuevos + los previos).

- [ ] **Step 5: Commit**

```bash
git add js/engagement.js tests/engagement.test.js
git commit -m "fix(engagement): rival (threat/reachable) solo con partidos decididos

Evita 'X te pisa los talones' espurio cuando el ranking está vacío (todos a 0).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Candidato `summary` (%) + dedupe por `kind` (`push-messages.js`)

**Files:**
- Modify: `tools/push-messages.js`
- Test: `tests/push-messages.test.js`

- [ ] **Step 1: Tests que fallan — summary y dedupe por kind**

Añadir a `tests/push-messages.test.js`:

```js
test("buildSummaryCandidates: un candidato por usuario y bloque, con missingPick", () => {
  const soon = [M1, M2]; // mismo bloque horario (19:00Z)
  const hasPred = new Set(["u1|m1", "u1|m2"]); // u1 tiene ambos; u2 ninguno
  const cands = pm.buildSummaryCandidates(["u1", "u2"], soon, hasPred);
  assert.strictEqual(cands.length, 2); // 1 por usuario (un solo bloque)
  const u1 = cands.find(function (c) { return c.userId === "u1"; });
  const u2 = cands.find(function (c) { return c.userId === "u2"; });
  assert.strictEqual(u1.reason, "summary");
  assert.strictEqual(u1.kind, "summary");
  assert.strictEqual(u1.missingPick, false);
  assert.strictEqual(u2.missingPick, true);
  assert.strictEqual(u1.blockMatches.length, 2);
});

test("applyGuardrails: summary gana el bloque sobre la oportunidad", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "rival_threat", kind: "opportunity", kickoffAt: "2026-06-28T22:00:00Z" },
    { userId: "u1", matchId: "m1", reason: "summary", kind: "summary", kickoffAt: "2026-06-28T22:00:00Z" }
  ];
  const out = pm.applyGuardrails(cands, {});
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kind, "summary");
});

test("applyGuardrails: dedupe por kind (summary y opportunity no se pisan)", () => {
  const cands = [
    { userId: "u1", matchId: "m1", reason: "summary", kind: "summary", kickoffAt: "2026-06-28T22:00:00Z" }
  ];
  // ya se envió el summary de m1 → se descarta; pero un opportunity de m1 NO
  assert.strictEqual(pm.applyGuardrails(cands, { alreadySent: new Set(["u1|m1|summary"]) }).length, 0);
  const opp = [{ userId: "u1", matchId: "m1", reason: "rival_threat", kind: "opportunity", kickoffAt: "2026-06-29T22:00:00Z" }];
  assert.strictEqual(pm.applyGuardrails(opp, { alreadySent: new Set(["u1|m1|summary"]) }).length, 1);
});
```

Además, **actualizar** el test existente "applyGuardrails: descarta opt-out/suprimidos y ya-enviados (match+reason)": cambiar su `alreadySent` de `new Set(["u2|m1|pending_pick"])` a `new Set(["u2|m1|opportunity"])` (el dedupe ahora es por `kind`, y los candidatos sin `kind` cuentan como `"opportunity"`). El resto del test queda igual.

- [ ] **Step 2: Correr → fallan los nuevos**

Run: `node --test tests/push-messages.test.js`
Expected: FALLAN (no existe `buildSummaryCandidates`; dedupe aún por reason).

- [ ] **Step 3: Implementar en `tools/push-messages.js`**

(a) Extender la prioridad (la más alta para summary). Reemplazar:

```js
const REASON_PRIORITY = { pending_pick: 5, captain: 4, reachable_rival: 3, rival_threat: 2, win_matchday: 1 };
```

por:

```js
const REASON_PRIORITY = { summary: 6, pending_pick: 5, captain: 4, reachable_rival: 3, rival_threat: 2, win_matchday: 1 };
```

(b) En `applyGuardrails`, cambiar el dedupe de `reason` a `kind`. Reemplazar:

```js
  const cands = (candidates || []).filter(function (c) {
    return c && !c.suppressed && !alreadySent.has(c.userId + "|" + c.matchId + "|" + c.reason);
  });
```

por:

```js
  const cands = (candidates || []).filter(function (c) {
    return c && !c.suppressed && !alreadySent.has(c.userId + "|" + c.matchId + "|" + (c.kind || "opportunity"));
  });
```

(c) Añadir `buildSummaryCandidates` (junto a `buildOpportunityCandidates`):

```js
// Candidatos del push "summary" (% del más votado), por (usuario, bloque horario).
// soon: partidos en ventana; hasPredSet: Set("user|match") con los picks existentes.
// Devuelve { userId, matchId (representativo del bloque), reason:"summary", kind:"summary",
//            kickoffAt, blockMatches, missingPick }.
function buildSummaryCandidates(userIds, soon, hasPredSet) {
  const blocks = {};
  (soon || []).forEach(function (m) {
    const k = blockHourKey(m.date);
    (blocks[k] = blocks[k] || []).push(m);
  });
  const out = [];
  (userIds || []).forEach(function (uid) {
    Object.keys(blocks).forEach(function (k) {
      const ms = blocks[k];
      const missingPick = ms.some(function (m) { return !hasPredSet.has(uid + "|" + m.id); });
      out.push({
        userId: uid,
        matchId: ms[0].id,
        reason: "summary",
        kind: "summary",
        kickoffAt: ms[0].date,
        blockMatches: ms,
        missingPick: missingPick
      });
    });
  });
  return out;
}
```

(d) Exportarlo. En `module.exports`, añadir `buildSummaryCandidates: buildSummaryCandidates,` a la lista.

- [ ] **Step 4: Correr → pasan**

Run: `node --test tests/push-messages.test.js`
Expected: PASA (nuevos + actualizado + previos).

- [ ] **Step 5: Commit**

```bash
git add tools/push-messages.js tests/push-messages.test.js
git commit -m "feat(push): candidato summary (%) de máxima prioridad + dedupe por kind

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cron con datos en vivo + summary + oportunidad (`send-push-reminders.js`)

**Files:**
- Modify: `tools/send-push-reminders.js`

- [ ] **Step 1: Requerir `api.js` y añadir `liveMatches`**

Tras la línea `const engagement = require("../js/engagement.js");` añadir:

```js
const api = require("../js/api.js");
```

Y añadir esta función helper (p. ej. después de `engagementMatch`):

```js
// Trae resultados en vivo de FIFA y los fusiona con el snapshot; degrada al snapshot si falla.
async function liveMatches(snapMatches) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    let res;
    try { res = await fetch(api.ENDPOINT, { signal: ctrl.signal, cache: "no-store" }); }
    finally { clearTimeout(t); }
    if (!res.ok) throw new Error("FIFA HTTP " + res.status);
    const json = await res.json();
    if (!json || !Array.isArray(json.Results)) throw new Error("Respuesta FIFA inválida");
    const live = json.Results.map(api.normalize).filter(function (m) { return m.id && m.num && m.date; });
    console.log("FIFA en vivo: " + live.length + " partidos fusionados");
    return api.merge(snapMatches, live);
  } catch (e) {
    console.error("FIFA en vivo falló, uso snapshot:", e.message);
    return snapMatches;
  }
}
```

- [ ] **Step 2: Fusionar en vivo al inicio de `main()` y usar `matches` para `soon`**

En `main()`, reemplazar:

```js
  const snap = snapshot();
  const now = Date.now();
  const soon = snap.matches.filter(function (m) {
    const t = new Date(m.date).getTime();
    return m.status === "scheduled" && t > now && t <= now + WINDOW_MS;
  });
```

por:

```js
  const snap = snapshot();
  const now = Date.now();
  const matches = await liveMatches(snap.matches);
  const soon = matches.filter(function (m) {
    const t = new Date(m.date).getTime();
    return m.status === "scheduled" && t > now && t <= now + WINDOW_MS;
  });
```

(Las ramas DIAG/TEST siguen usando `snap.matches`/`soon` tal cual; no se tocan.)

- [ ] **Step 3: Reescribir el bloque de producción (candidatos + envío)**

Reemplazar TODO el bloque que va desde:

```js
  if (!soon.length) { console.log("Sin partidos en la ventana."); return; }
  console.log("Partidos próximos: " + soon.map(function (m) { return m.id; }).join(", "));
```

hasta el final del `console.log(... "Usuarios avisados: " ...)` (es el último bloque de `main()`), por:

```js
  if (!soon.length) { console.log("Sin partidos en la ventana."); return; }
  console.log("Partidos próximos: " + soon.map(function (m) { return m.id; }).join(", "));

  const subs = validSubscriptions(await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth"));
  if (!subs.length) { console.log("Sin suscriptores."); return; }
  const ids = soon.map(function (m) { return m.id; }).join(",");
  const preds = await rest("predictions?select=user_id,match_id,hg,ag,pens&limit=20000");
  const profiles = await rest("profiles?select=id,username");
  const picks = await rest("champion_picks?select=user_id,team_id");
  const sent = await rest("push_sent?select=user_id,match_id,kind,sent_at&match_id=in.(" + ids + ")");
  const sentTodayRows = await rest("push_sent?select=user_id,sent_at&sent_at=gte." + encodeURIComponent(curacaoDayStartIso(now)));
  const caps = await rest("captain_picks?select=user_id,match_id&limit=20000").catch(function () { return []; });

  const alreadySent = new Set();
  (sent || []).forEach(function (s) { alreadySent.add(s.user_id + "|" + s.match_id + "|" + (s.kind || "opportunity")); });
  const sentTodayCount = {};
  (sentTodayRows || []).forEach(function (s) { sentTodayCount[s.user_id] = (sentTodayCount[s.user_id] || 0) + 1; });

  const byUser = {};
  subs.forEach(function (s) {
    const userSubs = byUser[s.user_id] = byUser[s.user_id] || [];
    if (userSubs.length < MAX_SUBSCRIPTIONS_PER_USER) userSubs.push(s);
  });
  const userIds = Object.keys(byUser);

  const official = scoring.buildLeaderboard(profiles || [], preds || [], picks || [], matches, caps || []);
  const tallies = pm.tallyByMatch(preds || []);
  const hasPred = new Set((preds || []).map(function (p) { return p.user_id + "|" + p.match_id; }));

  // Candidatos: summary (%, principal) + oportunidad (capitán/rival; pending_pick lo cubre el %).
  const summaryCands = pm.buildSummaryCandidates(userIds, soon, hasPred);
  const oppCands = userIds.map(function (uid) {
    return userOpportunityCandidate(uid, soon, snap.teams, official, preds || [], caps || [], now);
  }).filter(Boolean);
  const winners = pm.applyGuardrails(summaryCands.concat(oppCands), { alreadySent: alreadySent, sentTodayCount: sentTodayCount });
  const winnersByUser = {};
  winners.forEach(function (c) { (winnersByUser[c.userId] = winnersByUser[c.userId] || []).push(c); });

  let avisados = 0;
  for (const uid of Object.keys(winnersByUser)) {
    for (const candidate of winnersByUser[uid]) {
      const msg = candidate.kind === "summary"
        ? pm.buildPush(candidate.blockMatches, snap.teams, tallies, candidate.missingPick)
        : pm.buildOpportunityPush(candidate.opp, pm.horaTxt(candidate.kickoffAt));
      if (!msg) continue;
      const payload = pushPayload(msg.title, msg.body, msg.data);
      console.log((DRY ? "[dry-run] " : "") + uid.slice(0, 8) + "… [" + candidate.kind + ":" + candidate.reason + "] ← " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
      if (DRY) { avisados++; continue; }

      let delivered = 0;
      for (const s of byUser[uid]) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await rest("push_subscriptions?user_id=eq." + uid + "&endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
            console.log("  suscripción expirada eliminada");
          } else {
            console.error("  error de envío: " + (e.statusCode || e.message));
          }
        }
      }
      if (!delivered) { console.error("  ningún endpoint aceptó el push; se reintentará"); continue; }
      await rest("push_sent", {
        method: "POST",
        body: JSON.stringify([{ match_id: candidate.matchId, user_id: uid, kind: candidate.kind }])
      });
      avisados++;
    }
  }
  console.log((DRY ? "[dry-run] " : "") + "Usuarios avisados: " + avisados);
```

- [ ] **Step 4: Quitar `pending_pick` de los candidatos de oportunidad del cron**

En `userOpportunityCandidate`, reemplazar:

```js
  if (!opp || !opp.match || ["pending_pick", "captain", "reachable_rival", "rival_threat"].indexOf(opp.reason) === -1) return null;
  return {
    userId: uid,
    matchId: opp.match.id,
    reason: opp.reason,
    kickoffAt: opp.match.kickoffAt,
    opp: opp
  };
```

por (sin `pending_pick`, y marca `kind:"opportunity"`):

```js
  if (!opp || !opp.match || ["captain", "reachable_rival", "rival_threat"].indexOf(opp.reason) === -1) return null;
  return {
    userId: uid,
    matchId: opp.match.id,
    reason: opp.reason,
    kind: "opportunity",
    kickoffAt: opp.match.kickoffAt,
    opp: opp
  };
```

- [ ] **Step 5: Verificar sintaxis y suite**

Run: `node -c tools/send-push-reminders.js`
Expected: sin salida (OK).

Run: `node --test tests/`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add tools/send-push-reminders.js
git commit -m "feat(push): cron lee FIFA en vivo + envía % (principal) y oportunidad por kind

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Migración SQL de `push_sent` (columna `kind`)

**Files:**
- Create: `sql/migrate-push-sent-kind.sql`

- [ ] **Step 1: Crear el archivo**

Crear `sql/migrate-push-sent-kind.sql` con:

```sql
-- Permite que un usuario reciba el push de % (kind='summary') y, en otro slot del día,
-- uno de oportunidad (kind='opportunity') para el mismo partido sin pisarse el dedupe.
-- Idempotente: se puede correr varias veces.
alter table public.push_sent add column if not exists kind text not null default 'opportunity';

-- Reemplaza el PK (match_id, user_id) por un unique que incluye kind.
alter table public.push_sent drop constraint if exists push_sent_pkey;
create unique index if not exists push_sent_match_user_kind
  on public.push_sent (match_id, user_id, kind);
```

- [ ] **Step 2: Commit**

```bash
git add sql/migrate-push-sent-kind.sql
git commit -m "chore(db): migración push_sent.kind para % + oportunidad sin pisarse

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Nota: si la carpeta `sql/` no existe, créala (es solo un archivo de referencia que JM aplica en el SQL editor de Supabase; no lo corre el cron).

---

## Task 6: Verificación (simulación local con datos en vivo)

**Files:** ninguno (verificación). Reusa los JSON ya descargados con la anon key en `/tmp` durante el diagnóstico, o re-descárgalos.

- [ ] **Step 1: Suite completa**

Run: `node --test tests/`
Expected: `# tests` ≥ previos, `# pass` = todos, `# fail 0`.

- [ ] **Step 2: Simulación del cron (sin enviar, datos reales vía anon + FIFA en vivo)**

Crear un script temporal `/tmp/sim-push.js` que: carga el snapshot, llama a la MISMA `liveMatches` (fetch FIFA), reconstruye `official` con `buildLeaderboard`, y para `jmcriptos_26` y `jose` imprime el/los push(es) que generaría (summary + oportunidad), usando `buildSummaryCandidates`, `userOpportunityCandidate`-equivalente y `applyGuardrails`. Confirmar:
  - **jmcriptos_26 NO** recibe "jose te pisa los talones" (con datos en vivo el ranking es real; y si FIFA degrada, el guardarraíl lo bloquea por `decided=0`).
  - El push de **summary** sale con la **hora correcta** (mediodía → "12:00 p. m.").
  - El cuerpo del summary trae el % y, si falta el pick, la línea "👉 ¡Aún te falta tu pick!".

Comando: `node /tmp/sim-push.js` (usa `require` con rutas al repo). Revisar la salida a ojo.

- [ ] **Step 3 (opcional, recomendado): DRY-RUN real desde Actions**

Tras mergear, lanzar el workflow `push-reminders.yml` en modo manual con `DRY_RUN=1` (si el workflow lo soporta) o ejecutar el script en un runner con `SUPABASE_SERVICE_KEY` + VAPID y `DRY_RUN=1`. Confirmar en el log que ningún usuario recibe el rival espurio y que el % sale bien. (Lo ejecuta JM; requiere los secrets.)

---

## Verificación final

- [ ] `node --test tests/` → `# fail 0`.
- [ ] Simulación local: sin "jose te pisa los talones" espurio; summary con hora correcta y %.
- [ ] **Aplicar `sql/migrate-push-sent-kind.sql` en Supabase ANTES de que corra el cron nuevo** (si no, el INSERT con `kind` falla). 
- [ ] Merge a `main` con superpowers:finishing-a-development-branch (push dispara deploy; el cron usa el código de `main`).

---

## Self-review (cobertura del spec)

- **Datos en vivo en el cron (reusar api.js)** → Task 4 Steps 1-2 (`liveMatches`, `matches` en `buildLeaderboard`).
- **Fix de horas (hourCycle h12)** → Task 1.
- **Guardarraíl rival (me.decided>0)** → Task 2.
- **% como push principal + coexistencia (summary prioridad máxima, drop pending_pick, kind dedupe, 2/día)** → Task 3 (REASON_PRIORITY, buildSummaryCandidates, dedupe kind) + Task 4 (passes, drop pending_pick, push_sent kind).
- **Migración push_sent.kind** → Task 5.
- **Degradación si FIFA falla** → Task 4 Step 1 (`liveMatches` catch → snapshot) + guardarraíl (Task 2).
- **Pruebas (unit + simulación + dry-run)** → Tasks 1-3 (unit), Task 6 (simulación/dry-run).
- **Orden de despliegue (SQL antes que código)** → Verificación final.
- **No cambia sw.js/VAPID/payload/sitio en vivo/scoring** → ninguna de esas rutas se toca.
```
