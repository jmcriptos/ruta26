const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "metrics.js"), "utf8");

function runMetrics(overrides) {
  const calls = [];
  const WC = { CONFIG: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" } };
  const context = {
    window: {
      WC: WC,
      matchMedia: function () { return { matches: false }; },
      navigator: { standalone: false },
      addEventListener: function () {}
    },
    WC: WC,
    navigator: { doNotTrack: "0" },
    document: { referrer: "" },
    location: { hash: "#inicio", hostname: "ruta26.example" },
    sessionStorage: {
      getItem: function () { return null; },
      setItem: function () {}
    },
    crypto: { randomUUID: function () { return "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"; } },
    fetch: function (url, init) {
      calls.push({ url: url, init: init });
      return Promise.resolve({ ok: true });
    },
    URL: URL
  };
  Object.assign(context, overrides || {});
  vm.runInNewContext(source, context);
  return calls;
}

test("metrics registra mediante el RPC limitado, no con INSERT directo", () => {
  const calls = runMetrics();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://example.supabase.co/rest/v1/rpc/record_page_view");
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual(body, {
    p_session_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    p_section: "#inicio",
    p_device: "desktop",
    p_standalone: false,
    p_ref: ""
  });
});

test("metrics respeta Do Not Track", () => {
  const calls = runMetrics({ navigator: { doNotTrack: "1" } });
  assert.strictEqual(calls.length, 0);
});
