const test = require("node:test");
const assert = require("node:assert");
const { versionHtml } = require("../tools/version-assets.js");

// resolver inyectado: ref local conocida → hash fijo; desconocida → null
const resolver = function (rel) {
  return {
    "js/app.js": "aaaa111122",
    "styles.css": "bbbb333344",
    "como-jugar.html": "cccc555566"
  }[rel] || null;
};

test("reemplaza un ?v= existente por el hash", () => {
  const out = versionHtml('<script src="js/app.js?v=20260101a"></script>', resolver);
  assert.ok(out.indexOf('js/app.js?v=aaaa111122') >= 0, out);
});

test("añade ?v= a un ref sin query", () => {
  const out = versionHtml('<link rel="stylesheet" href="styles.css">', resolver);
  assert.ok(out.indexOf('styles.css?v=bbbb333344') >= 0, out);
});

test("versiona también links .html", () => {
  const out = versionHtml('<a href="como-jugar.html?v=old">guía</a>', resolver);
  assert.ok(out.indexOf('como-jugar.html?v=cccc555566') >= 0, out);
});

test("ignora refs externas (https y protocol-relative)", () => {
  const cdn = '<script src="https://cdn.jsdelivr.net/x.js"></script>';
  const pr = '<script src="//cdn.x/y.js"></script>';
  assert.strictEqual(versionHtml(cdn, resolver), cdn);
  assert.strictEqual(versionHtml(pr, resolver), pr);
});

test("deja igual un ref a archivo desconocido", () => {
  const html = '<script src="js/missing.js?v=1"></script>';
  assert.strictEqual(versionHtml(html, resolver), html);
});

test("no toca refs que no sean .js/.css/.html", () => {
  const html = '<link rel="manifest" href="manifest.json"><img src="og.jpg">';
  assert.strictEqual(versionHtml(html, resolver), html);
});

test("es idempotente", () => {
  const once = versionHtml('<script src="js/app.js"></script>', resolver);
  const twice = versionHtml(once, resolver);
  assert.strictEqual(twice, once);
});
