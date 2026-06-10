const groups = [
  { id: "A", teams: [["México", "🇲🇽", true], ["Sudáfrica", "🇿🇦"], ["Corea del Sur", "🇰🇷"], ["Chequia", "🇨🇿"]] },
  { id: "B", teams: [["Canadá", "🇨🇦", true], ["Bosnia y Herzegovina", "🇧🇦"], ["Catar", "🇶🇦"], ["Suiza", "🇨🇭"]] },
  { id: "C", teams: [["Brasil", "🇧🇷"], ["Marruecos", "🇲🇦"], ["Haití", "🇭🇹"], ["Escocia", "🏴"]] },
  { id: "D", teams: [["Estados Unidos", "🇺🇸", true], ["Paraguay", "🇵🇾"], ["Australia", "🇦🇺"], ["Turquía", "🇹🇷"]] },
  { id: "E", teams: [["Alemania", "🇩🇪"], ["Curaçao", "🇨🇼"], ["Costa de Marfil", "🇨🇮"], ["Ecuador", "🇪🇨"]] },
  { id: "F", teams: [["Países Bajos", "🇳🇱"], ["Japón", "🇯🇵"], ["Suecia", "🇸🇪"], ["Túnez", "🇹🇳"]] },
  { id: "G", teams: [["Bélgica", "🇧🇪"], ["Egipto", "🇪🇬"], ["Irán", "🇮🇷"], ["Nueva Zelanda", "🇳🇿"]] },
  { id: "H", teams: [["España", "🇪🇸"], ["Cabo Verde", "🇨🇻"], ["Arabia Saudita", "🇸🇦"], ["Uruguay", "🇺🇾"]] },
  { id: "I", teams: [["Francia", "🇫🇷"], ["Senegal", "🇸🇳"], ["Irak", "🇮🇶"], ["Noruega", "🇳🇴"]] },
  { id: "J", teams: [["Argentina", "🇦🇷"], ["Argelia", "🇩🇿"], ["Austria", "🇦🇹"], ["Jordania", "🇯🇴"]] },
  { id: "K", teams: [["Portugal", "🇵🇹"], ["R. D. del Congo", "🇨🇩"], ["Uzbekistán", "🇺🇿"], ["Colombia", "🇨🇴"]] },
  { id: "L", teams: [["Inglaterra", "🏴"], ["Croacia", "🇭🇷"], ["Ghana", "🇬🇭"], ["Panamá", "🇵🇦"]] }
];

const fixtures = [
  { date: "11 JUN", day: "JUE", group: "A", time: "15:00", venue: "Ciudad de México", home: ["México", "🇲🇽"], away: ["Sudáfrica", "🇿🇦"] },
  { date: "11 JUN", day: "JUE", group: "A", time: "22:00", venue: "Guadalajara", home: ["Corea del Sur", "🇰🇷"], away: ["Chequia", "🇨🇿"] },
  { date: "12 JUN", day: "VIE", group: "B", time: "15:00", venue: "Toronto", home: ["Canadá", "🇨🇦"], away: ["Bosnia y Herzegovina", "🇧🇦"] },
  { date: "12 JUN", day: "VIE", group: "D", time: "21:00", venue: "Los Ángeles", home: ["Estados Unidos", "🇺🇸"], away: ["Paraguay", "🇵🇾"] },
  { date: "13 JUN", day: "SÁB", group: "B", time: "15:00", venue: "San Francisco", home: ["Catar", "🇶🇦"], away: ["Suiza", "🇨🇭"] },
  { date: "13 JUN", day: "SÁB", group: "C", time: "18:00", venue: "New York / New Jersey", home: ["Brasil", "🇧🇷"], away: ["Marruecos", "🇲🇦"] },
  { date: "13 JUN", day: "SÁB", group: "C", time: "21:00", venue: "Boston", home: ["Haití", "🇭🇹"], away: ["Escocia", "🏴"] },
  { date: "13 JUN", day: "SÁB", group: "D", time: "21:00", venue: "Vancouver", home: ["Australia", "🇦🇺"], away: ["Turquía", "🇹🇷"] },
  { date: "14 JUN", day: "DOM", group: "E", time: "13:00", venue: "Houston", home: ["Alemania", "🇩🇪"], away: ["Curaçao", "🇨🇼"] },
  { date: "14 JUN", day: "DOM", group: "F", time: "16:00", venue: "Dallas", home: ["Países Bajos", "🇳🇱"], away: ["Japón", "🇯🇵"] },
  { date: "14 JUN", day: "DOM", group: "E", time: "19:00", venue: "Filadelfia", home: ["Costa de Marfil", "🇨🇮"], away: ["Ecuador", "🇪🇨"] },
  { date: "14 JUN", day: "DOM", group: "F", time: "22:00", venue: "Monterrey", home: ["Suecia", "🇸🇪"], away: ["Túnez", "🇹🇳"] },
  { date: "15 JUN", day: "LUN", group: "H", time: "12:00", venue: "Atlanta", home: ["España", "🇪🇸"], away: ["Cabo Verde", "🇨🇻"] },
  { date: "15 JUN", day: "LUN", group: "G", time: "15:00", venue: "Vancouver", home: ["Bélgica", "🇧🇪"], away: ["Egipto", "🇪🇬"] },
  { date: "15 JUN", day: "LUN", group: "H", time: "18:00", venue: "Miami", home: ["Arabia Saudita", "🇸🇦"], away: ["Uruguay", "🇺🇾"] },
  { date: "15 JUN", day: "LUN", group: "G", time: "21:00", venue: "Los Ángeles", home: ["Irán", "🇮🇷"], away: ["Nueva Zelanda", "🇳🇿"] },
  { date: "16 JUN", day: "MAR", group: "I", time: "15:00", venue: "New York / New Jersey", home: ["Francia", "🇫🇷"], away: ["Senegal", "🇸🇳"] },
  { date: "16 JUN", day: "MAR", group: "I", time: "18:00", venue: "Boston", home: ["Irak", "🇮🇶"], away: ["Noruega", "🇳🇴"] },
  { date: "16 JUN", day: "MAR", group: "J", time: "21:00", venue: "Kansas City", home: ["Argentina", "🇦🇷"], away: ["Argelia", "🇩🇿"] },
  { date: "16 JUN", day: "MAR", group: "J", time: "00:00", venue: "San Francisco", home: ["Austria", "🇦🇹"], away: ["Jordania", "🇯🇴"] },
  { date: "17 JUN", day: "MIÉ", group: "K", time: "13:00", venue: "Houston", home: ["Portugal", "🇵🇹"], away: ["R. D. del Congo", "🇨🇩"] },
  { date: "17 JUN", day: "MIÉ", group: "L", time: "16:00", venue: "Dallas", home: ["Inglaterra", "🏴"], away: ["Croacia", "🇭🇷"] },
  { date: "17 JUN", day: "MIÉ", group: "L", time: "19:00", venue: "Toronto", home: ["Ghana", "🇬🇭"], away: ["Panamá", "🇵🇦"] },
  { date: "17 JUN", day: "MIÉ", group: "K", time: "22:00", venue: "Ciudad de México", home: ["Uzbekistán", "🇺🇿"], away: ["Colombia", "🇨🇴"] }
];

