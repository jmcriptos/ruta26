const test = require("node:test");
const assert = require("node:assert");
const view = require("../js/thirds-view.js");

// 12 terceros: 8 clasifican (qualifies true), 4 no. t6 y t8 con grupo en curso (pj 2).
function makeThirds() {
  const groups = "ABCDEFGHIJKL".split("");
  return groups.map(function (g, i) {
    return {
      teamId: "t" + (i + 1), group: g,
      pts: 12 - i, pj: (i === 5 || i === 7) ? 2 : 3,
      pg: 1, pe: 1, pp: 1, gf: 3, gc: 3, dg: 0,
      qualifies: i < 8
    };
  });
}
function makeTeamById() {
  const m = {};
  for (let i = 1; i <= 12; i++) m["t" + i] = { id: "t" + i, name: "Equipo " + i, flag: "🏳" };
  return m;
}

test("renderThirds: vacío si no hay terceros o ninguno jugó", () => {
  assert.strictEqual(view.renderThirds([], {}), "");
  const noPlay = makeThirds().map(function (t) { return Object.assign({}, t, { pj: 0 }); });
  assert.strictEqual(view.renderThirds(noPlay, makeTeamById()), "");
});

test("renderThirds: marca 8 filas como qualifying", () => {
  const html = view.renderThirds(makeThirds(), makeTeamById());
  const matches = html.match(/gt-team-row qualifying/g) || [];
  assert.strictEqual(matches.length, 8);
});

test("renderThirds: inserta la línea de corte una sola vez", () => {
  const html = view.renderThirds(makeThirds(), makeTeamById());
  const cuts = html.match(/thirds-cut/g) || [];
  assert.strictEqual(cuts.length, 1);
  assert.ok(html.indexOf("Clasifican los 8 mejores") >= 0, html);
});

test("renderThirds: asterisco solo en terceros con grupo en curso (pj<3)", () => {
  const html = view.renderThirds(makeThirds(), makeTeamById());
  // t6 (pj 2) lleva asterisco; su etiqueta de grupo es "Gr. F *"
  assert.ok(html.indexOf("Gr. F *") >= 0, "t6 debería ir marcado provisional");
  // t1 (pj 3) no lleva asterisco: "Gr. A" sin " *"
  assert.ok(html.indexOf("Gr. A</small>") >= 0, "t1 no debería ir marcado");
});

test("renderThirds: cada fila lleva data-team-id para abrir el panel", () => {
  const html = view.renderThirds(makeThirds(), makeTeamById());
  const ids = html.match(/data-team-id="t\d+"/g) || [];
  assert.strictEqual(ids.length, 12);
});

test("renderThirds: equipo desconocido no revienta", () => {
  const thirds = [{ teamId: "x", group: "A", pts: 3, pj: 3, pg: 1, pe: 0, pp: 2, gf: 1, gc: 2, dg: -1, qualifies: true }];
  const html = view.renderThirds(thirds, {});
  assert.ok(html.indexOf("Por definir") >= 0, html);
});
