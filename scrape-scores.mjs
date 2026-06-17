#!/usr/bin/env node
// ============================================================================
// World Cup 2026 — score scraper
// Pulls all WC matches from football-data.org and upserts them into Supabase.
//
// Run:   node --env-file=.env scrape-scores.mjs
// Needs (in .env):  FOOTBALL_DATA_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Idempotent: upserts on the football-data match id (ext_id), so re-running
// just refreshes scores. Safe to put on a cron during the tournament.
// ============================================================================

const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

for (const [k, v] of Object.entries({
  FOOTBALL_DATA_TOKEN: FD_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY: SERVICE_KEY,
})) {
  if (!v) {
    console.error(
      `Missing env var ${k}. Copy .env.example to .env and fill it in.`,
    );
    process.exit(1);
  }
}

// --- Canonical names + aliases (kept in sync with the TEAMS/ALIAS maps in
//     wc2026-table.html). If a feed name doesn't map, it's logged so you can
//     add an alias here. -------------------------------------------------------
const TEAMS = new Set([
  "Mexico",
  "South Africa",
  "South Korea",
  "Czech Republic",
  "Canada",
  "Bosnia and Herzegovina",
  "Qatar",
  "Switzerland",
  "Brazil",
  "Morocco",
  "Haiti",
  "Scotland",
  "United States",
  "Paraguay",
  "Australia",
  "Turkey",
  "Germany",
  "Curacao",
  "Ivory Coast",
  "Ecuador",
  "Netherlands",
  "Japan",
  "Sweden",
  "Tunisia",
  "Belgium",
  "Egypt",
  "Iran",
  "New Zealand",
  "Spain",
  "Cape Verde",
  "Saudi Arabia",
  "Uruguay",
  "France",
  "Senegal",
  "Iraq",
  "Norway",
  "Argentina",
  "Algeria",
  "Austria",
  "Jordan",
  "Portugal",
  "DR Congo",
  "Uzbekistan",
  "Colombia",
  "England",
  "Croatia",
  "Ghana",
  "Panama",
]);

const ALIAS = {
  USA: "United States",
  US: "United States",
  "United States of America": "United States",
  "Korea Republic": "South Korea",
  "Republic of Korea": "South Korea",
  "Korea, South": "South Korea",
  "IR Iran": "Iran",
  "Iran (Islamic Republic of)": "Iran",
  Türkiye: "Turkey",
  Turkiye: "Turkey",
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  CIV: "Ivory Coast",
  Curaçao: "Curacao",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  Bosnia: "Bosnia and Herzegovina",
  "Congo DR": "DR Congo",
  "Democratic Republic of the Congo": "DR Congo",
  "Congo (DR)": "DR Congo",
  "DR Congo": "DR Congo",
  Czechia: "Czech Republic",
  "Cabo Verde": "Cape Verde",
  "Cape Verde Islands": "Cape Verde",
  KSA: "Saudi Arabia",
};

const COMBINING = /[̀-ͯ]/g; // diacritic marks, stripped for matching
const norm = (x) =>
  x
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(/[’‘`´]/g, "'") // unify curly/straight apostrophes
    .toLowerCase()
    .trim();

function canon(n) {
  if (n == null) return "";
  const s = String(n).trim();
  if (ALIAS[s]) return ALIAS[s];
  const ns = norm(s);
  for (const k in ALIAS) if (norm(k) === ns) return ALIAS[k];
  for (const k of TEAMS) if (norm(k) === ns) return k;
  return s; // unmapped — returned as-is so the caller can detect it
}

// --- Fetch matches from football-data.org -----------------------------------
async function fetchMatches() {
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    {
      headers: { "X-Auth-Token": FD_TOKEN },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `football-data.org HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const json = await res.json();
  return json.matches || [];
}

// "GROUP_A" / "Group A" -> "A"; knockout stages -> null
function groupLetter(g) {
  if (!g) return null;
  const m = String(g).match(/([A-L])\s*$/i);
  return m ? m[1].toUpperCase() : null;
}

function toRow(m) {
  const home = canon(m.homeTeam?.name);
  const away = canon(m.awayTeam?.name);
  return {
    ext_id: m.id,
    grp: groupLetter(m.group),
    stage: m.stage || null,
    team1: home,
    team2: away,
    score1: m.score?.fullTime?.home ?? null,
    score2: m.score?.fullTime?.away ?? null,
    status:
      m.status === "FINISHED"
        ? "finished"
        : String(m.status || "").toLowerCase(),
    kickoff: m.utcDate || null,
    _homeRaw: m.homeTeam?.name,
    _awayRaw: m.awayTeam?.name,
  };
}

// --- Upsert into Supabase (PostgREST), keyed on ext_id ----------------------
async function upsert(rows) {
  const payload = rows.map(({ _homeRaw, _awayRaw, ...r }) => r);
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/matches?on_conflict=ext_id`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Supabase upsert HTTP ${res.status}: ${body.slice(0, 300)}`,
    );
  }
}

// Current rows in the DB, keyed by ext_id, so we can write only what changed
// (keeps updated_at meaningful). On any failure we return an empty map, which
// makes the caller treat everything as new and write it all (safe fallback).
async function fetchExisting() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/matches?select=ext_id,score1,score2,status,team1,team2,grp,stage`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!res.ok) return new Map();
    const rows = await res.json();
    return new Map(rows.map((r) => [r.ext_id, r]));
  } catch {
    return new Map();
  }
}

async function main() {
  const matches = await fetchMatches();
  console.log(`Fetched ${matches.length} matches from football-data.org`);

  const rows = matches.map(toRow);

  // Drop rows where a team name isn't known yet (TBD knockout slots) or didn't
  // map to a canonical name. Collect unmapped names so aliases can be added.
  const unmapped = new Set();
  const keep = rows.filter((r) => {
    const okHome = TEAMS.has(r.team1);
    const okAway = TEAMS.has(r.team2);
    if (r._homeRaw && !okHome) unmapped.add(r._homeRaw);
    if (r._awayRaw && !okAway) unmapped.add(r._awayRaw);
    return okHome && okAway;
  });

  if (unmapped.size) {
    console.warn(
      `\n⚠️  ${unmapped.size} team name(s) didn't map — add them to ALIAS:\n   ` +
        [...unmapped].map((n) => `"${n}"`).join(", "),
    );
  }

  if (!keep.length) {
    console.log("No matches with known teams to write yet. Done.");
    return;
  }

  // Write only rows that are new or whose data actually changed, so the DB's
  // updated_at reflects real match-data changes rather than every run.
  const existing = await fetchExisting();
  const changed = keep.filter((r) => {
    const e = existing.get(r.ext_id);
    if (!e) return true; // new match
    return (
      e.score1 !== r.score1 ||
      e.score2 !== r.score2 ||
      e.status !== r.status ||
      e.team1 !== r.team1 ||
      e.team2 !== r.team2 ||
      e.grp !== r.grp ||
      e.stage !== r.stage
    );
  });

  if (!changed.length) {
    console.log("No changes since last run. Done.");
    return;
  }

  await upsert(changed);

  const played = changed.filter(
    (r) => r.score1 != null && r.score2 != null,
  ).length;
  console.log(
    `\n✅ Upserted ${changed.length} changed match(es) ` +
      `(${played} with a final score) into Supabase.`,
  );
}

main().catch((e) => {
  console.error("\n❌ " + e.message);
  process.exit(1);
});
