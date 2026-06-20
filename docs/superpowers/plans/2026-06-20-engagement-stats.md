# Métricas de engagement en el dashboard — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una sección "Engagement" al dashboard de stats (embudo, uso por momento, push, tendencia) alimentada por una RPC agregada `engagement_rollup`.

**Architecture:** Espejo del patrón existente: una RPC agregada sin PII (como `analytics_rollup`) + helpers de render ya presentes en `js/stats-dashboard.js` (`card`, `barList`, `kpi`, `columnSVG`). Degradación segura: si la RPC no está desplegada, la sección se omite/muestra vacío sin romper el dashboard.

**Tech Stack:** Postgres/Supabase (RPC `security definer`), JS vanilla (IIFE de dashboard, sin build). El `stats-dashboard.js` actual no tiene tests; la verificación es manual en el navegador (preview), siguiendo ese patrón.

**Orden de despliegue:** `tools/migrate-engagement-events.sql` (write, ya escrito) y `tools/engagement-rollup.sql` (read, Tarea 1) deben desplegarse en Supabase para que la sección muestre datos. El JS degrada seguro si no están.

**Referencia:** spec en `docs/superpowers/specs/2026-06-20-engagement-stats-design.md`.

---

### Task 1: RPC `engagement_rollup` (read agregado, sin PII)

**Files:**
- Create: `tools/engagement-rollup.sql`

- [ ] **Step 1: Crear el SQL**

Crear `tools/engagement-rollup.sql`:

```sql
-- Rollup agregado de engagement_events (sin PII): conteos y sesiones distintas
-- por (día, evento) + una fila de total del rango (day = null) para el embudo.
-- Mismo patrón de seguridad que analytics_rollup. Pegar en Supabase SQL Editor → Run.
create or replace function public.engagement_rollup(since_at timestamptz default (now() - interval '62 days'))
returns table (day date, event text, events bigint, sessions bigint)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with params as (
    select greatest(coalesce(since_at, now() - interval '62 days'), now() - interval '93 days') as since_at
  ),
  bounded as (
    select (e.ts at time zone 'America/Curacao')::date as day, e.event, e.session_id
    from public.engagement_events e cross join params p
    where e.ts >= p.since_at and e.ts < now() + interval '5 minutes'
  )
  select b.day, b.event, count(*)::bigint, count(distinct b.session_id)::bigint
    from bounded b group by b.day, b.event
  union all
  select null::date, b.event, count(*)::bigint, count(distinct b.session_id)::bigint
    from bounded b group by b.event;
$function$;
revoke all on function public.engagement_rollup(timestamptz) from public;
grant execute on function public.engagement_rollup(timestamptz) to anon, authenticated;
alter function public.engagement_rollup(timestamptz) set statement_timeout = '2000ms';
```

- [ ] **Step 2: Desplegar en Supabase** (controlador/usuario)

Pegar `tools/engagement-rollup.sql` en Supabase → SQL Editor → New query → Run. Requiere que `engagement_events` ya exista (`tools/migrate-engagement-events.sql`).

- [ ] **Step 3: Verificar** (en el SQL Editor)

```sql
select * from public.engagement_rollup(now() - interval '7 days') limit 5;
```
Expected: filas `(day, event, events, sessions)` (o vacío si aún no hay eventos). Nunca expone `session_id` ni `fields`.

- [ ] **Step 4: Commit**

```bash
git add tools/engagement-rollup.sql
git commit -m "feat(db): RPC engagement_rollup agregada (sin PII) para el dashboard"
```

---

### Task 2: Cargar el rollup en el dashboard (degradación segura)

**Files:**
- Modify: `js/stats-dashboard.js` (`load`, ~líneas 106-112)

- [ ] **Step 1: Añadir la consulta al Promise.all**

En `js/stats-dashboard.js`, en `load()`, reemplazar:

```javascript
    Promise.all([
      q("profiles?select=id,username,created_at"),
      q("champion_picks?select=user_id,team_id"),
      q("predictions?select=user_id,match_id&limit=5000"),
      rpc("analytics_rollup", { since_at: since })
    ]).then(function (res) {
      raw = { profiles: res[0], picks: res[1], preds: res[2], views: res[3] };
```

por:

