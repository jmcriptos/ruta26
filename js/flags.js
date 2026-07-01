/* Banderas redondas (circle-flags). Dual-environment (browser + node:test). */
(function (root) {
  // código de equipo (3 letras, campo team.code) → archivo de bandera redonda
  // (ISO 3166-1 alpha-2 en minúscula, con casos especiales gb-eng / gb-sct).
  const FLAG_CODE = {
    GER: "de", KSA: "sa", ALG: "dz", ARG: "ar", AUS: "au", AUT: "at", BEL: "be", BIH: "ba",
    BRA: "br", CPV: "cv", CAN: "ca", QAT: "qa", CZE: "cz", COL: "co", KOR: "kr", CIV: "ci",
    CRO: "hr", CUW: "cw", ECU: "ec", EGY: "eg", SCO: "gb-sct", ESP: "es", USA: "us", FRA: "fr",
    GHA: "gh", HAI: "ht", ENG: "gb-eng", IRQ: "iq", IRN: "ir", JPN: "jp", JOR: "jo", MAR: "ma",
    MEX: "mx", NOR: "no", NZL: "nz", NED: "nl", PAN: "pa", PAR: "py", POR: "pt", COD: "cd",
    SEN: "sn", RSA: "za", SWE: "se", SUI: "ch", TUN: "tn", TUR: "tr", URU: "uy", UZB: "uz"
  };
  function flagFile(code) { return FLAG_CODE[code] || null; }
  function flagSrc(team) {
    const f = team && flagFile(team.code);
    return f ? "assets/flags/" + f + ".svg" : null;
  }
  const flags = { FLAG_CODE: FLAG_CODE, flagFile: flagFile, flagSrc: flagSrc };
  root.WC = root.WC || {};
  root.WC.flags = flags;
  if (typeof module !== "undefined" && module.exports) module.exports = flags;
})(typeof window !== "undefined" ? window : globalThis);
