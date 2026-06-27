/* Vista pura: tarjeta "Mejores terceros". Sin DOM, testeable sola.
   Depende solo del array que entrega WC.standings.rankThirds. */
(function (root) {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // thirds: array de rankThirds (teamId, group, pts, pj, pg, pe, pp, dg, qualifies)
  // teamById: mapa id -> { name, flag }
  // Devuelve el HTML de la tarjeta, o "" si aún no hay datos útiles.
  function renderThirds(thirds, teamById) {
    const list = (thirds || []).filter(function (t) { return t && t.teamId; });
    if (!list.length || !list.some(function (t) { return t.pj > 0; })) return "";
    const lookup = teamById || {};
    const head = '<div class="gt-row gt-head">' +
      '<span class="gt-pos">#</span><span class="gt-team">Mejores terceros</span>' +
      '<span>PJ</span><span>PG</span><span>PE</span><span>PP</span><span>DG</span>' +
      '<span class="gt-pts">PTS</span></div>';
    const rows = list.map(function (t, i) {
      const tm = lookup[t.teamId] || { name: "Por definir", flag: "" };
      const prov = t.pj < 3;
      const dg = (t.dg > 0 ? "+" : "") + t.dg;
      const cut = i === 8
        ? '<div class="thirds-cut"><span>Clasifican los 8 mejores</span></div>'
        : "";
      return cut +
        '<button class="gt-row gt-team-row' + (t.qualifies ? " qualifying" : "") +
        '" data-team-id="' + esc(t.teamId) + '">' +
        '<span class="gt-pos">' + (i + 1) + '</span>' +
        '<span class="gt-team"><i>' + esc(tm.flag) + '</i><em>' + esc(tm.name) + '</em>' +
        '<small class="t3-grp">Gr. ' + esc(t.group) + (prov ? ' *' : '') + '</small></span>' +
        '<span>' + t.pj + '</span><span>' + t.pg + '</span><span>' + t.pe + '</span>' +
        '<span>' + t.pp + '</span><span>' + dg + '</span>' +
        '<span class="gt-pts">' + t.pts + '</span></button>';
    }).join("");
    const note = '<p class="thirds-note">* Grupo aún en curso. ' +
      'Clasificación provisional hasta cerrar la fase de grupos.</p>';
    return '<article class="group-card thirds-card"><div class="group-table">' +
      head + rows + '</div>' + note + '</article>';
  }

  const thirdsView = { renderThirds: renderThirds };
  root.WC = root.WC || {};
  root.WC.thirdsView = thirdsView;
  if (typeof module !== "undefined" && module.exports) module.exports = thirdsView;
})(typeof window !== "undefined" ? window : globalThis);
