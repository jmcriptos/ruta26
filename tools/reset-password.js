/* Soporte: reasignar la contraseña de un jugador de la quiniela que la olvidó.
   La quiniela usa email sintético (jm.aceleracion+<usuario>@gmail.com) sin
   correo real, así que el "olvidé mi contraseña" del usuario no aplica: lo
   resetea el admin con la service key vía Admin API de Supabase.

   Corre en GitHub Actions (workflow reset-password.yml).
   Env: SUPABASE_SERVICE_KEY (secret), RESET_USERNAME (requerido),
        RESET_PASSWORD (opcional; si falta, se genera una temporal y se imprime),
        DRY_RUN=1 → solo verifica que el usuario existe, sin cambiar nada. */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://wwzgpifvfmogjttwstxy.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.env.DRY_RUN === "1";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

if (!SERVICE_KEY) { console.error("ERROR: falta SUPABASE_SERVICE_KEY"); process.exit(1); }

async function api(path, init) {
  return fetch(SUPABASE_URL + path, Object.assign({
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json"
    }
  }, init || {}));
}

// contraseña temporal legible: sin caracteres ambiguos (0/O, 1/l/I)
function genTemp() {
  const cs = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = require("crypto").randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += cs[b[i] % cs.length];
  return s;
}

(async function main() {
  const uname = (process.env.RESET_USERNAME || "").trim().toLowerCase();
  if (!USERNAME_RE.test(uname)) {
    console.error("Usuario inválido (3-20 caracteres: minúsculas, números o _): " + uname);
    process.exit(1);
  }
  const provided = process.env.RESET_PASSWORD || "";
  if (provided && provided.length < 6) { console.error("La contraseña debe tener al menos 6 caracteres."); process.exit(1); }
  const password = provided || genTemp();

  // id del jugador desde profiles (la service key omite RLS)
  const profRes = await api("/rest/v1/profiles?select=id,username&username=eq." + encodeURIComponent(uname));
  if (!profRes.ok) { console.error("Error leyendo profiles: HTTP " + profRes.status); process.exit(1); }
  const prof = await profRes.json();
  if (!prof.length) { console.error("No existe el usuario " + uname); process.exit(1); }
  const uid = prof[0].id;
  console.log("Usuario " + uname + " encontrado (" + uid.slice(0, 8) + "…).");

  if (DRY) { console.log("[dry-run] el usuario existe; no se cambió la contraseña."); return; }

  const upd = await api("/auth/v1/admin/users/" + uid, { method: "PUT", body: JSON.stringify({ password: password }) });
  if (!upd.ok) { console.error("Admin API " + upd.status + ": " + (await upd.text())); process.exit(1); }
  console.log("Contraseña actualizada para " + uname + ".");
  // solo se imprime si la generamos (si JM la dio, ya la conoce y no se duplica en el log)
  if (!provided) console.log("Contraseña temporal (pásala al jugador): " + password);
})().catch(function (e) { console.error(e.message || e); process.exit(1); });
