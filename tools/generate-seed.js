// Uso: node tools/generate-seed.js
// Genera tools/seed-matches.sql con los 104 partidos desde el snapshot.
const fs = require("fs");
const path = require("path");
global.window = global;
require("../js/data.js");

const matches = global.WC.SNAPSHOT.matches;
if (matches.length !== 104) throw new Error("Esperaba 104 partidos, hay " + matches.length);

const values = matches.map(function (m) {
  return "('" + m.id + "', '" + m.date + "', '" + m.stage + "')";
});
const sql = "-- Generado por tools/generate-seed.js — pegar en el SQL Editor de Supabase.\n" +
  "insert into public.matches (id, kickoff_at, stage) values\n" +
  values.join(",\n") +
  "\non conflict (id) do update set kickoff_at = excluded.kickoff_at, stage = excluded.stage;\n";
fs.writeFileSync(path.join(__dirname, "seed-matches.sql"), sql);
console.log("OK: " + matches.length + " partidos → tools/seed-matches.sql");
