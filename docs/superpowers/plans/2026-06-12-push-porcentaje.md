# Push pre-partido con % de la quiniela — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push a TODOS los suscriptores ~1h antes de cada partido con el % del resultado más votado de la quiniela, más línea extra si al usuario le falta el pick. Reemplaza el recordatorio actual de picks faltantes.

**Architecture:** La lógica pura (conteo + textos) va en un módulo nuevo `tools/push-messages.js` (testeable; el script principal ejecuta main() al cargarse y no es requerible). `tools/send-push-reminders.js` conserva el esqueleto (rest(), validación de endpoints, dedupe push_sent, limpieza 404/410, modos DRY/TEST/DIAG) y cambia la construcción del mensaje y la ventana (2h → 75 min).

**Tech Stack:** Node (Actions corre Node 20; localmente hay 16 — no usar APIs >16), node --test, web-push, Supabase REST.

**Spec:** `docs/superpowers/specs/2026-06-12-push-porcentaje-design.md`

## Datos verificados (no re-investigar)

- `predictions`: `user_id, match_id, hg, ag, pens(boolean), updated_at`. Ganador del pick: `hg>ag` local, `hg<ag` visitante, `hg=ag` empate. `pens` NO codifica ganador.
- `snapshot().teams` es un mapa id→`{name, flag, ...}`; `snapshot().matches[i]` tiene `id, num, date(ISO), home, away` (home/away pueden ser null en eliminatorias futuras).
- El script corre cada 15 min vía `.github/workflows/push-reminders.yml` (no se toca).
- `push_sent` PK (match_id, user_id); `Prefer: resolution=ignore-duplicates` ya está en rest().

---

### Task 1: Módulo puro `tools/push-messages.js` (TDD)

**Files:**
- Create: `tools/push-messages.js`
- Test: `tests/push-messages.test.js`

