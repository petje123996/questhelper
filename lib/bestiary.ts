import { cleanText } from "./format";
import { fetchPageHtml } from "./quest";

export type BestiaryRow = {
  name: string;
  members: boolean | null; // null = couldn't tell from this row
  combatLevel: number;
  hitpoints: number;
  defence: number;
  attack: number;
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
  // Combat level under-represents a low-Defence account's real striking
  // power (Defence/Hitpoints/Prayer all feed into it, Attack/Strength
  // only partly) — a wide upper bound means a pure with a modest combat
  // level still sees the higher-level-but-weak-Defence monsters they can
  // actually fight safely, not just ones near their nominal level.
  const hi = level + 60;
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
    // The "Monster" header spans 2 real columns (icon + name) via
    // colspan, so array index must follow expanded column position, not
    // <th> element position — otherwise every index after it is off by
    // one and the "name" cell we read is actually the empty icon cell.
    const labels: string[] = [];
    headerCells.forEach((th) => {
      const span = Math.max(1, parseInt(th.getAttribute("colspan") || "1", 10) || 1);
      const label = headerLabel(th);
      for (let i = 0; i < span; i++) labels.push(label);
    });

    const nameIdx = labels.findIndex((h) => h.includes("monster") || h.includes("name"));
    const hpIdx = labels.findIndex((h) => h.includes("hitpoint"));
    if (nameIdx === -1 || hpIdx === -1) return; // not a bestiary list table
    // How many expanded columns the Monster header actually spans, so we
    // can pick whichever of them holds the real name text (not the icon).
    let nameSpanEnd = nameIdx;
    while (nameSpanEnd + 1 < labels.length && labels[nameSpanEnd + 1] === labels[nameIdx]) nameSpanEnd++;

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
    const atkIdx = labels.findIndex((h) => h.includes("attack level"));
    const cbIdx = labels.findIndex((h) => h.includes("combat level") || h === "combat");
    const membersIdx = labels.findIndex((h) => h.includes("member") || h.includes("f2p"));

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        // Expand any colspan in the data row too, so cell index stays
        // aligned with the header's expanded column positions.
        const cells: Element[] = [];
        Array.from(tr.children).forEach((cell) => {
          if (cell.tagName !== "TH" && cell.tagName !== "TD") return;
          const span = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
          for (let i = 0; i < span; i++) cells.push(cell);
        });
        if (cells.length <= Math.max(nameIdx, hpIdx)) return;
        // The name is somewhere across the Monster column's full span
        // (often icon cell + name cell) — take whichever holds the most
        // text, since an icon-only cell has no textContent to speak of.
        let name = "";
        for (let i = nameIdx; i <= nameSpanEnd && i < cells.length; i++) {
          const t = cleanText(cells[i].textContent || "");
          if (t.length > name.length) name = t;
        }
        if (!name) return;
        const hitpoints = firstNumber(cleanText(cells[hpIdx]?.textContent || ""));
        if (!hitpoints) return;
        // -1 = no Defence/Attack column found at all on this table
        // (unknown), vs. a real 0 value for a genuinely 0-level monster.
        const defence = defIdx >= 0 ? firstNumber(cleanText(cells[defIdx]?.textContent || "")) : -1;
        const attack = atkIdx >= 0 ? firstNumber(cleanText(cells[atkIdx]?.textContent || "")) : -1;
        const cbText = cbIdx >= 0 ? cleanText(cells[cbIdx]?.textContent || "") : "";
        const combatLevel = firstNumber(cbText) || fallbackLevel;

        let members: boolean | null = null;
        if (membersIdx >= 0 && cells[membersIdx]) {
          const cell = cells[membersIdx];
          const label = headerLabel(cell) || cleanText(cell.textContent || "").toLowerCase();
          if (label) members = !/f2p|free/.test(label);
          else if (cell.querySelector("img, svg")) members = true;
        }

        rows.push({ name, members, combatLevel, hitpoints, defence, attack });
      });
  });

  return rows;
}

export type BestiaryDebug = {
  title: string;
  found: boolean;
  tableCount: number;
  headerDumps: string[];
  rawSnippet: string;
};

// Diagnostic dump used only when a bracket page is found but yields zero
// rows: shows every table's header labels (as our parser sees them) plus
// a raw HTML snippet, so a structural mismatch (e.g. no <table> element
// at all, or headers we're not recognising) can be seen directly.
export async function debugBestiaryPage(title: string): Promise<BestiaryDebug> {
  const html = await fetchPageHtml(title);
  if (!html) return { title, found: false, tableCount: 0, headerDumps: [], rawSnippet: "" };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.body.querySelectorAll("table"));
  const headerDumps = tables.slice(0, 5).map((t, i) => {
    const headerRow = t.querySelector("tr");
    const ths = headerRow ? Array.from(headerRow.querySelectorAll("th")) : [];
    const labels = ths.map((th) => headerLabel(th) || "(empty)");
    return `table ${i + 1} (${ths.length} th cells): ${labels.join(" | ") || "(no th cells found)"}`;
  });

  let rawSnippet: string;
  if (tables[0]) {
    rawSnippet = tables[0].outerHTML.slice(0, 1500);
  } else {
    const bodyHtml = doc.body.innerHTML;
    const idx = bodyHtml.toLowerCase().indexOf("list");
    rawSnippet =
      "(no <table> elements found on the page at all)\n\n" +
      (idx >= 0 ? bodyHtml.slice(Math.max(0, idx - 200), idx + 1500) : bodyHtml.slice(0, 1500));
  }

  return { title, found: true, tableCount: tables.length, headerDumps, rawSnippet };
}

export type BracketAttempt = { title: string; found: boolean; rowCount: number };
export type BestiaryFetchResult = { rows: BestiaryRow[]; attempted: BracketAttempt[] };

// Members and F2P monsters turn out to be listed together on the same
// per-level-bracket pages (distinguished by the Members column), so we
// always fetch the same bracket pages and let the caller filter by mode
// — no need for a separately-guessed F2P page title.
export async function fetchBestiaryRows(combatLevel: number): Promise<BestiaryFetchResult> {
  const brackets = bracketsForLevel(combatLevel);
  const attempted: BracketAttempt[] = [];
  const results = await Promise.all(
    brackets.map(async (b) => {
      const html = await fetchPageHtml(b.title);
      if (!html) {
        attempted.push({ title: b.title, found: false, rowCount: 0 });
        return [];
      }
      const rows = parseBestiaryTables(html, b.mid);
      attempted.push({ title: b.title, found: true, rowCount: rows.length });
      return rows;
    })
  );
  return { rows: results.flat(), attempted };
}
