# Capitán de eliminatorias — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada jugador marque un partido de eliminatoria por día como "Capitán ⭐", multiplicando ×3 los puntos base de ese partido (el bonus de penales no se multiplica), sin restar nunca y sin tocar el puntaje acumulado de la fase de grupos.

**Architecture:** La lógica de puntaje vive en el módulo puro `js/scoring.js` (testeable con `node:test`); una tabla nueva `captain_picks` en Supabase con RLS calcada de `predictions`; y la UI/persistencia en `js/game.js`. El multiplicador se aplica al construir el ranking, no se materializa en la base.

**Tech Stack:** JavaScript vanilla (sin build), Supabase (Postgres + RLS), `node:test` para pruebas. Tests se corren con `node --test tests/`.

**Orden de despliegue (importante):** La Tarea 3 (desplegar la tabla en Supabase) debe ejecutarse en producción **antes** de probar las Tareas 4 y 5 en el navegador.

**Referencia:** spec en `docs/superpowers/specs/2026-06-18-capitan-eliminatorias-design.md`.

---

### Task 1: Scoring — `captainTotal()` y `CAPTAIN_MULT`

**Files:**
- Modify: `js/scoring.js`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write the failing tests**

Añadir al final de `tests/scoring.test.js` (antes de cualquier cierre de archivo; el archivo son tests planos top-level):

```javascript
test("capitán: eliminatoria acertada se multiplica x3 (1 → 3)", () => {
  const m = played("r16", 2, 1, "H");
  const s = sc.scoreMatch({ hg: 1, ag: 0 }, m);
  assert.strictEqual(sc.captainTotal(s, m), 3);
});

test("capitán: el bonus de penales NO se multiplica (base 1×3=3 + 1 = 4)", () => {
  const m = played("r16", 1, 1, "H", { hp: 4, ap: 2 });
  const s = sc.scoreMatch({ hg: 1, ag: 0, pens: true }, m);
  assert.strictEqual(s.points, 2);
  assert.strictEqual(sc.captainTotal(s, m), 4);
});

test("capitán: final exacto x3 (3 → 9) y solo-resultado x3 (1 → 3)", () => {
  const mf = played("final", 2, 1, "H");
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 2, ag: 1 }, mf), mf), 9);
  assert.strictEqual(sc.captainTotal(sc.scoreMatch({ hg: 3, ag: 0 }, mf), mf), 3);
});

test("capitán: fallar no suma ni resta (0)", () => {
  const m = played("qf", 0, 1, "A");
  const s = sc.scoreMatch({ hg: 1, ag: 0 }, m); // pred avanza local pero ganó visitante → falla
  assert.strictEqual(sc.captainTotal(s, m), 0);
});

test("capitán: en grupos no aplica (queda igual a la base)", () => {
  const m = played("group", 2, 1);
  const s = sc.scoreMatch({ hg: 1, ag: 0 }, m);
  assert.strictEqual(sc.captainTotal(s, m), 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scoring.test.js`
Expected: FAIL con `sc.captainTotal is not a function`.

- [ ] **Step 3: Implement `CAPTAIN_MULT` and `captainTotal`**

En `js/scoring.js`, debajo de la declaración `const CHAMPION_LOCK = ...` (línea ~10), añadir:

```javascript
  const CAPTAIN_MULT = 3;

  // Total de un partido capitaneado: multiplica SOLO la base (acertar quién
  // avanza, o el marcador de la final). El bonus de penales (+1) se suma sin
  // multiplicar. Grupos no se capitanean: si llega uno, devuelve la base sin tocar.
  function captainTotal(s, match) {
    if (!s || s.points <= 0 || match.stage === "group") return s ? s.points : 0;
    const base = match.stage === "final" ? s.points : POINTS.match;
    const pensBonus = s.points - base;
    return base * CAPTAIN_MULT + pensBonus;
  }
```

Luego, en el objeto `scoring` (línea ~117) añadir las dos exportaciones nuevas:

```javascript
  const scoring = { POINTS: POINTS, CAPTAIN_MULT: CAPTAIN_MULT, CHAMPION_LOCK: CHAMPION_LOCK, scoreMatch: scoreMatch, captainTotal: captainTotal, scoreChampion: scoreChampion, buildLeaderboard: buildLeaderboard, freezeLive: freezeLive, buildLiveLeaderboard: buildLiveLeaderboard };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scoring.test.js`
Expected: PASS (todos los tests, incluidos los previos).

- [ ] **Step 5: Commit**

```bash
git add js/scoring.js tests/scoring.test.js
git commit -m "feat(scoring): captainTotal x3 sobre la base (penales sin multiplicar)"
```

---

### Task 2: Scoring — ranking con capitanes

**Files:**
- Modify: `js/scoring.js` (`buildLeaderboard`, `buildLiveLeaderboard`)
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write the failing tests**

Añadir a `tests/scoring.test.js`:

```javascript
test("ranking: el capitán multiplica el partido elegido (1 → 3)", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("r16", 2, 1, "H")]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0, pens: false }];
  const sinCap = sc.buildLeaderboard(profiles, preds, [], matches, []);
  assert.strictEqual(sinCap[0].points, 1);
  const conCap = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(conCap[0].points, 3);
});

test("ranking: un capitán en grupos no cambia el acumulado", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("group", 2, 1)]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }];
  const r = sc.buildLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(r[0].points, 1);
});

test("ranking en vivo: respeta el capitán", () => {
  const profiles = [{ id: "u1", username: "ana" }];
  const matches = [played("r16", 2, 1, "H")]; // id "m1"
  const preds = [{ user_id: "u1", match_id: "m1", hg: 1, ag: 0 }];
  const rows = sc.buildLiveLeaderboard(profiles, preds, [], matches, [{ user_id: "u1", match_id: "m1" }]);
  assert.strictEqual(rows[0].points, 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scoring.test.js`
Expected: FAIL — `conCap[0].points` será 1 (el 5º argumento se ignora todavía).

- [ ] **Step 3: Implement captain-aware leaderboard**

En `js/scoring.js`, cambiar la firma y el cuerpo de `buildLeaderboard` (línea ~47). Firma nueva:

```javascript
  function buildLeaderboard(profiles, predictions, picks, matches, captains) {
    const matchById = {};
    matches.forEach(function (m) { matchById[m.id] = m; });
    const captainSet = {};
    (captains || []).forEach(function (c) { captainSet[c.user_id + "|" + c.match_id] = true; });
    const rowByUser = {};
    const rows = profiles.map(function (p) {
      const row = { userId: p.id, username: p.username, points: 0, exact: 0, outcome: 0, bonus: 0, predicted: 0, decided: 0 };
      rowByUser[p.id] = row;
      return row;
    });
    predictions.forEach(function (pr) {
      const row = rowByUser[pr.user_id];
      const match = matchById[pr.match_id];
      if (!row || !match) return;
      row.predicted++;
      const s = scoreMatch({ hg: pr.hg, ag: pr.ag, pens: pr.pens }, match);
      const isCap = captainSet[pr.user_id + "|" + pr.match_id];
      row.points += isCap ? captainTotal(s, match) : s.points;
      if (s.kind === "exact") row.exact++;
      if (s.kind === "outcome") row.outcome++;
      if (s.kind === "exact" || s.kind === "outcome" || s.kind === "miss") row.decided++;
    });
```

(El resto de `buildLeaderboard` — el bloque `picks.forEach`, el `rows.sort` y el cálculo de `pos`/`tier` — queda igual.)

Luego cambiar `buildLiveLeaderboard` (línea ~104) para aceptar y propagar `captains`:

```javascript
  function buildLiveLeaderboard(profiles, predictions, picks, matches, captains) {
    const official = buildLeaderboard(profiles, predictions, picks, matches, captains);
    const rows = buildLeaderboard(profiles, predictions, picks, matches.map(freezeLive), captains);
```