- [ ] **Step 1: Tests que fallan.** Crear `tests/push-messages.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const pm = require("../tools/push-messages.js");

const TEAMS = {
  "43911": { id: "43911", code: "MEX", name: "México", flag: "🇲🇽" },
  "43883": { id: "43883", code: "RSA", name: "Sudáfrica", flag: "🇿🇦" },
  "43924": { id: "43924", code: "KOR", name: "Corea del Sur", flag: "🇰🇷" },
  "43950": { id: "43950", code: "CZE", name: "Chequia", flag: "🇨🇿" }
};
const M1 = { id: "m1", num: 1, date: "2026-06-12T19:00:00.000Z", home: "43911", away: "43883" };
const M2 = { id: "m2", num: 2, date: "2026-06-12T19:00:00.000Z", home: "43924", away: "43950" };

function preds(matchId, homeWins, draws, awayWins) {
  const out = [];
  for (let i = 0; i < homeWins; i++) out.push({ match_id: matchId, hg: 2, ag: 0 });
  for (let i = 0; i < draws; i++) out.push({ match_id: matchId, hg: 1, ag: 1 });
  for (let i = 0; i < awayWins; i++) out.push({ match_id: matchId, hg: 0, ag: 1 });
  return out;
}

test("tallyByMatch: cuenta local/empate/visitante por partido", () => {
  const t = pm.tallyByMatch(preds("m1", 8, 2, 1).concat(preds("m2", 1, 3, 2)));
  assert.deepStrictEqual(t.m1, { home: 8, draw: 2, away: 1, total: 11 });
  assert.deepStrictEqual(t.m2, { home: 1, draw: 3, away: 2, total: 6 });
});

test("tallyByMatch: ignora filas malformadas", () => {
  const t = pm.tallyByMatch([{ match_id: "m1", hg: 2, ag: 0 }, null, { match_id: "m1", hg: "x", ag: 0 }, { hg: 1, ag: 1 }]);
  assert.deepStrictEqual(t.m1, { home: 1, draw: 0, away: 0, total: 1 });
});

test("matchSummary: mayoría local con redondeo", () => {
  // 8 de 11 = 72.7 → 73
  const s = pm.matchSummary(M1, TEAMS, { home: 8, draw: 2, away: 1, total: 11 });
  assert.strictEqual(s, "El 73% de la quiniela espera que gane 🇲🇽 México");
});

test("matchSummary: mayoría empate y mayoría visitante", () => {
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 5, away: 2, total: 8 }),
    "El 63% de la quiniela espera empate");
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 2, away: 5, total: 8 }),
    "El 63% de la quiniela espera que gane 🇿🇦 Sudáfrica");
});

test("matchSummary: empate técnico gana orden local, empate, visitante", () => {
  assert.ok(pm.matchSummary(M1, TEAMS, { home: 3, draw: 3, away: 0, total: 6 }).includes("México"));
  assert.ok(pm.matchSummary(M1, TEAMS, { home: 1, draw: 3, away: 3, total: 7 }).includes("empate"));
});

test("matchSummary: menos de 3 picks", () => {
  assert.strictEqual(pm.matchSummary(M1, TEAMS, { home: 1, draw: 1, away: 0, total: 2 }),
    "¡Sé de los primeros en pronosticar!");
  assert.strictEqual(pm.matchSummary(M1, TEAMS, undefined),
    "¡Sé de los primeros en pronosticar!");
});

test("buildPush: un partido, sin pick faltante", () => {
  const p = pm.buildPush([M1], TEAMS, { m1: { home: 8, draw: 2, away: 1, total: 11 } }, false);
  assert.strictEqual(p.title, "⚽ México vs Sudáfrica · 3:00 p. m.");
  assert.strictEqual(p.body, "El 73% de la quiniela espera que gane 🇲🇽 México");
});

test("buildPush: línea extra cuando falta el pick", () => {
  const p = pm.buildPush([M1], TEAMS, { m1: { home: 8, draw: 2, away: 1, total: 11 } }, true);
  assert.ok(p.body.endsWith("\n👉 ¡Aún te falta tu pick!"));
});

test("buildPush: dos partidos simultáneos en un solo push", () => {
  const tallies = { m1: { home: 8, draw: 2, away: 1, total: 11 }, m2: { home: 1, draw: 3, away: 2, total: 6 } };
  const p = pm.buildPush([M1, M2], TEAMS, tallies, false);
  assert.strictEqual(p.title, "⚽ 2 partidos arrancan a las 3:00 p. m.");
  assert.ok(p.body.includes("México vs Sudáfrica: 73% con México"));
  assert.ok(p.body.includes("Corea del Sur vs Chequia: 50% empate"));
});

test("buildPush: partido sin equipos definidos usa texto genérico", () => {
  const ko = { id: "k1", num: 73, date: "2026-06-28T19:00:00.000Z", home: null, away: null };
  const p = pm.buildPush([ko], TEAMS, {}, false);
  assert.ok(p.title.includes("El partido"));
  assert.strictEqual(p.body, "¡Sé de los primeros en pronosticar!");
});
```

- [ ] **Step 2: Verificar que fallan.** `node --test tests/push-messages.test.js` → FAIL (`Cannot find module`).

- [ ] **Step 3: Implementar `tools/push-messages.js`:**