```javascript
    Promise.all([
      q("profiles?select=id,username,created_at"),
      q("champion_picks?select=user_id,team_id"),
      q("predictions?select=user_id,match_id&limit=5000"),
      rpc("analytics_rollup", { since_at: since }),
      rpc("engagement_rollup", { since_at: since }).catch(function () { return []; })
    ]).then(function (res) {
      raw = { profiles: res[0], picks: res[1], preds: res[2], views: res[3], eng: res[4] };
```

> El `.catch(()=>[])` aísla la RPC nueva: si no está desplegada (404), `raw.eng` queda `[]` y el resto del dashboard carga normal.

- [ ] **Step 2: Verificar (manual, navegador)**

Servir el sitio y abrir `stats.html`. Con la RPC sin desplegar, el dashboard debe cargar igual que antes (sin errores en consola; la sección de engagement aún no existe hasta la Tarea 4).

- [ ] **Step 3: Commit**

```bash
git add js/stats-dashboard.js
git commit -m "feat(stats): cargar engagement_rollup con degradación segura"
```

---

### Task 3: Agregación de engagement

**Files:**
- Modify: `js/stats-dashboard.js` (añadir `aggregateEngagement` y `engDaySeries` junto a `aggregate`, antes de los SVG builders ~línea 237)

- [ ] **Step 1: Añadir las funciones de agregación**

Insertar en `js/stats-dashboard.js` justo después del cierre de `function aggregate() { ... }` (antes del comentario `/* ── SVG builders ── */`):

```javascript
  /* Engagement: deriva totales (fila day=null), sesiones por evento y serie diaria. */
  function aggregateEngagement() {
    var rows = (raw && raw.eng) || [];
    var tot = {}, sess = {}, byDay = {};
    rows.forEach(function (r) {
      var ev = String(r.event || ""), n = Number(r.events) || 0, s = Number(r.sessions) || 0;
      if (r.day == null) { tot[ev] = n; sess[ev] = s; }                  // total del rango
      else { var d = String(r.day); byDay[d] = (byDay[d] || 0) + n; }    // por día (tendencia)
    });
    return { tot: tot, sess: sess, byDay: byDay, hasData: rows.length > 0 };
  }

  function engDaySeries() {
    var byDay = aggregateEngagement().byDay, now = Date.now(), out = [];
    for (var i = range - 1; i >= 0; i--) {
      var k = dayKey(new Date(now - i * MS).toISOString());
      out.push({ label: dayLabel(k), n: byDay[k] || 0 });
    }
    return out;
  }
```

- [ ] **Step 2: Verificar (sintaxis)**

Run: `node --check js/stats-dashboard.js`
Expected: sin salida (sintaxis OK). *(No hay tests automáticos para este archivo; la verificación funcional es en la Tarea 4 vía navegador.)*

- [ ] **Step 3: Commit**

```bash
git add js/stats-dashboard.js
git commit -m "feat(stats): agregación de eventos de engagement"
```

---

### Task 4: Sección "Engagement" en el render

**Files:**
- Modify: `js/stats-dashboard.js` (añadir `renderEngagement`; insertar en `render`)

- [ ] **Step 1: Añadir `renderEngagement()`**

Insertar en `js/stats-dashboard.js` justo antes de `function render() {` (~línea 395):

