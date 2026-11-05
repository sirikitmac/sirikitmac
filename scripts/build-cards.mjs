// Builds the self-hosted profile cards (hero + selected work) as SVGs.
// Runs daily in .github/workflows/profile-3d.yml with GITHUB_TOKEN.
// Local preview without a token: `node scripts/build-cards.mjs --seed scripts/seed.json`
import { readFile, writeFile, mkdir } from "node:fs/promises";

const USER = process.env.USERNAME || "sirikitmac";
const OUT = "assets";

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

// ---------- palette (matches the GitSkins "satan" theme) ----------
const C = {
  bg0: "#0b0607",
  bg1: "#1a0707",
  red: "#ff4500",
  orange: "#ff6b35",
  peach: "#ff8c61",
  text: "#ffd9cc",
  dim: "#b07a6c",
};
const MONO = "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

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

async function fetchData() {
  const repoFields = PROJECTS.map(
    (p, i) => `p${i}: repository(owner: $login, name: "${p.repo}") {
      pushedAt
      homepageUrl
      languages(first: 6, orderBy: {field: SIZE, direction: DESC}) {
        totalSize edges { size node { name color } }
      }
    }`,
  ).join("\n");
  const d = await gql(
    `query($login: String!) {
      user(login: $login) {
        name login bio avatarUrl(size: 200)
        followers { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
          totalCount
          nodes { languages(first: 10) { edges { size node { name color } } } }
        }
        contributionsCollection { contributionCalendar { totalContributions } }
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
  const topLangs = [...langTotals.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 4)
    .map(([name]) => name);

  const avatarRes = await fetch(u.avatarUrl);
  const avatar = `data:${avatarRes.headers.get("content-type") || "image/png"};base64,${Buffer.from(
    await avatarRes.arrayBuffer(),
  ).toString("base64")}`;

  return {
    name: u.name || u.login,
    login: u.login,
    bio: u.bio || "",
    avatar,
    followers: u.followers.totalCount,
    repos: u.repositories.totalCount,
    contributions: u.contributionsCollection.contributionCalendar.totalContributions,
    topLangs,
    projects: PROJECTS.map((p, i) => {
      const r = d[`p${i}`] || {};
      const total = r.languages?.totalSize || 1;
      return {
        ...p,
        homepage: r.homepageUrl || "",
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

const fmt = (n) => n.toLocaleString("en-US");

function backdrop(id, w, h) {
  return `
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg0}"/>
    </linearGradient>
    <radialGradient id="${id}-orb"><stop offset="0" stop-color="${C.red}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.red}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-orb2"><stop offset="0" stop-color="${C.orange}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.orange}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-title" x1="0" x2="1"><stop offset="0" stop-color="${C.red}"/><stop offset="1" stop-color="${C.peach}"/></linearGradient>
    <clipPath id="${id}-clip"><rect width="${w}" height="${h}" rx="20"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-clip)">
    <rect width="${w}" height="${h}" fill="url(#${id}-bg)"/>
    <ellipse cx="${w * 0.12}" cy="${h * 0.15}" rx="${w * 0.28}" ry="${h * 0.9}" fill="url(#${id}-orb)">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="6s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="${w * 0.85}" cy="${h * 0.95}" rx="${w * 0.35}" ry="${h * 0.8}" fill="url(#${id}-orb2)">
      <animate attributeName="opacity" values="1;0.6;1" dur="7s" repeatCount="indefinite"/>
    </ellipse>
  </g>
  <rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="19.5" fill="none" stroke="${C.red}" stroke-opacity="0.55" stroke-width="1.5"/>`;
}

// ---------- hero ----------
function hero(d) {
  const W = 860, H = 230, id = "hero";
  const chips = d.topLangs
    .map((l, i) => {
      const w = 22 + l.length * 7.2;
      const x = d._chipX ?? 0;
      d._chipX = x + w + 10;
      return `<g transform="translate(${x},0)"><rect width="${w}" height="24" rx="12" fill="${C.red}" fill-opacity="0.12" stroke="${C.red}" stroke-opacity="0.45"/><text x="${w / 2}" y="16" text-anchor="middle" font-family="${MONO}" font-size="11" fill="${C.peach}">${esc(l)}</text></g>`;
    })
    .join("");
  delete d._chipX;

  const stat = (x, value, label) => `
    <text x="${x}" y="176" text-anchor="middle" font-family="${SANS}" font-size="20" font-weight="700" fill="${C.text}">${value}</text>
    <text x="${x}" y="194" text-anchor="middle" font-family="${MONO}" font-size="9.5" letter-spacing="1.5" fill="${C.dim}">${label}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.name)} — ${fmt(d.contributions)} contributions in the last year">
  ${backdrop(id, W, H)}
  <defs><clipPath id="av"><circle cx="100" cy="100" r="56"/></clipPath></defs>
  <circle cx="100" cy="100" r="62" fill="none" stroke="url(#${id}-title)" stroke-width="2.5">
    <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite"/>
  </circle>
  ${d.avatar ? `<image href="${d.avatar}" x="44" y="44" width="112" height="112" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>` : ""}
  <text x="190" y="62" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${C.peach}">@${esc(d.login)}</text>
  <text x="188" y="108" font-family="${SANS}" font-size="44" font-weight="800" fill="url(#${id}-title)">${esc(d.name)}</text>
  <text x="190" y="136" font-family="${SANS}" font-size="14" fill="${C.text}" fill-opacity="0.85">${esc(d.bio)}</text>
  <g transform="translate(190,158)">${chips}</g>

  <line x1="600" y1="40" x2="600" y2="${H - 40}" stroke="${C.red}" stroke-opacity="0.3"/>
  <text x="725" y="96" text-anchor="middle" font-family="${SANS}" font-size="52" font-weight="800" fill="url(#${id}-title)">${fmt(d.contributions)}</text>
  <text x="725" y="120" text-anchor="middle" font-family="${MONO}" font-size="10" letter-spacing="2" fill="${C.peach}">CONTRIBUTIONS · LAST YEAR</text>
  <line x1="640" y1="142" x2="810" y2="142" stroke="${C.red}" stroke-opacity="0.25"/>
  ${stat(680, fmt(d.repos), "REPOS")}
  ${stat(770, fmt(d.followers), "FOLLOWERS")}
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
      const stack = p.stack.join(" · ");
      return `
  <g transform="translate(${x},70)">
    <animate attributeName="opacity" from="0" to="1" dur="0.5s" begin="${0.15 + i * 0.15}s" fill="freeze"/>
    <rect width="${cw}" height="${ch}" rx="13" fill="#08080c" fill-opacity="0.55" stroke="${C.red}" stroke-opacity="0.5">
      <animate attributeName="stroke-opacity" values="0.4;0.85;0.4" dur="4.5s" begin="${i * 0.6}s" repeatCount="indefinite"/>
    </rect>
    <line x1="0" y1="30" x2="${cw}" y2="30" stroke="${C.red}" stroke-opacity="0.4"/>
    <text x="16" y="20" font-family="${MONO}" font-size="10.5" fill="${C.peach}"><tspan fill="${C.red}">•</tspan> ${esc(p.repo.toLowerCase())}</text>
    <text x="${cw - 16}" y="20" text-anchor="end" font-family="${MONO}" font-size="9.5" fill="${C.dim}">${esc(ago(p.pushedAt))}</text>
    <text x="16" y="56" font-family="${SANS}" font-size="18" font-weight="700" fill="url(#${id}-title)">${esc(p.title)}</text>
    <text x="16" y="72" font-family="${SANS}" font-size="11.5" font-style="italic" fill="${C.peach}">${esc(p.tagline)}</text>
    ${lines}
    <defs><clipPath id="bar${i}"><rect x="16" y="${barY}" width="${barW}" height="6" rx="3"/></clipPath></defs>
    <rect x="16" y="${barY}" width="${barW}" height="6" rx="3" fill="${C.peach}" fill-opacity="0.15"/>
    <g clip-path="url(#bar${i})">${bar}</g>
    <text x="16" y="${barY + 24}" font-family="${MONO}" font-size="10" fill="${C.dim}">${top ? `${esc(top.name)} ${Math.round(top.pct)}%` : ""}</text>
    <text x="16" y="${ch - 16}" font-family="${MONO}" font-size="10" fill="${C.peach}">${esc(stack)}</text>
  </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Selected work: ${d.projects.map((p) => esc(p.title)).join(", ")}">
  ${backdrop(id, W, H)}
  <text x="30" y="40" font-family="${MONO}" font-size="12" letter-spacing="2" fill="${C.red}">PROJECTS.LIST</text>
  <text x="180" y="40" font-family="${MONO}" font-size="11" fill="${C.peach}" fill-opacity="0.8">./projects.sh --selected</text>
  <text x="${W - 30}" y="40" text-anchor="end" font-family="${MONO}" font-size="11" fill="${C.peach}" fill-opacity="0.7">${d.projects.length} projects</text>
  <line x1="28" y1="52" x2="${W - 28}" y2="52" stroke="${C.red}" stroke-opacity="0.5" stroke-width="1.5"/>
  ${cards}
</svg>
`;
}

// ---------- main ----------
const seedIdx = process.argv.indexOf("--seed");
const data =
  seedIdx > -1
    ? await (async () => {
        const s = JSON.parse(await readFile(process.argv[seedIdx + 1], "utf8"));
        s.projects = PROJECTS.map((p) => ({ ...p, ...(s.projects?.[p.repo] || {}) }));
        return s;
      })()
    : await fetchData();

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/hero.svg`, hero(data));
await writeFile(`${OUT}/projects.svg`, projects(data));
console.log(`cards built: ${fmt(data.contributions)} contributions, ${data.projects.length} projects`);
