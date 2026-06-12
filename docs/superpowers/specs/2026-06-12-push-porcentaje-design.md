# Push pre-partido para todos con % de la quiniela

**Fecha:** 2026-06-12
**Estado:** Aprobado por JM en conversación

## Objetivo

Reemplazar el recordatorio actual ("te falta tu pick", solo a quienes no han
pronosticado, ventana 2h) por **un push a todos los suscriptores ~1 hora antes
de cada partido** con el dato social de la quiniela:

> ⚽ México vs Sudáfrica · 3:00 p. m.
> El 73% de la quiniela espera que gane 🇲🇽 México

A quien le falte el pick, el mismo push agrega una línea extra:

> 👉 ¡Aún te falta tu pick!

## Mensaje

- **Un partido:** título `⚽ <local> vs <visitante> · <hora>`, cuerpo
  `El <pct>% de la quiniela espera que gane <bandera> <equipo>`.
- **Mayoría empate:** `El <pct>% de la quiniela espera empate`.
- **Menos de 3 picks en el partido:** `¡Sé de los primeros en pronosticar!`
  (un % con 1-2 picks no es representativo).
- **Dos simultáneos** (última jornada de grupos): un solo push por usuario.
  Título `⚽ 2 partidos arrancan a las <hora>`, cuerpo con una línea por
  partido: `<local> vs <visitante>: <pct>% con <equipo>` (o `<pct>% empate`,
  o `aún sin picks`).
- **Línea extra** si al usuario le falta el pick de ≥1 de esos partidos:
  `👉 ¡Aún te falta tu pick!`
- Hora en zona `America/Curacao`, tap lleva a `#quiniela`, formato declarative
  web push actual (`web_push: 8030`). Sin nombres de usuarios ni datos
  individuales: solo agregados.

## Cálculo del %

Por partido, sobre `predictions` (la tabla ya existente):
`hg > ag` → victoria local; `hg < ag` → visitante; `hg = ag` → empate
(`pens` es un bonus aparte y no codifica ganador). El % mostrado es el del
resultado más votado, `Math.round((votos/total)*100)`. Empate técnico entre
resultados → gana el orden local, empate, visitante.

## Infra

- Se reescribe la lógica de `tools/send-push-reminders.js`; el workflow de
  Actions (cada 15 min) no cambia.
- **Ventana: 75 minutos** antes del kickoff (antes 2h). Cron cada 15 min +
  margen para retrasos de Actions → llega típicamente 60-70 min antes. Si
  Actions se saltara más de 75 min de corridas, ese push se pierde
  (aceptado: la semántica "≈1h antes" importa más que la garantía).
- Dedupe igual: `push_sent` (match_id, user_id). Si ningún endpoint del
  usuario acepta el push, no se marca y se reintenta al siguiente cron.
- Limpieza de suscripciones 404/410 igual que hoy.
- `DRY_RUN=1` y `TEST_USERNAME` se conservan (el texto de prueba se
  actualiza: ya no promete avisos de picks). `DIAG_USERNAME` se simplifica:
  muestra suscripciones, pick sí/no y enviado sí/no por partido próximo.
- La lógica pura (conteo de resultados y armado de título/cuerpo) se extrae a
  `tools/push-messages.js` para poder testearla — el script actual ejecuta
  `main()` al cargarse y no es requerible desde tests.

## Testing

- `tests/push-messages.test.js` (node --test): mayoría local/empate/visitante,
  redondeo, umbral <3 picks, dos partidos simultáneos, línea extra de pick
  faltante, hora de Curaçao, escape no aplica (texto plano de notificación,
  pero los nombres de equipo vienen del snapshot propio, no de input externo).
- Verificación end-to-end con `DRY_RUN=1` contra Supabase real antes de
  mergear (listar a quién le llegaría qué).