const rankings = [
  ["Francia", "🇫🇷", "16.2%", "Grupo I"],
  ["Inglaterra", "🏴", "10.5%", "Grupo L"],
  ["Portugal", "🇵🇹", "9.3%", "Grupo K"],
  ["Argentina", "🇦🇷", "9.2%", "Grupo J"],
  ["Brasil", "🇧🇷", "8.1%", "Grupo C"],
  ["Alemania", "🇩🇪", "6.0%", "Grupo E"],
  ["Países Bajos", "🇳🇱", "4.4%", "Grupo F"],
  ["Noruega", "🇳🇴", "2.6%", "Grupo I"],
  ["Bélgica", "🇧🇪", "2.2%", "Grupo G"],
  ["Colombia", "🇨🇴", "1.9%", "Grupo K"],
  ["México", "🇲🇽", "1.7%", "Grupo A"],
  ["Estados Unidos", "🇺🇸", "1.7%", "Grupo D"],
  ["Japón", "🇯🇵", "1.5%", "Grupo F"],
  ["Marruecos", "🇲🇦", "1.5%", "Grupo C"]
];

const groupsGrid = document.getElementById("groupsGrid");
const matchesGrid = document.getElementById("matchesGrid");
const dateStrip = document.getElementById("dateStrip");
const noTeams = document.getElementById("noTeams");
let activeDate = "TODOS";
let visibleMatches = 6;
let activeMatchFilter = "upcoming";

function renderGroups(query = "") {
  const normalized = query.toLocaleLowerCase("es").trim();
  const filtered = groups
    .map(group => ({ ...group, teams: group.teams.filter(team => team[0].toLocaleLowerCase("es").includes(normalized)) }))
    .filter(group => group.teams.length);

  groupsGrid.innerHTML = filtered.map(group => `
    <article class="group-card">
      <div class="group-title"><strong>Grupo ${group.id}</strong><span>${group.teams.length === 4 ? "4 selecciones" : `${group.teams.length} resultado${group.teams.length > 1 ? "s" : ""}`}</span></div>
      ${group.teams.map(team => `<div class="group-team ${team[2] ? "host" : ""}"><span>${team[1]}</span>${team[0]}</div>`).join("")}
    </article>
  `).join("");
  noTeams.hidden = filtered.length > 0;
}

function renderDates() {
  const dates = [...new Map(fixtures.map(match => [match.date, match.day])).entries()];
  dateStrip.innerHTML = [
    `<button class="date-button active" data-date="TODOS"><span>Calendario</span><strong>Todos</strong></button>`,
    ...dates.map(([date, day]) => {
      const [number] = date.split(" ");
      return `<button class="date-button" data-date="${date}"><span>${day}</span><strong>${number}</strong></button>`;
    })
  ].join("");
}

