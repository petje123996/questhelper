import { cleanText } from "./format";
import { fetchPageHtml } from "./quest";

export type BestiaryRow = {
  name: string;
  members: boolean | null; // null = couldn't tell from this row
  combatLevel: number;
  hitpoints: number;
  defence: number;
};

// The full (members) bestiary isn't one table — it's split into a
// separate subpage per 10-level combat bracket: "Bestiary/Levels 1 to
// 10", "Bestiary/Levels 11 to 20", etc. We only fetch the brackets that
// overlap the player's level window instead of all ~20 of them.
const MEMBER_BRACKETS: [number, number][] = [
  [1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 70], [71, 80],
  [81, 90], [91, 100], [101, 110], [111, 120], [121, 130], [131, 140], [141, 150],
  [151, 160], [161, 170], [171, 180], [181, 190], [191, 200], [201, 400],
];

function bracketsForLevel(level: number): { title: string; mid: number }[] {
  const lo = Math.max(1, level - 60);
  const hi = level + 20;
  return MEMBER_BRACKETS.filter(([a, b]) => b >= lo && a <= hi).map(([a, b]) => ({
    title: `Bestiary/Levels ${a} to ${b}`,
    mid: Math.round((a + b) / 2),
  }));
}

function firstNumber(s: string): number {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// Column headers in these tables are icons (sortable-table convention),
// so the readable label usually lives in a title/alt attribute rather
// than the cell's visible text — check all three.
function headerLabel(cell: Element): string {
  const parts: string[] = [cleanText(cell.textContent || "")];
  const title = cell.getAttribute("title");
  if (title) parts.push(title);
  cell.querySelectorAll("[title]").forEach((el) => {
    const t = el.getAttribute("title");
    if (t) parts.push(t);
  });
  cell.querySelectorAll("img[alt]").forEach((img) => {
    const a = img.getAttribute("alt");
    if (a) parts.push(a);
  });
  return parts.join(" ").toLowerCase();
}

// Parses every "List"-style sortable table found on the page (a bracket
// subpage has one, the combined F2P page has one per collapsible
// section). fallbackLevel is used when no combat-level column is found,
// since the bracket itself already tells us the rough range.
function parseBestiaryTables(html: string, fallbackLevel: number): BestiaryRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const rows: BestiaryRow[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerRow = table.querySelector("tr");
    if (!headerRow) return;
    const headerCells = Array.from(headerRow.querySelectorAll("th"));
    if (headerCells.length < 3) return;
    const labels = headerCells.map(headerLabel);

    const nameIdx = labels.findIndex((h) => h.includes("monster") || h.includes("name"));
    const hpIdx = labels.findIndex((h) => h.includes("hitpoint"));
    if (nameIdx === -1 || hpIdx === -1) return; // not a bestiary list table

    const defIdx = labels.findIndex(
      (h) =>
        h.includes("defence level") ||
        (h.includes("defence") &&
          !h.includes("stab") &&
          !h.includes("slash") &&
          !h.includes("crush") &&
          !h.includes("magic") &&
          !h.includes("ranged") &&
          !h.includes("light") &&
          !h.includes("standard") &&
          !h.includes("heavy"))
    );
    const cbIdx = labels.findIndex((h) => h.includes("combat level") || h === "combat");
    const membersIdx = labels.findIndex((h) => h.includes("member") || h.includes("f2p"));

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td"));
        if (cells.length <= Math.max(nameIdx, hpIdx)) return;
        const name = cleanText(cells[nameIdx]?.textContent || "");
        if (!name) return;
        const hitpoints = firstNumber(cleanText(cells[hpIdx]?.textContent || ""));
        if (!hitpoints) return;
        // -1 = no Defence column found at all on this table (unknown),
        // vs. a real 0 Defence value for a genuinely defenceless monster.
        const defence = defIdx >= 0 ? firstNumber(cleanText(cells[defIdx]?.textContent || "")) : -1;
        const cbText = cbIdx >= 0 ? cleanText(cells[cbIdx]?.textContent || "") : "";
        const combatLevel = firstNumber(cbText) || fallbackLevel;

        let members: boolean | null = null;
        if (membersIdx >= 0 && cells[membersIdx]) {
          const cell = cells[membersIdx];
          const label = headerLabel(cell) || cleanText(cell.textContent || "").toLowerCase();
          if (label) members = !/f2p|free/.test(label);
          else if (cell.querySelector("img, svg")) members = true;
        }

        rows.push({ name, members, combatLevel, hitpoints, defence });
      });
  });

  return rows;
}

export async function fetchBestiaryRows(members: boolean, combatLevel: number): Promise<BestiaryRow[]> {
  if (!members) {
    const html = await fetchPageHtml("Bestiary/Free-to-play");
    if (!html) return [];
    return parseBestiaryTables(html, combatLevel);
  }

  const brackets = bracketsForLevel(combatLevel);
  const results = await Promise.all(
    brackets.map(async (b) => {
      const html = await fetchPageHtml(b.title);
      return html ? parseBestiaryTables(html, b.mid) : [];
    })
  );
  return results.flat();
}
