"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Flow: quest info & requirements → item checklist → step wizard.
// Quest list styled like the in-game quest tab (red/yellow/green).

const API = "https://oldschool.runescape.wiki/api.php";
const WIKI = "https://oldschool.runescape.wiki";
const TILES = "https://maps.runescape.wiki/osrs/tiles";

// Common teleports for route advice: destination coords + cast time
type Teleport = {
  name: string;
  x: number;
  y: number;
  f2p: boolean;
  cast: number;
  note: string;
  icon: string;
};
const TELEPORTS: Teleport[] = [
  { name: "Home Teleport (Lumbridge)", x: 3222, y: 3218, f2p: true, cast: 12, note: "free · 30 min cooldown", icon: "🏠" },
  { name: "Varrock Teleport", x: 3213, y: 3424, f2p: true, cast: 4, note: "25 Magic", icon: "✨" },
  { name: "Lumbridge Teleport", x: 3222, y: 3218, f2p: true, cast: 4, note: "31 Magic", icon: "✨" },
  { name: "Falador Teleport", x: 2965, y: 3379, f2p: true, cast: 4, note: "37 Magic", icon: "✨" },
  { name: "Camelot Teleport", x: 2757, y: 3477, f2p: false, cast: 4, note: "45 Magic", icon: "✨" },
  { name: "Ardougne Teleport", x: 2661, y: 3300, f2p: false, cast: 4, note: "51 Magic", icon: "✨" },
  { name: "Watchtower (Yanille)", x: 2544, y: 3095, f2p: false, cast: 4, note: "58 Magic", icon: "✨" },
  { name: "Trollheim Teleport", x: 2890, y: 3678, f2p: false, cast: 4, note: "61 Magic", icon: "✨" },
  { name: "Kourend Castle Teleport", x: 1643, y: 3673, f2p: false, cast: 4, note: "69 Magic", icon: "✨" },
  { name: "Civitas illa Fortis Tele.", x: 1681, y: 3133, f2p: false, cast: 4, note: "54 Magic", icon: "✨" },
  { name: "Glory: Edgeville", x: 3087, y: 3496, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Al Kharid", x: 3293, y: 3163, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Draynor", x: 3105, y: 3251, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Glory: Karamja", x: 2918, y: 3176, f2p: false, cast: 3, note: "Amulet of glory", icon: "💎" },
  { name: "Dueling: Ferox Enclave", x: 3150, y: 3635, f2p: false, cast: 3, note: "Ring of dueling", icon: "💍" },
  { name: "Dueling: Castle Wars", x: 2440, y: 3089, f2p: false, cast: 3, note: "Ring of dueling", icon: "💍" },
  { name: "Games: Burthorpe", x: 2898, y: 3546, f2p: false, cast: 3, note: "Games necklace", icon: "📿" },
  { name: "Games: Barbarian Outpost", x: 2519, y: 3571, f2p: false, cast: 3, note: "Games necklace", icon: "📿" },
];

// Approximate F2P areas as [x1, y1, x2, y2] rectangles (members areas get dimmed)
const F2P_RECTS: [number, number, number, number][] = [
  [2920, 3000, 3400, 3560], // mainland: Falador–Varrock–Lumbridge–Al Kharid
  [2941, 3560, 3392, 3968], // F2P Wilderness
  [2872, 3130, 2919, 3202], // Musa Point (Karamja)
  [2805, 3220, 2875, 3320], // Crandor
  [2506, 2940, 2615, 3065], // Corsair Cove
];

type RouteOption = {
  icon: string;
  name: string;
  sec: number;
  detail: string;
  f2p: boolean;
};

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(
    Math.abs(Math.round(a.x) - Math.round(b.x)),
    Math.abs(Math.round(a.y) - Math.round(b.y))
  );
}

function runSecs(tiles: number): number {
  return Math.ceil(tiles / 2) * 0.6;
}

function fmtSec(s: number): string {
  const r = Math.round(s);
  if (r < 90) return `${r}s`;
  return `${Math.floor(r / 60)}m ${r % 60}s`;
}

// Best travel options from a to b, sorted by estimated time
function buildRouteOptions(
  a: { x: number; y: number },
  b: { x: number; y: number },
  f2pOnly: boolean
): RouteOption[] {
  const direct = chebyshev(a, b);
  const opts: RouteOption[] = [
    {
      icon: "🏃",
      name: "Run from your position",
      sec: runSecs(direct),
      detail: `${direct} tiles`,
      f2p: true,
    },
  ];
  TELEPORTS.filter((t) => !f2pOnly || t.f2p).forEach((t) => {
    const d = chebyshev(t, b);
    opts.push({
      icon: t.icon,
      name: t.name,
      sec: t.cast + runSecs(d),
      detail: `${t.note} → run ${d} tiles`,
      f2p: t.f2p,
    });
  });
  opts.sort((x, y) => x.sec - y.sec);
  return opts.slice(0, 5);
}

const C = {
  bg: "#26211A",
  panel: "#332C22",
  panelSoft: "#3B342A",
  border: "#57492F",
  goldDim: "#B08A3E",
  borderSoft: "#463C2C",
  gold: "#E7B84C",
  parch: "#E9DDBE",
  ink: "#3A2E19",
  text: "#D8CDB4",
  textDim: "#9A8E74",
  green: "#7CB363",
  red: "#C96A5B",
  qRed: "#E05C5C",
  qYellow: "#E7C84C",
  qGreen: "#7CC763",
};

const POPULAR = [
  "Cook's Assistant", "The Restless Ghost", "Rune Mysteries", "Sheep Shearer",
  "Imp Catcher", "Romeo & Juliet", "Doric's Quest", "Ernest the Chicken",
  "Vampyre Slayer", "The Knight's Sword", "Dragon Slayer I", "Waterfall Quest",
  "Tree Gnome Village", "Fight Arena", "The Grand Tree", "Priest in Peril",
  "Witch's House", "Monkey Madness I", "Recipe for Disaster",
  "Animal Magnetism", "Lost City", "Desert Treasure I", "Monk's Friend",
  "Plague City", "Dwarf Cannon", "The Dig Site", "Druidic Ritual",
  "Client of Kourend", "X Marks the Spot", "A Porcine of Interest",
];

// Fallback F2P list, used if the wiki category can't be fetched
const F2P_FALLBACK = [
  "Below Ice Mountain", "Black Knights' Fortress", "Cook's Assistant",
  "The Corsair Curse", "Demon Slayer", "Doric's Quest", "Dragon Slayer I",
  "Ernest the Chicken", "Goblin Diplomacy", "Imp Catcher",
  "The Knight's Sword", "Misthalin Mystery", "Pirate's Treasure",
  "Prince Ali Rescue", "The Restless Ghost", "Romeo & Juliet",
  "Rune Mysteries", "Sheep Shearer", "Shield of Arrav", "Vampyre Slayer",
  "Witch's Potion", "X Marks the Spot",
];

const MINI_FALLBACK = [
  "Barbarian Training", "Bear Your Soul", "Daddy's Home", "Enter the Abyss",
  "Family Pest", "Hopespear's Will", "In Search of Knowledge",
  "Lair of Tarn Razorlor", "Skippy and the Mogres", "The Frozen Door",
  "The General's Shadow", "The Mage Arena", "The Mage Arena II",
];

const SKILLS = new Set([
  "attack", "strength", "defence", "ranged", "prayer", "magic",
  "runecraft", "runecrafting", "hitpoints", "crafting", "mining",
  "smithing", "fishing", "cooking", "firemaking", "woodcutting",
  "agility", "herblore", "thieving", "fletching", "slayer",
  "farming", "construction", "hunter",
]);

type SkillReq = { level: number; skill: string; note: string };
type Coords = { x: number; y: number; plane?: number; mapId?: number };
type Meta = {
  difficulty: string | null;
  length: string | null;
  start: string | null;
  startCoords: Coords | null;
  skillReqs: SkillReq[];
  otherReqs: string[];
  enemies: string[];
};
type LinkRef = { label: string; page: string };
type Step = {
  text: string;
  info: string[];
  images: string[];
  links: LinkRef[];
  section: string;
};
type Item = { name: string; info: string | null };
type Quest = {
  name: string;
  steps: Step[];
  items: Item[];
  meta: Meta;
  rewards: string[];
};
type RecentItem = { name: string; done: number; total: number };
type Player = { name: string; skills: Record<string, number> };
type GalleryImg = { src: string; caption: string };
type Lookup = {
  title: string;
  page: string;
  loading: boolean;
  images: string[];
  coords: Coords | null;
  error: string | null;
};
type WorldMap = {
  x: number;
  y: number;
  title: string;
  marker: boolean;
  plane?: number;
  mapId?: number;
};
type QuestReward = { qp: number; xp: Record<string, number> };
type Progress = Record<string, QuestReward>;

