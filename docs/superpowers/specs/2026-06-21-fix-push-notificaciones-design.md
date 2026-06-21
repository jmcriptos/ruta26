# Arreglo de las notificaciones push (datos en vivo + %)

**Fecha:** 2026-06-21
**Estado:** Propuesto (diseño) — pendiente de aprobación de JM

## Síntomas reportados y causa raíz (diagnóstico con evidencia)

1. **"jose te pisa los talones" enviado a José (usuario `jmcriptos_26`).**
   No es auto-referencia. El cron `tools/send-push-reminders.js` arma el ranking con el
   **snapshot estático** `js/data.js`, generado el **2026-06-10** con los 104 partidos en
   `scheduled` y **sin marcadores** (el sitio en vivo sí trae resultados de la API FIFA;
   el cron no). → todos en 0 pts, empatados → `buildLeaderboard` desempata
   **alfabéticamente** → `jmcriptos_26` queda justo encima de `jose` →
   `engagement.opportunity` dispara `rival_threat` (gap 0 ≤ umbral) nombrando al de abajo.
   Evidencia: `snap.generatedAt=2026-06-10`, 104/104 `scheduled`, 0 marcadores;
   ranking reconstruido = todos 0 pts / pos 1, orden alfabético; jose es vecino de jmcriptos_26.

2. **Horas mal.** `horaTxt` (en `tools/push-messages.js`) usa `hour12:true`, que en locale
   `es` imprime el **mediodía como "0:00 p. m."** y la medianoche como "0:00 a. m.".
   Evidencia: partido a 16:00Z (mediodía Curaçao) → "0:00 p. m.". Con `hourCycle:"h12"` → "12:00 p. m.".

3. **No llega el push del %.** El `main()` de producción solo envía pushes de *Oportunidad*
   (`buildOpportunityPush`). El push de **% del más votado** (`buildPush`) quedó solo en la
   rama de prueba `TEST_USERNAME`; nunca se conecta al envío automático.

## Decisiones de JM

- **Datos:** el cron debe **leer datos en vivo** (API FIFA) + **guardarraíl**.
- **% push:** restaurarlo como **push principal pre-partido**.
- **Coexistencia:** **% (principal) + oportunidad corregida** (capitán/rival), con prioridad
  al % y respetando el tope de 2/día.

## Arquitectura del arreglo

### 1. Datos en vivo en el cron (reusar `js/api.js`)
`js/api.js` es UMD (`module.exports`) y usa `fetch`/`AbortController` (disponibles en Node 20).
En `send-push-reminders.js`, antes de calcular nada, traer resultados y fusionarlos con el snapshot:

```js
const api = require("../js/api.js");
async function liveMatches(snapMatches) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 10000);
    const res = await fetch(api.ENDPOINT, { signal: ctrl.signal, cache: "no-store" }).finally(function () { clearTimeout(t); });
    if (!res.ok) throw new Error("FIFA HTTP " + res.status);
    const json = await res.json();
    if (!json || !Array.isArray(json.Results)) throw new Error("Respuesta FIFA inválida");
    const live = json.Results.map(api.normalize).filter(function (m) { return m.id && m.num && m.date; });
    return api.merge(snapMatches, live);
  } catch (e) {
    console.error("FIFA en vivo falló, uso snapshot:", e.message);
    return snapMatches; // degradar (el guardarraíl evita rivales espurios)
  }
}
```
`main()` usa estos `matches` fusionados para `soon`, `buildLeaderboard` y las oportunidades.
(El push del % no depende del ranking, pero sí del calendario/estado para elegir la ventana.)

### 2. Fix de horas (`tools/push-messages.js`)
En `horaTxt`, cambiar `hour12: true` por `hourCycle: "h12"`. Una línea. Sin otros efectos
(las demás horas no cambian; verificado).

### 3. Guardarraíl del rival (`js/engagement.js`, `opportunity`)
Las ramas `reachable_rival`/`rival_threat` solo aplican si el usuario tiene **partidos decididos**
(carrera real). Añadir la condición `me.decided > 0` a ambas ramas (las filas de
`buildLeaderboard` exponen `decided`). Beneficio doble: corrige el cron aunque FIFA falle
(degrada a snapshot con 0 decididos → no manda rival), y en la app evita "oportunidad de rival"
antes de que se juegue nada. El cliente usa datos en vivo, así que en la práctica no cambia su UX.