function renderMatches() {
  if (activeMatchFilter === "results") {
    matchesGrid.innerHTML = "";
    document.getElementById("resultsEmpty").hidden = false;
    document.getElementById("showMoreMatches").hidden = true;
    return;
  }

  document.getElementById("resultsEmpty").hidden = true;
  const filtered = fixtures.filter(match => activeDate === "TODOS" || match.date === activeDate);
  const shown = activeDate === "TODOS" ? filtered.slice(0, visibleMatches) : filtered;

  matchesGrid.innerHTML = shown.map(match => `
    <article class="match-card">
      <div class="match-meta"><span>${match.date} · Grupo ${match.group}</span><span>${match.time}</span></div>
      <div class="team-row"><span>${match.home[0]}</span><span>${match.home[1]}</span></div>
      <div class="team-row"><span>${match.away[0]}</span><span>${match.away[1]}</span></div>
      <div class="match-bottom"><strong>${match.venue}</strong><span>PRÓXIMAMENTE</span></div>
    </article>
  `).join("");

  const showMore = document.getElementById("showMoreMatches");
  showMore.hidden = activeDate !== "TODOS" || visibleMatches >= filtered.length;
}

function renderRankings() {
  document.getElementById("rankingList").innerHTML = rankings.map((team, index) => `
    <article class="ranking-row">
      <span class="num">${String(index + 2).padStart(2, "0")}</span>
      <span class="flag">${team[1]}</span>
      <div><strong>${team[0]}</strong><small>${team[3]}</small></div>
      <span class="chance">${team[2]}</span>
    </article>
  `).join("");
}

function updateCountdown() {
  const target = new Date("2026-06-11T15:00:00-04:00").getTime();
  const distance = Math.max(0, target - Date.now());
  const values = {
    days: Math.floor(distance / 86400000),
    hours: Math.floor((distance % 86400000) / 3600000),
    minutes: Math.floor((distance % 3600000) / 60000),
    seconds: Math.floor((distance % 60000) / 1000)
  };
  Object.entries(values).forEach(([key, value]) => {
    document.getElementById(key).textContent = String(value).padStart(2, "0");
  });
}

document.getElementById("teamSearch").addEventListener("input", event => renderGroups(event.target.value));
document.getElementById("showMoreMatches").addEventListener("click", () => {
  visibleMatches += 6;
  renderMatches();
});

dateStrip.addEventListener("click", event => {
  const button = event.target.closest("[data-date]");
  if (!button) return;
  activeDate = button.dataset.date;
  dateStrip.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  renderMatches();
});

document.querySelector(".match-tabs").addEventListener("click", event => {
  const button = event.target.closest("[data-match-filter]");
  if (!button) return;
  activeMatchFilter = button.dataset.matchFilter;
  document.querySelectorAll("[data-match-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderMatches();
});

const searchOverlay = document.getElementById("searchOverlay");
const globalSearch = document.getElementById("globalSearch");
const allTeams = groups.flatMap(group => group.teams.map(team => ({ name: team[0], flag: team[1], group: group.id })));

function toggleSearch(open) {
  searchOverlay.classList.toggle("open", open);
  searchOverlay.setAttribute("aria-hidden", String(!open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) setTimeout(() => globalSearch.focus(), 100);
}

function renderGlobalSearch(query = "") {
  const normalized = query.toLocaleLowerCase("es").trim();
  const results = normalized ? allTeams.filter(team => team.name.toLocaleLowerCase("es").includes(normalized)).slice(0, 8) : allTeams.slice(0, 6);
  document.getElementById("searchResults").innerHTML = results.map(team => `
    <a class="search-result" href="#equipos" data-close-search>
      <span>${team.flag}</span><div><strong>${team.name}</strong><small>Grupo ${team.group}</small></div>
    </a>
  `).join("");
}

document.getElementById("searchToggle").addEventListener("click", () => toggleSearch(true));
document.getElementById("searchClose").addEventListener("click", () => toggleSearch(false));
searchOverlay.addEventListener("click", event => {
  if (event.target === searchOverlay || event.target.closest("[data-close-search]")) toggleSearch(false);
});
globalSearch.addEventListener("input", event => renderGlobalSearch(event.target.value));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") toggleSearch(false);
});

document.getElementById("menuToggle").addEventListener("click", () => document.querySelector(".main-nav").classList.toggle("open"));
document.querySelectorAll(".main-nav a").forEach(link => link.addEventListener("click", () => document.querySelector(".main-nav").classList.remove("open")));

const sections = [...document.querySelectorAll("main section[id]")];
const navLinks = [...document.querySelectorAll(".main-nav a")];
const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
  });
}, { rootMargin: "-35% 0px -55%" });
sections.forEach(section => sectionObserver.observe(section));

renderGroups();
renderDates();
renderMatches();
renderRankings();
renderGlobalSearch();
updateCountdown();
setInterval(updateCountdown, 1000);
