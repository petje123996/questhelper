import { cleanText } from "./format";
import { fetchPageHtml } from "./quest";

export type TrainingMethod = {
  name: string;
  page: string | null; // wiki page for the method itself, if it links to one
  levelReq: number; // -1 = no level column found on this table (unknown)
  xpPerHour: number; // -1 = no xp/rate column found on this table (unknown)
  membersOnly: boolean | null; // null = couldn't tell from this row
};

// Wiki page titles for each skill's training guide. Attack/Strength/
// Defence/Hitpoints/Ranged/Magic aren't here — those are trained by
// fighting monsters, already covered by the Combat Adviser.
export const SKILL_TRAINING_PAGES: Record<string, string> = {
  prayer: "Prayer training",
  runecraft: "Runecraft training",
  crafting: "Crafting training",
  mining: "Mining training",
  smithing: "Smithing training",
  fishing: "Fishing training",
  cooking: "Cooking training",
  firemaking: "Firemaking training",
  woodcutting: "Woodcutting training",
  agility: "Agility training",
  herblore: "Herblore training",
  thieving: "Thieving training",
  fletching: "Fletching training",
  slayer: "Slayer training",
  farming: "Farming training",
  construction: "Construction training",
  hunter: "Hunter training",
};

export const TRAINABLE_SKILLS = Object.keys(SKILL_TRAINING_PAGES);

// Same idea as firstNumber in lib/bestiary.ts, but comma-aware — XP/hr
// figures on these pages are written as full numbers ("40,000"), and a
// plain \d+ match would only catch the "40" before the comma breaks it.
function firstNumberLoose(s: string): number {
  const m = s.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Math.round(parseFloat(m[0])) : -1;
}

// Column headers are icons on some of these tables (same sortable-table
// convention as the Bestiary), so the readable label can live in a
// title/alt attribute rather than the cell's visible text.
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

// Parses every sortable "Training methods"-style table on a skill guide
// page. These pages are far less uniform than the Bestiary's per-bracket
// tables (some skills split methods across several tables by level range,
// others use one big table, wording for the rate column varies a lot), so
// this leans on tolerant keyword matching rather than a fixed layout —
// expect it to need the same kind of follow-up fixes the Bestiary parser
// did once it's checked against real pages.
function parseTrainingTables(html: string): TrainingMethod[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.body;
  root
    .querySelectorAll(".navbox, .references, #toc, .toc, .mw-editsection, sup, style, script")
    .forEach((el) => el.remove());

  const methods: TrainingMethod[] = [];

  root.querySelectorAll("table").forEach((table) => {
    const headerRow = table.querySelector("tr");
    if (!headerRow) return;
    const headerCells = Array.from(headerRow.querySelectorAll("th"));
    if (headerCells.length < 2) return;
    const labels: string[] = [];
    headerCells.forEach((th) => {
      const span = Math.max(1, parseInt(th.getAttribute("colspan") || "1", 10) || 1);
      const label = headerLabel(th);
      for (let i = 0; i < span; i++) labels.push(label);
    });

    const levelIdx = labels.findIndex((h) => h.includes("level"));
    const nameIdx = labels.findIndex(
      (h) => h.includes("method") || h.includes("activity") || h.includes("action") || h.includes("training")
    );
    if (levelIdx === -1 || nameIdx === -1) return; // not a training-methods table

    const rateIdx = labels.findIndex((h) => h.includes("xp") || h.includes("experience") || h.includes("rate"));
    const membersIdx = labels.findIndex((h) => h.includes("member") || h.includes("f2p"));

    Array.from(table.querySelectorAll("tr"))
      .slice(1)
      .forEach((tr) => {
        const cells: Element[] = [];
        Array.from(tr.children).forEach((cell) => {
          if (cell.tagName !== "TH" && cell.tagName !== "TD") return;
          const span = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
          for (let i = 0; i < span; i++) cells.push(cell);
        });
        if (cells.length <= Math.max(levelIdx, nameIdx)) return;

        const nameCell = cells[nameIdx];
        const anchor = nameCell.querySelector("a");
        const name = anchor ? cleanText(anchor.textContent || "") : cleanText(nameCell.textContent || "");
        if (!name || name.length < 2) return;

        const levelReq = firstNumberLoose(cleanText(cells[levelIdx]?.textContent || ""));
        const xpPerHour = rateIdx >= 0 ? firstNumberLoose(cleanText(cells[rateIdx]?.textContent || "")) : -1;

        let membersOnly: boolean | null = null;
        if (membersIdx >= 0 && cells[membersIdx]) {
          const cell = cells[membersIdx];
          const label = headerLabel(cell) || cleanText(cell.textContent || "").toLowerCase();
          if (/f2p|free|non.?member/.test(label)) membersOnly = false;
          else if (/\bmember|p2p|paid/.test(label)) membersOnly = true;
          else if (cell.querySelector("img, svg")) membersOnly = true;
        }

        const href = anchor?.getAttribute("href") || "";
        const page = href.startsWith("/w/")
          ? decodeURIComponent(href.slice(3)).split("#")[0].replace(/_/g, " ")
          : null;

        methods.push({ name, page, levelReq, xpPerHour, membersOnly });
      });
  });

  // A method can appear on more than one bracket table on longer guides
  // (e.g. listed again once a faster variant unlocks) — keep whichever
  // row actually carries an XP/hr figure.
  const byName = new Map<string, TrainingMethod>();
  methods.forEach((m) => {
    const existing = byName.get(m.name);
    if (!existing || m.xpPerHour > existing.xpPerHour) byName.set(m.name, m);
  });
  return Array.from(byName.values());
}

export async function fetchTrainingMethods(skill: string): Promise<TrainingMethod[]> {
  const title = SKILL_TRAINING_PAGES[skill];
  if (!title) return [];
  const html = await fetchPageHtml(title);
  if (!html) return [];
  return parseTrainingTables(html);
}