```js
/* Lógica pura de los push pre-partido: conteo de resultados más votados y
   armado de título/cuerpo. Separada de send-push-reminders.js para testearla
   (ese script ejecuta main() al cargarse). */

const MIN_PICKS = 3;

// hora local de Curaçao, p. ej. "3:00 p. m."
function horaTxt(iso) {
  return new Intl.DateTimeFormat("es", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Curacao" })
    .format(new Date(iso)).replace(/\s/g, " ");
}

// predictions crudas → { matchId: {home, draw, away, total} }
function tallyByMatch(preds) {
  const out = {};
  (Array.isArray(preds) ? preds : []).forEach(function (p) {
    if (!p || p.match_id == null) return;
    const hg = Number(p.hg), ag = Number(p.ag);
    if (!Number.isInteger(hg) || !Number.isInteger(ag)) return;
    const t = out[p.match_id] = out[p.match_id] || { home: 0, draw: 0, away: 0, total: 0 };
    if (hg > ag) t.home++; else if (hg < ag) t.away++; else t.draw++;
    t.total++;
  });
  return out;
}

function teamName(teams, id) {
  const t = id != null ? teams[id] : null;
  return t ? { name: t.name, flag: t.flag || "" } : null;
}

// resultado más votado; empate técnico → orden local, empate, visitante
function topOutcome(tally) {
  if (tally.home >= tally.draw && tally.home >= tally.away) return { key: "home", n: tally.home };
  if (tally.draw >= tally.away) return { key: "draw", n: tally.draw };
  return { key: "away", n: tally.away };
}

// frase del % para un partido (cuerpo de push de un solo partido)
function matchSummary(match, teams, tally) {
  if (!tally || tally.total < MIN_PICKS) return "¡Sé de los primeros en pronosticar!";
  const top = topOutcome(tally);
  const pct = Math.round((top.n / tally.total) * 100);
  if (top.key === "draw") return "El " + pct + "% de la quiniela espera empate";
  const team = teamName(teams, top.key === "home" ? match.home : match.away);
  if (!team) return "¡Sé de los primeros en pronosticar!";
  return "El " + pct + "% de la quiniela espera que gane " + (team.flag ? team.flag + " " : "") + team.name;
}

// línea corta por partido (cuerpo de push con varios partidos)
function matchLine(match, teams, tally) {
  const home = teamName(teams, match.home);
  const away = teamName(teams, match.away);
  const vs = home && away ? home.name + " vs " + away.name : "Partido " + match.num;
  if (!tally || tally.total < MIN_PICKS) return vs + ": aún sin picks";
  const top = topOutcome(tally);
  const pct = Math.round((top.n / tally.total) * 100);
  if (top.key === "draw") return vs + ": " + pct + "% empate";
  const team = top.key === "home" ? home : away;
  return team ? vs + ": " + pct + "% con " + team.name : vs + ": aún sin picks";
}

// push completo {title, body} para 1..n partidos simultáneos
function buildPush(matches, teams, tallies, missingPick) {
  const hora = horaTxt(matches[0].date);
  let title, body;
  if (matches.length === 1) {
    const m = matches[0];
    const home = teamName(teams, m.home);
    const away = teamName(teams, m.away);
    title = "⚽ " + (home && away ? home.name + " vs " + away.name : "El partido") + " · " + hora;
    body = matchSummary(m, teams, tallies[m.id]);
  } else {
    title = "⚽ " + matches.length + " partidos arrancan a las " + hora;
    body = matches.map(function (m) { return matchLine(m, teams, tallies[m.id]); }).join("\n");
  }
  if (missingPick) body += "\n👉 ¡Aún te falta tu pick!";
  return { title: title, body: body };
}

module.exports = { tallyByMatch: tallyByMatch, matchSummary: matchSummary, matchLine: matchLine, buildPush: buildPush, horaTxt: horaTxt, MIN_PICKS: MIN_PICKS };
```

Nota sobre la hora: `Intl` en Node puede usar espacio fino (` `) en
"p. m." — el `replace` lo normaliza a espacio normal. Si el test de hora
fallara por diferencia de ICU local ("3:00 p. m." vs "3:00 p.m."), ajustar la
ASERCIÓN al output real de Node y dejar comentario — el formato exacto del
locale no es el contrato, el contenido sí.

- [ ] **Step 4: Verificar que pasan.** `node --test tests/push-messages.test.js` → PASS (10). Suite completa → 7 files pass.

- [ ] **Step 5: Commit.** `git add tools/push-messages.js tests/push-messages.test.js && git commit -m "feat: lógica pura del push con porcentaje de la quiniela"`

---

### Task 2: Reescribir el flujo de `tools/send-push-reminders.js`

**Files:**
- Modify: `tools/send-push-reminders.js`

Sin tests unitarios nuevos (es orquestación I/O); se verifica con DRY_RUN en Task 3.

- [ ] **Step 1: Cambios puntuales:**

1a. Cabecera del archivo: actualizar el comentario inicial (ahora: push a todos con % ~1h antes, línea extra si falta pick, dedupe igual).

1b. `const WINDOW_MS = 75 * 60 * 1000; // ~1h antes; margen por crons retrasados` (antes 2h).

1c. `const pm = require("./push-messages.js");` arriba, junto a los otros require. Eliminar `horaTxt` local (usar el del módulo si hiciera falta — buildPush ya lo incluye) y `teamTxt`.

1d. Reemplazar el bloque desde `const subs = validSubscriptions(...)` hasta el final del loop por:

