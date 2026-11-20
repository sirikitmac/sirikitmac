// Builds the self-hosted profile cards as SVGs, holo-foil edition:
//   assets/hero.svg      holographic collector card + stat tiles
//   assets/stack.svg     language stack
//   assets/projects.svg  selected work
//   assets/social.svg    let's connect
// and frames the 3D contribution city with the same foil border (--frame).
// Runs daily in .github/workflows/profile-3d.yml with GITHUB_TOKEN.
// Local preview without a token: node scripts/build-cards.mjs --seed path/to/seed.json
import { readFile, writeFile, mkdir } from "node:fs/promises";

const USER = process.env.USERNAME || "sirikitmac";
const OUT = "assets";
const CITY = "profile-3d-contrib/profile-satan-animate.svg";

// Selected work — edit this list to change what shows on the profile.
const PROJECTS = [
  {
    repo: "KalSync",
    title: "KalSync",
    tagline: "See what's ahead.",
    description:
      "Community-powered road hazard reporting for Filipino road users. Live map, photo reports and community confirmations — launching in Iligan City.",
    stack: ["React", "TypeScript", "Leaflet"],
  },
  {
    repo: "sirikitvault",
    title: "SirikitVault",
    tagline: "My UI/UX stash.",
    description:
      "A curated vault of 200 UI/UX resources across 12 categories, with live previews, four view modes and favorites.",
    stack: ["Next.js", "Tailwind", "Framer Motion"],
  },
  {
    repo: "lgu-tracker",
    title: "LGU Tracker",
    tagline: "Bantay Proyekto, Gabay sa Progreso.",
    description:
      "Web-based LGU project monitoring system — track local government projects from planning to completion. CCC181 final project, Team BB.",
    stack: ["TypeScript", "PostgreSQL"],
  },
];

// ---------- palette ----------
const C = {
  bg0: "#07070d",
  bg1: "#0d0b1c",
  ink: "#07070d",
  panel: "#0b0b16",
  tile: "#11111d",
  tileStroke: "#2a2a44",
  red: "#c084fc", // accent (was red) — now holo violet
  orange: "#22d3ee", // secondary glow — cyan
  peach: "#a5b4fc", // soft accent text — lilac
  text: "#e5e7eb",
  dim: "#8b8fa8",
  white: "#ffffff",
  grey: "#9ca3af",
  lilac: "#a5b4fc",
  sky: "#7dd3fc",
  gold: "#facc15",
};
const ABBR = { TypeScript: "TS", JavaScript: "JS", PLpgSQL: "PL", CSS: "CSS", HTML: "</>", Python: "Py", Java: "J", "C++": "C++", Shell: "$" };
const FOIL = ["#7c3aed", "#22d3ee", "#4ade80", "#f472b6"];
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";

// ---------- data ----------
async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "profile-cards",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function streakFrom(days) {
  // current streak, counting back from today; an empty today doesn't break it
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].contributionCount > 0) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

async function fetchData() {
  const repoFields = PROJECTS.map(
    (p, i) => `p${i}: repository(owner: $login, name: "${p.repo}") {
      pushedAt
      languages(first: 6, orderBy: {field: SIZE, direction: DESC}) {
        totalSize edges { size node { name color } }
      }
    }`,
  ).join("\n");
  const d = await gql(
    `query($login: String!) {
      user(login: $login) {
        name login bio createdAt avatarUrl(size: 400)
        followers { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
          totalCount
          nodes { languages(first: 10) { edges { size node { name color } } } }
        }
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks { contributionDays { date contributionCount } }
          }
        }
      }
      ${repoFields}
    }`,
    { login: USER },
  );
  const u = d.user;
  const langTotals = new Map();
  for (const r of u.repositories.nodes)
    for (const e of r.languages.edges) {
      const cur = langTotals.get(e.node.name) || { size: 0, color: e.node.color };
      cur.size += e.size;
      langTotals.set(e.node.name, cur);
    }
  const totalSize = [...langTotals.values()].reduce((s, v) => s + v.size, 0) || 1;
  const langs = [...langTotals.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([name, v]) => ({ name, color: v.color || C.peach, pct: (v.size / totalSize) * 100 }));

  const avatarRes = await fetch(u.avatarUrl);
  const avatar = `data:${avatarRes.headers.get("content-type") || "image/png"};base64,${Buffer.from(
    await avatarRes.arrayBuffer(),
  ).toString("base64")}`;

  const cal = u.contributionsCollection.contributionCalendar;
  return {
    name: u.name || u.login,
    login: u.login,
    bio: u.bio || "",
    since: new Date(u.createdAt).getUTCFullYear(),
    avatar,
    followers: u.followers.totalCount,
    repos: u.repositories.totalCount,
    contributions: cal.totalContributions,
    streak: streakFrom(cal.weeks.flatMap((w) => w.contributionDays)),
    langs,
    projects: PROJECTS.map((p, i) => {
      const r = d[`p${i}`] || {};
      const total = r.languages?.totalSize || 1;
      return {
        ...p,
        pushedAt: r.pushedAt || null,
        languages: (r.languages?.edges || []).map((e) => ({
          name: e.node.name,
          color: e.node.color || C.peach,
          pct: (e.size / total) * 100,
        })),
      };
    }),
  };
}

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => Number(n).toLocaleString("en-US");
// strip a leading emoji so "👩‍💻 I.T Student" reads "I.T Student" on the card
const plainBio = (s) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();

