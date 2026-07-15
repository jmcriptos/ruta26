# Batacazo de 15 — semifinal Inglaterra vs Argentina (15 jul 2026)

## Contexto

Hoy se juega la semifinal **Inglaterra (43942) vs Argentina (43922)**, `matchId 400021540`, 15 jul 2026 19:00 UTC. Es el único partido de la jornada.

El batacazo normal paga según rareza (`CAPTAIN_TIERS`): +3 si casi nadie lo tenía, +2, +1, o 0 si era el favorito obvio. Para darle peso a la semi, el batacazo de hoy paga **15 puntos fijos para cualquiera de los dos equipos**, siempre que el jugador marque el partido como su batacazo y acierte quién gana.

La decisión de simetría es deliberada: hoy el batacazo deja de premiar ir contracorriente y se vuelve un "doble o nada" sobre quién gana la semi.

Consecuencia asumida: como hoy hay un solo partido y el batacazo es uno por jornada, quien **olvide marcarlo** queda 15 puntos abajo sin haber fallado ningún pronóstico. Por eso el aviso por push es parte del alcance, no un extra.

## Regla

Marcar la semi como batacazo y acertar quién gana/avanza → **+15 encima de lo que gane el pick**, en lugar de la escala de rareza.

- Gana Inglaterra y la marcaste → +15.
- Gana Argentina y la marcaste → +15.
- Fallas el ganador → sin bono (rige el guard normal de `captainTotal`: el pick debe sumar puntos).
- No marcaste batacazo → sin bono, scoring normal.

No exige marcador exacto. Máximo del partido: **19** (3 exacto + 1 avance + 15).

Casos borde, ambos pagan porque `predWinner === match.winner`:
- Predices 1–1 con `adv: "home"` (Inglaterra) e Inglaterra gana 2–0 → el pick suma el +1 de avance, luego +15.
- Empate en 90' y Argentina pasa por penales, con el pick en Argentina → `match.winner` es quien avanza → +15.

## Diseño

### 1. `js/scoring.js`

`SPECIAL_BATACAZO` (objeto único, Cabo Verde +50 del 3 jul) pasa a **array** `SPECIAL_BATACAZOS`:

```js
const SPECIAL_BATACAZOS = [
  { matchId: "400021521", teamId: "43850", bonus: 50 }, // Cabo Verde, 3 jul — histórico, NO tocar
  { matchId: "400021540", teamId: null,    bonus: 15 }  // Semi Inglaterra–Argentina, 15 jul
];
```

**Por qué array y no sobrescribir:** el scoring se recalcula en cada carga sobre todo el histórico. Sobrescribir la constante borraría el +50 que ya cobraron los que marcaron Cabo Verde.

`teamId: null` = simétrico (cualquiera de los dos). `teamId` con valor = la regla vieja, amarrada a un equipo.

Helper nuevo `specialBatacazoFor(match, pred)` → devuelve la entrada de la promo o `null`:
- `match.id` debe coincidir con `matchId`.
- Si la entrada trae `teamId`, exige `match.winner === teamId`.
- Exige `predWinner(pred, match) === match.winner`.

Para la entrada de Cabo Verde esto es equivalente a la lógica original (`match.winner === teamId && predWinner === teamId`).

Reescrituras:
- `specialBatacazoApplies(match, pred)` → `!!specialBatacazoFor(match, pred)`. Se conserva el nombre porque `game.js` lo usa.
- `effectiveBatacazoBonus(match, pCorrect, pred)` → `const sp = specialBatacazoFor(match, pred); return sp ? sp.bonus : captainBonus(match, pCorrect);`

`captainTotal` no se toca: ya exige `s.points > 0`, y acertar al ganador en una semi siempre paga al menos el +1 de avance.

Exports: se agrega `SPECIAL_BATACAZOS` y se **elimina** `SPECIAL_BATACAZO` (evita una segunda fuente de verdad obsoleta). Los dos consumidores se rewirean abajo.

`maxMatchPoints` no refleja el 15 — igual que con Cabo Verde, solo subestima el potencial en engagement, sin efecto en el scoring real.

