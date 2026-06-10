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

  function rankThirds(tables) {
    const thirds = Object.keys(tables).sort().map(function (g) {
      return Object.assign({ group: g }, tables[g][2]);
    });
    thirds.sort(function (x, y) {
      return y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || (x.group < y.group ? -1 : 1);
    });
    thirds.forEach(function (t, i) { t.qualifies = i < 8; });
    return thirds;
  }

  function resolveSlot(ph, ctx) {
    if (!ph) return { teamId: null, label: "" };
    let m;
    if ((m = ph.match(/^([12])([A-L])$/))) {
      const pos = Number(m[1]), g = m[2];
      if (groupFinished(g, ctx.tables)) return { teamId: ctx.tables[g][pos - 1].teamId, label: "" };
      return { teamId: null, label: pos + "º grupo " + g };
    }
    if ((m = ph.match(/^3([A-L]+)$/))) {
      // La asignación real de terceros la entrega la API (Home/Away del partido); aquí solo etiqueta.
      return { teamId: null, label: "Mejor 3º " + m[1].split("").join("/") };
    }
    if ((m = ph.match(/^W(\d+)$/))) {
      const prev = ctx.matchesByNum[Number(m[1])];
      if (prev && prev.status === "played" && prev.winner) return { teamId: prev.winner, label: "" };
      return { teamId: null, label: "Gana P" + m[1] };
    }
    if ((m = ph.match(/^RU(\d+)$/))) {
      const prev = ctx.matchesByNum[Number(m[1])];
      if (prev && prev.status === "played" && prev.winner) {
        return { teamId: prev.winner === prev.home ? prev.away : prev.home, label: "" };
      }
      return { teamId: null, label: "Pierde P" + m[1] };
    }
    return { teamId: null, label: ph };
  }

  const standings = { computeGroups: computeGroups, groupFinished: groupFinished, rankThirds: rankThirds, resolveSlot: resolveSlot };
  root.WC = root.WC || {};
  root.WC.standings = standings;
  if (typeof module !== "undefined" && module.exports) module.exports = standings;
})(typeof window !== "undefined" ? window : globalThis);
