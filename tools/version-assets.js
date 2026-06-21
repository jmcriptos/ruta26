/* Versiona assets locales en HTML: reescribe ?v= con un hash de contenido.
   Puro y testeable: versionHtml(html, resolveHash). El CLI hashea desde disco. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HTML_FILES = ["index.html", "stats.html", "como-jugar.html"];

// Reescribe src/href locales a .js/.css/.html poniendo ?v=<hash>.
// resolveHash(relPath) → string | null (null = externa/desconocida → sin cambios).
function versionHtml(html, resolveHash) {
  return String(html).replace(/\b(src|href)="([^"]+)"/g, function (full, attr, url) {
    if (/^(https?:)?\/\//i.test(url)) return full;            // externa o //cdn
    const q = url.indexOf("?");
    const file = q < 0 ? url : url.slice(0, q);
    const query = q < 0 ? "" : url.slice(q + 1);
    if (!/\.(js|css|html)$/i.test(file)) return full;          // solo assets versionables
    const hash = resolveHash(file);
    if (!hash) return full;
    const params = new URLSearchParams(query);
    params.set("v", hash);
    return attr + '="' + file + "?" + params.toString() + '"';
  });
}

function hashFile(absPath) {
  return crypto.createHash("md5").update(fs.readFileSync(absPath)).digest("hex").slice(0, 10);
}

function run(root) {
  root = root || process.cwd();
  HTML_FILES.forEach(function (name) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) return;
    const html = fs.readFileSync(p, "utf8");
    const out = versionHtml(html, function (rel) {
      const target = path.join(root, rel);
      if (!fs.existsSync(target)) {
        console.warn("[version-assets] " + name + ": ref no encontrada → " + rel + " (sin cambios)");
        return null;
      }
      return hashFile(target);
    });
    if (out !== html) {
      fs.writeFileSync(p, out);
      console.log("[version-assets] " + name + ": versionado");
    } else {
      console.log("[version-assets] " + name + ": sin cambios");
    }
  });
}

module.exports = { versionHtml: versionHtml, hashFile: hashFile, run: run };

if (require.main === module) run();
