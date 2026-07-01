const test = require("node:test");
const assert = require("node:assert");
const flags = require("../js/flags.js");

test("flags: mapea los 48 equipos", () => {
  assert.strictEqual(Object.keys(flags.FLAG_CODE).length, 48);
});

test("flags: casos especiales de código", () => {
  assert.strictEqual(flags.flagFile("ENG"), "gb-eng");
  assert.strictEqual(flags.flagFile("SCO"), "gb-sct");
  assert.strictEqual(flags.flagFile("CUW"), "cw");
  assert.strictEqual(flags.flagFile("GER"), "de");
});

test("flags: flagSrc arma la ruta del asset", () => {
  assert.strictEqual(flags.flagSrc({ code: "FRA" }), "assets/flags/fr.svg");
  assert.strictEqual(flags.flagSrc({ code: "ENG" }), "assets/flags/gb-eng.svg");
});

test("flags: código desconocido devuelve null (degrada seguro)", () => {
  assert.strictEqual(flags.flagFile("ZZZ"), null);
  assert.strictEqual(flags.flagSrc({ code: "ZZZ" }), null);
  assert.strictEqual(flags.flagSrc(null), null);
});
