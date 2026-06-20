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

/* ---------- Oportunidad pre-partido (Story 1.3) ---------- */
const oppFixture = require("./fixtures/engagement/pre-match-opportunity.json");

test("opportunity: prioridad determinística (fixture pre-match-opportunity)", () => {
  oppFixture.cases.forEach(function (c) {
    const vm = eng.opportunity(c.snapshot);
    const e = c.expect;
    assert.strictEqual(vm.state, e.state, c.name + " · state");
    if (e.reason != null) assert.strictEqual(vm.reason, e.reason, c.name + " · reason");
    if (e.matchId != null) assert.strictEqual(vm.match && vm.match.id, e.matchId, c.name + " · matchId");
    if (e.actionLabel != null) assert.strictEqual(vm.primaryAction && vm.primaryAction.label, e.actionLabel, c.name + " · action");
    if (e.rivalUsername != null) assert.strictEqual(vm.rival && vm.rival.username, e.rivalUsername, c.name + " · rival");
  });
});

/* ---------- tensión live + pronósticos compactos (Story 1.4) ---------- */
const liveFixture = require("./fixtures/engagement/live-ranking-social.json");
const groupsFixture = require("./fixtures/engagement/post-lock-predictions.json");

test("liveTension: personal > grupal > fallback (fixture)", () => {
  liveFixture.cases.forEach(function (c) {
    const vm = eng.liveTension(c.snapshot);
    assert.strictEqual(vm.state, c.expect.state, c.name + " · state");
    if (c.expect.mePos != null) assert.strictEqual(vm.me && vm.me.pos, c.expect.mePos, c.name + " · mePos");
    if (c.expect.meDelta != null) assert.strictEqual(vm.me && vm.me.delta, c.expect.meDelta, c.name + " · meDelta");
    if (c.expect.state === "personal") assert.ok(vm.message && vm.message.length, c.name + " · message");
  });
});

test("predictionGroups: agrupa visibles, empty si no (fixture)", () => {
  groupsFixture.cases.forEach(function (c) {
    const vm = eng.predictionGroups(c.snapshot, c.matchId);
    assert.strictEqual(vm.state, c.expect.state, c.name + " · state");
    if (c.expect.groups) {
      assert.strictEqual(vm.groups.length, c.expect.groups.length, c.name + " · groups len");
      c.expect.groups.forEach(function (g, i) {
        assert.strictEqual(vm.groups[i].outcome, g.outcome, c.name + " · outcome " + i);
        assert.strictEqual(vm.groups[i].count, g.count, c.name + " · count " + i);
      });
    }
  });
});
