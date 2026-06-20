const test = require("node:test");
const assert = require("node:assert");
const eng = require("../js/engagement.js");

/* ---------- base pura (Story 1.2) ---------- */

test("engagement: expone los 5 view models", () => {
  ["opportunity", "liveTension", "predictionGroups", "postMatchSummary", "whatsappShare"].forEach(function (k) {
    assert.strictEqual(typeof eng[k], "function", k);
  });
});

test("engagement: degrada seguro ante datos faltantes", () => {
  assert.strictEqual(eng.opportunity(null), null);
  assert.strictEqual(eng.opportunity({ meId: null }), null);
  assert.deepStrictEqual(eng.liveTension({}), { state: "fallback", message: null, me: null, rows: [] });
  assert.deepStrictEqual(eng.predictionGroups({}, "m1"), { state: "empty", matchId: "m1", groups: [] });
  assert.strictEqual(eng.postMatchSummary({}), null);
  assert.strictEqual(eng.whatsappShare(null, {}), null);
});