function wrap(text, maxChars) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > maxChars) {
      lines.push(line.trim());
      line = word;
    } else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function ago(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  if (days < 30) return `updated ${days}d ago`;
  if (days < 365) return `updated ${Math.floor(days / 30)}mo ago`;
  return `updated ${Math.floor(days / 365)}y ago`;
}

// Foil gradient that slowly rotates, so borders shimmer like a holo card.
// `${id}-flat` is a static version for text and thin lines.
function foilDefs(id, cx, cy) {
  const stops = FOIL.map((c, i) => `<stop offset="${(i / (FOIL.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("");
  return `
    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx - cx}" y1="${cy - cy}" x2="${cx * 2}" y2="${cy * 2}">
      ${stops}
      <animateTransform attributeName="gradientTransform" type="rotate" values="0 ${cx} ${cy};360 ${cx} ${cy}" dur="10s" repeatCount="indefinite"/>
    </linearGradient>
    <linearGradient id="${id}-flat" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}

// A sheen bar that sweeps across a clipped area.
function sheen(id, x, y, w, h, clip, delay = 0) {
  return `
  <defs><linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient></defs>
  <g clip-path="url(#${clip})">
    <g transform="skewX(-18)">
      <rect x="${x - 220}" y="${y}" width="150" height="${h}" fill="url(#${id}-sh)">
        <animateTransform attributeName="transform" type="translate" values="0 0;${w + h + 300} 0;${w + h + 300} 0" keyTimes="0;0.55;1" dur="5s" begin="${delay}s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>`;
}

// Dark card body with a foil border — the shared look for every section.
function holoFrame(id, W, H) {
  return `
  <defs>
    ${foilDefs(`${id}-foil`, W / 2, H / 2)}
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg0}"/>
    </linearGradient>
    <radialGradient id="${id}-orb"><stop offset="0" stop-color="#7c3aed" stop-opacity="0.28"/><stop offset="1" stop-color="${C.red}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-orb2"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.14"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-title" x1="0" x2="1"><stop offset="0" stop-color="#c084fc"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#4ade80"/></linearGradient>
    <clipPath id="${id}-clip"><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="19"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>
    <ellipse cx="${W * 0.12}" cy="${H * 0.15}" rx="${W * 0.28}" ry="${H * 0.9}" fill="url(#${id}-orb)">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="6s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="${W * 0.85}" cy="${H * 0.95}" rx="${W * 0.35}" ry="${H * 0.8}" fill="url(#${id}-orb2)">
      <animate attributeName="opacity" values="1;0.6;1" dur="7s" repeatCount="indefinite"/>
    </ellipse>
  </g>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="21" fill="none" stroke="url(#${id}-foil)" stroke-width="3"/>`;
}

