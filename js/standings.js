(function (root) {
  function computeGroups(matches, teams) {
    const tables = {};
    const rows = {};
    Object.keys(teams).forEach(function (id) {
      const t = teams[id];
      if (!t.group) return;
      const row = { teamId: id, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0 };
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
      if (m.hs > m.as) { h.pts += 3; h.pg++; a.pp++; }
      else if (m.hs < m.as) { a.pts += 3; a.pg++; h.pp++; }
      else { h.pts++; a.pts++; h.pe++; a.pe++; }
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

  // opts.provisional: en slots de grupo aún sin cerrar, devuelve el equipo que
  // va en esa posición ahora (marcado provisional) en vez del placeholder.
  function resolveSlot(ph, ctx, opts) {
    if (!ph) return { teamId: null, label: "", provisional: false };
    let m;
    if ((m = ph.match(/^([12])([A-L])$/))) {
      const pos = Number(m[1]), g = m[2];
      const table = ctx.tables[g];
      if (groupFinished(g, ctx.tables)) return { teamId: table[pos - 1].teamId, label: "", provisional: false };
      if (opts && opts.provisional && table && table.some(function (r) { return r.pj > 0; })) {
        return { teamId: table[pos - 1].teamId, label: pos + "º grupo " + g, provisional: true };
      }
      return { teamId: null, label: pos + "º grupo " + g, provisional: false };
    }
    if ((m = ph.match(/^3([A-L]+)$/))) {
      // La asignación real de terceros la entrega la API (Home/Away del partido); aquí solo etiqueta.
      return { teamId: null, label: "Mejor 3º " + m[1].split("").join("/"), provisional: false };
    }
    if ((m = ph.match(/^W(\d+)$/))) {
      const prev = ctx.matchesByNum[Number(m[1])];
      if (prev && prev.status === "played" && prev.winner) return { teamId: prev.winner, label: "", provisional: false };
      return { teamId: null, label: "Gana P" + m[1], provisional: false };
    }
    if ((m = ph.match(/^RU(\d+)$/))) {
      const prev = ctx.matchesByNum[Number(m[1])];
      if (prev && prev.status === "played" && prev.winner) {
        return { teamId: prev.winner === prev.home ? prev.away : prev.home, label: "", provisional: false };
      }
      return { teamId: null, label: "Pierde P" + m[1], provisional: false };
    }
    return { teamId: null, label: ph, provisional: false };
  }

  function nextMatch(num, koMatches) {
    return koMatches.find(function (x) { return x.phA === "W" + num || x.phB === "W" + num; }) || null;
  }

  function chainFrom(match, koMatches) {
    const route = [];
    const seen = new Set(); // datos en vivo malformados no deben colgar el walk
    let cur = match;
    while (cur && !seen.has(cur.num)) {
      seen.add(cur.num);
      route.push(cur);
      cur = nextMatch(cur.num, koMatches);
    }
    return route; // el 3er puesto nunca entra: solo se llega vía RU
  }

  function teamRoute(teamId, scenario, data) {
    const team = data.teams[teamId];
    if (!team) return { mode: "scenario", eliminated: false, segments: [] };
    const ko = data.matches.filter(function (x) { return x.stage !== "group" && x.stage !== "third"; });
    const real = ko.filter(function (x) { return x.home === teamId || x.away === teamId; });
    if (real.length) {
      const eliminated = real.some(function (x) {
        return x.status === "played" && x.winner && x.winner !== teamId;
      });
      const last = real[real.length - 1];
      const tail = eliminated ? [] : chainFrom(last, ko).slice(1);
      return { mode: "real", eliminated: eliminated, segments: [{ certain: true, matches: real.concat(tail) }] };
    }
    const entries = ko.filter(function (x) {
      if (scenario === 3) {
        return [x.phA, x.phB].some(function (p) { return p && /^3[A-L]+$/.test(p) && p.indexOf(team.group) !== -1; });
      }
      return x.phA === String(scenario) + team.group || x.phB === String(scenario) + team.group;
    });
    return {
      mode: "scenario", eliminated: false,
      segments: entries.map(function (e) { return { certain: scenario !== 3, matches: chainFrom(e, ko) }; })
    };
  }

  function groupStageEliminated(teamId, data) {
    const team = data.teams[teamId];
    if (!team) return false;
    const inKO = data.matches.some(function (m) {
      return m.stage !== "group" && (m.home === teamId || m.away === teamId);
    });
    if (inKO) return false; // ya está en el bracket real
    if (!groupFinished(team.group, data.tables)) return false;
    const rows = data.tables[team.group] || [];
    const idx = rows.findIndex(function (r) { return r.teamId === teamId; });
    if (idx === 3) return true;
    if (idx === 2) {
      const allDone = Object.keys(data.tables).every(function (g) { return groupFinished(g, data.tables); });
      if (!allDone) return false;
      const third = (data.thirds || []).find(function (t) { return t.teamId === teamId; });
      return Boolean(third) && !third.qualifies;
    }
    return false;
  }

  // Lado del cuadro al que pertenece un partido KO: sigue la cadena de ganadores
  // (W##) hasta la semifinal 101 (izquierda) o 102 (derecha). La final y los
  // partidos desconocidos devuelven null.
  function bracketSide(matchNum, matchesByNum) {
    let cur = matchesByNum[matchNum];
    const seen = {};
    while (cur && !seen[cur.num]) {
      if (cur.num === 101) return "left";
      if (cur.num === 102) return "right";
      seen[cur.num] = true;
      const next = Object.keys(matchesByNum).map(function (k) { return matchesByNum[k]; })
        .find(function (x) { return x.phA === "W" + cur.num || x.phB === "W" + cur.num; });
      cur = next || null;
    }
    return null;
  }

  const standings = { computeGroups: computeGroups, groupFinished: groupFinished, rankThirds: rankThirds, resolveSlot: resolveSlot, teamRoute: teamRoute, groupStageEliminated: groupStageEliminated, bracketSide: bracketSide };
  root.WC = root.WC || {};
  root.WC.standings = standings;
  if (typeof module !== "undefined" && module.exports) module.exports = standings;
})(typeof window !== "undefined" ? window : globalThis);
