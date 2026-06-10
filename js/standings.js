(function (root) {
  function computeGroups(matches, teams) {
    const tables = {};
    const rows = {};
    Object.keys(teams).forEach(function (id) {
      const t = teams[id];
      if (!t.group) return;
      const row = { teamId: id, pts: 0, pj: 0, gf: 0, gc: 0, dg: 0 };
      rows[id] = row;
      (tables[t.group] = tables[t.group] || []).push(row);
    });
    matches.forEach(function (m) {
      if (m.stage !== "group" || m.status !== "played" || m.hs == null) return;
      const h = rows[m.home], a = rows[m.away];
      if (!h || !a) return;
      h.pj++; a.pj++;
      h.gf += m.hs; h.gc += m.as;
      a.gf += m.as; a.gc += m.hs;
      if (m.hs > m.as) h.pts += 3;
      else if (m.hs < m.as) a.pts += 3;
      else { h.pts++; a.pts++; }
    });
    Object.keys(tables).forEach(function (g) {
      tables[g].forEach(function (r) { r.dg = r.gf - r.gc; });
      tables[g].sort(function (x, y) {
        return y.pts - x.pts || y.dg - x.dg || y.gf - x.gf ||
          teams[x.teamId].name.localeCompare(teams[y.teamId].name, "es");
      });
    });
    return tables;
  }

  function groupFinished(group, tables) {
    return Boolean(tables[group]) && tables[group].every(function (r) { return r.pj === 3; });
  }

  const standings = { computeGroups: computeGroups, groupFinished: groupFinished };
  root.WC = root.WC || {};
  root.WC.standings = standings;
  if (typeof module !== "undefined" && module.exports) module.exports = standings;
})(typeof window !== "undefined" ? window : globalThis);