function svgOpen(W, H, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
  <style>@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>`;
}

// ---------- hero: holographic collector card ----------
function hero(d) {
  const W = 880, H = 460;
  const CX = 40, CY = 30, CW = 360, CH = 400;
  const top3 = d.langs.slice(0, 3);
  const rarity =
    d.contributions >= 2000 ? "LEGENDARY" : d.contributions >= 1000 ? "EPIC" : d.contributions >= 500 ? "RARE" : "COMMON";

  const langRows = top3
    .map((l, i) => {
      const y = 327 + i * 26;
      return `
      <rect x="64" y="${y}" width="20" height="20" rx="4.4" fill="${l.color}"/>
      <text x="74" y="${y + 14}" text-anchor="middle" font-family="${SANS}" font-size="8.5" font-weight="800" fill="${C.white}">${esc(ABBR[l.name] || l.name.slice(0, 2))}</text>
      <text x="94" y="${y + 15}" font-family="${SANS}" font-size="14" font-weight="600" fill="#e5e7eb">${esc(l.name)}</text>
      <text x="376" y="${y + 15}" text-anchor="end" font-family="${MONO}" font-size="13" fill="${C.lilac}">${Math.round(l.pct)} PWR</text>`;
    })
    .join("");

  const tiles = [
    [d.contributions, "CONTRIBUTIONS"],
    [d.followers, "FOLLOWERS"],
    [d.repos, "REPOS"],
    [d.streak, "DAY STREAK"],
  ]
    .map(([v, label], i) => {
      const x = 450 + (i % 2) * 196;
      const y = 200 + Math.floor(i / 2) * 96;
      return `
  <g opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.4s" begin="${0.3 + i * 0.12}s" fill="freeze"/>
    <rect x="${x}" y="${y}" width="180" height="80" rx="14" fill="${C.tile}" stroke="${C.tileStroke}"/>
    <text x="${x + 18}" y="${y + 44}" font-family="${SANS}" font-size="28" font-weight="800" fill="url(#hero-foil-flat)">${fmt(v)}</text>
    <text x="${x + 18}" y="${y + 66}" font-family="${MONO}" font-size="11" letter-spacing="1.1" fill="${C.grey}">${label}</text>
  </g>`;
    })
    .join("");

  return `${svgOpen(W, H, `${d.name}'s holographic collector card: ${fmt(d.contributions)} contributions, ${fmt(d.followers)} followers, ${fmt(d.repos)} repos, ${d.streak} day streak`)}
  <defs>
    ${foilDefs("hero-foil", CX + CW / 2, CY + CH / 2)}
    <clipPath id="hero-card"><rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="22"/></clipPath>
    <clipPath id="hero-face"><rect x="64" y="96" width="312" height="190" rx="12"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${C.ink}"/>

  <g>
    <animateTransform attributeName="transform" type="rotate" values="-1.2 220 430;1.2 220 430;-1.2 220 430" dur="6s" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" repeatCount="indefinite"/>
    <g clip-path="url(#hero-card)">
      <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" fill="url(#hero-foil)"/>
      <rect x="${CX + 8}" y="${CY + 8}" width="${CW - 16}" height="${CH - 16}" rx="16" fill="${C.panel}" opacity=".92"/>
      <text x="64" y="76" font-family="${SANS}" font-size="26" font-weight="700" fill="${C.white}">${esc(d.name)}</text>
      <text x="376" y="76" text-anchor="end" font-family="${MONO}" font-size="13" fill="${C.gold}">⚡ ${fmt(d.contributions)}</text>
      ${d.avatar ? `<image href="${d.avatar}" x="64" y="96" width="312" height="190" preserveAspectRatio="xMidYMid slice" clip-path="url(#hero-face)"/>` : ""}
      <rect x="64" y="96" width="312" height="190" rx="12" fill="url(#hero-foil-flat)" opacity=".16"/>
      <text x="64" y="312" font-family="${MONO}" font-size="11" letter-spacing="1.5" fill="${C.lilac}">${rarity} · ${fmt(d.repos)} REPOS · SINCE ${d.since}</text>
      ${langRows}
    </g>
    ${sheen("hero", CX, CY, CW, CH, "hero-card")}
    <rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="22" fill="none" stroke="url(#hero-foil)" stroke-width="3"/>
  </g>

  <text x="450" y="74" font-family="${MONO}" font-size="12" letter-spacing="2.4" fill="${C.sky}">COLLECTOR'S EDITION · ${new Date().getUTCFullYear()}</text>
  <text x="450" y="128" font-family="${SANS}" font-size="44" font-weight="800" letter-spacing="-0.9" fill="${C.white}">@${esc(d.login)}</text>
  <text x="450" y="158" font-family="${SANS}" font-size="16" fill="${C.grey}">${esc(plainBio(d.bio))}</text>
  ${tiles}
</svg>
`;
}

// ---------- core toolkit: language stack ----------
function stack(d) {
  const W = 860, id = "stack";
  const H = 110 + d.langs.length * 34;
  const barX = 300, barW = 520;
  const body = d.langs
    .map((l, i) => {
      const y = 104 + i * 34;
      const w = Math.max(4, (l.pct / 100) * barW);
      return `
  <circle cx="40" cy="${y - 4}" r="5" fill="${l.color}"/>
  <text x="56" y="${y}" font-family="${MONO}" font-size="13" font-weight="700" fill="${C.text}">${esc(l.name)}</text>
  <text x="${barX - 22}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${C.peach}">${l.pct < 1 ? "&lt;1" : Math.round(l.pct)}%</text>
  <rect x="${barX}" y="${y - 9}" width="${barW}" height="8" rx="4" fill="${C.peach}" fill-opacity="0.12"/>
  <rect x="${barX}" y="${y - 9}" width="${w.toFixed(1)}" height="8" rx="4" fill="${l.color}">
    <animate attributeName="width" from="0" to="${w.toFixed(1)}" dur="0.9s" begin="${0.2 + i * 0.12}s" calcMode="spline" keyTimes="0;1" keySplines="0.3 0 0.2 1"/>
  </rect>`;
    })
    .join("");
  return `${svgOpen(W, H, `Language stack: ${d.langs.map((l) => `${l.name} ${Math.round(l.pct)}%`).join(", ")}`)}
  ${holoFrame(id, W, H)}
  <text x="30" y="50" font-family="${SANS}" font-size="22" font-weight="800" fill="url(#${id}-title)">Language Stack</text>
  <text x="30" y="70" font-family="${MONO}" font-size="11" fill="${C.dim}">Repository-weighted technologies</text>
  <text x="${W - 30}" y="50" text-anchor="end" font-family="${MONO}" font-size="12" fill="${C.peach}">&gt; stack.scan <tspan fill="${C.red}">_<animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></tspan></text>
  ${body}
  ${sheen(id, 0, 0, W, H, `${id}-clip`, 1)}
</svg>
`;
}

// ---------- selected work ----------
function projects(d) {
  const W = 860, id = "proj";
  const pad = 28, gap = 16, cols = d.projects.length;
  const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
  const descLines = d.projects.map((p) => wrap(p.description, 34));
  const maxLines = Math.max(...descLines.map((l) => l.length));
  const ch = 168 + maxLines * 16;
  const H = 70 + ch + 28;

  const cards = d.projects
    .map((p, i) => {
      const x = pad + i * (cw + gap);
      const lines = descLines[i]
        .map((l, j) => `<text x="16" y="${92 + j * 16}" font-family="${MONO}" font-size="11" fill="${C.text}" fill-opacity="0.82">${esc(l)}</text>`)
        .join("");
      const barY = 100 + maxLines * 16;
      let bx = 0;
      const barW = cw - 32;
      const bar = p.languages
        .map((l) => {
          const w = (l.pct / 100) * barW;
          const seg = `<rect x="${16 + bx}" y="${barY}" width="${Math.max(w, 0)}" height="6" fill="${l.color}"/>`;
          bx += w;
          return seg;
        })
        .join("");
      const top = p.languages[0];
      return `
  <g transform="translate(${x},70)" opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="${0.15 + i * 0.15}s" fill="freeze"/>
    <rect width="${cw}" height="${ch}" rx="13" fill="#08080c" fill-opacity="0.6" stroke="url(#${id}-foil-flat)" stroke-width="1.5"/>
    <line x1="0" y1="30" x2="${cw}" y2="30" stroke="url(#${id}-foil-flat)" stroke-opacity="0.45"/>
    <text x="16" y="20" font-family="${MONO}" font-size="10.5" fill="${C.peach}"><tspan fill="${C.red}">•</tspan> ${esc(p.repo.toLowerCase())}</text>
    <text x="${cw - 16}" y="20" text-anchor="end" font-family="${MONO}" font-size="9.5" fill="${C.dim}">${esc(ago(p.pushedAt))}</text>
    <text x="16" y="56" font-family="${SANS}" font-size="18" font-weight="700" fill="url(#${id}-title)">${esc(p.title)}</text>
    <text x="16" y="72" font-family="${SANS}" font-size="11.5" font-style="italic" fill="${C.peach}">${esc(p.tagline)}</text>
    ${lines}
    <defs><clipPath id="bar${i}"><rect x="16" y="${barY}" width="${barW}" height="6" rx="3"/></clipPath></defs>
    <rect x="16" y="${barY}" width="${barW}" height="6" rx="3" fill="${C.peach}" fill-opacity="0.15"/>
    <g clip-path="url(#bar${i})">${bar}</g>
    <text x="16" y="${barY + 24}" font-family="${MONO}" font-size="10" fill="${C.dim}">${top ? `${esc(top.name)} ${Math.round(top.pct)}%` : ""}</text>
    <text x="16" y="${ch - 16}" font-family="${MONO}" font-size="10" fill="${C.peach}">${esc(p.stack.join(" · "))}</text>
  </g>`;
    })
    .join("");

  return `${svgOpen(W, H, `Selected work: ${d.projects.map((p) => p.title).join(", ")}`)}
  ${holoFrame(id, W, H)}
  <text x="30" y="40" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${C.red}">PROJECTS.LIST</text>
  <text x="180" y="40" font-family="${MONO}" font-size="11" fill="${C.peach}" fill-opacity="0.8">./projects.sh --selected</text>
  <text x="${W - 30}" y="40" text-anchor="end" font-family="${MONO}" font-size="11" fill="${C.peach}" fill-opacity="0.7">${d.projects.length} projects</text>
  <line x1="28" y1="52" x2="${W - 28}" y2="52" stroke="url(#${id}-foil-flat)" stroke-opacity="0.6" stroke-width="1.5"/>
  ${cards}
  ${sheen(id, 0, 0, W, H, `${id}-clip`, 2)}
</svg>
`;
}

// ---------- let's connect ----------
function social(d) {
  const W = 860, H = 120, id = "soc";
  const pw = 210, px = (W - pw) / 2, py = 34;
  return `${svgOpen(W, H, `Connect: GitHub @${d.login}`)}
  ${holoFrame(id, W, H)}
  <rect x="${px}" y="${py}" width="${pw}" height="52" rx="26" fill="#08080c" fill-opacity="0.7" stroke="url(#${id}-foil-flat)" stroke-width="1.5"/>
  <circle cx="${px + 28}" cy="${py + 26}" r="15" fill="${C.red}" fill-opacity="0.15" stroke="${C.red}" stroke-opacity="0.6"/>
  <text x="${px + 28}" y="${py + 31}" text-anchor="middle" font-family="${SANS}" font-size="14" font-weight="800" fill="${C.peach}">G</text>
  <text x="${px + 54}" y="${py + 23}" font-family="${SANS}" font-size="14" font-weight="700" fill="${C.text}">GitHub</text>
  <text x="${px + 54}" y="${py + 40}" font-family="${MONO}" font-size="11" fill="${C.peach}">@${esc(d.login)}</text>
  ${sheen(id, 0, 0, W, H, `${id}-clip`, 3)}
</svg>
`;
}

// ---------- 3D city: add the foil frame around the generated SVG ----------
async function frameCity(path) {
  let svg;
  try {
    svg = await readFile(path, "utf8");
  } catch {
    console.log(`no ${path} yet, skipping frame`);
    return;
  }
  if (svg.includes('id="cityframe-foil"')) return; // already framed
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const W = m ? Number(m[1]) : 1280, H = m ? Number(m[2]) : 850;
  const openEnd = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  const head = `<defs>${foilDefs("cityframe-foil", W / 2, H / 2)}<clipPath id="cityframe-clip"><rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="30"/></clipPath></defs><g clip-path="url(#cityframe-clip)">`;
  const tail = `</g><rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="32" fill="none" stroke="url(#cityframe-foil)" stroke-width="6"/>`;
  svg = svg.slice(0, openEnd) + head + svg.slice(openEnd).replace(/<\/svg>\s*$/, `${tail}</svg>`);
  await writeFile(path, svg);
  console.log(`framed ${path}`);
}

// ---------- main ----------
const args = process.argv.slice(2);
if (args.includes("--frame")) {
  const p = args[args.indexOf("--frame") + 1];
  await frameCity(p && !p.startsWith("--") ? p : CITY);
  process.exit(0);
}

const seedIdx = args.indexOf("--seed");
const data =
  seedIdx > -1
    ? await (async () => {
        const s = JSON.parse(await readFile(args[seedIdx + 1], "utf8"));
        s.projects = PROJECTS.map((p) => ({ ...p, ...(s.projects?.[p.repo] || {}) }));
        return s;
      })()
    : await fetchData();

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/hero.svg`, hero(data));
await writeFile(`${OUT}/stack.svg`, stack(data));
await writeFile(`${OUT}/projects.svg`, projects(data));
await writeFile(`${OUT}/social.svg`, social(data));
console.log(`cards built: ${fmt(data.contributions)} contributions, ${data.streak} day streak, ${data.projects.length} projects`);
