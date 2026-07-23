import { cleanText } from "./format";
import { buildLookup, fetchPageHtml } from "./quest";
import type { Lookup } from "./quest";
import { NON_MONSTER_NAME_PATTERN } from "./training";

export type MonsterEntry = {
  name: string;
  hitpoints: number;
  defence: number;
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
): { hitpoints: number; defence: number; combatLevel: number } | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.body.querySelectorAll("table"));

  for (const table of tables) {
    let hitpoints = 0;
    let defence = 0;
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
      else if (label.includes("combat level")) combatLevel = Math.max(combatLevel, num);
    });
    // Require both Hitpoints and Combat level in the same table — a
    // content table elsewhere on a non-monster page (e.g. a guide
    // discussing a monster's HP) is far less likely to also carry a
    // matching Combat level row right next to it.
    if (hitpoints > 0 && combatLevel > 0) return { hitpoints, defence, combatLevel };
  }
  return null;
}

// Fetches one candidate page and, if it looks like an actual monster page
// (has an infobox with Hitpoints), returns its stats plus images/location
// pulled from the very same page fetch — no extra request needed for the
// "picture" button. Pages that aren't monsters (items, guides, etc. picked
// up by the broad link harvest) simply return null here and get filtered.
export async function fetchMonsterEntry(name: string): Promise<MonsterEntry | null> {
  if (NON_MONSTER_NAME_PATTERN.test(name)) return null;
  const html = await fetchPageHtml(name);
  if (!html) return null;
  const stats = parseMonsterInfobox(html);
  if (!stats) return null;
  return {
    name,
    hitpoints: stats.hitpoints,
    defence: stats.defence,
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
