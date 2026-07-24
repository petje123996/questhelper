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
  aggressive: boolean | null; // null = infobox has no Aggressive row
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
function parseMonsterInfobox(html: string): {
  hitpoints: number;
  defence: number;
  attack: number;
  strength: number;
  maxHit: number;
  aggressive: boolean | null;
  combatLevel: number;
} | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.body.querySelectorAll("table"));

  // The infobox's "Combat stats" section (found via a live-device debug
  // dump) isn't label:value rows at all — it's a single row of six plain
  // value cells (Hitpoints, Attack, Strength, Defence, Magic, Ranged, in
  // that fixed order) identified only by icon, sitting under its own
  // full-width section-title row. Reading it as label:value rows (like
  // everything else in the infobox) paired adjacent VALUES together
  // instead — e.g. "58: 12" for Hitpoints/Attack — which is why Strength
  // and Defence never came out of it. Needs its own pass, tracking
  // whether the previous row was that "Combat stats" title bar.
  const COMBAT_STATS_ORDER = ["hitpoints", "attack", "strength", "defence", "magic", "ranged"];

  for (const table of tables) {
    let hitpoints = 0;
    // -1 = no row for this stat found in the table (unknown), vs a real
    // 0 for a genuinely defenceless/harmless monster — matters both for
    // display ("?" vs "0") and for the Combat Adviser's scoring, which
    // otherwise reads an unmatched stat as "0 = safest possible".
    let defence = -1;
    let attack = -1;
    let strength = -1;
    let maxHit = -1;
    let aggressive: boolean | null = null;
    let combatLevel = 0;
    let combatStatsGridFound = false;
    let nextRowIsCombatStatsGrid = false;

    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children).filter(
        (c) => c.tagName === "TH" || c.tagName === "TD"
      );

      if (nextRowIsCombatStatsGrid && cells.length >= 2) {
        cells.forEach((cell, i) => {
          const m = cleanText(cell.textContent || "").match(/\d+/);
          if (!m) return;
          const n = parseInt(m[0], 10);
          const stat = COMBAT_STATS_ORDER[i];
          if (stat === "hitpoints") hitpoints = Math.max(hitpoints, n);
          else if (stat === "attack") attack = Math.max(attack, n);
          else if (stat === "strength") strength = Math.max(strength, n);
          else if (stat === "defence") defence = Math.max(defence, n);
        });
        combatStatsGridFound = true;
        nextRowIsCombatStatsGrid = false;
        return;
      }
      nextRowIsCombatStatsGrid =
        cells.length === 1 && /combat stats/i.test(cleanText(cells[0]?.textContent || ""));
      if (nextRowIsCombatStatsGrid) return;

      if (cells.length < 2) return;
      const label = cleanText(cells[0].textContent || "").toLowerCase();
      if (!label) return;
      const value = cleanText(cells[1].textContent || "");
      if (label.startsWith("aggressive")) {
        const v = value.toLowerCase();
        if (/^yes/.test(v)) aggressive = true;
        else if (/^no/.test(v)) aggressive = false;
        return;
      }
      // Match the first number rather than stripping+concatenating all
      // digits — a cell like "3 (melee) / 19 (special)" (multiple Max
      // hit values) would otherwise parse as garbage (319).
      const m = value.match(/\d+/);
      if (!m) return;
      const num = parseInt(m[0], 10);
      if (num <= 0) return;
      if (label.includes("hitpoints")) hitpoints = Math.max(hitpoints, num);
      else if (label.startsWith("defence")) defence = Math.max(defence, num);
      else if (label.startsWith("attack")) attack = Math.max(attack, num);
      else if (label.startsWith("strength")) strength = Math.max(strength, num);
      else if (label.includes("max hit") || label.includes("maximum hit")) maxHit = Math.max(maxHit, num);
      else if (label.includes("combat level")) combatLevel = Math.max(combatLevel, num);
    });
    // Accept the table once Hitpoints is known and we have some other
    // strong signal this is really the combat infobox: either a Combat
    // level row (older/simpler infoboxes) or a successfully-read Combat
    // stats grid (newer layout, which doesn't always show Combat level
    // as its own table row at all — the game shows it next to the page
    // title instead).
    if (hitpoints > 0 && (combatLevel > 0 || combatStatsGridFound)) {
      return { hitpoints, defence, attack, strength, maxHit, aggressive, combatLevel };
    }
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
    aggressive: stats.aggressive,
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
        if (cells.length === 0) return;
        const texts = cells.map((c) => cleanText(c.textContent || "") || "(icon/empty)");
        // A single-cell row is a full-width section title (e.g. "Combat
        // stats"); a wide row (like that section's icon-grid of plain
        // values) is shown with every cell instead of just the first
        // two — pairing only cells[0]/cells[1] on a 6-cell stats row is
        // exactly what misread Hitpoints+Attack as a fake "58: 12" pair.
        if (cells.length === 1) rows.push(`[table ${ti + 1}] === ${texts[0]} ===`);
        else if (cells.length === 2) rows.push(`[table ${ti + 1}] ${texts[0]}: ${texts[1]}`);
        else rows.push(`[table ${ti + 1}] row(${cells.length}): ${texts.join(" | ")}`);
      });
    });
  return { name, found: true, rows: rows.slice(0, 60) };
}
