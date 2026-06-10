# Quiniela — cambio de reglas a 1X2 + penales

**Fecha:** 10 de junio de 2026 (torneo inicia 11 de junio)
**Estado:** diseño aprobado en conversación, pendiente plan
**Reemplaza la mecánica de:** `2026-06-10-quiniela-design.md` (marcadores partido a partido)

## Cambio

Sustituir la predicción de marcador exacto por predicción de resultado:

- **Grupos:** elegir 1X2 — Gana local / Empate / Gana visitante.
- **Eliminatorias** (r32, r16, qf, sf, third): elegir quién avanza (local/visitante) + flag opcional "por penales".
- **Final:** marcador con goles (steppers), única que conserva el sistema de marcador.

## Puntuación (plana)

| Acierto | Puntos |
|---------|--------|
| Grupos: resultado 1X2 correcto | 1 |
| Eliminatorias: quién avanza correcto | 1 |
| Eliminatorias: además "por penales" correcto (SOLO si acertó quién avanza) | +1 (total 2) |
| Final: marcador exacto | 3 |
| Final: solo resultado 1X2 (sin exacto) | 1 |
| Campeón | 15 (sin cambios) |

- "Por penales" se reconoce en el partido real cuando la API trae marcador de penales: `match.hp != null` (en el modelo normalizado, `hp`/`ap` son los penalty scores). Prórroga sin penales NO cuenta como penales.
- Si el jugador NO marcó "por penales" y el partido tampoco fue por penales: solo el punto de quién-avanza (no hay penalización por no marcar).
- Si marcó "por penales" pero falló quién avanza: 0 puntos (el flag solo suma sobre un acierto de quién avanza).

## Almacenamiento (mínimo cambio)

Tabla `predictions` conserva `hg`/`ag` y se agrega **una columna** `pens boolean not null default false`.

Codificación que escribe el cliente:
- Grupos: Gana local → `(1,0)`; Empate → `(0,0)`; Gana visitante → `(0,1)`. `pens=false`.
- Eliminatorias: Avanza local → `(1,0)`; Avanza visitante → `(0,1)`. `pens` = lo que marque el toggle.
- Final: marcador real elegido con steppers `(hg,ag)`. `pens=false`.

El check `hg/ag between 0 and 99` sigue válido. Las políticas RLS no cambian (no restringen columnas; el upsert ahora incluye `pens`).

## Migración de datos

El torneo no ha empezado; las predicciones actuales son de prueba. El SQL de migración:
1. `alter table public.predictions add column if not exists pens boolean not null default false;`
2. `delete from public.predictions;` (limpia las viejas, que tenían semántica de marcador).

`champion_picks` queda intacto (su semántica no cambia). JM corre este SQL una vez en el SQL Editor.

## UI

`pickRowHtml` en `js/game.js` se bifurca por tipo de partido:

- **Grupos** → tres botones tipo segmented control: `Gana {local}` · `Empate` · `Gana {visitante}`. El activo en lima. Guardado automático al tocar.
- **Eliminatorias** → dos botones `Avanza {local}` · `Avanza {visitante}` + un toggle `⚽ Por penales` (pill que enciende/apaga). Guardado automático.
- **Final** → steppers `+/−` actuales (sin cambios).

Filas bloqueadas (partido ya empezó) muestran el pick elegido en texto + el chip de puntos calculado.

`rulesHtml` se actualiza con la nueva tabla.

## Scoring (js/scoring.js)

`scoreMatch(pred, match)` reescrito. `pred` ahora es `{hg, ag, pens}`.

```
si no pred → {points:0, kind:"none"}
si match no jugado → {points:0, kind:"pending"}

FINAL (stage === "final"):
  si pred.hg==hs y pred.ag==as → {3, "exact"}
  si signo(pred.hg-pred.ag)==signo(hs-as) → {1, "outcome"}
  → {0, "miss"}

GRUPOS (stage === "group"):
  si signo(pred.hg-pred.ag)==signo(hs-as) → {1, "outcome"}
  → {0, "miss"}

ELIMINATORIAS (resto):
  predWinner = pred.hg>pred.ag ? home : away
  si predWinner !== winner → {0, "miss"}
  base 1; si pred.pens y (match.hp != null) → +1
  → {points: base, kind:"outcome"}   // kind "outcome" siempre que acierte avanza
```

`scoreChampion` y `buildLeaderboard` se mantienen; `buildLeaderboard` ya suma `s.points` y cuenta `exact`/`outcome` por `kind` — sigue válido. (Nota: con 1X2 casi todo es "outcome"; "exact" solo aparece en la final.)

## Verificación

- `node --test tests/`: reescribir los tests de scoreMatch para 1X2/penales/final; el resto sigue.
- Browser E2E con puerto fresco: grupos (3 botones), eliminatorias (avanza + penales), final (steppers), guardado y persistencia, bloqueo, ranking, móvil.
- Estilo: solo tokens existentes.

## Fuera de alcance

- Convertir predicciones viejas (se borran). Cambiar puntuación del campeón. Históricos.
