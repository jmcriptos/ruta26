#!/usr/bin/env node
/* Genera js/thirds-allocation.js desde la tabla oficial FIFA (495 combinaciones)
   publicada en Wikipedia (Template:2026 FIFA World Cup third-place table).
   Uso: node tools/generate-thirds-allocation.js
   Re-ejecutable; valida invariantes y falla ruidosamente. */
const fs = require("fs");
const path = require("path");

const WINNERS = ["A", "B", "D", "E", "G", "I", "K", "L"]; // orden de columnas 1A..1L
const SRC = "https://en.wikipedia.org/w/api.php?action=parse&page=Template:2026_FIFA_World_Cup_third-place_table&prop=wikitext&format=json&formatversion=2";

async function main() {
  const res = await fetch(SRC, { headers: { "User-Agent": "ruta26-thirds-allocation/1.0 (https://jmcriptos.github.io/ruta26)" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " al traer la tabla");
  const wt = (await res.json()).parse.wikitext;

  // Orden real de las columnas de ganador (1A..1L) leído del encabezado, para no
  // depender de un orden alfabético asumido: si Wikipedia reordena, falla ruidoso.
  const hEnd = wt.search(/\n\|-\s*\n!\s*scope="row"/);
  const header = hEnd >= 0 ? wt.slice(0, hEnd) : "";
  const cols = (header.match(/1([A-L])\s*<br\s*\/?>\s*vs/g) || []).map(function (s) { return s.match(/1([A-L])/)[1]; });
  if (cols.length !== 8 || cols.slice().sort().join("") !== WINNERS.slice().sort().join("")) {
    throw new Error("orden de columnas inesperado: [" + cols.join(",") + "]");
  }

  const blocks = wt.split(/\n\|-/).filter(function (b) { return /scope="row"/.test(b); });
  const alloc = {};
  blocks.forEach(function (b) {
    const no = (b.match(/scope="row"\s*\|\s*(\d+)/) || [])[1];
    const key = (b.match(/'''([A-L])'''/g) || []).map(function (s) { return s.replace(/'/g, ""); });
    const asg = (b.match(/\b3([A-L])\b/g) || []).map(function (s) { return s.slice(1); });
    if (key.length !== 8 || asg.length !== 8) throw new Error("fila " + no + ": key=" + key.length + " asg=" + asg.length);
    const keyStr = key.slice().sort().join("");
    const map = {};
    cols.forEach(function (w, i) { map[w] = asg[i]; });
    const vals = WINNERS.map(function (w) { return map[w]; });
    if (new Set(vals).size !== 8) throw new Error("fila " + no + " (" + keyStr + "): terceros repetidos");
    if (vals.slice().sort().join("") !== keyStr) throw new Error("fila " + no + " (" + keyStr + "): asignados != clave");
    if (alloc[keyStr]) throw new Error("clave duplicada " + keyStr);
    alloc[keyStr] = map;
  });

  const n = Object.keys(alloc).length;
  if (n !== 495) throw new Error("se esperaban 495 combinaciones, hay " + n);

  const lines = Object.keys(alloc).sort().map(function (k) {
    return "  " + JSON.stringify(k) + ": " + JSON.stringify(alloc[k]);
  });
  const out =
    "/* Generado por tools/generate-thirds-allocation.js - no editar a mano.\n" +
    "   Tabla oficial FIFA de asignacion de terceros a dieciseisavos (495 combinaciones).\n" +
    "   Clave: los 8 grupos cuyos terceros clasifican (ordenados).\n" +
    "   Valor: { grupoGanador: grupoTercero } para 74(E) 77(I) 79(A) 80(L) 81(D) 82(G) 85(B) 87(K).\n" +
    "   Fuente: Wikipedia Template:2026 FIFA World Cup third-place table. */\n" +
    "(function (root) {\n" +
    "  var ALLOC = {\n" +
    lines.join(",\n") + "\n" +
    "  };\n" +
    "  root.WC = root.WC || {};\n" +
    "  root.WC.thirdsAllocation = ALLOC;\n" +
    "  if (typeof module !== \"undefined\" && module.exports) module.exports = ALLOC;\n" +
    "})(typeof window !== \"undefined\" ? window : globalThis);\n";

  const dest = path.join(__dirname, "..", "js", "thirds-allocation.js");
  fs.writeFileSync(dest, out);
  console.log("OK: " + n + " combinaciones -> js/thirds-allocation.js");
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
