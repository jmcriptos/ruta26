# Disparador externo del cron de push (cron-job.org → GitHub API)

**Por qué:** los cron `schedule` de GitHub Actions son best-effort y se saltan corridas
(observado: huecos de 1.5–5.5 h en vez de cada 15 min). Si el hueco supera la ventana de
180 min, el partido se pierde (caso Argentina vs Austria, 22-jun-2026). La solución es
disparar el workflow desde un cron **externo confiable** vía `workflow_dispatch`.

El workflow `.github/workflows/push-reminders.yml` ya soporta `workflow_dispatch` con el
input `dry_run`. El `schedule` se deja como respaldo (el dedupe evita envíos dobles).

## 1) Token de GitHub (fine-grained PAT)

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token:
- **Resource owner:** jmcriptos
- **Repository access:** Only select repositories → `jmcriptos/ruta26`
- **Permissions → Repository permissions → Actions:** **Read and write**
- **Expiration:** la que prefieras (al vencer, regenerar y actualizar en cron-job.org)

Copia el token (empieza con `github_pat_…`).

## 2) Probar el endpoint (opcional, con curl)

```bash
curl -i -X POST \
  -H "Authorization: Bearer github_pat_TU_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/jmcriptos/ruta26/actions/workflows/push-reminders.yml/dispatches \
  -d '{"ref":"main","inputs":{"dry_run":"0"}}'
```
Respuesta esperada: **HTTP 204 No Content** (sin cuerpo) → disparó una corrida.

## 3) Job en cron-job.org

cron-job.org → crear cuenta → **Create cronjob**:
- **Title:** Ruta26 push reminders
- **URL:** `https://api.github.com/repos/jmcriptos/ruta26/actions/workflows/push-reminders.yml/dispatches`
- **Schedule:** Every 15 minutes (`*/15 * * * *`)
- **Advanced → Request method:** `POST`
- **Advanced → Headers:**
  - `Authorization: Bearer github_pat_TU_TOKEN`
  - `Accept: application/vnd.github+json`
  - `X-GitHub-Api-Version: 2022-11-28`
  - `Content-Type: application/json`
- **Advanced → Request body:** `{"ref":"main","inputs":{"dry_run":"0"}}`
- **Notificaciones:** activar aviso por fallo (para enterarte si el token vence).

Guardar. cron-job.org tratará **HTTP 204** como éxito.

## Notas

- Cada disparo corre el envío real (`dry_run=0`). El dedupe (`push_sent`, por
  `match_id+user_id+kind`) garantiza un solo push por partido/tipo aunque dispare seguido.
- Con disparos confiables cada 15 min se podría **estrechar la ventana** (`WINDOW_MS`/`WINDOW_MIN`)
  de 180 a ~75–90 min para que el % salga más cerca del kickoff (opcional; hoy queda en 180).
- El `schedule` de Actions sigue activo como respaldo; no estorba.
- Verificar funcionamiento: `gh run list --workflow=push-reminders.yml` debe mostrar corridas
  `event=workflow_dispatch` cada ~15 min.