// Load Leaflet once from CDN
let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href =
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => resolve((window as any).L);
    s.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function cleanText(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function normalizeSkill(s: string): string {
  const t = s.toLowerCase().trim();
  return t === "runecrafting" ? "runecraft" : t;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function resolveSrc(raw: string): string {
  if (raw.startsWith("//")) return "https:" + raw;
  if (raw.startsWith("/")) return WIKI + raw;
  return raw;
}

function wikiUrl(page: string): string {
  return WIKI + "/w/" + encodeURIComponent(page.replace(/ /g, "_"));
}

// Render text with \u0001…\u0002 bold markers as real bold text
function renderRich(t: string): React.ReactNode {
  if (!t.includes("\u0001")) return t;
  const parts = t.split(/[\u0001\u0002]/);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <b key={i} style={{ fontWeight: 800 }}>
        {p}
      </b>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

// Extract game coordinates from wiki HTML (embedded maps)
function extractCoords(html: string): Coords | null {
  const withMeta = (x: number, y: number): Coords | null => {
    if (x < 1000 || x > 13000 || y < 1000 || y > 13000) return null;
    const c: Coords = { x, y };
    const pm = html.match(/"plane"\s*:\s*(\d)/) || html.match(/data-plane="(\d)"/);
    if (pm) c.plane = Math.min(3, Math.max(0, parseInt(pm[1], 10)));
    const mm =
      html.match(/"mapID"\s*:\s*(-?\d+)/i) || html.match(/data-mapid="(-?\d+)"/i);
    if (mm) {
      const id = parseInt(mm[1], 10);
      if (id > 0) c.mapId = id; // -1/0 both mean the surface map
    }
    return c;
  };
  let m = html.match(/"coordinates"\s*:\s*\[\s*(\d{3,5})(?:\.\d+)?\s*,\s*(\d{3,5})/);
  if (m) {
    const r = withMeta(+m[1], +m[2]);
    if (r) return r;
  }
  m = html.match(/data-x="(\d{3,5})"[^>]*data-y="(\d{3,5})"/);
  if (m) {
    const r = withMeta(+m[1], +m[2]);
    if (r) return r;
  }
  m = html.match(/data-lon="(\d{3,5}(?:\.\d+)?)"[^>]*data-lat="(\d{3,5}(?:\.\d+)?)"/);
  if (m) {
    const r = withMeta(Math.round(+m[1]), Math.round(+m[2]));
    if (r) return r;
  }
  m = html.match(/data-lat="(\d{3,5}(?:\.\d+)?)"[^>]*data-lon="(\d{3,5}(?:\.\d+)?)"/);
  if (m) {
    const r = withMeta(Math.round(+m[2]), Math.round(+m[1]));
    if (r) return r;
  }
  return null;
}

// Official OSRS combat level formula
function calcCombat(skills: Record<string, number>): number {
  const g = (n: string) => skills[n] ?? 1;
  const base = 0.25 * (g("defence") + Math.max(g("hitpoints"), 10) + Math.floor(g("prayer") / 2));
  const melee = 0.325 * (g("attack") + g("strength"));
  const range = 0.325 * Math.floor((3 * g("ranged")) / 2);
  const mage = 0.325 * Math.floor((3 * g("magic")) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

// Highest "(level X)" found in an enemy description
function enemyLevel(s: string): number | null {
  const matches = Array.from(s.matchAll(/levels?\s*(\d+)/gi));
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

// Split "Bucket of milk (can be bought at...)" into name + extra info
function splitItem(raw: string): Item {
  const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m && m[1].trim()) {
    return { name: cleanText(m[1]), info: cleanText(m[2]) };
  }
  return { name: cleanText(raw), info: null };
}

// Extract quest points + XP amounts from reward lines
function parseRewardStats(rewards: string[]): QuestReward {
  let qp = 0;
  const xp: Record<string, number> = {};
  rewards.forEach((line) => {
    const q = line.match(/(\d+)\s+quest points?/i);
    if (q) qp = Math.max(qp, parseInt(q[1], 10));
    const rx = /([\d,]+(?:\.\d+)?)\s+([A-Za-z]+)\s+(?:experience|exp\b|xp\b)/gi;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(line))) {
      const amount = parseFloat(m[1].replace(/,/g, ""));
      const skill = normalizeSkill(m[2]);
      if (SKILLS.has(skill) && amount > 0) {
        xp[skill] = (xp[skill] || 0) + amount;
      }
    }
  });
  return { qp, xp };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wiki returned status " + res.status);
  return res.json();
}

function loadStored(key: string): any {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function saveStored(key: string, val: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage unavailable */
  }
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

const storageKey = (name: string) => "qh-quest-" + name.replace(/[\s/\\'"]+/g, "_");

// Own text of each li element, excluding nested lists
function ownLiTexts(container: Element): string[] {
  const out: string[] = [];
  container.querySelectorAll("li").forEach((li) => {
    const clone = li.cloneNode(true) as Element;
    clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
    const t = cleanText(clone.textContent || "");
    if (t) out.push(t);
  });
  return out;
}

// Captioned images from a full guide page
function parseGallery(html: string): GalleryImg[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: GalleryImg[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll("figure, div.thumb").forEach((fig) => {
    const img = fig.querySelector("img");
    if (!img) return;
    const w = parseInt(img.getAttribute("width") || "0", 10);
    if (w < 100) return;
    const src = resolveSrc(img.getAttribute("src") || "");
    if (!src || seen.has(src)) return;
    seen.add(src);
    const capEl = fig.querySelector("figcaption, .thumbcaption");
    const caption = cleanText(capEl?.textContent || "");
    out.push({ src, caption });
  });
  return out.slice(0, 30);
}

// Split a step into text + info + images + links
function makeStep(li: Element, section: string): Step | null {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll("ul, ol").forEach((n) => n.remove());

  const images: string[] = [];
  clone.querySelectorAll("img").forEach((img) => {
    if (images.length >= 2) return;
    const w = parseInt(img.getAttribute("width") || "0", 10);
    if (w < 80) return;
    const src = resolveSrc(img.getAttribute("src") || "");
    if (src) images.push(src);
  });

  const links: LinkRef[] = [];
  clone.querySelectorAll("a").forEach((a) => {
    if (links.length >= 4) return;
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("/w/")) return;
    if (a.querySelector("img")) return;
    const page = decodeURIComponent(href.slice(3))
      .split("#")[0]
      .replace(/_/g, " ");
    const label = cleanText(a.textContent || "");
    if (!label || label.length < 3 || !page) return;
    if (links.some((l) => l.page === page)) return;
    links.push({ label, page });
  });

  // Mark bold text (dialogue choices) with sentinel characters so it
  // survives the plain-text extraction and can be rendered bold again
  clone.querySelectorAll("b, strong").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (t) el.textContent = "\u0001" + t + "\u0002";
  });

  const raw = cleanText(clone.textContent || "");
  if (!raw) return null;

  const infos: string[] = [];
  const stripped = raw.replace(/\s*\(([^()]+)\)/g, (match, inner) => {
    const t = cleanText(inner);
    if (t.length >= 12) {
      infos.push(t);
      return "";
    }
    return match;
  });

  return { text: cleanText(stripped), info: infos, images, links, section };
}

// Turn wiki HTML into steps + items + quest info + rewards
function parseGuide(html: string): {
  steps: Step[];
  items: Item[];
  meta: Meta;
  rewards: string[];
} {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      ".navbox, .references, .reference, #toc, .toc, .mw-editsection, .messagebox, .infobox, style, script, sup"
    )
    .forEach((el) => el.remove());

  const items: Item[] = [];
  const rewards: string[] = [];
  const meta: Meta = {
    difficulty: null,
    length: null,
    start: null,
    startCoords: null,
    skillReqs: [],
    otherReqs: [],
    enemies: [],
  };

  // Reward boxes (tables/divs with "reward" in the class name)
  root.querySelectorAll("table, div").forEach((el) => {
    const cls = (el.getAttribute("class") || "").toLowerCase();
    if (!cls.includes("reward")) return;
    el.querySelectorAll("tr, li").forEach((row) => {
      const t = cleanText(row.textContent || "");
      if (t && t.length < 200) rewards.push(t);
    });
    el.remove();
  });

  const details = root.querySelector("table.questdetails");
  if (details) {
    details.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) return;
      const label = (th.textContent || "").toLowerCase();

      if (/item/.test(label)) {
        ownLiTexts(td).forEach((t) => items.push(splitItem(t)));
      } else if (/difficulty/.test(label)) {
        meta.difficulty = cleanText(td.textContent || "") || null;
      } else if (/length/.test(label)) {
        meta.length = cleanText(td.textContent || "") || null;
      } else if (/start/.test(label)) {
        // Coordinates come from the embedded "Show on map" link
        meta.startCoords = extractCoords(td.outerHTML || "");
        const tdClone = td.cloneNode(true) as Element;
        tdClone.querySelectorAll("a").forEach((a) => {
          if (/show on map/i.test(a.textContent || "")) a.remove();
        });
        meta.start = cleanText(tdClone.textContent || "") || null;
      } else if (/enem|defeat/.test(label)) {
        const lis = ownLiTexts(td);
        meta.enemies = lis.length
          ? lis
          : cleanText(td.textContent || "")
          ? [cleanText(td.textContent || "")]
          : [];
      } else if (/requirement/.test(label)) {
        ownLiTexts(td).forEach((t) => {
          if (t.endsWith(":")) return; // header lines like "Completion of..."
          const m = t.match(/^(\d+)\s+([A-Za-z]+)(.*)$/);
          if (m && SKILLS.has(m[2].toLowerCase())) {
            meta.skillReqs.push({
              level: parseInt(m[1], 10),
              skill: m[2],
              note: cleanText(m[3] || ""),
            });
          } else {
            meta.otherReqs.push(t);
          }
        });
      }
    });
    details.remove();
  }

  const SKIP = /reference|navigat|see also|trivia|gallery|changes/i;
  const steps: Step[] = [];
  let sectionTitle = "Walkthrough";
  let mode: "steps" | "skip" | "rewards" = "steps";

  const pushLis = (listEl: Element) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      if (mode === "rewards") {
        const clone = li.cloneNode(true) as Element;
        clone.querySelectorAll("ul, ol").forEach((n) => n.remove());
        const t = cleanText(clone.textContent || "");
        if (t) rewards.push(t);
      } else {
        const st = makeStep(li, sectionTitle);
        if (st) steps.push(st);
      }
      li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => pushLis(sub));
    });
  };

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName;
      if (tag === "H2" || tag === "H3") {
        const title = cleanText(child.textContent || "");
        if (/reward/i.test(title)) {
          mode = "rewards";
        } else if (SKIP.test(title)) {
          mode = "skip";
        } else {
          mode = "steps";
          if (title) sectionTitle = title;
        }
        return;
      }
      if (mode === "skip") return;
      if (tag === "UL" || tag === "OL") {
        if (!child.closest("table")) pushLis(child);
        return;
      }
      if (tag === "DIV" || tag === "SECTION") walk(child);
    });
  };
  walk(root);

  return { steps, items, meta, rewards };
}

