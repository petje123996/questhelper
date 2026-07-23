import { cleanText } from "./format";
import { buildLookup, fetchPageHtml } from "./quest";
import type { Lookup } from "./quest";
import { isNonMonsterName } from "./training";

export type MonsterEntry = {
  name: string;
  hitpoints: number;
  defence: number;
  attack: number;
  strength: number;
  maxHit: number;
  combatLevel: number;
  xpPerKill: number;
  lookup: Lookup;
};

// Rough approximation: OSRS awards about 4 combat XP per hitpoint of
// damage dealt, so a monster's max HP is a reasonable stand-in for "XP
// value per kill". Not exact (varies slightly by combat style), but good
// enough to rank monsters against each other.
const XP_PER_HP = 4;

// Wiki infoboxes label/value rows by convention (label in the first cell,
// value in the second) but the exact table's CSS class isn't reliable to
// guess, so instead of targeting "table.infobox" we scan tables in
// document order and use the first one whose rows include a Hitpoints
// value — that's virtually always the infobox, since it's the first
// substantial table on a monster page, without depending on class names.
function parseMonsterInfobox(
  html: string
): { hitpoints: number; defence: number; attack: number; strength: number; maxHit: number; combatLevel: number } | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.body.querySelectorAll("table"));

  for (const table of tables) {
    let hitpoints = 0;
    let defence = 0;
    let attack = 0;
    let strength = 0;
    let maxHit = 0;
    let combatLevel = 0;
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children).filter(
        (c) => c.tagName === "TH" || c.tagName === "TD"
      );
      if (cells.length < 2) return;
      const label = cleanText(cells[0].textContent || "").toLowerCase();
      if (!label) return;
      const value = cleanText(cells[1].textContent || "");
      const num = parseInt(value.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(num) || num <= 0) return;
      if (label.includes("hitpoints")) hitpoints = Math.max(hitpoints, num);
      else if (label.startsWith("defence")) defence = Math.max(defence, num);
      else if (label.startsWith("attack")) attack = Math.max(attack, num);
      else if (label.startsWith("strength")) strength = Math.max(strength, num);
      else if (label.includes("max hit") || label.includes("maximum hit")) maxHit = Math.max(maxHit, num);
      else if (label.includes("combat level")) combatLevel = Math.max(combatLevel, num);
    });
    // Require both Hitpoints and Combat level in the same table — a
    // content table elsewhere on a non-monster page (e.g. a guide
    // discussing a monster's HP) is far less likely to also carry a
    // matching Combat level row right next to it.
    if (hitpoints > 0 && combatLevel > 0) return { hitpoints, defence, attack, strength, maxHit, combatLevel };
  }
  return null;
}

// Fetches one candidate page and, if it looks like an actual monster page
// (has an infobox with Hitpoints), returns its stats plus images/location
// pulled from the very same page fetch — no extra request needed for the
// "picture" button. Pages that aren't monsters (items, guides, etc. picked
// up by the broad link harvest) simply return null here and get filtered.
export async function fetchMonsterEntry(name: string): Promise<MonsterEntry | null> {
  if (isNonMonsterName(name)) return null;
  const html = await fetchPageHtml(name);
  if (!html) return null;
  const stats = parseMonsterInfobox(html);
  if (!stats) return null;
  return {
    name,
    hitpoints: stats.hitpoints,
    defence: stats.defence,
    attack: stats.attack,
    strength: stats.strength,
    maxHit: stats.maxHit,
    combatLevel: stats.combatLevel,
    xpPerKill: stats.hitpoints * XP_PER_HP,
    lookup: buildLookup(name, name, html),
  };
}

export async function fetchMonsterEntries(names: string[]): Promise<MonsterEntry[]> {
  const unique = Array.from(new Set(names)).slice(0, 45);
  const results = await Promise.all(unique.map((n) => fetchMonsterEntry(n).catch(() => null)));
  return results.filter((r): r is MonsterEntry => r !== null);
}

export type MonsterDebug = { name: string; found: boolean; rows: string[] };

// Diagnostic dump used only when fetchMonsterEntries comes back empty:
// shows every label/value pair our parser can actually see in the first
// few tables of a candidate page, so a real parsing mismatch can be
// spotted directly instead of guessed at blind.
export async function debugMonsterPage(name: string): Promise<MonsterDebug> {
  const html = await fetchPageHtml(name);
  if (!html) return { name, found: false, rows: [] };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: string[] = [];
  Array.from(doc.body.querySelectorAll("table"))
    .slice(0, 3)
    .forEach((table, ti) => {
      table.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.children).filter(
          (c) => c.tagName === "TH" || c.tagName === "TD"
        );
        if (cells.length < 2) return;
        const label = cleanText(cells[0].textContent || "");
        const value = cleanText(cells[1].textContent || "");
        if (label) rows.push(`[table ${ti + 1}] ${label}: ${value}`);
      });
    });
  return { name, found: true, rows: rows.slice(0, 40) };
}
