const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "metrics.js"), "utf8");

// El primer registro espera a que se resuelva el país (Cloudflare trace) o al
// timeout de respaldo, así que el helper es asíncrono y deja correr microtareas.
// opts.trace: "MX" (default) devuelve loc=MX; "fail" simula trace caído.
async function runMetrics(opts) {
  opts = opts || {};
  const calls = [];       // solo llamadas al RPC record_page_view
  let traceCalls = 0;     // llamadas al trace de Cloudflare
  const WC = { CONFIG: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" } };
  const context = {
    window: {
      WC: WC,
      matchMedia: function () { return { matches: false }; },
      navigator: { standalone: false },
      addEventListener: function () {}
    },
    WC: WC,
    navigator: { doNotTrack: opts.dnt || "0" },
    document: { referrer: "" },
    location: { hash: "#inicio", hostname: "ruta26.example" },
    sessionStorage: {
      getItem: function () { return null; },
      setItem: function () {}
    },
    crypto: { randomUUID: function () { return "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"; } },
    setTimeout: setTimeout,
    fetch: function (url, init) {
      if (String(url).indexOf("cloudflare.com") !== -1) {
        traceCalls++;
        if (opts.trace === "fail") return Promise.reject(new Error("down"));
        return Promise.resolve({ ok: true, text: function () { return Promise.resolve("fl=abc\nip=1.2.3.4\nloc=MX\n"); } });
      }
      calls.push({ url: url, init: init });
      return Promise.resolve({ ok: true });
    },
    URL: URL
  };
  vm.runInNewContext(source, context);
  // Dejar correr la resolución del país y el primer track.
  await new Promise(function (r) { setImmediate(r); });
  await new Promise(function (r) { setImmediate(r); });
  return { calls: calls, traceCalls: traceCalls, WC: context.WC };
}

test("metrics registra mediante el RPC limitado, no con INSERT directo", async () => {
  const { calls } = await runMetrics();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://example.supabase.co/rest/v1/rpc/record_page_view");
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body, {
    p_session_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    p_section: "#inicio",
    p_device: "desktop",
    p_standalone: false,
    p_ref: "",
    p_country: "MX"
  });
});

test("metrics deriva el país del trace de Cloudflare (loc=XX), nunca de la IP", async () => {
  const { calls, traceCalls } = await runMetrics();
  assert.strictEqual(traceCalls, 1);
  assert.strictEqual(JSON.parse(calls[0].init.body).p_country, "MX");
});

test("metrics registra aunque el país no se resuelva (trace caído)", async () => {
  const { calls } = await runMetrics({ trace: "fail" });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(JSON.parse(calls[0].init.body).p_country, "");
});

test("metrics respeta Do Not Track", async () => {
  const { calls, traceCalls } = await runMetrics({ dnt: "1" });
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(traceCalls, 0);
});

/* ---------- eventos de engagement (Story 1.9) ---------- */

test("engagement: sanitizeEvent solo deja campos allowlisted; evento desconocido = null", async () => {
  const { WC } = await runMetrics();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(WC.metrics.sanitizeEvent("opportunity_viewed", { state: "pending_pick", reason: "captain", evil: "PII" }))),
    { event: "opportunity_viewed", fields: { state: "pending_pick", reason: "captain" } }
  );
  assert.strictEqual(WC.metrics.sanitizeEvent("evento_inventado", { x: 1 }), null);
});

test("engagement: track postea al RPC validado con campos saneados", async () => {
  const r = await runMetrics();
  const before = r.calls.length;
  r.WC.metrics.track("opportunity_cta_clicked", { reason: "captain", leak: "no" });
  const ev = r.calls.slice(before).find(function (c) { return /record_engagement_event/.test(c.url); });
  assert.ok(ev, "debe postear a record_engagement_event");
  const body = JSON.parse(ev.init.body);
  assert.strictEqual(body.p_event, "opportunity_cta_clicked");
  assert.deepStrictEqual(body.p_fields, { reason: "captain" });
});

test("engagement: post_match_summary_viewed permite movement y scope", async () => {
  const { WC } = await runMetrics();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(WC.metrics.sanitizeEvent("post_match_summary_viewed", { movement: "none", scope: "matchday", text: "no" }))),
    { event: "post_match_summary_viewed", fields: { movement: "none", scope: "matchday" } }
  );
});

test("engagement: live_ranking_viewed usa has_personal_impact booleano", async () => {
  const r = await runMetrics();
  const before = r.calls.length;
  r.WC.metrics.track("live_ranking_viewed", { has_personal_impact: true, impact: "personal" });
  const ev = r.calls.slice(before).find(function (c) { return /record_engagement_event/.test(c.url); });
  assert.ok(ev, "debe postear live_ranking_viewed");
  const body = JSON.parse(ev.init.body);
  assert.strictEqual(body.p_event, "live_ranking_viewed");
  assert.deepStrictEqual(body.p_fields, { has_personal_impact: true });
});

test("engagement: eventos de vista no se repiten en el mismo contexto", async () => {
  const r = await runMetrics();
  const before = r.calls.length;
  r.WC.metrics.track("opportunity_viewed", { state: "pending_pick", reason: "pending_pick" });
  r.WC.metrics.track("opportunity_viewed", { state: "pending_pick", reason: "pending_pick" });
  const views = r.calls.slice(before).filter(function (c) { return /record_engagement_event/.test(c.url); });
  assert.strictEqual(views.length, 1);
});

test("engagement: bajo Do Not Track no se expone WC.metrics", async () => {
  const { WC } = await runMetrics({ dnt: "1" });
  assert.strictEqual(WC.metrics, undefined);
});