```javascript
  function renderEngagement() {
    var e = aggregateEngagement();
    if (!e.hasData) {
      return card("Engagement del loop",
        '<p class="dz-empty">Aún sin datos de engagement. Aparecerán cuando se despliegue el rollup y los jugadores usen el loop.</p>',
        { span2: true });
    }
    var T = e.tot, S = e.sess;
    var pct = function (a, b) { return b > 0 ? Math.round(100 * a / b) + "%" : "—"; };

    // Embudo por sesiones distintas (direccional)
    var oppV = S.opportunity_viewed || 0, cta = S.opportunity_cta_clicked || 0, pred = S.prediction_submitted || 0;
    var funnel =
      kpi("Vieron Oportunidad", oppV, { sub: "sesiones" }) +
      kpi("Tocaron el CTA", cta, { sub: pct(cta, oppV) + " de quienes la vieron" }) +
      kpi("Pronosticaron", pred, { sub: pct(pred, cta) + " de quienes tocaron" });

    // Uso de cada momento (eventos totales en el rango)
    var moments = barList([
      { label: "Oportunidad", n: T.opportunity_viewed || 0 },
      { label: "Ranking en vivo", n: T.live_ranking_viewed || 0 },
      { label: "Pronósticos compactos", n: T.locked_predictions_viewed || 0 },
      { label: "Resumen post-partido", n: T.post_match_summary_viewed || 0 },
      { label: "Compartir", n: (T.share_summary_clicked || 0) + (T.whatsapp_copy_clicked || 0) }
    ].filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; }), ACCENT);

    // Push
    var seen = T.push_prompt_seen || 0, on = T.push_enabled || 0, off = T.push_dismissed || 0, clk = T.push_reminder_clicked || 0;
    var push = barList([
      { label: "Avisos vistos", n: seen },
      { label: "Activados", n: on },
      { label: "Descartados", n: off },
      { label: "Abiertos desde push", n: clk }
    ].filter(function (r) { return r.n > 0; }), SECOND) +
      '<p class="dz-note">Opt-in: ' + pct(on, seen) + " · Abren desde el aviso: " + num.format(clk) + "</p>";

    return card("Embudo del loop", '<section class="dz-kpis">' + funnel + "</section>",
        { span2: true, aside: "sesiones · " + range + " días" }) +
      card("Uso de cada momento", moments || '<p class="dz-empty">Sin eventos en el rango.</p>', { aside: "eventos" }) +
      card("Notificaciones push", push, { aside: range + " días" }) +
      card("Engagement por día", columnSVG(engDaySeries(), ACCENT), { span2: true, aside: "eventos del loop por día" });
  }
```

- [ ] **Step 2: Insertar la sección en `render()`**

En `render()`, reemplazar el cierre:

```javascript
      card("Registros por día", columnSVG(a.regsSeries, SECOND), { span2: true, aside: "+" + a.regsInRange + " en el rango" }) +
      "</section></main>";
```

por:

```javascript
      card("Registros por día", columnSVG(a.regsSeries, SECOND), { span2: true, aside: "+" + a.regsInRange + " en el rango" }) +
      "</section>" +
      '<section class="dz-grid">' + renderEngagement() + "</section>" +
      "</main>";
```

- [ ] **Step 3: Verificar (sintaxis)**

Run: `node --check js/stats-dashboard.js`
Expected: sin salida.

- [ ] **Step 4: Verificar (navegador, con datos simulados)**

Servir el sitio, abrir `stats.html`. Como aún no hay datos, debe verse la card "Engagement del loop" con el estado vacío y **sin romper** el resto del dashboard. Para probar el render con datos, inyectar un mock vía consola del navegador (o `preview_eval`):

```javascript
// simula el rollup y re-renderiza (los nombres internos viven en el closure del IIFE,
// así que esto se hace forzando raw.eng vía la red real o pegando filas de ejemplo en
// la respuesta de engagement_rollup). Verificación mínima: la card aparece y no hay
// errores de consola. Verificación completa: tras desplegar la RPC y generar eventos.
```

Confirmar: la sección "Embudo del loop", "Uso de cada momento", "Notificaciones push" y "Engagement por día" aparecen cuando hay filas; el estado vacío aparece cuando no. Cero errores en consola.

- [ ] **Step 5: Commit**

```bash
git add js/stats-dashboard.js
git commit -m "feat(stats): sección de engagement (embudo, momentos, push, tendencia)"
```

---

### Task 5: Bump de versión y verificación final

**Files:**
- Modify: `stats.html` (versión de `js/stats-dashboard.js`)

- [ ] **Step 1: Bump de versión**

En `stats.html`, reemplazar:

```html
  <script src="js/stats-dashboard.js?v=20260615-paises"></script>
```

por:

```html
  <script src="js/stats-dashboard.js?v=20260620-engagement"></script>
```

- [ ] **Step 2: Verificación final (navegador)**

Servir y abrir `stats.html` con recarga forzada. Confirmar:
- El dashboard carga completo (jugadores, vistas, países, etc.) sin regresiones.
- La sección de engagement aparece (estado vacío hasta que haya datos), sin errores de consola.

- [ ] **Step 3: Commit**

```bash
git add stats.html
git commit -m "chore(stats): bump de versión del dashboard con engagement"
```

---

## Fuera de alcance

- Embudo por-usuario/journey (los eventos no enlazan sesiones a lo largo del tiempo).
- Tests automáticos de `stats-dashboard.js` (el archivo no tiene tests; se sigue ese patrón).
- Comparativos semana-a-semana del engagement (se puede añadir después con filas `period`).