export default function QuestHelper() {
  const [view, setView] = useState<"home" | "quest">("home");
  const [phase, setPhase] = useState<"info" | "items" | "steps" | "done">("info");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [optimal, setOptimal] = useState<string[]>([]);
  const [f2p, setF2p] = useState<Set<string>>(new Set(F2P_FALLBACK));
  const [miniSet, setMiniSet] = useState<Set<string>>(new Set(MINI_FALLBACK));
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>({});
  const [lastReward, setLastReward] = useState<QuestReward | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [itemsChecked, setItemsChecked] = useState<Set<number>>(new Set());
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [stepInfoOpen, setStepInfoOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [gallery, setGallery] = useState<GalleryImg[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [worldMap, setWorldMap] = useState<WorldMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rsn, setRsn] = useState("");
  const [player, setPlayer] = useState<Player | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const planeRef = useRef(0);
  const routeModeRef = useRef(false);
  const routeRef = useRef<{ pts: { x: number; y: number }[]; layers: any[] }>({
    pts: [],
    layers: [],
  });
  const [floor, setFloor] = useState(0);
  const [routeMode, setRouteMode] = useState(false);
  const [routeResult, setRouteResult] = useState<{
    a: { x: number; y: number };
    b: { x: number; y: number };
    tiles: number;
  } | null>(null);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [f2pMode, setF2pMode] = useState(false);
  const f2pModeRef = useRef(false);
  const f2pLayerRef = useRef<any>(null);

  useEffect(() => {
    const r = loadStored("qh-recent");
    if (Array.isArray(r)) {
      const active = r.filter(
        (x: RecentItem) => x && x.total > 0 && x.done < x.total
      );
      setRecent(active);
      if (active.length !== r.length) saveStored("qh-recent", active);
    }

    const comp = loadStored("qh-completed");
    if (Array.isArray(comp)) setCompleted(new Set(comp));

    const prog = loadStored("qh-progress");
    if (prog && typeof prog === "object") setProgress(prog);

    const f2p = loadStored("qh-f2p");
    if (f2p === true) {
      setF2pMode(true);
      f2pModeRef.current = true;
    }

    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) {
      setPlayer(savedPlayer);
      setRsn(savedPlayer.name);
    }

    // Optimal Quest Guide order from the wiki (refresh at most weekly)
    const cachedOpt = loadStored("qh-optimal");
    const optFresh =
      cachedOpt &&
      Array.isArray(cachedOpt.names) &&
      cachedOpt.names.length > 0 &&
      Date.now() - (cachedOpt.ts || 0) < 7 * 24 * 60 * 60 * 1000;
    if (cachedOpt && Array.isArray(cachedOpt.names) && cachedOpt.names.length > 0) {
      setOptimal(cachedOpt.names);
    }
    if (!optFresh) {
      (async () => {
        try {
          const data = await fetchJson(
            `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
              "Optimal quest guide"
            )}`
          );
          if (data.error) return;
          const doc = new DOMParser().parseFromString(
            data.parse.text["*"],
            "text/html"
          );
          const names: string[] = [];
          const seen = new Set<string>();
          // Quest links inside tables/lists, in document order
          doc.querySelectorAll("table a, ul a, ol a").forEach((a) => {
            const href = a.getAttribute("href") || "";
            if (!href.startsWith("/w/")) return;
            const page = decodeURIComponent(href.slice(3))
              .split("#")[0]
              .replace(/_/g, " ");
            if (!page || page.includes(":") || page.includes("/")) return;
            const key = page.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            names.push(page);
          });
          if (names.length > 20) {
            setOptimal(names);
            saveStored("qh-optimal", { ts: Date.now(), names });
          }
        } catch {
          /* no adviser, no problem */
        }
      })();
    }

    // Quest lists from the wiki, grouped like the in-game quest tab
    const cached = loadStored("qh-questlist2");
    if (cached && Array.isArray(cached.all) && cached.all.length > 0) {
      setAllQuests(cached.all);
      if (Array.isArray(cached.f2p)) setF2p(new Set(cached.f2p));
      if (Array.isArray(cached.mini)) setMiniSet(new Set(cached.mini));
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      const fetchCategory = async (category: string): Promise<string[]> => {
        const names: string[] = [];
        let cont: string | null = null;
        for (let i = 0; i < 3; i++) {
          const url =
            `${API}?action=query&format=json&origin=*&list=categorymembers` +
            `&cmtitle=${encodeURIComponent("Category:" + category)}` +
            `&cmtype=page&cmlimit=500` +
            (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
          const data: any = await fetchJson(url);
          (data.query?.categorymembers || []).forEach((m: any) => {
            const t = String(m.title || "");
            if (
              t &&
              !t.includes("/") &&
              !t.includes(":") &&
              !/^(Quests|Quest points|Quest List|Miniquests)$/i.test(t)
            ) {
              names.push(t);
            }
          });
          cont = data.continue?.cmcontinue || null;
          if (!cont) break;
        }
        return names;
      };
      try {
        const [quests, free, minis] = await Promise.all([
          fetchCategory("Quests"),
          fetchCategory("Free-to-play quests").catch(() => [] as string[]),
          fetchCategory("Miniquests").catch(() => [] as string[]),
        ]);
        if (quests.length > 10) {
          const all = Array.from(new Set([...quests, ...minis])).sort((a, b) =>
            a.localeCompare(b)
          );
          setAllQuests(all);
          if (free.length > 5) setF2p(new Set(free));
          if (minis.length > 0) setMiniSet(new Set(minis));
          saveStored("qh-questlist2", {
            ts: Date.now(),
            all,
            f2p: free.length > 5 ? free : F2P_FALLBACK,
            mini: minis.length > 0 ? minis : MINI_FALLBACK,
          });
        }
      } catch {
        /* fallbacks remain */
      }
    })();
  }, []);

  // Initialise the world map when opened
  useEffect(() => {
    if (!worldMap) return;
    let map: any = null;
    let cancelled = false;
    setMapError(null);
    setRouteResult(null);
    setRouteModalOpen(false);
    setRouteMode(false);
    routeModeRef.current = false;
    routeRef.current = { pts: [], layers: [] };
    planeRef.current = worldMap.plane ?? 0;
    setFloor(worldMap.plane ?? 0);
    (async () => {
      try {
        let v: string | null = null;
        const cached = loadStored("qh-mapver");
        if (cached && cached.v && Date.now() - (cached.ts || 0) < 86400000) {
          v = cached.v;
        }
        if (!v) {
          const res = await fetch("/api/mapconfig");
          const d = await res.json();
          if (!res.ok || !d.cacheVersion) throw new Error();
          v = d.cacheVersion as string;
          saveStored("qh-mapver", { v, ts: Date.now() });
        }

        const L = await loadLeaflet();
        if (cancelled || !mapDivRef.current) return;

        map = L.map(mapDivRef.current, {
          crs: L.CRS.Simple,
          minZoom: -3,
          maxZoom: 5,
          zoomControl: true,
          attributionControl: true,
        });

        mapRef.current = map;

        const mapId = worldMap.mapId && worldMap.mapId > 0 ? worldMap.mapId : 0;
        const OsrsTiles = L.TileLayer.extend({
          getTileUrl: function (c: any) {
            return `${TILES}/${mapId}_${v}/${c.z}/${planeRef.current}_${c.x}_${-(c.y + 1)}.png`;
          },
        });
        const layer = new OsrsTiles("", {
          minZoom: -3,
          maxZoom: 5,
          minNativeZoom: -3,
          maxNativeZoom: 3,
          tileSize: 256,
          attribution:
            'Map © Jagex · tiles <a href="https://weirdgloop.org/licensing" target="_blank" rel="noopener">RuneScape Wiki</a>',
        });
        layer.addTo(map);
        layerRef.current = layer;

        const pos = [worldMap.y + 0.5, worldMap.x + 0.5];
        map.setView(pos, worldMap.marker ? 2 : 0);
        if (worldMap.marker) {
          L.circleMarker(pos, {
            radius: 9,
            color: "#E7B84C",
            weight: 3,
            fillColor: "#C96A5B",
            fillOpacity: 0.9,
          })
            .addTo(map)
            .bindTooltip(worldMap.title);
        }

        // Route measuring: tap start, tap destination
        map.on("click", (e: any) => {
          if (!routeModeRef.current) return;
          const pt = { x: e.latlng.lng, y: e.latlng.lat };
          const r = routeRef.current;
          if (r.pts.length >= 2) {
            r.layers.forEach((ly: any) => map.removeLayer(ly));
            r.pts = [];
            r.layers = [];
            setRouteResult(null);
            setRouteModalOpen(false);
          }
          r.pts.push(pt);
          const mk = L.circleMarker([pt.y, pt.x], {
            radius: 7,
            color: "#E7B84C",
            weight: 3,
            fillColor: r.pts.length === 1 ? "#7CB363" : "#C96A5B",
            fillOpacity: 0.95,
          }).addTo(map);
          r.layers.push(mk);
          if (r.pts.length === 2) {
            const [a, b] = r.pts;
            const line = L.polyline(
              [
                [a.y, a.x],
                [b.y, b.x],
              ],
              { color: "#E7B84C", weight: 3, dashArray: "6 6" }
            ).addTo(map);
            r.layers.push(line);
            // OSRS movement allows diagonals → Chebyshev distance
            setRouteResult({ a, b, tiles: chebyshev(a, b) });
            setRouteModalOpen(true);
          }
        });

        // Dim members areas when F2P mode is on
        if (f2pModeRef.current) addF2pOverlay(map, L);
      } catch {
        if (!cancelled) setMapError("The map couldn't be loaded.");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current = null;
      layerRef.current = null;
      f2pLayerRef.current = null;
      routeRef.current = { pts: [], layers: [] };
      if (map) map.remove();
    };
  }, [worldMap]);

  // Dark polygon over the whole world with F2P areas cut out as holes
  const addF2pOverlay = (map: any, L: any) => {
    if (f2pLayerRef.current) return;
    const outer = [
      [0, 0],
      [0, 12800],
      [12800, 12800],
      [12800, 0],
    ];
    const holes = F2P_RECTS.map(([x1, y1, x2, y2]) => [
      [y1, x1],
      [y1, x2],
      [y2, x2],
      [y2, x1],
    ]);
    f2pLayerRef.current = L.polygon([outer, ...holes], {
      stroke: false,
      fillColor: "#000",
      fillOpacity: 0.55,
      interactive: false,
    }).addTo(map);
  };

  const toggleF2pMode = () => {
    const next = !f2pModeRef.current;
    f2pModeRef.current = next;
    setF2pMode(next);
    saveStored("qh-f2p", next);
    const L = (window as any).L;
    if (!mapRef.current || !L) return;
    if (next) {
      addF2pOverlay(mapRef.current, L);
    } else if (f2pLayerRef.current) {
      mapRef.current.removeLayer(f2pLayerRef.current);
      f2pLayerRef.current = null;
    }
  };

  const setMapFloor = (p: number) => {
    planeRef.current = p;
    setFloor(p);
    if (layerRef.current) layerRef.current.redraw();
  };

  const toggleRouteMode = () => {
    const next = !routeModeRef.current;
    routeModeRef.current = next;
    setRouteMode(next);
    if (!next && mapRef.current) {
      routeRef.current.layers.forEach((ly: any) =>
        mapRef.current.removeLayer(ly)
      );
      routeRef.current = { pts: [], layers: [] };
      setRouteResult(null);
      setRouteModalOpen(false);
    }
  };

  // Wiki search suggestions + local list
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setSuggest([]);
      return;
    }
    const local = allQuests.filter((n) => n.toLowerCase().includes(q));
    setSuggest(local.slice(0, 8));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await fetchJson(
          `${API}?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(
            query.trim()
          )}`
        );
        const names: string[] = (data[1] || []).filter(
          (n: string) => !n.includes("/")
        );
        const merged = Array.from(new Set([...local, ...names])).slice(0, 8);
        setSuggest(merged);
      } catch {
        /* keep the local list */
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, allQuests]);

  const loadStats = async () => {
    const name = rsn.trim();
    if (!name) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`/api/hiscores?player=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.skills)) {
        throw new Error(data.error || "Player not found");
      }
      const skills: Record<string, number> = {};
      data.skills.forEach((s: any) => {
        if (s && s.name) skills[normalizeSkill(String(s.name))] = Number(s.level) || 1;
      });
      const p: Player = { name, skills };
      setPlayer(p);
      saveStored("qh-rsn", p);
    } catch (e: any) {
      setStatsError(e?.message || "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  };

  const checkReq = (req: SkillReq): boolean | null => {
    if (!player) return null;
    return (player.skills[normalizeSkill(req.skill)] ?? 1) >= req.level;
  };

  const combatLevel = player ? calcCombat(player.skills) : null;

  const toggleCompleted = (name: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      saveStored("qh-completed", Array.from(next));
      return next;
    });
  };

  // Check whether a requirement line is a quest name
  const matchQuest = (req: string): string | null => {
    const r = req.toLowerCase();
    const exact = allQuests.find((n) => n.toLowerCase() === r);
    if (exact) return exact;
    const partial = allQuests.find(
      (n) => n.length >= 8 && r.includes(n.toLowerCase())
    );
    return partial || null;
  };

  const updateRecent = useCallback(
    (name: string, done: number, total: number) => {
      setRecent((prev) => {
        const next = [
          { name, done, total },
          ...prev.filter((r) => r.name !== name),
        ].slice(0, 8);
        saveStored("qh-recent", next);
        return next;
      });
    },
    []
  );

  const removeFromRecent = useCallback((name: string) => {
    setRecent((prev) => {
      const next = prev.filter((r) => r.name !== name);
      saveStored("qh-recent", next);
      return next;
    });
  }, []);

  const deleteRecent = (name: string) => {
    removeFromRecent(name);
    removeStored(storageKey(name));
  };

  const persist = (
    name: string,
    p: string,
    step: number,
    items: Set<number>
  ) => {
    saveStored(storageKey(name), {
      phase: p,
      step,
      items: Array.from(items),
    });
  };

  const openQuest = async (name: string) => {
    setLoading(true);
    setError(null);
    setView("quest");
    setQuest(null);
    setOpenInfo(null);
    setStepInfoOpen(false);
    setGallery([]);
    setGalleryOpen(false);
    setLookup(null);
    try {
      let usedMainPage = false;
      let data = await fetchJson(
        `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
          name + "/Quick guide"
        )}`
      );
      if (data.error) {
        data = await fetchJson(
          `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
            name
          )}`
        );
        usedMainPage = true;
      }
      if (data.error) throw new Error("Quest not found on the wiki.");
      const html = data.parse.text["*"];
      const parsed = parseGuide(html);
      if (!parsed.steps.length) {
        throw new Error("No steps found on this page.");
      }
      const displayName = String(data.parse.title).replace("/Quick guide", "");
      const q: Quest = { name: displayName, ...parsed };

      const saved = loadStored(storageKey(displayName));
      let p: "info" | "items" | "steps" = "info";
      let step = 0;
      let items = new Set<number>();
      if (saved && saved.phase !== "done") {
        if (saved.phase === "steps") p = "steps";
        else if (saved.phase === "items") p = "items";
        step = Math.min(saved.step || 0, q.steps.length - 1);
        items = new Set<number>(
          (saved.items || []).filter((i: number) => i < q.items.length)
        );
      }

      setQuest(q);
      setPhase(p);
      setStepIdx(step);
      setItemsChecked(items);
      updateRecent(displayName, p === "steps" ? step : 0, q.steps.length);

      // Load gallery (and missing data) from the full guide in the background
      if (usedMainPage) {
        setGallery(parseGallery(html));
      } else {
        (async () => {
          try {
            const d2 = await fetchJson(
              `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
                displayName
              )}`
            );
            if (!d2.error) {
              const fullHtml = d2.parse.text["*"];
              const g = parseGallery(fullHtml);
              const own = parseGallery(html);
              const seen = new Set(g.map((x) => x.src));
              setGallery([...g, ...own.filter((x) => !seen.has(x.src))]);
              const c = parsed.meta.startCoords ? null : extractCoords(fullHtml);
              const extraRewards = parsed.rewards.length
                ? null
                : parseGuide(fullHtml).rewards;
              if (c || extraRewards) {
                setQuest((prev) => {
                  if (!prev || prev.name !== displayName) return prev;
                  return {
                    ...prev,
                    meta: c ? { ...prev.meta, startCoords: c } : prev.meta,
                    rewards: extraRewards || prev.rewards,
                  };
                });
              }
            }
          } catch {
            /* no gallery, no problem */
          }
        })();
      }
    } catch (e: any) {
      setError(e?.message || "Loading failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch images + coordinates for a wiki page
  const lookupPage = async (page: string, label: string) => {
    setLookup({ title: label, page, loading: true, images: [], coords: null, error: null });
    try {
      const data = await fetchJson(
        `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(
          page
        )}`
      );
      if (data.error) throw new Error("Page not found");
      const html: string = data.parse.text["*"];
      const coords = extractCoords(html);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const found: { src: string; isMap: boolean }[] = [];
      const seen = new Set<string>();
      doc.querySelectorAll("img").forEach((img) => {
        const w = parseInt(img.getAttribute("width") || "0", 10);
        if (w < 100) return;
        const src = resolveSrc(img.getAttribute("src") || "");
        if (!src || seen.has(src)) return;
        seen.add(src);
        found.push({ src, isMap: /location|map/i.test(src) });
      });
      found.sort((a, b) => Number(b.isMap) - Number(a.isMap));
      const images = found.slice(0, 3).map((f) => f.src);
      setLookup({
        title: label,
        page,
        loading: false,
        images,
        coords,
        error: images.length || coords ? null : "No images found on this page.",
      });
    } catch {
      setLookup((prev) =>
        prev ? { ...prev, loading: false, error: "Loading failed." } : null
      );
    }
  };

  const afterInfo = () => {
    if (!quest) return;
    const p = quest.items.length ? "items" : "steps";
    setPhase(p);
    persist(quest.name, p, stepIdx, itemsChecked);
  };

  const toggleItem = (i: number) => {
    if (!quest) return;
    setItemsChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      persist(quest.name, phase, stepIdx, next);
      return next;
    });
  };

  const startSteps = () => {
    if (!quest) return;
    setPhase("steps");
    setStepInfoOpen(false);
    persist(quest.name, "steps", stepIdx, itemsChecked);
    updateRecent(quest.name, stepIdx, quest.steps.length);
  };

  const nextStep = () => {
    if (!quest) return;
    setStepInfoOpen(false);
    if (stepIdx >= quest.steps.length - 1) {
      // Quest complete: record rewards in the profile
      const reward = parseRewardStats(quest.rewards);
      setLastReward(reward);
      setProgress((prev) => {
        const next = { ...prev, [quest.name]: reward };
        saveStored("qh-progress", next);
        return next;
      });
      setCompleted((prev) => {
        const next = new Set(prev);
        next.add(quest.name);
        saveStored("qh-completed", Array.from(next));
        return next;
      });
      setPhase("done");
      removeFromRecent(quest.name);
      removeStored(storageKey(quest.name));
      return;
    }
    const n = stepIdx + 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
  };

  const jumpToStep = (i: number) => {
    if (!quest) return;
    setStepIdx(i);
    setStepInfoOpen(false);
    setStepsOpen(false);
    persist(quest.name, "steps", i, itemsChecked);
    updateRecent(quest.name, i, quest.steps.length);
  };

  const prevStep = () => {
    if (!quest || stepIdx === 0) return;
    setStepInfoOpen(false);
    const n = stepIdx - 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
  };

  const total = quest ? quest.steps.length : 0;
  const pct = total ? Math.round((stepIdx / total) * 100) : 0;
  const step = quest && phase === "steps" ? quest.steps[stepIdx] : null;
  const isLast = quest ? stepIdx === total - 1 : false;
  const recentNames = new Set(recent.map((r) => r.name));
  const hasReqs = quest
    ? quest.meta.skillReqs.length > 0 ||
      quest.meta.otherReqs.length > 0 ||
      quest.meta.enemies.length > 0
    : false;

  // Profile totals
  const totalQp = Object.values(progress).reduce((s, p) => s + (p.qp || 0), 0);
  const xpTotals: Record<string, number> = {};
  Object.values(progress).forEach((p) => {
    Object.entries(p.xp || {}).forEach(([sk, amt]) => {
      xpTotals[sk] = (xpTotals[sk] || 0) + amt;
    });
  });
  const xpSorted = Object.entries(xpTotals).sort((a, b) => b[1] - a[1]);
  const completedList = Array.from(completed).sort();

  // What's next: first quests from the Optimal Quest Guide not yet done
  const questByLower = new Map(allQuests.map((n) => [n.toLowerCase(), n]));
  const upNext = optimal
    .map((n) => questByLower.get(n.toLowerCase()))
    .filter((n): n is string => !!n && !completed.has(n));
  const nextQuest = upNext.length > 0 ? upNext[0] : null;
  const afterThat = upNext.slice(1, 4);

  // Quest list groups, like the in-game quest tab
  const questStatus = (name: string): "done" | "progress" | "new" =>
    completed.has(name) ? "done" : recentNames.has(name) ? "progress" : "new";
  const statusColor = (s: "done" | "progress" | "new") =>
    s === "done" ? C.qGreen : s === "progress" ? C.qYellow : C.qRed;
  const freeQuests = allQuests.filter((n) => f2p.has(n) && !miniSet.has(n));
  const memberQuests = allQuests.filter((n) => !f2p.has(n) && !miniSet.has(n));
  const miniQuests = allQuests.filter((n) => miniSet.has(n));

  // ── Styles ──
  const frame: React.CSSProperties = {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "system-ui, sans-serif",
    fontSize: 15,
    lineHeight: 1.45,
  };
  const goldTitle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: C.gold,
    letterSpacing: 0.5,
  };
  const card: React.CSSProperties = {
    background: C.panel,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 10,
  };
  const bigBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "15px",
    fontSize: 17,
    fontWeight: 700,
    background: C.gold,
    color: C.ink,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.45)",
  };
  const ghostBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "13px",
    fontSize: 15,
    fontWeight: 600,
    background: "transparent",
    color: C.textDim,
    border: `1px solid ${C.borderSoft}`,
    borderRadius: 12,
    cursor: "pointer",
  };
  const chip: React.CSSProperties = {
    padding: "6px 12px",
    background: C.panelSoft,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    fontSize: 13,
    color: C.parch,
  };
  const headBtn: React.CSSProperties = {
    background: "transparent",
    border: `1px solid ${C.borderSoft}`,
    color: C.gold,
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 15,
    cursor: "pointer",
  };
  const dashed: React.CSSProperties = {
    borderTop: `1px dashed ${C.goldDim}`,
    margin: "14px 0 0",
  };
  const toolChip: React.CSSProperties = {
    padding: "7px 12px",
    background: "rgba(58,46,25,.08)",
    color: C.ink,
    border: "1.5px solid rgba(58,46,25,.45)",
    borderRadius: 16,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
  const toolIcon: React.CSSProperties = {
    ...toolChip,
    width: 34,
    height: 34,
    padding: 0,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 15,
  };

  const questListGroup = (title: string, names: string[]) =>
    names.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: C.goldDim,
            padding: "6px 2px",
          }}
        >
          {title}
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          {names.map((n, i) => {
            const s = questStatus(n);
            const isDone = s === "done";
            return (
              <button
                key={n}
                onClick={() => (editMode ? toggleCompleted(n) : openQuest(n))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  background: "transparent",
                  color: statusColor(s),
                  border: "none",
                  borderBottom:
                    i < names.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {editMode && (
                  <span
                    style={{
                      flexShrink: 0,
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      background: isDone ? C.qGreen : "transparent",
                      color: isDone ? C.bg : "transparent",
                      border: isDone
                        ? `1px solid ${C.qGreen}`
                        : `2px solid ${C.border}`,
                    }}
                  >
                    ✓
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>
    );

  // ── Overlay (gallery / lookup / profile) ──
  const overlay = (title: string, onClose: () => void, children: React.ReactNode) => (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.7)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "82vh",
          overflowY: "auto",
          background: C.bg,
          borderTop: `2px solid ${C.gold}`,
          borderRadius: "16px 16px 0 0",
          padding: "14px 14px 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ ...goldTitle, fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: C.panelSoft,
              color: C.parch,
              border: `1px solid ${C.border}`,
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  // ── Profile overlay ──
  const profileOverlay =
    profileOpen &&
    overlay("👤 Profile", () => setProfileOpen(false), (
      <>
        {player ? (
          <div style={{ ...card, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ color: C.parch, fontWeight: 700, fontSize: 16 }}>
              {player.name}
            </div>
            {combatLevel !== null && (
              <div style={{ fontSize: 13, color: C.textDim }}>
                Combat level <b style={{ color: C.gold }}>{combatLevel}</b>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>
            Enter your RSN on the home screen to link your stats.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ ...card, flex: 1, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>
              {completedList.length}
            </div>
            <div style={{ fontSize: 12, color: C.textDim }}>🏆 Quests done</div>
          </div>
          <div style={{ ...card, flex: 1, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold }}>
              {totalQp}
            </div>
            <div style={{ fontSize: 12, color: C.textDim }}>⭐ Quest points</div>
          </div>
        </div>

        <div style={{ ...goldTitle, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          📈 XP earned from quests
        </div>
        {xpSorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>
            No XP tracked yet — complete a quest in the app and its rewards will
            show up here.
          </div>
        )}
        {xpSorted.map(([sk, amt]) => (
          <div
            key={sk}
            style={{
              ...card,
              display: "flex",
              justifyContent: "space-between",
              padding: "9px 14px",
              marginBottom: 5,
              fontSize: 14,
            }}
          >
            <span style={{ color: C.parch }}>{capitalize(sk)}</span>
            <span style={{ color: C.gold, fontWeight: 700 }}>
              +{fmtNum(amt)} xp
            </span>
          </div>
        ))}

        <div
          style={{
            ...goldTitle,
            fontSize: 15,
            fontWeight: 700,
            margin: "14px 0 6px",
          }}
        >
          ✅ Completed quests
        </div>
        {completedList.length === 0 && (
          <div style={{ fontSize: 13, color: C.textDim }}>
            Nothing completed yet — your adventure awaits!
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {completedList.map((n) => (
            <span
              key={n}
              style={{
                ...chip,
                borderColor: C.green,
                color: C.textDim,
                fontSize: 12,
              }}
            >
              ✓ {n}
            </span>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.textDim, marginTop: 14 }}>
          Quest points and XP are tracked from quests completed in this app.
        </div>
      </>
    ));

  // ── World map (fullscreen) ──
  const worldMapOverlay = worldMap && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: C.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `2px solid ${C.border}`,
        }}
      >
        <div
          style={{
            ...goldTitle,
            fontSize: 16,
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          🗺️ {worldMap.title}
        </div>
        <button
          onClick={toggleRouteMode}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: routeMode ? C.gold : C.panelSoft,
            color: routeMode ? C.ink : C.gold,
            border: `1px solid ${routeMode ? C.gold : C.border}`,
            fontSize: 15,
            cursor: "pointer",
            lineHeight: 1,
          }}
          title="Measure route"
        >
          📏
        </button>
        {[0, 1, 2, 3].map((p) => (
          <button
            key={p}
            onClick={() => setMapFloor(p)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: floor === p ? C.gold : "transparent",
              color: floor === p ? C.ink : C.textDim,
              border: `1px solid ${floor === p ? C.gold : C.borderSoft}`,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title={`Floor ${p}`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={toggleF2pMode}
          style={{
            height: 30,
            padding: "0 9px",
            borderRadius: 8,
            background: f2pMode ? C.gold : "transparent",
            color: f2pMode ? C.ink : C.textDim,
            border: `1px solid ${f2pMode ? C.gold : C.borderSoft}`,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Highlight free-to-play area"
        >
          F2P
        </button>
        <button
          onClick={() => setWorldMap(null)}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: C.panelSoft,
            color: C.parch,
            border: `1px solid ${C.border}`,
            fontSize: 15,
            cursor: "pointer",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
      {routeMode && !routeModalOpen && (
        <div
          style={{
            padding: "8px 14px",
            fontSize: 13,
            color: C.textDim,
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.panel,
          }}
        >
          📏 Tap your start point, then your destination.
        </div>
      )}
      {mapError ? (
        <div style={{ padding: 30, textAlign: "center", color: C.textDim }}>
          {mapError}
        </div>
      ) : (
        <div ref={mapDivRef} style={{ flex: 1, background: "#000" }} />
      )}

      {/* Route advice modal */}
      {routeResult && routeModalOpen && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1200,
            maxHeight: "62%",
            overflowY: "auto",
            background: C.bg,
            borderTop: `2px solid ${C.gold}`,
            borderRadius: "16px 16px 0 0",
            padding: "12px 14px 20px",
            boxSizing: "border-box",
            boxShadow: "0 -6px 24px rgba(0,0,0,.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, flex: 1 }}>
              📏 {routeResult.tiles} tiles
            </div>
            <button
              onClick={toggleF2pMode}
              style={{
                height: 28,
                padding: "0 9px",
                borderRadius: 8,
                background: f2pMode ? C.gold : "transparent",
                color: f2pMode ? C.ink : C.textDim,
                border: `1px solid ${f2pMode ? C.gold : C.borderSoft}`,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              F2P only
            </button>
            <button
              onClick={() => setRouteModalOpen(false)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: C.panelSoft,
                color: C.parch,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
            🚶 Walk ~{fmtSec(routeResult.tiles * 0.6)} · 🏃 Run ~
            {fmtSec(runSecs(routeResult.tiles))}
          </div>

          {buildRouteOptions(routeResult.a, routeResult.b, f2pMode).map(
            (opt, i) => (
              <div
                key={opt.name}
                style={{
                  ...card,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  marginBottom: 6,
                  borderColor: i === 0 ? C.gold : C.borderSoft,
                }}
              >
                <span style={{ fontSize: 17, flexShrink: 0 }}>{opt.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: i === 0 ? C.gold : C.parch,
                    }}
                  >
                    {opt.name}
                    {!opt.f2p && !f2pMode && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.textDim,
                          marginLeft: 6,
                          fontWeight: 400,
                        }}
                      >
                        members
                      </span>
                    )}
                    {i === 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.ink,
                          background: C.gold,
                          borderRadius: 5,
                          padding: "1px 5px",
                          marginLeft: 6,
                          fontWeight: 700,
                        }}
                      >
                        BEST
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim }}>
                    {opt.detail}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 14,
                    fontWeight: 700,
                    color: i === 0 ? C.gold : C.text,
                  }}
                >
                  ~{fmtSec(opt.sec)}
                </span>
              </div>
            )
          )}

          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
            Straight-line estimates — walls, doors and stairs not included.
          </div>
        </div>
      )}
    </div>
  );

  // ── Home ──
  if (view === "home") {
    return (
      <div style={frame}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 14px 40px" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ ...goldTitle, fontSize: 26, fontWeight: 700 }}>
              ⚔️ Quest Helper
            </div>
            <div style={{ color: C.textDim, fontSize: 13, marginTop: 2 }}>
              OSRS Wiki quick guides, right next to your game
            </div>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a quest…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 16px",
              fontSize: 16,
              background: C.panelSoft,
              color: C.parch,
              border: `2px solid ${C.border}`,
              borderRadius: 10,
              outline: "none",
            }}
          />

          {suggest.length > 0 && (
            <div style={{ ...card, marginTop: 8, overflow: "hidden" }}>
              {suggest.map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setQuery("");
                    openQuest(n);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "13px 16px",
                    background: "transparent",
                    color: C.parch,
                    border: "none",
                    borderBottom: `1px solid ${C.borderSoft}`,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* RSN / stats — right under the search bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
                placeholder="RuneScape name…"
                maxLength={12}
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: "border-box",
                  padding: "11px 14px",
                  fontSize: 15,
                  background: C.panelSoft,
                  color: C.parch,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  outline: "none",
                }}
              />
              <button
                onClick={loadStats}
                disabled={statsLoading || !rsn.trim()}
                style={{
                  flexShrink: 0,
                  padding: "11px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  background: C.gold,
                  color: C.ink,
                  border: "none",
                  borderRadius: 10,
                  cursor: "pointer",
                  opacity: statsLoading || !rsn.trim() ? 0.5 : 1,
                }}
              >
                {statsLoading ? "…" : player ? "Refresh" : "Load"}
              </button>
            </div>
            {player && !statsError && (
              <div style={{ fontSize: 13, color: C.green, marginTop: 6 }}>
                ✓ Stats loaded for {player.name}
                {combatLevel !== null ? ` · Combat level ${combatLevel}` : ""}
              </div>
            )}
            {statsError && (
              <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>
                {statsError}
              </div>
            )}
            {!player && !statsError && (
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                With your stats loaded you'll see whether you meet each quest's
                skill requirements.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() =>
                setWorldMap({ x: 3222, y: 3218, title: "Gielinor", marker: false })
              }
              style={{ ...ghostBtn, flex: 1, color: C.gold, borderColor: C.border }}
            >
              🗺️ World map
            </button>
            <button
              onClick={() => setProfileOpen(true)}
              style={{ ...ghostBtn, flex: 1, color: C.gold, borderColor: C.border }}
            >
              👤 Profile
            </button>
          </div>

          {nextQuest && (
            <div
              onClick={() => openQuest(nextQuest)}
              style={{
                ...card,
                borderColor: C.gold,
                padding: "14px 16px",
                marginTop: 26,
                cursor: "pointer",
                boxShadow: "0 3px 12px rgba(0,0,0,.35)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: C.goldDim,
                  fontWeight: 700,
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                🎯 WHAT'S NEXT
              </div>
              <div style={{ ...goldTitle, fontSize: 19, fontWeight: 700 }}>
                {nextQuest}
              </div>
              {afterThat.length > 0 && (
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                  Then: {afterThat.join(" · ")}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                Based on the wiki's Optimal Quest Guide — tap to start
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
                Continue
              </div>
              {recent.map((r) => {
                const p = r.total ? Math.round((r.done / r.total) * 100) : 0;
                return (
                  <div
                    key={r.name}
                    onClick={() => openQuest(r.name)}
                    style={{
                      ...card,
                      padding: "12px 14px",
                      marginBottom: 8,
                      cursor: "pointer",
                      color: C.text,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          color: C.parch,
                          fontWeight: 600,
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.name}
                      </span>
                      <span style={{ color: C.gold, fontSize: 13 }}>{p}%</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRecent(r.name);
                        }}
                        style={{
                          flexShrink: 0,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: "transparent",
                          color: C.textDim,
                          border: `1px solid ${C.borderSoft}`,
                          fontSize: 13,
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      style={{
                        height: 5,
                        marginTop: 8,
                        background: C.bg,
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: p + "%",
                          height: "100%",
                          background: C.gold,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quest List — styled like the in-game quest tab */}
          <div style={{ marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ ...goldTitle, fontSize: 15 }}>Quest List</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 13, color: C.textDim }}>
                  Quest Points: <b style={{ color: C.gold }}>{totalQp}</b>
                </div>
                <button
                  onClick={() => setEditMode(!editMode)}
                  style={{
                    padding: "6px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: editMode ? C.gold : "transparent",
                    color: editMode ? C.ink : C.gold,
                    border: `1px solid ${editMode ? C.gold : C.borderSoft}`,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {editMode ? "Done" : "✏️ Mark done"}
                </button>
              </div>
            </div>
            {editMode && (
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 8 }}>
                Tap quests you've already completed to mark them ✓ — tap again to
                undo. Press Done when finished.
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 11,
                color: C.textDim,
                marginBottom: 10,
              }}
            >
              <span>
                <span style={{ color: C.qRed }}>●</span> Not started
              </span>
              <span>
                <span style={{ color: C.qYellow }}>●</span> In progress
              </span>
              <span>
                <span style={{ color: C.qGreen }}>●</span> Completed
              </span>
            </div>
            {questListGroup("Free Quests", freeQuests)}
            {questListGroup("Members' Quests", memberQuests)}
            {questListGroup("Miniquests", miniQuests)}
          </div>
        </div>
        {profileOverlay}
        {worldMapOverlay}
      </div>
    );
  }

  // ── Quest view ──
  return (
    <div style={{ ...frame, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          background: C.bg,
          borderBottom: `2px solid ${C.border}`,
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setView("home")} style={headBtn}>
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...goldTitle,
                fontSize: 17,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {quest ? quest.name : "Loading…"}
            </div>
            {quest && phase === "info" && (
              <div style={{ fontSize: 12, color: C.textDim }}>Quest info</div>
            )}
            {quest && phase === "steps" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Step {stepIdx + 1} of {total} · {pct}%
              </div>
            )}
            {quest && phase === "items" && (
              <div style={{ fontSize: 12, color: C.textDim }}>
                Required items · {itemsChecked.size}/{quest.items.length}
              </div>
            )}
          </div>
          <button onClick={() => setProfileOpen(true)} style={headBtn}>
            👤
          </button>
        </div>
        {quest && phase === "steps" && (
          <div
            style={{
              height: 5,
              marginTop: 8,
              background: C.panel,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: pct + "%",
                height: "100%",
                background: C.gold,
                transition: "width .3s",
              }}
            />
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          padding: "16px 14px 30px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: C.textDim }}>
            Fetching the quick guide from the wiki…
          </div>
        )}

        {error && (
          <div style={{ ...card, borderColor: C.red, padding: 16, color: C.parch }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 4 }}>
              Couldn't load the guide
            </div>
            {error}
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setView("home")}
                style={{
                  background: C.panelSoft,
                  border: `1px solid ${C.border}`,
                  color: C.gold,
                  borderRadius: 8,
                  padding: "9px 14px",
                  cursor: "pointer",
                }}
              >
                Back to search
              </button>
            </div>
          </div>
        )}

        {/* Phase 0: quest info & requirements */}
        {quest && phase === "info" && (
          <>
            <div style={{ flex: 1 }}>
              {(quest.meta.difficulty || quest.meta.length) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                  {quest.meta.difficulty && (
                    <span style={chip}>🏁 {quest.meta.difficulty}</span>
                  )}
                  {quest.meta.length && (
                    <span style={chip}>⏱️ {quest.meta.length}</span>
                  )}
                </div>
              )}

              {quest.meta.start && (
                <div
                  onClick={() => {
                    if (quest.meta.startCoords) {
                      setWorldMap({
                        x: quest.meta.startCoords.x,
                        y: quest.meta.startCoords.y,
                        title: "Start point",
                        marker: true,
                        plane: quest.meta.startCoords.plane,
                        mapId: quest.meta.startCoords.mapId,
                      });
                    }
                  }}
                  style={{
                    ...card,
                    padding: "11px 14px",
                    marginBottom: 14,
                    cursor: quest.meta.startCoords ? "pointer" : "default",
                    borderColor: quest.meta.startCoords ? C.gold : C.borderSoft,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.goldDim, fontWeight: 700 }}>
                      📍 START POINT
                    </span>
                    {quest.meta.startCoords && (
                      <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>
                        🗺️ Show on map
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: C.parch }}>{quest.meta.start}</div>
                </div>
              )}

              <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                Requirements
              </div>

              {!hasReqs && (
                <div style={{ color: C.textDim, fontSize: 14 }}>
                  No requirements — you can start right away! 🎉
                </div>
              )}

              {quest.meta.skillReqs.map((req, i) => {
                const ok = checkReq(req);
                return (
                  <div
                    key={i}
                    style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      marginBottom: 6,
                      borderColor:
                        ok === true ? C.green : ok === false ? C.red : C.borderSoft,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>
                      {ok === true ? "✅" : ok === false ? "❌" : "▫️"}
                    </span>
                    <span style={{ color: C.parch, fontSize: 15, flex: 1 }}>
                      Level {req.level} {req.skill}
                      {req.note && (
                        <span style={{ color: C.textDim, fontSize: 13 }}> {req.note}</span>
                      )}
                    </span>
                    {player && (
                      <span
                        style={{
                          fontSize: 13,
                          color: ok ? C.green : C.red,
                          fontWeight: 700,
                        }}
                      >
                        {player.skills[normalizeSkill(req.skill)] ?? 1}
                      </span>
                    )}
                  </div>
                );
              })}

              {quest.meta.skillReqs.length > 0 && !player && (
                <div style={{ fontSize: 12, color: C.textDim, margin: "4px 0 10px" }}>
                  Tip: enter your RSN on the home screen and I'll check your levels
                  automatically.
                </div>
              )}

              {quest.meta.otherReqs.map((t, i) => {
                const qName = matchQuest(t);
                if (!qName) {
                  return (
                    <div
                      key={i}
                      style={{
                        ...card,
                        padding: "10px 14px",
                        marginBottom: 6,
                        fontSize: 14,
                        color: C.text,
                      }}
                    >
                      📜 {t}
                    </div>
                  );
                }
                const isDone = completed.has(qName);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (!isDone) openQuest(qName);
                    }}
                    style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      marginBottom: 6,
                      cursor: isDone ? "default" : "pointer",
                      borderColor: isDone ? C.green : C.gold,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>{isDone ? "✅" : "📜"}</span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 15,
                        color: isDone ? C.textDim : C.gold,
                        textDecoration: isDone ? "line-through" : "underline",
                        fontWeight: 600,
                      }}
                    >
                      {qName}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompleted(qName);
                      }}
                      style={{
                        flexShrink: 0,
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        background: isDone ? C.green : "transparent",
                        color: isDone ? C.bg : "transparent",
                        border: isDone
                          ? `1px solid ${C.green}`
                          : `2px solid ${C.border}`,
                        cursor: "pointer",
                      }}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}

              {quest.meta.otherReqs.some((t) => matchQuest(t) && !completed.has(matchQuest(t) as string)) && (
                <div style={{ fontSize: 12, color: C.textDim, margin: "4px 0 10px" }}>
                  Tap a quest to open it, or tap the box if you've already
                  completed it.
                </div>
              )}

              {quest.meta.enemies.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ ...goldTitle, fontSize: 14, fontWeight: 700 }}>
                      ⚔️ Enemies to defeat
                    </div>
                    {combatLevel !== null && (
                      <span style={{ fontSize: 12, color: C.textDim }}>
                        Your combat: <b style={{ color: C.gold }}>{combatLevel}</b>
                      </span>
                    )}
                  </div>
                  {quest.meta.enemies.map((e, i) => {
                    const lvl = enemyLevel(e);
                    const ok =
                      combatLevel !== null && lvl !== null
                        ? combatLevel >= lvl
                        : null;
                    return (
                      <div
                        key={i}
                        style={{
                          ...card,
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          marginBottom: 6,
                          borderColor:
                            ok === true
                              ? C.green
                              : ok === false
                              ? C.red
                              : C.borderSoft,
                        }}
                      >
                        <span style={{ fontSize: 15 }}>
                          {ok === true ? "✅" : ok === false ? "⚠️" : "⚔️"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 14,
                            color: ok === true ? C.green : ok === false ? C.parch : C.text,
                          }}
                        >
                          {e}
                        </span>
                        {ok === false && (
                          <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>
                            above your level
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {combatLevel !== null && (
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                      Based on combat level only — gear and tactics matter too.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={afterInfo} style={{ ...bigBtn, marginTop: 16 }}>
              {quest.items.length ? "To required items →" : "Start quest →"}
            </button>
          </>
        )}

        {/* Phase 1: item checklist */}
        {quest && phase === "items" && (
          <>
            <div style={{ ...goldTitle, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              🎒 Gather these items
            </div>
            <div style={{ flex: 1 }}>
              {quest.items.map((it, i) => {
                const isDone = itemsChecked.has(i);
                const infoOpen = openInfo === i;
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: isDone ? C.panel : C.panelSoft,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 10,
                        padding: "4px 6px 4px 4px",
                      }}
                    >
                      <button
                        onClick={() => toggleItem(i)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flex: 1,
                          minWidth: 0,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          padding: "9px 6px",
                          cursor: "pointer",
                          color: isDone ? C.textDim : C.parch,
                          textDecoration: isDone ? "line-through" : "none",
                          fontSize: 15,
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            background: isDone ? C.green : "transparent",
                            color: isDone ? C.bg : "transparent",
                            border: isDone
                              ? `1px solid ${C.green}`
                              : `2px solid ${C.border}`,
                          }}
                        >
                          ✓
                        </span>
                        <span>{it.name}</span>
                      </button>
                      {it.info && (
                        <button
                          onClick={() => setOpenInfo(infoOpen ? null : i)}
                          style={{
                            flexShrink: 0,
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: infoOpen ? C.gold : "transparent",
                            color: infoOpen ? C.ink : C.gold,
                            border: `1px solid ${infoOpen ? C.gold : C.goldDim}`,
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          i
                        </button>
                      )}
                    </div>
                    {it.info && infoOpen && (
                      <div
                        style={{
                          margin: "4px 0 8px 36px",
                          padding: "9px 12px",
                          background: C.panel,
                          border: `1px solid ${C.goldDim}`,
                          borderRadius: 8,
                          fontSize: 13,
                          color: C.text,
                        }}
                      >
                        {it.info}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={startSteps} style={{ ...bigBtn, marginTop: 16 }}>
              Start quest →
            </button>
          </>
        )}

        {/* Phase 2: step wizard, each step on its own screen */}
        {quest && phase === "steps" && step && (
          <>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: C.goldDim,
                  marginBottom: 10,
                }}
              >
                {step.section}
              </div>
              <div
                style={{
                  flex: 1,
                  background: C.parch,
                  color: C.ink,
                  border: `2px solid ${C.gold}`,
                  borderRadius: 14,
                  padding: "22px 18px",
                  fontSize: 18,
                  lineHeight: 1.55,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  boxShadow: "0 4px 16px rgba(0,0,0,.4)",
                  overflowY: "auto",
                }}
              >
                <span>{renderRich(step.text)}</span>

                {step.images.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    style={{
                      maxWidth: "100%",
                      maxHeight: 260,
                      objectFit: "contain",
                      borderRadius: 10,
                      marginTop: 14,
                      border: `1px solid ${C.goldDim}`,
                      alignSelf: "center",
                    }}
                  />
                ))}

                {/* Toolbar: permanent dashed divider with all step actions */}
                <div style={dashed} />
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {step.links.map((l) => (
                    <button
                      key={l.page}
                      onClick={() => lookupPage(l.page, l.label)}
                      style={toolChip}
                    >
                      🔍 {l.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setStepsOpen(true)}
                    style={toolIcon}
                    title="All steps"
                  >
                    📋
                  </button>
                  {gallery.length > 0 && (
                    <button
                      onClick={() => setGalleryOpen(true)}
                      style={toolIcon}
                      title="Maps & images"
                    >
                      🖼️
                    </button>
                  )}
                  <button
                    onClick={() => setPhase("info")}
                    style={toolIcon}
                    title="Quest info"
                  >
                    ℹ️
                  </button>
                  {quest.items.length > 0 && (
                    <button
                      onClick={() => setPhase("items")}
                      style={toolIcon}
                      title="Required items"
                    >
                      🎒
                    </button>
                  )}
                  {step.info.length > 0 && (
                    <button
                      onClick={() => setStepInfoOpen(!stepInfoOpen)}
                      style={{
                        ...toolIcon,
                        fontFamily: "Georgia, serif",
                        fontWeight: 700,
                        background: stepInfoOpen ? C.ink : "rgba(58,46,25,.08)",
                        color: stepInfoOpen ? C.parch : C.ink,
                      }}
                    >
                      i
                    </button>
                  )}
                </div>

                {stepInfoOpen && step.info.length > 0 && (
                  <>
                    <div style={dashed} />
                    <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
                      {step.info.map((inf, i) => (
                        <div key={i} style={{ padding: "3px 0" }}>
                          ℹ️ {renderRich(inf)}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                onClick={nextStep}
                style={{
                  ...bigBtn,
                  background: isLast ? C.green : C.gold,
                }}
              >
                {isLast ? "Quest complete 🏆" : "Next ✓"}
              </button>
              <button
                onClick={prevStep}
                disabled={stepIdx === 0}
                style={{
                  ...ghostBtn,
                  marginTop: 8,
                  opacity: stepIdx === 0 ? 0.35 : 1,
                }}
              >
                ← Previous
              </button>
            </div>
          </>
        )}

        {/* Phase 3: complete */}
        {quest && phase === "done" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 60 }}>🏆</div>
            <div
              style={{
                ...goldTitle,
                fontSize: 24,
                fontWeight: 700,
                marginTop: 10,
              }}
            >
              Quest complete!
            </div>
            <div style={{ color: C.textDim, marginTop: 6 }}>
              {quest.name} has been completed and removed from your list.
            </div>
            {lastReward && (lastReward.qp > 0 || Object.keys(lastReward.xp).length > 0) && (
              <div style={{ ...card, padding: "12px 18px", marginTop: 16 }}>
                {lastReward.qp > 0 && (
                  <div style={{ color: C.gold, fontWeight: 700, fontSize: 15 }}>
                    ⭐ +{lastReward.qp} Quest point{lastReward.qp > 1 ? "s" : ""}
                  </div>
                )}
                {Object.entries(lastReward.xp).map(([sk, amt]) => (
                  