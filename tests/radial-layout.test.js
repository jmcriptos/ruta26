const test = require("node:test");
const assert = require("node:assert");
const rl = require("../js/radial-layout.js");

// Árbol chico de 2 niveles: final(1) -> 2 hojas r32 (2,3)
const TREE_2 = [
  { num: 1, stage: "final", phA: "W2", phB: "W3" },
  { num: 2, stage: "r32", phA: "1A", phB: "2B", home: "t1", away: "t2" },
  { num: 3, stage: "r32", phA: "1C", phB: "2D", home: "t3", away: "t4" }
];

test("bracketTree: hojas emiten home y away en orden", () => {
  const { order } = rl.bracketTree(TREE_2);
  assert.deepStrictEqual(order, [
    { matchNum: 2, side: "home" }, { matchNum: 2, side: "away" },
    { matchNum: 3, side: "home" }, { matchNum: 3, side: "away" }
  ]);
});

test("bracketTree: rounds agrupa por etapa", () => {
  const { rounds } = rl.bracketTree(TREE_2);
  assert.deepStrictEqual(rounds.r32.map(m => m.num), [2, 3]);
  assert.deepStrictEqual(rounds.final.map(m => m.num), [1]);
});

// Árbol de 3 niveles: final(1) -> r16(2,3) -> r32(4,5,6,7)
const TREE_3 = [
  { num: 1, stage: "final", phA: "W2", phB: "W3" },
  { num: 2, stage: "r16", phA: "W4", phB: "W5" },
  { num: 3, stage: "r16", phA: "W6", phB: "W7" },
  { num: 4, stage: "r32", phA: "1A", phB: "2B", home: "a", away: "b" },
  { num: 5, stage: "r32", phA: "1C", phB: "2D", home: "c", away: "d" },
  { num: 6, stage: "r32", phA: "1E", phB: "2F", home: "e", away: "f" },
  { num: 7, stage: "r32", phA: "1G", phB: "2H", home: "g", away: "h" }
];

test("bracketTree: anida izquierda antes que derecha", () => {
  const { order, rounds } = rl.bracketTree(TREE_3);
  assert.deepStrictEqual(order.map(s => s.matchNum), [4, 4, 5, 5, 6, 6, 7, 7]);
  // rounds.r16[0] (m2) es padre de rounds.r32[0,1] (m4,m5)
  assert.deepStrictEqual(rounds.r32.map(m => m.num), [4, 5, 6, 7]);
  assert.deepStrictEqual(rounds.r16.map(m => m.num), [2, 3]);
});

test("geometría: RINGS de afuera hacia adentro", () => {
  assert.strictEqual(rl.RINGS.length, 5);
  assert.strictEqual(rl.RINGS[0].n, 32);
  assert.strictEqual(rl.RINGS[4].n, 2);
});

test("geometría: padre = floor(i/2)", () => {
  assert.strictEqual(rl.parentIndex(0), 0);
  assert.strictEqual(rl.parentIndex(7), 3);
});

test("geometría: finalistas a las 9 y 3 en punto", () => {
  const a = rl.nodePos(4, 0, 100); // ring final, nodo 0
  const b = rl.nodePos(4, 1, 100); // ring final, nodo 1
  assert.ok(a.x < 50, "nodo 0 a la izquierda");
  assert.ok(b.x > 50, "nodo 1 a la derecha");
  assert.ok(Math.abs(a.y - 50) < 0.001, "nodo 0 centrado en vertical");
  assert.ok(Math.abs(b.y - 50) < 0.001, "nodo 1 centrado en vertical");
});

/* ---------- geometría rectangular ---------- */

test("nodeAngleDeg: ángulo del nodo con rotación del lienzo", () => {
  assert.strictEqual(rl.nodeAngleDeg(0, 0), 0.5 / 32 * 360 + 90);
  assert.strictEqual(rl.nodeAngleDeg(4, 1), 1.5 / 2 * 360 + 90);
});

test("rectSegment: a=hijo, b=padre, esquina en el radio del padre y ángulo del hijo", () => {
  const s = rl.rectSegment(0, 3);
  const child = rl.nodePos(0, 3), parent = rl.nodePos(1, 1);
  assert.ok(Math.abs(s.a.x - child.x) < 1e-9 && Math.abs(s.a.y - child.y) < 1e-9);
  assert.ok(Math.abs(s.b.x - parent.x) < 1e-9 && Math.abs(s.b.y - parent.y) < 1e-9);
  // esquina: a la distancia del anillo padre del centro…
  const dc = Math.hypot(s.c.x - 50, s.c.y - 50);
  assert.ok(Math.abs(dc - rl.RINGS[1].r * 100) < 1e-9);
  // …y colineal con centro→hijo (mismo ángulo)
  const da = Math.hypot(s.a.x - 50, s.a.y - 50);
  assert.ok(Math.abs((s.a.x - 50) / da - (s.c.x - 50) / dc) < 1e-9);
  assert.ok(Math.abs((s.a.y - 50) / da - (s.c.y - 50) / dc) < 1e-9);
  assert.strictEqual(s.r, rl.RINGS[1].r * 100);
});

test("rectSegment: sweep sigue el sentido del delta angular (par adelante, impar atrás)", () => {
  assert.strictEqual(rl.rectSegment(0, 2).sweep, 1);
  assert.strictEqual(rl.rectSegment(0, 3).sweep, 0);
  // extremos del anillo (cruce de las 12 del lienzo): mismo patrón
  assert.strictEqual(rl.rectSegment(0, 0).sweep, 1);
  assert.strictEqual(rl.rectSegment(0, 31).sweep, 0);
});

test("rectSegment: respeta size custom", () => {
  const s = rl.rectSegment(1, 4, 200);
  const parent = rl.nodePos(2, 2, 200);
  assert.ok(Math.abs(s.b.x - parent.x) < 1e-9 && Math.abs(s.b.y - parent.y) < 1e-9);
  assert.strictEqual(s.r, rl.RINGS[2].r * 200);
});
