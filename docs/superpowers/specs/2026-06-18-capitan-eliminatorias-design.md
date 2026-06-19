# Capitán de eliminatorias ⭐ — Diseño

**Fecha:** 2026-06-18
**Estado:** Diseño aprobado (pendiente plan de implementación)
**Autor:** JM + Claude (brainstorming)

## Contexto

La quiniela Ruta 26 (Mundial 2026) tiene ~27 jugadores, retención excelente
(participación por partido subió de 13 a 25 picks; ~93% de los registrados
pronostica cada partido). El análisis de datos del 18 jun 2026 mostró que **no
hay problema de retención**: el núcleo vuelve cada día. Por tanto el "Capitán"
se diseña como **sabor adicional para la fase eliminatoria**, no como mecánica
de rescate.

Los puntos de la quiniela son **acumulables y se mantienen entre fases**:
`buildLeaderboard` suma todos los partidos (grupos + eliminatorias) + campeón en
un único total, sin reinicios. El Capitán respeta esto: **solo añade** puntos
extra sobre partidos de eliminatorias; nunca resta ni reinicia.

## Objetivo

Darle tensión y una decisión diaria extra a la fase eliminatoria, manteniendo la
filosofía del juego: simple, accesible y **nadie pierde puntos ya ganados**.

## No-objetivos (YAGNI)

- No toca la fase de grupos ni reescribe puntajes pasados.
- No resta puntos (sin "doblar o nada").
- No calcula cuotas ni rareza de picks (eso sería el upgrade "contracorriente", futuro).
- No introduce dinero ni apuestas reales.

## La mecánica

Desde **octavos de final (28 jun 2026)** en adelante:

- Cada **día de partidos** de eliminatoria, el jugador marca **un** partido como
  su **Capitán ⭐**.
- El partido capitaneado vale **×3**: los **puntos base** del partido se
  multiplican por 3.
- El **bonus de penales (+1)** NO se multiplica: se suma aparte, tal como está
  fijado hoy. El ×3 aplica solo al punto base de acertar quién avanza (o al
  marcador de la final).
- Solo multiplica puntos **positivos**. Si el capitán falla → 0 en ese partido.
  **Nunca resta.**
- Se **bloquea a la hora de inicio** del partido capitaneado (igual que los picks).
- Solo se puede capitanear un partido que el jugador **predijo**.
- **Uno por día**: marcar otro partido del mismo día desmarca el anterior.
- En rondas con un solo partido al día (típicamente semis/final), el capitán
  aplica sobre ese único partido.

### Valores resultantes (x3 sobre el total del partido)

| Situación en eliminatoria | Sin capitán | Con capitán |
|---|---:|---:|
| Acierta quién avanza | 1 | 3 |
| Acierta avance + que fue por penales | 2 | **4** (base 1×3=3, +1 penales sin multiplicar) |
| Final: solo resultado | 1 | 3 |
| Final: marcador exacto | 3 | 9 |
| Falla | 0 | 0 |

> El multiplicador aplica **solo a los puntos base** (acertar quién avanza, o el
> marcador de la final). El bonus de penales (+1) se suma aparte sin multiplicar.
> El factor (×3) es un parámetro: si más adelante se quiere otro peso, se cambia.

## Componentes

### 1. Datos (Supabase) — `tools/schema.sql`

Tabla nueva:

```sql
create table public.captain_picks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  match_day date not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id),
  unique (user_id, match_day)   -- fuerza 1 capitán por día
);
alter table public.captain_picks enable row level security;
```

RLS calcada de `predictions`:
- **select**: el propio siempre; los ajenos tras el kickoff del partido
  (revelar de quién es capitán = drama social).
- **insert/update**: solo el propio y solo si `kickoff_at > now()` del partido.
- **delete**: el propio antes del kickoff (para poder desmarcar/cambiar).

`match_day` lo calcula el cliente a partir de la fecha del partido (día
calendario en `America/Curacao`) y se valida; el `unique (user_id, match_day)`
garantiza un solo capitán por día a nivel base.

### 2. Scoring (`js/scoring.js`)

- `buildLeaderboard` recibe además los `captain_picks` y, al sumar cada
  predicción, si `(user_id, match_id)` es capitán **y** el partido es de
  eliminatoria **y** los puntos base son > 0, multiplica **solo la parte base**
  por `CAPTAIN_MULT = 3` y deja el bonus de penales sin multiplicar. Es decir:
  `total = base*3 + pensBonus` (vs `base + pensBonus` normal). Para esto
  `scoreMatch` debe exponer el desglose base/penales (o `buildLeaderboard`
  resta el bonus de penales antes de multiplicar).
- Se mantiene puro y dual-environment (browser + node:test).
- `buildLiveLeaderboard` hereda el efecto (usa `buildLeaderboard`).
- Nueva constante `CAPTAIN_MULT = 3` junto a `POINTS`.
- Considerar exponer en cada fila del ranking cuánto vino del bonus capitán
  (para mostrarlo en la UI, opcional).

### 3. UI (`js/game.js`)

- En las tarjetas/filas de partidos de **eliminatoria**, un toggle ⭐ "Capitán".
- Regla 1-por-día en el cliente: marcar uno desmarca el otro del mismo día.
- Solo habilitado si el jugador ya tiene predicción en ese partido y el partido
  no ha iniciado.
- Tras el kickoff, mostrar el ⭐ de cada jugador (en el detalle de picks revelados).
- Actualizar el texto de "Cómo se juega" (`rulesHtml`) con la regla del capitán.

### 4. Push (opcional, fase 2)

- Reutilizar la infra existente para un recordatorio "🔔 ¿Ya pusiste tu capitán
  de hoy?" en días de eliminatoria sin capitán marcado. No bloquea el lanzamiento.

## Casos borde

- **Sin capitán ese día**: simplemente no hay bonus. Suave, sin auto-asignar.
- **Capitán en partido sin predicción**: no permitido (UI lo impide; defensa en
  scoring: si no hay pick, no hay puntos que multiplicar).
- **Empate en eliminatoria sin tanda definida**: ya manejado por `freezeLive`/
  `scoreMatch`; el capitán solo multiplica si hay puntos.
- **Cambiar de opinión**: permitido hasta el kickoff (update/delete del capitán).

## Pruebas

- Tests unitarios de `scoring.js` (estilo `tests/`): capitán que acierta (×3 = 3),
  que falla (0), con bonus de penales (base 1×3=3 + 1 sin multiplicar = **4**),
  en final exacto (9), capitán en grupos (ignorado), sin capitán (sin cambio),
  acumulación correcta entre fases.
- Verificar que el ranking acumulado de grupos no cambia al introducir capitanes
  solo en eliminatorias.

## Futuro (fuera de alcance)

- **Capitán contracorriente**: el multiplicador depende de qué tan raro fue el
  pick (cuotas derivadas de los picks de la propia gente). Upgrade natural si se
  quiere premiar la valentía / apretar la tabla.
- Notificación push del capitán (si la fase 2 no entra en el lanzamiento inicial).
