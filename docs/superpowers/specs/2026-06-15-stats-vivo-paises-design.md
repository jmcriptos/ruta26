# Stats: usuarios en vivo y países

**Fecha:** 2026-06-15
**Estado:** Aprobado por JM (retomado)

## Objetivo

Agregar al dashboard de estadísticas (`stats.html`):
1. **Usuarios en vivo** — cuántas sesiones están activas ahora.
2. **Países** — de dónde se conectan los visitantes.

Manteniendo el principio del analytics actual: **sin PII, sin guardar IP**, todo
agregado. Respeta Do Not Track (ya lo hace `metrics.js`).

## 1) Captura del país (sin IP)

- `js/metrics.js`: una vez por sesión, `fetch("https://www.cloudflare.com/cdn-cgi/trace")`,
  extrae `loc=XX` (código ISO de 2 letras mayúsculas), lo cachea en
  `sessionStorage` (`wc26-country`) y lo envía como `p_country` en el page_view.
  - Si la petición falla, no hay match, o `navigator.doNotTrack === "1"`, el país
    queda vacío y no se bloquea el registro normal.
  - Nunca se ve ni guarda la IP: Cloudflare la procesa; tomamos solo el país.
  - El país se resuelve antes del primer `track()`; si tarda, el primer
    page_view puede ir sin país y los siguientes (al cambiar de sección) ya con él.
- `index.html`: agregar `https://www.cloudflare.com` a `connect-src` del CSP.

## 2) Almacenamiento (SQL, agregado)

- `page_views`: nueva columna `country text` con check `country ~ '^[A-Z]{2}$'`
  (o null). Las visitas previas quedan `null`.
- `record_page_view`: nuevo parámetro `p_country text default ''`; se valida
  (`^[A-Z]{2}$` → se guarda; cualquier otra cosa → `null`). El resto del flujo
  (cuota anti-abuso, validaciones, statement_timeout) no cambia.
- `analytics_rollup`: agregar la dimensión `country`, agrupando **solo las filas
  con país válido** (`where v.country ~ '^[A-Z]{2}$'`). Devuelve
  `dimension='country', value=<XX>, views, sessions` por día. Las visitas sin
  país no producen fila de país (no hay categoría "Desconocido"); siguen contando
  en el total y demás dimensiones.
- `analytics_live()`: función nueva, `security definer`, que devuelve el número de
  **sesiones distintas con al menos una vista en los últimos 5 minutos**
  (`count(distinct session_id) where ts > now() - interval '5 minutes'`). No
  expone `session_id`. `grant execute` a `anon`. `statement_timeout` corto.

**Despliegue:** `tools/migrate-analytics-country-live.sql` con el `ALTER TABLE` y
los tres `create or replace` / `create`, para pegar en el SQL Editor de Supabase.
`tools/schema.sql` se actualiza como fuente de verdad.

## 3) Dashboard (`stats.html` + `js/stats-dashboard.js`)

- **Usuarios en vivo:** indicador arriba ("● N en vivo"), que llama a
  `analytics_live` al cargar y se auto-refresca cada ~45 s. Si falla (p. ej. SQL
  sin desplegar / 404), muestra "—" sin romper el resto del dashboard.
- **Países:** tarjeta tipo lista (mismo estilo que las demás métricas) con
  bandera + nombre + sesiones/visitas, ordenada desc. Solo países conocidos.
  - Bandera: derivada del código ISO-2 (pares de "regional indicator symbols").
  - Nombre en español: `Intl.DisplayNames(['es'], {type:'region'}).of(code)`, con
    el propio código como respaldo si el navegador no lo soporta.
  - Si aún no hay ningún país (datos viejos), la tarjeta no se muestra.

## Errores / bordes

- Cloudflare trace caído/lento → país vacío esa sesión; el page_view se registra.
- `analytics_live`/dimensión country 404 (SQL sin desplegar) → indicador "—" y
  sin tarjeta de países; el resto del dashboard funciona igual.
- Código de país inválido → se descarta (null), no llega a la lista.

## Testing

- Funciones puras testeables (en un helper o el módulo del dashboard): parseo de
  `loc=XX` del texto de trace y `codeToFlag(code)` (ISO-2 → emoji). Cobertura con
  `node --test`.
- SQL (RPCs) y render del dashboard: verificación en el navegador tras desplegar
  la migración.

## Scope (YAGNI)

- "En vivo" es solo el número total; sin desglose por país/sección en vivo.
- Países como lista; sin mapa mundial.
- Sin fila "Desconocido".

## Nota de scope

Toca `js/metrics.js`, `js/stats-dashboard.js`, `stats.html`, `index.html` (CSP),
`tools/schema.sql` y una migración SQL nueva. **No toca `js/game.js`** → no
interfiere con los cambios de timezone sin commitear de otra sesión.
