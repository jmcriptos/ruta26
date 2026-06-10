// Uso: node tools/generate-data.js
// Descarga el calendario FIFA 2026 y escribe js/data.js (snapshot embebido).
const fs = require("fs");
const path = require("path");
const api = require("../js/api.js");

const FLAGS = {
  ALG: "🇩🇿", ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BIH: "🇧🇦",
  BRA: "🇧🇷", CAN: "🇨🇦", CIV: "🇨🇮", COD: "🇨🇩", COL: "🇨🇴", CPV: "🇨🇻",
  CRO: "🇭🇷", CUW: "🇨🇼", CZE: "🇨🇿", ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  ESP: "🇪🇸", FRA: "🇫🇷", GER: "🇩🇪", GHA: "🇬🇭", HAI: "🇭🇹", IRN: "🇮🇷",
  IRQ: "🇮🇶", JOR: "🇯🇴", JPN: "🇯🇵", KOR: "🇰🇷", KSA: "🇸🇦", MAR: "🇲🇦",
  MEX: "🇲🇽", NED: "🇳🇱", NOR: "🇳🇴", NZL: "🇳🇿", PAN: "🇵🇦", PAR: "🇵🇾",
  POR: "🇵🇹", QAT: "🇶🇦", RSA: "🇿🇦", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", SEN: "🇸🇳", SUI: "🇨🇭",
  SWE: "🇸🇪", TUN: "🇹🇳", TUR: "🇹🇷", URU: "🇺🇾", USA: "🇺🇸", UZB: "🇺🇿"
};
// La API usa nombres largos/oficiales; el sitio usa estos (coinciden con el diseño actual):
const NAME_OVERRIDES = {
  CUW: "Curaçao", USA: "Estados Unidos", IRN: "Irán", KOR: "Corea del Sur",
  CPV: "Cabo Verde", COD: "R. D. del Congo", KSA: "Arabia Saudita"
};
const HOSTS = ["MEX", "CAN", "USA"];

(async function () {
  const res = await fetch(api.ENDPOINT);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const raw = (await res.json()).Results;
  const matches = raw.map(api.normalize).sort(function (a, b) { return a.num - b.num; });

  const teams = {};
  raw.forEach(function (rm) {
    const nm = api.normalize(rm);
    ["Home", "Away"].forEach(function (side) {
      const t = rm[side];
      if (!t || !t.IdTeam) return;
      if (!teams[t.IdTeam]) {
        teams[t.IdTeam] = {
          id: t.IdTeam,
          code: t.Abbreviation,
          name: NAME_OVERRIDES[t.Abbreviation] || t.TeamName[0].Description,
          flag: FLAGS[t.Abbreviation] || null,
          group: null,
          host: HOSTS.indexOf(t.Abbreviation) !== -1
        };
      }
      if (nm.stage === "group" && nm.group) teams[t.IdTeam].group = nm.group;
    });
  });

  const list = Object.values(teams);
  const sinBandera = list.filter(function (t) { return !t.flag; });
  if (sinBandera.length) throw new Error("Sin bandera: " + sinBandera.map(function (t) { return t.code; }).join(", "));
  if (list.length !== 48) throw new Error("Esperaba 48 equipos, hay " + list.length);
  if (matches.length !== 104) throw new Error("Esperaba 104 partidos, hay " + matches.length);
  if (list.some(function (t) { return !t.group; })) throw new Error("Equipo sin grupo");

  const out = "// Generado por tools/generate-data.js el " + new Date().toISOString() + " — no editar a mano.\n" +
    "window.WC = window.WC || {};\n" +
    "WC.SNAPSHOT = " + JSON.stringify({ generatedAt: new Date().toISOString(), teams: teams, matches: matches }) + ";\n";
  fs.writeFileSync(path.join(__dirname, "..", "js", "data.js"), out);
  console.log("OK: " + matches.length + " partidos, " + list.length + " equipos → js/data.js");
})();