(El resto de `buildLiveLeaderboard` queda igual.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scoring.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add js/scoring.js tests/scoring.test.js
git commit -m "feat(scoring): aplicar capitán x3 en buildLeaderboard y versión en vivo"
```

---

### Task 3: Base de datos — tabla `captain_picks` + RLS

**Files:**
- Create: `tools/captain-picks.sql`
- Modify: `tools/schema.sql` (añadir la tabla canónica)

> Nota: `tools/schema.sql` ya tiene cambios sin commitear en el árbol de trabajo. Añadir esta sección al final del archivo, en su propio bloque, para no chocar con esos cambios.

- [ ] **Step 1: Create the deployable migration**

Crear `tools/captain-picks.sql` con:

```sql
-- Capitán de eliminatorias: 1 por día (unique user+match_day), multiplica x3 los
-- puntos base del partido. RLS calcada de predictions. Pegar en Supabase SQL Editor.
create table public.captain_picks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  match_day date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id),
  unique (user_id, match_day)
);
alter table public.captain_picks enable row level security;

create policy "ver mi capitán siempre, ajenos tras el kickoff"
  on public.captain_picks for select using (
    user_id = auth.uid()
    or (select kickoff_at from public.matches m where m.id = match_id) <= now()
  );
create policy "crear capitán solo mío y antes del kickoff"
  on public.captain_picks for insert with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
create policy "editar capitán solo mío y antes del kickoff"
  on public.captain_picks for update
  using (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  )
  with check (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
create policy "borrar mi capitán antes del kickoff"
  on public.captain_picks for delete using (
    user_id = auth.uid()
    and (select kickoff_at from public.matches m where m.id = match_id) > now()
  );
```

- [ ] **Step 2: Add the same table to the canonical schema**

Copiar el mismo bloque (sin el comentario de "pegar en Supabase") al final de `tools/schema.sql`, precedido por un encabezado de sección:

```sql
-- 8) Capitán de eliminatorias (1 por día, multiplica x3 los puntos base)
```

- [ ] **Step 3: Deploy to Supabase**

Pegar el contenido de `tools/captain-picks.sql` en Supabase → SQL Editor → New query → Run.

- [ ] **Step 4: Verify the table exists and RLS is on**

En el SQL Editor, ejecutar:

```sql
select relrowsecurity from pg_class where relname = 'captain_picks';
```

Expected: una fila con `relrowsecurity = true`.

- [ ] **Step 5: Commit**

```bash
git add tools/captain-picks.sql tools/schema.sql
git commit -m "feat(db): tabla captain_picks con RLS (1 capitán por día)"
```

---

### Task 4: `game.js` — cargar capitanes y pasarlos al ranking

**Files:**
- Modify: `js/game.js` (`loadAll` línea ~89-99; llamadas a leaderboard líneas ~483, ~544, ~683)

- [ ] **Step 1: Fetch `captain_picks` in `loadAll`**

En `js/game.js`, dentro de `loadAll` (línea ~89), añadir la 4ª consulta al `Promise.all` y guardar el resultado:

```javascript
      const results = await Promise.all([
        client.from("profiles").select("id, username"),
        client.from("predictions").select("user_id, match_id, hg, ag, pens").limit(20000),
        client.from("champion_picks").select("user_id, team_id"),
        client.from("captain_picks").select("user_id, match_id").limit(20000)
      ]);
      if (results.some(function (r) { return r.error; })) { loadError = true; return; }
      data.profiles = results[0].data || [];
      data.predictions = results[1].data || [];
      data.picks = results[2].data || [];
      data.captains = results[3].data || [];
```

- [ ] **Step 2: Pass captains into the three leaderboard calls**

Cambiar las tres llamadas:

Línea ~483 (`liveRankingHtml`):
```javascript
    const rows = WC.scoring.buildLiveLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
```

Línea ~544 (`rankingHtml`):
```javascript
    const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
```

Línea ~683 (en el handler de "compartir"):
```javascript
      const rows = WC.scoring.buildLeaderboard(data.profiles, data.predictions, data.picks, matches(), data.captains);
```

- [ ] **Step 3: Initialize `data.captains`**

En `js/game.js` línea 29, reemplazar:

```javascript
  let data = { profiles: [], predictions: [], picks: [] };
```

por:

```javascript
  let data = { profiles: [], predictions: [], picks: [], captains: [] };
