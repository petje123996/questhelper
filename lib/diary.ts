import { cleanText } from "./format";
import { loadStored, saveStored } from "./storage";

export const DIARY_REGIONS = [
  "Ardougne", "Desert", "Falador", "Fremennik", "Kandarin", "Karamja",
  "Kourend & Kebos", "Lumbridge & Draynor", "Morytania", "Varrock",
  "Western Provinces", "Wilderness",
];

const TIERS = ["Easy", "Medium", "Hard", "Elite"];

export type DiaryTier = { tier: string; tasks: string[] };

// Full per-region task lists, cached for 7 days so the dashboard's
// "almost there" summary can read them without a fresh fetch every time
// — the Diaries page itself only used to cache task *counts*, not the
// text needed to spot a near-miss skill requirement.
const DIARY_TASKS_CACHE_PREFIX = "qh-diary-tasks-";
const DIARY_TASKS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export function cacheDiaryTasks(region: string, tiers: DiaryTier[]): void {
  saveStored(DIARY_TASKS_CACHE_PREFIX + region, { ts: Date.now(), tiers });
}

export function loadCachedDiaryTasks(region: string): DiaryTier[] | null {
  const cached = loadStored(DIARY_TASKS_CACHE_PREFIX + region);
  if (!cached || !Array.isArray(cached.tiers)) return null;
  if (Date.now() - (cached.ts || 0) > DIARY_TASKS_CACHE_MS) return null;
  return cached.tiers;
}

export function loadAllCachedDiaryTasks(): { region: string; tiers: DiaryTier[] }[] {
  return DIARY_REGIONS.map((region) => ({ region, tasks: loadCachedDiaryTasks(region) }))
    .filter((r): r is { region: string; tasks: DiaryTier[] } => !!r.tasks)
    .map((r) => ({ region: r.region, tiers: r.tasks }));
}

const SKILL_NAMES = [
  "attack", "defence", "strength", "hitpoints", "ranged", "prayer", "magic",
  "cooking", "woodcutting", "fletching", "fishing", "firemaking", "crafting",
  "smithing", "mining", "herblore", "agility", "thieving", "slayer",
  "farming", "runecraft(?:ing)?", "hunter", "construction",
];
const SKILL_LEVEL_RE = new RegExp(
  `(?:(\\d{1,3})\\s*(${SKILL_NAMES.join("|")})\\b)|(?:\\b(${SKILL_NAMES.join(
    "|"
  )})\\s*(?:level\\s*)?(\\d{1,3}))`,
  "i"
);

export type TaskLevelReq = { skill: string; level: number };

// Diary task descriptions are free text pulled straight from the wiki
// table ("Have level 40 Fishing and catch a swordfish…"), with no
// structured skill/level field — so the requirement has to be pattern
// matched out of the sentence. Only handles a plain "<number> <skill>" or
// "<skill> <number>"/"<skill> level <number>" mention; anything else
// (combat-level gated, quest-gated, or purely action-based tasks) is
// left unmatched on purpose rather than guessed at — a missed near-miss
// is far less harmful than a wrong one.
export function parseTaskLevelReq(text: string): TaskLevelReq | null {
  const m = text.match(SKILL_LEVEL_RE);
  if (!m) return null;
  const skill = (m[2] || m[3] || "").toLowerCase();
  const level = parseInt(m[1] || m[4], 10);
  if (!skill || !Number.isFinite(level) || level < 1 || level > 99) return null;
  return { skill: skill === "runecrafting" ? "runecraft" : skill, level };
}

// Achievement diary pages list tasks in tiered sections (Easy/Medium/Hard/
// Elite), each followed by a wikitable. Column layout differs slightly
// between diaries, so per row we take the longest text cell as the task
// description rather than assuming a fixed column index.
export function parseDiaryPage(html: string): DiaryTier[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const tiers: DiaryTier[] = [];
  let current: DiaryTier | null = null;

  root.querySelectorAll("h2, h3, table").forEach((el) => {
    if (el.tagName === "H2" || el.tagName === "H3") {
      const title = cleanText(el.textContent || "");
      const tier = TIERS.find((t) => title.toLowerCase().startsWith(t.toLowerCase()));
      if (tier) {
        current = { tier, tasks: [] };
        tiers.push(current);
      } else {
        current = null; // left the tasks section (e.g. "Rewards", "Trivia")
      }
      return;
    }
    if (!current) return;
    el.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length === 0) return;
      let best = "";
      cells.forEach((td) => {
        const t = cleanText(td.textContent || "");
        if (t.length > best.length) best = t;
      });
      if (best && best.length > 3 && !/^\d+$/.test(best)) {
        current!.tasks.push(best);
      }
    });
  });

  return tiers.filter((t) => t.tasks.length > 0);
}