```js
  const subs = validSubscriptions(await rest("push_subscriptions?select=user_id,endpoint,p256dh,auth"));
  if (!subs.length) { console.log("Sin suscriptores."); return; }
  const ids = soon.map(function (m) { return m.id; }).join(",");
  const preds = await rest("predictions?select=user_id,match_id,hg,ag&match_id=in.(" + ids + ")");
  const sent = await rest("push_sent?select=user_id,match_id&match_id=in.(" + ids + ")");
  const tallies = pm.tallyByMatch(preds);
  const hasPred = new Set(preds.map(function (p) { return p.user_id + "|" + p.match_id; }));
  const wasSent = new Set(sent.map(function (s) { return s.user_id + "|" + s.match_id; }));

  // agrupar suscripciones por usuario; un push por usuario y por ventana
  const byUser = {};
  subs.forEach(function (s) {
    const userSubs = byUser[s.user_id] = byUser[s.user_id] || [];
    if (userSubs.length < MAX_SUBSCRIPTIONS_PER_USER) userSubs.push(s);
  });

  let avisados = 0;
  for (const uid of Object.keys(byUser)) {
    const pending = soon.filter(function (m) { return !wasSent.has(uid + "|" + m.id); });
    if (!pending.length) continue;
    const missingPick = pending.some(function (m) { return !hasPred.has(uid + "|" + m.id); });
    const msg = pm.buildPush(pending, snap.teams, tallies, missingPick);
    const payload = pushPayload(msg.title, msg.body);
    console.log((DRY ? "[dry-run] " : "") + uid.slice(0, 8) + "… ← " + msg.title + " | " + msg.body.replace(/\n/g, " ⏎ "));
    if (DRY) { avisados++; continue; }

    let delivered = 0;
    for (const s of byUser[uid]) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        delivered++;
        console.log("  push aceptado por proveedor");
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await rest("push_subscriptions?user_id=eq." + uid + "&endpoint=eq." + encodeURIComponent(s.endpoint), { method: "DELETE" });
          console.log("  suscripción expirada eliminada");
        } else {
          console.error("  error de envío: " + (e.statusCode || e.message));
        }
      }
    }
    if (!delivered) {
      console.error("  ningún endpoint aceptó el push; se reintentará");
      continue;
    }
    await rest("push_sent", {
      method: "POST",
      body: JSON.stringify(pending.map(function (m) { return { match_id: m.id, user_id: uid }; }))
    });
    avisados++;
  }
  console.log((DRY ? "[dry-run] " : "") + "Usuarios avisados: " + avisados);
```

1e. Modo `TEST_USERNAME`: actualizar el texto de prueba a
`pushPayload("🔔 Prueba de avisos", "Así te avisaremos ~1 hora antes de cada partido con el pulso de la quiniela. ¡Todo listo! ✓")`.

1f. Modo `DIAG_USERNAME`: conservarlo tal cual está (muestra pick sí/no y
enviado sí/no por partido próximo — sigue siendo diagnóstico válido).

- [ ] **Step 2: Smoke local de sintaxis.** `node -e "new (require('vm').Script)(require('fs').readFileSync('tools/send-push-reminders.js','utf8'))" && echo OK` (no ejecuta main; solo valida parseo). Suite completa → 7 files pass.

- [ ] **Step 3: Commit.** `git add tools/send-push-reminders.js && git commit -m "feat: push pre-partido para todos con porcentaje de la quiniela"`

---

### Task 3: Verificación DRY_RUN contra Supabase real

El job de Actions usa secrets; localmente la service key no está disponible.
Verificación en dos niveles:

- [ ] **Step 1 (sin credenciales):** simular `rest()` con un stub: `node` one-liner que requiere push-messages con los datos del snapshot real y predicciones inventadas para el próximo partido, imprimiendo título/cuerpo de ambas variantes (con y sin pick faltante). Confirmar textos.
- [ ] **Step 2 (con Actions):** disparar el workflow manualmente con DRY_RUN (si el workflow lo soporta vía workflow_dispatch con input) o pedir a JM correrlo con su service key local:
  `SUPABASE_SERVICE_KEY=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… DRY_RUN=1 node tools/send-push-reminders.js`
  Revisar que liste a cada suscriptor con el mensaje correcto y "Usuarios avisados: N" sin enviar nada.
- [ ] **Step 3:** revisar `.github/workflows/push-reminders.yml`: si no tiene `workflow_dispatch`, agregarlo con input opcional `dry_run` para poder probar desde la UI de GitHub. Commit si se tocó.
