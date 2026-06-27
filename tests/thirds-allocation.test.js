const test = require("node:test");
const assert = require("node:assert");
const alloc = require("../js/thirds-allocation.js");

const WINNERS = ["A", "B", "D", "E", "G", "I", "K", "L"];

test("allocation: 495 combinaciones", () => {
  assert.strictEqual(Object.keys(alloc).length, 495);
});

test("allocation: invariante estructural en todas las filas", () => {
  Object.keys(alloc).forEach(function (key) {
    const row = alloc[key];
    assert.deepStrictEqual(Object.keys(row).sort(), WINNERS.slice().sort(), "ganadores en " + key);
    const vals = WINNERS.map(function (w) { return row[w]; });
    assert.strictEqual(new Set(vals).size, 8, "terceros distintos en " + key);
    assert.strictEqual(vals.slice().sort().join(""), key, "asignados==clave en " + key);
  });
});

test("allocation: filas conocidas de Wikipedia", () => {
  assert.deepStrictEqual(alloc["BDEFIJKL"], { A: "E", B: "J", D: "B", E: "D", G: "I", I: "F", K: "L", L: "K" });
  assert.deepStrictEqual(alloc["ABCDEFGI"], { A: "C", B: "G", D: "B", E: "D", G: "A", I: "F", K: "E", L: "I" });
  assert.deepStrictEqual(alloc["EFGHIJKL"], { A: "E", B: "J", D: "I", E: "F", G: "H", I: "G", K: "L", L: "K" });
});