```

- [ ] **Step 4: Manual verification**

1. Asegurar que la Tarea 3 ya se desplegó en Supabase.
2. Servir el sitio: `node -e "require('http').createServer((q,s)=>require('fs').createReadStream('.'+ (q.url==='/'?'/index.html':q.url)).on('error',()=>{s.statusCode=404;s.end()}).pipe(s)).listen(8000,()=>console.log('http://localhost:8000'))"` (o cualquier static server).
3. Abrir la quiniela, iniciar sesión, ir a la sección Quiniela.
4. Abrir la consola del navegador. Expected: sin errores; el ranking se pinta igual que antes (aún no hay capitanes, así que los puntos no cambian).

- [ ] **Step 5: Commit**

```bash
git add js/game.js
git commit -m "feat(game): cargar captain_picks y pasarlos al ranking"
```

---

### Task 5: `game.js` — toggle ⭐ Capitán, persistencia y regla 1-por-día

**Files:**
- Modify: `js/game.js` (helpers nuevos; `pickRowHtml` línea ~327; handler de click línea ~632)

- [ ] **Step 1: Add helpers `matchDay`, `captainMatchDay`, `isCaptain`**

En `js/game.js`, junto a los otros helpers (p. ej. después de `predType`, línea ~297), añadir:

```javascript
  // Día calendario del partido en Curazao (UTC-4, sin DST) → "YYYY-MM-DD".
  function matchDay(m) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Curacao", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(m.date));
  }
  function captainMatchDay(c) {
    const m = WC.state.matches.find(function (x) { return x.id === c.match_id; });
    return m ? matchDay(m) : null;
  }
  function isCaptain(matchId) {
    if (!session) return false;
    const uid = session.user.id;
    return data.captains.some(function (c) { return c.user_id === uid && c.match_id === matchId; });
  }
```

- [ ] **Step 2: Add `saveCaptain` (con regla 1-por-día y toggle-off)**

Añadir cerca de `saveChampion` (línea ~138):

```javascript
  async function saveCaptain(matchId) {
    if (!session) return;
    const uid = session.user.id;
    const m = WC.state.matches.find(function (x) { return x.id === matchId; });
    if (!m) return;
    const day = matchDay(m);
    const yaEra = data.captains.some(function (c) { return c.user_id === uid && c.match_id === matchId; });
    // Quitar el capitán anterior de ese día (incluye este si es toggle-off)
    const previos = data.captains.filter(function (c) { return c.user_id === uid && captainMatchDay(c) === day; });
    for (const c of previos) {
      await client.from("captain_picks").delete().eq("user_id", uid).eq("match_id", c.match_id);
    }
    data.captains = data.captains.filter(function (c) { return !(c.user_id === uid && captainMatchDay(c) === day); });
    if (yaEra) { render(); return; } // era toggle-off: ya quedó sin capitán ese día
    const res = await client.from("captain_picks").upsert({
      user_id: uid, match_id: matchId, match_day: day, updated_at: new Date().toISOString()
    });
    if (!res.error) data.captains.push({ user_id: uid, match_id: matchId });
    render();
  }
```

- [ ] **Step 3: Render the ⭐ button on unlocked knockout rows**

En `pickRowHtml` (línea ~327), en el `return` de la tarjeta NO bloqueada (línea ~373), insertar el botón de capitán entre `controls` y el `<span class="pick-state">`. Reemplazar:

```javascript
    const st = stateLabel(v);
    return '<div class="pick-card" data-match="' + m.id + '" data-type="' + type + '">' + head +
      controls +
      '<span class="pick-state ' + st.cls + '">' + st.text + "</span></div>";
```

por:

```javascript
    const st = stateLabel(v);
    const showStar = m.stage !== "group";
    const starOn = showStar && isCaptain(m.id);
    const star = showStar
      ? '<button type="button" class="cap-star' + (starOn ? " on" : "") + '" data-captain="' + m.id + '"' +
        (v ? "" : " disabled") + ' aria-pressed="' + (starOn ? "true" : "false") +
        '" title="Capitán del día: este partido vale ×3">⭐ Capitán' + (starOn ? " ✓" : "") + "</button>"
      : "";
    return '<div class="pick-card" data-match="' + m.id + '" data-type="' + type + '">' + head +
      controls + star +
      '<span class="pick-state ' + st.cls + '">' + st.text + "</span></div>";
