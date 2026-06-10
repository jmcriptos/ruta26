# Ruta 26 — Quiniela (sistema de juego con ranking)

**Fecha:** 10 de junio de 2026 (el torneo inicia el 11 de junio)
**Estado:** diseño aprobado en conversación (Opción A), pendiente plan de implementación
**Spec previo relacionado:** `2026-06-10-mundial-2026-app-design.md` (la app base ya está en producción en https://jmcriptos.github.io/ruta26/)

## Objetivo

Que el círculo de JM (amigos, familia, colegas — decenas de jugadores) pueda:

1. Registrarse con **usuario + contraseña**, sin ningún dato personal.
2. Predecir el **marcador de cada partido** antes de que empiece.
3. Elegir un **campeón** (bonus) hasta que arranquen los 16avos.
4. Competir en un **ranking global** que se actualiza solo con los resultados reales.

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Tipo de juego | Combinado: marcadores partido a partido + bonus campeón |
| Alcance | Círculo privado por link compartido; un solo ranking global |
| Backend | Supabase (plan gratuito), directo desde el frontend, sin servidor propio (Opción A) |
| Registro | Usuario + contraseña; sin email ni datos personales |
| Puntuación | Ponderada por fase (ver abajo) |
| Cierre de campeón | Al inicio de los 16avos: **2026-06-28T19:00:00Z** |
| Cierre por partido | Al kickoff de cada partido, validado por el servidor (RLS), no por el reloj del cliente |

## Sistema de puntuación

| Acierto | Fase de grupos | Eliminatorias |
|---------|----------------|---------------|
| Marcador exacto (hs y as) | 3 pts | 5 pts |
| Resultado sin exacto | 1 pt | 2 pts |
| Campeón (bonus único) | — | 15 pts |

- "Resultado" en grupos = ganador o empate (signo de hs−as).
- "Resultado" en eliminatorias = **quién avanza** (campo `winner` de la API, incluye penales).
- "Marcador exacto" en eliminatorias = `hs`/`as` al final del juego (la API no suma penales ahí; `hp`/`ap` van aparte).
- Marcador exacto y resultado no se acumulan: exacto otorga el valor mayor, si no, se evalúa resultado.
- El partido por el 3er puesto puntúa como eliminatoria; el campeón es el ganador del partido 104.
- Partido cancelado/sin resultado: 0 puntos, la predicción queda registrada.

## Arquitectura (Opción A)

```
GitHub Pages (estático)                Supabase (gratuito, cuenta de JM)
┌─────────────────────────┐           ┌────────────────────────────────┐
│ index.html  + sección   │  HTTPS    │ Auth (email/password)          │
│ js/game.js   Quiniela   │──────────▶│ Postgres + Row Level Security  │
│ js/scoring.js (puro)    │  supabase │  - profiles                    │
│ resultados FIFA (ya     │  -js SDK  │  - matches (referencia)        │
│  existen en WC.state)   │           │  - predictions                 │
└─────────────────────────┘           │  - champion_picks              │
                                      └────────────────────────────────┘
```

- **Sin servidor propio.** El SDK `@supabase/supabase-js` (UMD por CDN, sin build) habla directo con Supabase.
- **Usuario+contraseña sobre Supabase Auth:** el registro genera internamente `<usuario>@jugadores.ruta26` como email sintético (nunca visible). Confirmación de email desactivada. El usuario solo ve "usuario" y "contraseña".
- **Puntos calculados en el cliente:** cualquier visitante baja las predicciones visibles + tiene los resultados FIFA en `WC.state.matches`, y `js/scoring.js` computa el ranking al vuelo. Con ~50 jugadores × ~104 picks es trivial.
- **La anon key es pública por diseño**; la seguridad real son las políticas RLS.

## Modelo de datos (SQL que JM pega una vez en Supabase)

```
profiles        id uuid PK = auth.users.id, username text UNIQUE (3-20, [a-z0-9_]),
                created_at timestamptz
matches         id text PK (IdMatch FIFA), kickoff_at timestamptz NOT NULL, stage text
                -- seedeada una vez desde js/data.js; fuente de verdad para bloqueos
predictions     user_id uuid FK→profiles, match_id text FK→matches,
                hs smallint 0-99, as smallint 0-99, updated_at timestamptz,
                PK (user_id, match_id)
champion_picks  user_id uuid PK FK→profiles, team_id text, updated_at timestamptz
```

### Políticas RLS (las reglas del juego viven en la base)

- `profiles`: lectura pública (para el ranking); insert/update solo del propio (`auth.uid() = id`).
- `matches`: lectura pública; sin escritura desde el cliente.
- `predictions`:
  - SELECT: el dueño siempre; otros solo si el partido ya empezó —
    `user_id = auth.uid() OR (SELECT kickoff_at FROM matches m WHERE m.id = match_id) <= now()`
    (los picks ajenos son secretos hasta el kickoff).
  - INSERT/UPDATE: solo el dueño **y solo antes del kickoff** —
    `user_id = auth.uid() AND (SELECT kickoff_at FROM matches m WHERE m.id = match_id) > now()`.
    `now()` es la hora del servidor: imposible burlar el cierre desde el cliente.
- `champion_picks`:
  - SELECT: el dueño siempre; otros a partir de `2026-06-28T19:00:00Z`.
  - INSERT/UPDATE: solo el dueño y solo antes de esa fecha (literal en la política).

## UI / UX

### Sección nueva "Quiniela" (`#quiniela`)

- Entra a la nav de escritorio y a la **bottom bar móvil como 5º ítem** (ícono de diana/estrella).
- Fondo paper, componentes con los tokens existentes (lime/ink, tarjetas tipo match-card, pills). Cero colores o fuentes nuevas.

### Estados

1. **Sin sesión:** ranking visible (read-only) + tarjeta "Juega la quiniela" con formulario de registro/login: usuario, contraseña, un botón. Mensajes de error en español claro ("Ese usuario ya existe", "Contraseña muy corta").
2. **Con sesión:**
   - **Mis predicciones:** lista de partidos ordenada cronológicamente con dos steppers (+/−) por partido. Guardado automático (debounce ~600 ms) con indicador "Guardado ✓". Partidos ya iniciados: pick bloqueado 🔒 + resultado real + puntos obtenidos. Filtros reutilizando el patrón de pestañas: Por jugar / Jugados.
   - **Mi campeón:** selector de equipo (el mismo estilo del select del bracket) + leyenda del cierre. Tras el cierre muestra el pick bloqueado.
   - **Ranking:** tabla — posición, usuario, pts totales, desglose (exactos / resultados / bonus). El propio usuario resaltado. Botón compartir (share nativo) con su posición.
   - Cerrar sesión.

### Reglas visibles

Un bloque "Cómo se juega" plegable con la tabla de puntos y los cierres. Sin letra chica oculta.

## Estructura de código

```
index.html      sección #quiniela + script CDN supabase + js/game.js, js/scoring.js
js/scoring.js   PURO y dual-environment (browser + node:test):
                scoreMatch(pred, match) → {points, kind: "exact"|"outcome"|"miss"|"pending"}
                scoreChampion(pick, matches) → 0|15
                buildLeaderboard(predictions[], picks[], matches) → filas ordenadas con desglose
js/game.js      Supabase client, auth (login/registro/logout, email sintético),
                CRUD de predicciones y campeón, render de la sección, integración
                con WC.state (resultados) y WC.renderAll (re-render tras polling)
js/config.js    SUPABASE_URL y SUPABASE_ANON_KEY (committeado; la anon key es pública)
tools/seed-matches.sql  generado por script desde js/data.js: INSERT de los 104 matches
tools/schema.sql        tablas + políticas RLS (JM lo pega una vez en el SQL editor)
tests/scoring.test.js   node:test del scoring (exacto/resultado/penales/campeón/pendientes)
```

## Flujos de error

- Supabase caído / sin red: la sección muestra "El juego no está disponible ahora" — el resto de la app (calendario, bracket) sigue intacta; nunca se rompe.
- Sesión expirada: el SDK refresca tokens solo; si falla, vuelve al formulario con mensaje.
- Conflictos de guardado: upsert por PK (user_id, match_id); última escritura gana.
- Rechazo por RLS (partido ya empezó entre render y guardado): mensaje "Este partido ya cerró" y la fila se bloquea.

## Privacidad y abuso (escala: círculo de amigos)

- Sin datos personales: solo username + hash de contraseña (que guarda Supabase Auth).
- Picks ajenos invisibles hasta el kickoff (RLS), nadie copia.
- Username: 3-20 chars `[a-z0-9_]`, normalizado a minúsculas, único.
- Contraseña: mínimo 6 caracteres (config de Supabase Auth).
- Sin recuperación de contraseña (no hay email real). Si alguien la olvida, JM puede resetearla desde el panel de Supabase. Documentado en el bloque de reglas.
- Rate limiting: el que trae Supabase Auth por defecto.

## Setup manual de JM (una sola vez, ~5 min, guiado)

1. Crear proyecto gratuito en supabase.com (login con GitHub).
2. Desactivar confirmación de email (Auth → Providers → Email).
3. Pegar `tools/schema.sql` y luego `tools/seed-matches.sql` en el SQL Editor.
4. Copiar Project URL y anon key → `js/config.js`.

## Verificación

- `node --test tests/` para todo el scoring (incluye penales, 3er puesto, campeón, pendientes).
- Browser: registro de 2 usuarios de prueba, predicción, bloqueo simulado (partido con kickoff pasado), ranking con datos reales sembrados, móvil 375px, escenario Supabase-bloqueado (red offline a *.supabase.co).
- Estilo visual: solo tokens existentes.

## Fuera de alcance (YAGNI)

- Ligas/grupos privados múltiples, recuperación de contraseña por email, avatares,
  chat, notificaciones, edición de username, moderación automatizada, ELO/handicaps.
