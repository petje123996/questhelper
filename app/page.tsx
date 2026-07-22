"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── OSRS Quest Helper ───────────────────────────────────────────
// Flow: quest info & requirements → item checklist → step wizard.
// World map: Leaflet + official wiki tiles, NPC & start markers.

const API = "https://oldschool.runescape.wiki/api.php";
const WIKI = "https://oldschool.runescape.wiki";
const TILES = "https://maps.runescape.wiki/osrs/tiles";

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

const SKILLS = new Set([
  "attack", "strength", "defence", "ranged", "prayer", "magic",
  "runecraft", "runecrafting", "hitpoints", "crafting", "mining",
  "smithing", "fishing", "cooking", "firemaking", "woodcutting",
  "agility", "herblore", "thieving", "fletching", "slayer",
  "farming", "construction", "hunter",
]);

type SkillReq = { level: number; skill: string; note: string };
type Coords = { x: number; y: number };
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
type Quest = { name: string; steps: Step[]; items: Item[]; meta: Meta };
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
type WorldMap = { x: number; y: number; title: string; marker: boolean };

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

function resolveSrc(raw: string): string {
  if (raw.startsWith("//")) return "https:" + raw;
  if (raw.startsWith("/")) return WIKI + raw;
  return raw;
}

function wikiUrl(page: string): string {
  return WIKI + "/w/" + encodeURIComponent(page.replace(/ /g, "_"));
}

// Extract game coordinates from wiki HTML (embedded maps)
function extractCoords(html: string): Coords | null {
  const valid = (x: number, y: number) =>
    x >= 1000 && x <= 13000 && y >= 1000 && y <= 13000 ? { x, y } : null;
  let m = html.match(/"coordinates"\s*:\s*\[\s*(\d{3,5})(?:\.\d+)?\s*,\s*(\d{3,5})/);
  if (m) {
    const r = valid(+m[1], +m[2]);
    if (r) return r;
  }
  m = html.match(/data-x="(\d{3,5})"[^>]*data-y="(\d{3,5})"/);
  if (m) {
    const r = valid(+m[1], +m[2]);
    if (r) return r;
  }
  m = html.match(/data-lon="(\d{3,5}(?:\.\d+)?)"[^>]*data-lat="(\d{3,5}(?:\.\d+)?)"/);
  if (m) {
    const r = valid(Math.round(+m[1]), Math.round(+m[2]));
    if (r) return r;
  }
  m = html.match(/data-lat="(\d{3,5}(?:\.\d+)?)"[^>]*data-lon="(\d{3,5}(?:\.\d+)?)"/);
  if (m) {
    const r = valid(Math.round(+m[2]), Math.round(+m[1]));
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

// Turn wiki HTML into steps + items + quest info
function parseGuide(html: string): { steps: Step[]; items: Item[]; meta: Meta } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;

  root
    .querySelectorAll(
      ".navbox, .references, .reference, #toc, .toc, .mw-editsection, .messagebox, .infobox, style, script, sup"
    )
    .forEach((el) => el.remove());

  const items: Item[] = [];
  const meta: Meta = {
    difficulty: null,
    length: null,
    start: null,
    startCoords: null,
    skillReqs: [],
    otherReqs: [],
    enemies: [],
  };

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

  const SKIP = /reference|navigat|see also|trivia|gallery|changes|reward/i;
  const steps: Step[] = [];
  let sectionTitle = "Walkthrough";
  let skipping = false;

  const pushLis = (listEl: Element) => {
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const st = makeStep(li, sectionTitle);
      if (st) steps.push(st);
      li.querySelectorAll(":scope > ul, :scope > ol").forEach((sub) => pushLis(sub));
    });
  };

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      const tag = child.tagName;
      if (tag === "H2" || tag === "H3") {
        const title = cleanText(child.textContent || "");
        skipping = SKIP.test(title);
        if (!skipping && title) sectionTitle = title;
        return;
      }
      if (skipping) return;
      if (tag === "UL" || tag === "OL") {
        if (!child.closest("table")) pushLis(child);
        return;
      }
      if (tag === "DIV" || tag === "SECTION") walk(child);
    });
  };
  walk(root);

  return { steps, items, meta };
}