```

- [ ] **Step 4: Show the ⭐ on the locked own card (read-only)**

En `pickRowHtml`, en la rama `if (locked)` (línea ~342), reemplazar el `return` por uno que añada el indicador si fue tu capitán:

```javascript
      const wasCap = m.stage !== "group" && isCaptain(m.id);
      const capTag = wasCap ? ' <span class="cap-tag">⭐ Capitán ×3</span>' : "";
      return '<div class="pick-card locked" data-match="' + m.id + '">' + head +
        '<div class="pick-foot"><small>Tu pick: ' + pickLabel(m, v) + " · Real: " + real + capTag + "</small>" + chip + "</div></div>";
```

- [ ] **Step 5: Wire the click handler**

En el listener `rootEl.addEventListener("click", ...)` (línea ~632), añadir al inicio del cuerpo (antes del manejo de `[data-1x2]`):

```javascript
    const capBtn = event.target.closest("[data-captain]");
    if (capBtn) {
      if (capBtn.disabled) return;
      saveCaptain(capBtn.dataset.captain);
      return;
    }
```

- [ ] **Step 6: Manual verification**

1. Con la tabla desplegada (Tarea 3) y sesión iniciada, abrir la quiniela.
2. En un partido de eliminatoria **futuro** con pick puesto, debe aparecer "⭐ Capitán". Si no hay pick, el botón está deshabilitado.
3. Click en ⭐ → se marca (✓). Recargar la página → sigue marcado (persistió en Supabase).
4. Marcar otro partido **del mismo día** → el primero se desmarca (regla 1-por-día).
5. Click de nuevo sobre el marcado → se desmarca (toggle-off).
6. Consola sin errores en todos los pasos.

- [ ] **Step 7: Commit**

```bash
git add js/game.js
git commit -m "feat(game): toggle Capitán con regla 1-por-día y persistencia"
```

---

### Task 6: `game.js` — actualizar "Cómo se juega"

**Files:**
- Modify: `js/game.js` (`rulesHtml` línea ~393)

- [ ] **Step 1: Add the captain rows to the rules table**

En `rulesHtml`, después de la fila de `Campeón` (línea ~401), añadir una fila de capitán antes de cerrar `</table>`:

```javascript
      "<tr><td>Campeón</td><td>15 pts</td></tr>" +
      "<tr><td>⭐ Capitán de eliminatorias: tu partido del día vale ×3</td><td>×3 base</td></tr></table>" +
```

Y añadir una frase al `<p>` final:

```javascript
      "<p>Cada partido cierra a su hora de inicio. El bonus de penales solo cuenta si además aciertas quién avanza. " +
      "Desde octavos puedes marcar un partido por día como Capitán ⭐: sus puntos base valen ×3 (el +1 de penales no se multiplica). Solo suma, nunca resta. " +
      "Los picks de los demás se revelan cuando el partido empieza. ¿Olvidaste tu contraseña? Escríbele a JM.</p></details>";
```

- [ ] **Step 2: Manual verification**

Abrir la quiniela → desplegar "Cómo se juega" → confirmar que aparece la fila del Capitán ×3 y la frase explicativa.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "docs(game): explicar el Capitán de eliminatorias en las reglas"
```

---

## Fuera de alcance (futuro)

- **Revelar el ⭐ de los demás** en el detalle de picks revelados tras el kickoff (la RLS ya lo permite; falta pintarlo en la lista del ranking en vivo).
- **Push "¿ya pusiste tu capitán de hoy?"** reutilizando la infraestructura de `tools/send-push-reminders.js`.
- **Capitán contracorriente**: multiplicador según la rareza del pick (cuotas derivadas de los picks de la gente).
- **Columna de bonus de capitán** en la tabla de ranking (hoy se pliega dentro de Pts).
