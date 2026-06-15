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
  return { calls: calls, traceCalls: traceCalls };
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
