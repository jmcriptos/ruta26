# Quiniela — predicciones por jornada (reducir scroll móvil)

**Fecha:** 11 de junio de 2026
**Estado:** diseño aprobado en conversación, pendiente plan
**Sobre:** la sección Quiniela ya en producción

## Problema

"Mis predicciones" lista los 104 partidos por jugar como tarjetas de enfrentamiento apiladas → scroll enorme en móvil.

## Solución

Filtrar "Mis predicciones" por jornada con un carrusel de fechas (mismo patrón visual que la sección Partidos). Cada día muestra solo sus partidos (~4-8). Las tarjetas de enfrentamiento con banderas se mantienen.

## Comportamiento

- **Carrusel de fechas** arriba de la lista: un botón por día del torneo (día de semana + número), marca "HOY", scroll horizontal, autocentrado en el día activo. Construido en `js/game.js` a partir de los días únicos de `WC.state.matches` (con `WC.fmt`).
- **Filtra por día:** al elegir una fecha, la lista muestra solo los partidos de esa jornada, ordenados por hora. `pickRowHtml` ya distingue locked (jugado/en juego: resultado + chip de puntos) de editable (botones).
- **Día por defecto:** el primer día (cronológico) que tenga al menos un partido por jugar (kickoff futuro). Si todos jugados, el último día. Al inicio del torneo: 11 de junio.
- **Reemplaza** las pestañas "Por jugar / Jugados" y el estado `predFilter`. La fecha organiza todo.
- "Mi Campeón" y "Ranking" arriba: sin cambios.

## Componentes a tocar

- `js/game.js`:
  - Estado: quitar `predFilter`; agregar `predDate` (clave YYYY-MM-DD) y `predDateInit` (bool, para fijar el default una sola vez).
  - Helper `dateKey(iso)` y `defaultPredDate()` (primer día con partido por jugar).
  - `predictionsHtml()`: render del carrusel de fechas + la lista filtrada por `predDate`.
  - Eventos: click en `[data-gdate]` cambia `predDate` y re-render; quitar el handler de `[data-pf]`.
  - Tras render, autocentrar el carrusel en el día activo.
- `styles.css` (agregar al final): `.game-dates` (carrusel) y `.game-date` (botón), look del date-strip pero sobre fondo claro de la quiniela. Solo tokens existentes.

## No cambia

Reglas, scoring, esquema, RLS, datos, auth, campeón, ranking, compartir, reglas plegables. `node --test tests/` sigue igual (no toca scoring).

## Verificación

- Browser puerto fresco, logueado: "Mis predicciones" muestra el carrusel de fechas con HOY marcado y solo los partidos del día por defecto (11 JUN). Cambiar de día filtra. Guardado sigue funcionando (1X2/avanza/penales/steppers). Móvil 375px: scroll de la quiniela reducido a una jornada; carrusel desliza sin overflow. Escritorio: igual, sin romper. Estilo: solo tokens existentes.

## Fuera de alcance

Aligerar otras pantallas (Equipos, Partidos) — otra ronda. Agrupar por fase. Buscador de partido.
