const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// El SDK de Supabase debe cargarse del MISMO ORIGEN, no de un CDN externo: un CDN
// inalcanzable (red móvil/ISP/bloqueador) dejaba sin login a la PWA (game.js corta
// si window.supabase es undefined). Este test evita reintroducir esa fragilidad.
test("supabase: cargado del mismo origen, no de un CDN externo", () => {
  assert.ok(!/cdn\.jsdelivr\.net[^"']*supabase/i.test(html), "no debe cargar supabase desde jsdelivr");
  assert.ok(!/unpkg\.com[^"']*supabase/i.test(html), "no debe cargar supabase desde unpkg");

  const m = html.match(/<script[^>]+src="(js\/vendor\/supabase[^"?]*)/i);
  assert.ok(m, "index.html debe cargar supabase desde js/vendor/");

  const file = path.join(root, m[1]);
  assert.ok(fs.existsSync(file), "el archivo vendorizado debe existir: " + m[1]);
  const js = fs.readFileSync(file, "utf8");
  assert.ok(js.length > 100000, "el SDK vendorizado parece truncado");
  assert.ok(/createClient/.test(js), "el SDK vendorizado debe exponer createClient");
});