### 4. Push del % como principal + coexistencia con oportunidad

**Tipos de push (pre-partido):**
- **`summary` (%)** — `buildPush(matchesDelBloque, teams, tallies, missingPick)`. Para el bloque
  horario imminente (todos los partidos que arrancan en esa hora local). Es **broadcast** (mismo
  cuerpo para todos) salvo la línea "👉 ¡Aún te falta tu pick!" (por usuario). **Máxima prioridad.**
- **`opportunity`** — `buildOpportunityPush` con `captain` o `rival` (reachable/threat).
  **Se elimina `pending_pick`** del cron (el push de % ya trae el aviso de pick pendiente).

**Prioridad y volumen:** `REASON_PRIORITY` se extiende con `summary` (la más alta). Se mantiene
la regla "1 por bloque horario (mayor prioridad)" y el **tope 2/día por usuario**. Así, en el
bloque del partido el `summary` gana (es el principal); un push de `opportunity` solo sale como
**segundo** del día si el usuario aún tiene presupuesto.

**Dedupe (cambio de esquema mínimo):** hoy `push_sent` tiene PK `(match_id, user_id)` → un solo
push por partido. Para permitir que un usuario reciba el **%** y, en otro slot del día, un push de
**oportunidad**, se añade una columna **`kind text not null default 'opportunity'`** y el dedupe
pasa a `(match_id, user_id, kind)`. Migración SQL (idempotente):

```sql
alter table public.push_sent add column if not exists kind text not null default 'opportunity';
-- nuevo unique que reemplaza al PK (match_id, user_id)
alter table public.push_sent drop constraint if exists push_sent_pkey;
create unique index if not exists push_sent_match_user_kind on public.push_sent (match_id, user_id, kind);
```
El cron, al registrar, inserta `{ match_id, user_id, kind }` (`'summary'` o `'opportunity'`), y
`alreadySent` se construye por `(match_id, user_id, kind)`.

**Ventana de envío:** se mantiene `WINDOW_MS=180min` (3h) + dedupe (los cron de Actions se saltan
corridas; el dedupe garantiza un solo `summary` por partido). El % sale en la primera corrida en que
el partido entra en la ventana.

## Flujo de `main()` (resumen)
1. `matches = await liveMatches(snap.matches)`.
2. `soon` = partidos `scheduled` futuros dentro de la ventana (sobre `matches`).
3. `official = buildLeaderboard(profiles, preds, picks, matches, caps)` (datos reales).
4. **Pass A (summary):** por bloque horario imminente, candidato `summary` para cada suscriptor
   (cuerpo = `buildPush` con su `missingPick`). 
5. **Pass B (opportunity):** por usuario, `userOpportunityCandidate` (capitán/rival, con guardarraíl).
6. Unir candidatos, `applyGuardrails` (prioridad `summary` > capitán > rival; 1/bloque; 2/día;
   dedupe por `kind`), enviar, registrar en `push_sent` con su `kind`.

## Pruebas
- **Unit (`tools/push-messages.test.js`):** `horaTxt` a mediodía/medianoche → "12:00 p. m."/"12:00 a. m.";
  `applyGuardrails` con `summary` de máxima prioridad gana el bloque y respeta 2/día con `kind`.
- **Unit (`tests/engagement.test.js`):** `opportunity` NO devuelve `rival_threat`/`reachable_rival`
  cuando `me.decided === 0`; sí cuando hay decididos y gap ≤ umbral.
- **DRY-RUN del cron** (`DRY_RUN=1`, con `SUPABASE_SERVICE_KEY` en local o Action manual):
  con datos en vivo, listar qué recibiría cada usuario; confirmar que jmcriptos_26 ya **no** recibe
  "jose te pisa los talones" espurio y que el % sale con la hora correcta.

## Despliegue (orden)
1. Aplicar la **migración SQL** de `push_sent` (antes del nuevo código del cron).
2. Mergear el código del cron + `api.js`/`engagement.js`/`push-messages.js`.
3. (Operativo, fuera de este cambio) regenerar `js/data.js` cuando se pueda; ya no es bloqueante
   porque el cron lee FIFA en vivo y degrada con guardarraíl.

## Alcance / lo que NO cambia
- El servicio worker (`sw.js`), VAPID, las suscripciones y el payload Declarative Web Push.
- El sitio en vivo y el resto del loop de engagement.
- `scoring.js`.