### 2. `js/game.js` — banner

La rama de Cabo Verde en `specialPromoHtml` (línea ~480) se generaliza: busca la entrada en `SPECIAL_BATACAZOS` por `m.id` en vez de comparar contra la constante única. Copy según `teamId`:

- **Simétrico (`teamId: null`), antes del kickoff:** "Marca esta semi como tu Batacazo y gana **+15 puntos** si aciertas quién gana — Inglaterra o Argentina, da igual."
- **Simétrico, locked/en vivo:** "Batacazo especial: **+15 puntos** si aciertas quién avanza."
- **Jugado y logrado:** "💥 ¡Batacazo especial logrado! **+15 puntos**" (el bono sale de la entrada, no hardcodeado).
- **Con `teamId` (Cabo Verde):** el copy actual, sin cambios.

### 3. Push — `tools/push-messages.js` + `tools/send-push-reminders.js`

Doble pulso, reusando el patrón de "Atrévete a Suiza", porque el cron de Actions corre ~cada hora y el disparador externo no está activo:

- `special_bat15_pre` — cuando faltan >185 min. Envío manual de hoy (~8h antes).
- `special_bat15` — ventana estándar ≤185 min. Lo dispara el cron a T-3h.

Dedupe por `push_sent.kind` → los dos pulsos pueden salir sin bloquearse.

Nuevos en `push-messages.js`:
- `buildBat15Candidates(userIds, soon, promo, nowMs)` — broadcast a todos los suscriptores si el cruce está en `soon`; elige el `kind` por minutos al kickoff.
- `buildBat15Push(match, teams, hora)` — title `"💥 Batacazo de 15 · <hora>"`, body `"Hoy el Batacazo paga +15 puntos: marca la semi y acierta quién gana, Inglaterra o Argentina. ¡Solo hoy!"`.
- `REASON_PRIORITY.special_bat15 = 7` (mismo nivel que las otras promos: gana su bloque sobre el %).

En `send-push-reminders.js`: la rama que hoy lee `scoring.SPECIAL_BATACAZO` se sustituye por la entrada simétrica de `SPECIAL_BATACAZOS`. Los candidatos de Cabo Verde ya no aplican (partido jugado, nunca cae en `soon`), así que `buildSpecialCandidates`/`buildSpecialPush` quedan sin uso desde el runner pero se conservan con sus tests.

### 4. Tests — `tests/scoring.test.js`

Bloque nuevo "batacazo 15 semifinal", con un helper `sfMatch` al estilo de `suiMatch`:

1. Marcó batacazo, gana Inglaterra, pick con Inglaterra → +15 de bono.
2. Simetría: mismo caso con Argentina → +15.
3. Marcó batacazo, falló el ganador → sin bono.
4. Marcador exacto + batacazo → 19 en total.
5. Empate predicho con `adv` correcto → +15 (el pick suma solo el avance).
6. Sin batacazo marcado → scoring normal, sin bono.
7. **Regresión:** el +50 de Cabo Verde sigue pagando (histórico intacto).
8. **Regresión:** la escala de rareza sigue rigiendo en un KO fuera de la promo.

### 5. Despliegue

Orden, todo antes del kickoff (19:00 UTC):

1. `node --test tests/` en verde.
2. Bump `?v=` de `js/scoring.js` y `js/game.js` en `index.html`.
3. `git push` a main (GitHub Pages).
4. Verificar el banner en la app.
5. Push manual: `gh workflow run push-reminders.yml -f dry_run=1 -f window_min=600` para probar, luego `-f dry_run=0`.

Sin SQL ni migración: el cambio es JS puro.

## Fuera de alcance

- Tocar la promo "Atrévete a Suiza" (`SPECIAL_MATCH_PROMOS`), que es de otro partido y otra mecánica.
- El 3er puesto (18 jul) y la final (19 jul): si se quieren promos, son entradas nuevas en el array, en su momento.
- Reflejar el 15 en `maxMatchPoints`/engagement.
