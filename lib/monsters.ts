import { cleanText } from "./format";
import { buildLookup, fetchPageHtml } from "./quest";
import type { Lookup } from "./quest";

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

// Wiki monster pages use the same infobox convention as everything else
// on the site: a labelled row (th) next to its value (td). We read
// Hitpoints/Defence/Combat level by label rather than column position.
function parseMonsterInfobox(
  html: string
): { hitpoints: number; defence: number; combatLevel: number } | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const infobox = doc.body.querySelector("table.infobox");
  if (!infobox) return null;

  let hitpoints = 0;
  let defence = 0;
  let combatLevel = 0;
  infobox.querySelectorAll("tr").forEach((tr) => {
    const th = tr.querySelector("th");
    const td = tr.querySelector("td");
    if (!th || !td) return;
    const label = cleanText(th.textContent || "").toLowerCase();
    const value = cleanText(td.textContent || "");
    const num = parseInt(value.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(num) || num <= 0) return;
    if (label.includes("hitpoints")) hitpoints = Math.max(hitpoints, num);
    else if (label.startsWith("defence")) defence = Math.max(defence, num);
    else if (label.includes("combat level")) combatLevel = Math.max(combatLevel, num);
  });

  if (!hitpoints) return null;
  return { hitpoints, defence, combatLevel };
}

// Fetches one candidate page and, if it looks like an actual monster page
// (has an infobox with Hitpoints), returns its stats plus images/location
// pulled from the very same page fetch — no extra request needed for the
// "picture" button. Pages that aren't monsters (items, guides, etc. picked
// up by the broad link harvest) simply return null here and get filtered.
export async function fetchMonsterEntry(name: string): Promise<MonsterEntry | null> {
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
