import { API, cleanText, fetchJson, normalizeSkill, resolveSrc } from "./format";

export type SkillReq = { level: number; skill: string; note: string };
export type Coords = { x: number; y: number; plane?: number; mapId?: number };
export type Meta = {
  difficulty: string | null;
  length: string | null;
  start: string | null;
  startCoords: Coords | null;
  skillReqs: SkillReq[];
  otherReqs: string[];
  enemies: string[];
};
export type LinkRef = { label: string; page: string };
export type Step = {
  text: string;
  info: string[];
  images: string[];
  links: LinkRef[];
  section: string;
};
export type Item = { name: string; info: string | null };
export type Quest = {
  name: string;
  steps: Step[];
  items: Item[];
  meta: Meta;
  rewards: string[];
};
export type RecentItem = { name: string; done: number; total: number };
export type Player = { name: string; skills: Record<string, number> };
export type GalleryImg = { src: string; caption: string };
export type Lookup = {
  title: string;
  page: string;
  loading: boolean;
  images: string[];
  coords: Coords | null;
  error: string | null;
};
export type QuestReward = { qp: number; xp: Record<string, number> };
export type Progress = Record<string, QuestReward>;

export const SKILLS = new Set([
  "attack", "strength", "defence", "ranged", "prayer", "magic",
  "runecraft", "runecrafting", "hitpoints", "crafting", "mining",
  "smithing", "fishing", "cooking", "firemaking", "woodcutting",
  "agility", "herblore", "thieving", "fletching", "slayer",
  "farming", "construction", "hunter",
]);

// Official OSRS combat level formula
export function calcCombat(skills: Record<string, number>): number {
  const g = (n: string) => skills[n] ?? 1;
  const base = 0.25 * (g("defence") + Math.max(g("hitpoints"), 10) + Math.floor(g("prayer") / 2));
  const melee = 0.325 * (g("attack") + g("strength"));
  const range = 0.325 * Math.floor((3 * g("ranged")) / 2);
  const mage = 0.325 * Math.floor((3 * g("magic")) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

// Highest "(level X)" found in an enemy description
export function enemyLevel(s: string): number | null {
  const matches = Array.from(s.matchAll(/levels?\s*(\d+)/gi));
  if (!matches.length) return null;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

// Split "Bucket of milk (can be bought at...)" into name + extra info
export function splitItem(raw: string): Item {
  const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m && m[1].trim()) {
    return { name: cleanText(m[1]), info: cleanText(m[2]) };
  }
  return { name: cleanText(raw), info: null };
}

// Extract quest points + XP amounts from reward lines
export function parseRewardStats(rewards: string[]): QuestReward {
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

// Extract game coordinates from wiki HTML (embedded maps)
export function extractCoords(html: string): Coords | null {
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
export function parseGallery(html: string): GalleryImg[] {
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
    if (t) el.textContent = "" + t + "";
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
export function parseGuide(html: string): {
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

export async function fetchPageHtml(page: string): Promise<string | null> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text&page=${encodeURIComponent(page)}`
    );
    if (data.error) return null;
    return data.parse.text["*"];
  } catch {
    return null;
  }
}

// Same as fetchPageHtml but also grabs the page's wiki categories in the
// same request (prop=text|categories) — used to detect boss monsters via
// their "Category:Bosses" membership without a second network round-trip.
export async function fetchPageHtmlWithCategories(
  page: string
): Promise<{ html: string | null; categories: string[] }> {
  try {
    const data = await fetchJson(
      `${API}?action=parse&format=json&origin=*&redirects=1&prop=text%7Ccategories&page=${encodeURIComponent(page)}`
    );
    if (data.error) return { html: null, categories: [] };
    const categories: string[] = (data.parse.categories || []).map((c: any) => String(c["*"] || ""));
    return { html: data.parse.text["*"], categories };
  } catch {
    return { html: null, categories: [] };
  }
}

// Images + coordinates for a wiki page, prioritising map/location images —
// this is how an NPC's roaming-area map (shown on its infobox "Map"
// section) gets picked up ahead of e.g. its portrait.
export function buildLookup(page: string, title: string, html: string): Lookup {
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
  return {
    title,
    page,
    loading: false,
    images,
    coords,
    error: images.length || coords ? null : "No images found on this page.",
  };
}

export async function fetchLookup(page: string, title: string): Promise<Lookup> {
  const html = await fetchPageHtml(page);
  if (!html) return { title, page, loading: false, images: [], coords: null, error: "Page not found." };
  return buildLookup(page, title, html);
}