export default function QuestHelper() {
  const [view, setView] = useState<"home" | "quest">("home");
  const [phase, setPhase] = useState<"info" | "items" | "steps" | "done">("info");
  const [query, setQuery] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [allQuests, setAllQuests] = useState<string[]>(POPULAR);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [quest, setQuest] = useState<Quest | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [itemsChecked, setItemsChecked] = useState<Set<number>>(new Set());
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [stepInfoOpen, setStepInfoOpen] = useState(false);
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

    const savedPlayer = loadStored("qh-rsn");
    if (savedPlayer && savedPlayer.name && savedPlayer.skills) {
      setPlayer(savedPlayer);
      setRsn(savedPlayer.name);
    }

    // Full quest list from the wiki (refresh at most weekly)
    const cached = loadStored("qh-questlist");
    if (cached && Array.isArray(cached.names) && cached.names.length > 0) {
      setAllQuests(cached.names);
      if (Date.now() - (cached.ts || 0) < 7 * 24 * 60 * 60 * 1000) return;
    }
    (async () => {
      try {
        const names: string[] = [];
        let cont: string | null = null;
        for (let i = 0; i < 3; i++) {
          const url =
            `${API}?action=query&format=json&origin=*&list=categorymembers` +
            `&cmtitle=Category%3AQuests&cmtype=page&cmlimit=500` +
            (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : "");
          const data: any = await fetchJson(url);
          (data.query?.categorymembers || []).forEach((m: any) => {
            const t = String(m.title || "");
            if (
              t &&
              !t.includes("/") &&
              !t.includes(":") &&
              !/^(Quests|Quest points|Quest List)$/i.test(t)
            ) {
              names.push(t);
            }
          });
          cont = data.continue?.cmcontinue || null;
          if (!cont) break;
        }
        if (names.length > 10) {
          names.sort((a, b) => a.localeCompare(b));
          setAllQuests(names);
          saveStored("qh-questlist", { ts: Date.now(), names });
        }
      } catch {
        /* POPULAR remains as fallback */
      }
    })();
  }, []);

  // Initialise the world map when opened
  useEffect(() => {
    if (!worldMap) return;
    let map: any = null;
    let cancelled = false;
    setMapError(null);
    (async () => {
      try {
        // Get the current tile version (cached for a day)
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

        const OsrsTiles = L.TileLayer.extend({
          getTileUrl: function (c: any) {
            return `${TILES}/0_${v}/${c.z}/0_${c.x}_${-(c.y + 1)}.png`;
          },
        });
        new OsrsTiles("", {
          minZoom: -3,
          maxZoom: 5,
          minNativeZoom: -3,
          maxNativeZoom: 3,
          tileSize: 256,
          attribution:
            'Map © Jagex · tiles <a href="https://weirdgloop.org/licensing" target="_blank" rel="noopener">RuneScape Wiki</a>',
        }).addTo(map);

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
      } catch {
        if (!cancelled) setMapError("The map couldn't be loaded.");
      }
    })();
    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [worldMap]);

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

  const markCompleted = useCallback((name: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(name);
      saveStored("qh-completed", Array.from(next));
      return next;
    });
  }, []);

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

      // Load the gallery from the full guide in the background
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
              const g = parseGallery(d2.parse.text["*"]);
              const own = parseGallery(html);
              const seen = new Set(g.map((x) => x.src));
              setGallery([...g, ...own.filter((x) => !seen.has(x.src))]);
              // Start coordinates are sometimes only on the full guide page
              if (!parsed.meta.startCoords) {
                const c = extractCoords(d2.parse.text["*"]);
                if (c) {
                  setQuest((prev) =>
                    prev && prev.name === displayName
                      ? { ...prev, meta: { ...prev.meta, startCoords: c } }
                      : prev
                  );
                }
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
        error:
          images.length || coords ? null : "No images found on this page.",
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
      setPhase("done");
      markCompleted(quest.name);
      removeFromRecent(quest.name);
      removeStored(storageKey(quest.name));
      return;
    }
    const n = stepIdx + 1;
    setStepIdx(n);
    persist(quest.name, "steps", n, itemsChecked);
    updateRecent(quest.name, n, quest.steps.length);
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

  // ── Overlay (gallery / lookup) ──
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
          }}
        >
          ✕
        </button>
      </div>
      {mapError ? (
        <div style={{ padding: 30, textAlign: "center", color: C.textDim }}>
          {mapError}
        </div>
      ) : (
        <div ref={mapDivRef} style={{ flex: 1, background: "#000" }} />
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

          <button
            onClick={() =>
              setWorldMap({ x: 3222, y: 3218, title: "Gielinor", marker: false })
            }
            style={{ ...ghostBtn, marginTop: 12, color: C.gold, borderColor: C.border }}
          >
            🗺️ Open world map
          </button>

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

          <div style={{ marginTop: 26 }}>
            <div style={{ ...goldTitle, fontSize: 15, marginBottom: 8 }}>
              All quests
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allQuests
                .filter((n) => !recentNames.has(n))
                .map((n) => {
                  const isDone = completed.has(n);
                  return (
                    <button
                      key={n}
                      onClick={() => openQuest(n)}
                      style={{
                        ...chip,
                        padding: "9px 13px",
                        cursor: "pointer",
                        textDecoration: isDone ? "line-through" : "none",
                        color: isDone ? C.textDim : C.parch,
                        borderColor: isDone ? C.green : C.border,
                      }}
                    >
                      {isDone ? "✓ " : ""}
                      {n}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
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
          {quest && gallery.length > 0 && phase !== "done" && (
            <button onClick={() => setGalleryOpen(true)} style={headBtn}>
              🖼️
            </button>
          )}
          {quest && phase !== "info" && phase !== "done" && (
            <button onClick={() => setPhase("info")} style={headBtn}>
              ℹ️
            </button>
          )}
          {quest && phase === "steps" && quest.items.length > 0 && (
            <button onClick={() => setPhase("items")} style={headBtn}>
              🎒
            </button>
          )}
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
                <span>{step.text}</span>

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

                {/* Toolbar: permanent dashed divider with all step actions below */}
                {(step.links.length > 0 || step.info.length > 0) && (
                  <>
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
                      {step.info.length > 0 && (
                        <button
                          onClick={() => setStepInfoOpen(!stepInfoOpen)}
                          style={{
                            ...toolChip,
                            width: 32,
                            height: 32,
                            padding: 0,
                            borderRadius: "50%",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "Georgia, serif",
                            fontSize: 15,
                            background: stepInfoOpen ? C.ink : "rgba(58,46,25,.08)",
                            color: stepInfoOpen ? C.parch : C.ink,
                          }}
                        >
                          i
                        </button>
                      )}
                    </div>
                  </>
                )}

                {stepInfoOpen && step.info.length > 0 && (
                  <>
                    <div style={dashed} />
                    <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5 }}>
                      {step.info.map((inf, i) => (
                        <div key={i} style={{ padding: "3px 0" }}>
                          ℹ️ {inf}
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
            <button
              onClick={() => setView("home")}
              style={{ ...bigBtn, marginTop: 26, maxWidth: 300 }}
            >
              Back to home
            </button>
          </div>
        )}
      </div>

      {/* Overlay: NPC/location lookup */}
      {lookup &&
        overlay(`🔍 ${lookup.title}`, () => setLookup(null), (
          <>
            {lookup.loading && (
              <div style={{ color: C.textDim, padding: "20px 0", textAlign: "center" }}>
                Searching the wiki…
              </div>
            )}
            {lookup.error && !lookup.loading && (
              <div style={{ color: C.textDim, fontSize: 14, marginBottom: 12 }}>
                {lookup.error}
              </div>
            )}
            {!lookup.loading && (
              <button
                onClick={() => {
                  const c = lookup.coords;
                  const title = lookup.title;
                  setLookup(null);
                  setWorldMap(
                    c
                      ? { x: c.x, y: c.y, title, marker: true }
                      : { x: 3222, y: 3218, title: "Gielinor", marker: false }
                  );
                }}
                style={{ ...bigBtn, marginBottom: 12 }}
              >
                {lookup.coords ? "🗺️ Show on world map" : "🗺️ Open world map"}
              </button>
            )}
            {lookup.images.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                style={{
                  width: "100%",
                  borderRadius: 10,
                  marginBottom: 10,
                  border: `1px solid ${C.borderSoft}`,
                }}
              />
            ))}
            <a
              href={wikiUrl(lookup.page)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "12px",
                background: C.panelSoft,
                color: C.gold,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              Open on wiki ↗
            </a>
          </>
        ))}

      {/* Overlay: gallery from the full guide */}
      {galleryOpen &&
        overlay("🖼️ Maps & images", () => setGalleryOpen(false), (
          <>
            {gallery.map((g) => (
              <div key={g.src} style={{ marginBottom: 16 }}>
                <img
                  src={g.src}
                  alt=""
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: `1px solid ${C.borderSoft}`,
                  }}
                />
                {g.caption && (
                  <div style={{ fontSize: 13, color: C.textDim, marginTop: 4 }}>
                    {g.caption}
                  </div>
                )}
              </div>
            ))}
          </>
        ))}

      {worldMapOverlay}
    </div>
  );
}
